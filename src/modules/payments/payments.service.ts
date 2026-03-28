import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentCheckout, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaymentRepository } from '../../common/prisma/repositories/payment.repository';
import { PaymentLedgerRepository } from '../../common/prisma/repositories/payment-ledger.repository';
import { PaymentCheckoutRepository } from '../../common/prisma/repositories/payment-checkout.repository';
import { PaystackWebhookEventRepository } from '../../common/prisma/repositories/paystack-webhook-event.repository';
import { SalonRepository } from '../../common/prisma/repositories/salon.repository';
import { StylistRepository } from '../../common/prisma/repositories/stylist.repository';
import { SubaccountRepository } from '../../common/prisma/repositories/subaccount.repository';
import { UserRepository } from '../../common/prisma/repositories/user.repository';
import { ServiceDiscountRepository } from '../../common/prisma/repositories/service-discount.repository';
import { WithdrawalRequestRepository } from '../../common/prisma/repositories/withdrawal-request.repository';
import type { AuthUserPayload } from '../auth/types/auth.types';
import { InitializePaymentDto, ProviderTypeDto } from './dto/initialize-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { CreateSubaccountDto } from './dto/create-subaccount.dto';
import { WithdrawFundsDto } from './dto/withdraw-funds.dto';
import { PaystackClient } from './paystack.client';
import { createHash, createHmac } from 'crypto';

const PAYSTACK_CHANNELS = [
  'card',
  'bank',
  'ussd',
  'qr',
  'mobile_money',
  'bank_transfer',
];

type WalletSnapshot = {
  pendingBalance: number;
  availableBalance: number;
  totalEarnings: number;
  totalWithdrawn: number;
};

type PaystackData<T> = { data: T };
type ProviderTypeValue = 'salon' | 'stylist';
type LedgerEntryTypeValue =
  | 'deposit_pending_credit'
  | 'payout_release_credit'
  | 'withdrawal_debit'
  | 'refund_debit';

type DiscountRule = {
  serviceKeyword: string;
  discountPercent: number;
  maxPrice: number | null;
};

type BookingPaymentTarget = {
  id: string;
  customerId: string;
  providerType: ProviderTypeValue;
  salonId: string | null;
  stylistId: string | null;
  totalAmount: number;
  transportFare: number;
  services: unknown;
  paymentStatus: string;
  groupBookingId: string | null;
};

type ProviderGroup = {
  key: string;
  providerType: ProviderTypeValue;
  providerUserId: string;
  providerEmail: string | null;
  bookingIds: string[];
  totalAmount: number;
  transportFare: number;
  services: Array<{ name?: string; service?: string; rate?: number; price?: number }>;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly paystack: PaystackClient,
    private readonly checkouts: PaymentCheckoutRepository,
    private readonly payments: PaymentRepository,
    private readonly ledger: PaymentLedgerRepository,
    private readonly withdrawals: WithdrawalRequestRepository,
    private readonly serviceDiscounts: ServiceDiscountRepository,
    private readonly subaccounts: SubaccountRepository,
    private readonly webhookEvents: PaystackWebhookEventRepository,
    private readonly users: UserRepository,
    private readonly salons: SalonRepository,
    private readonly stylists: StylistRepository,
    private readonly prisma: PrismaService,
  ) {}

  async initializePayment(user: AuthUserPayload, dto: InitializePaymentDto, callbackUrl?: string) {
    const targets = await this.loadBookingTargets(user.userId, dto);
    if (!targets.length) {
      throw new BadRequestException({
        message: 'No bookings provided for payment initialization',
        error: 'No bookings provided for payment initialization',
      });
    }

    this.assertBookingsUnpaid(targets);

    const bookingIds = targets.map((booking) => booking.id).sort();
    const clientCheckoutId = this.resolveClientCheckoutId(dto, bookingIds);
    const existingCheckout = await this.checkouts.findByCustomerAndClientCheckoutId(
      user.userId,
      clientCheckoutId,
    );

    if (existingCheckout?.paystackReference && existingCheckout?.paystackAuthorizationUrl) {
      return {
        success: true,
        message:
          existingCheckout.status === 'paid' ? 'Payment already verified' : 'Payment already initialized',
        data: {
          paymentUrl: existingCheckout.paystackAuthorizationUrl,
          reference: existingCheckout.paystackReference,
          checkoutId: existingCheckout.id,
        },
      };
    }

    const providerGroups = await this.buildProviderGroups(targets);
    if (!providerGroups.length) {
      throw new BadRequestException({ message: 'No providers found', error: 'No providers found' });
    }

    const discountRules = await this.loadActiveDiscountRules();
    const checkoutTotal = providerGroups.reduce(
      (sum, group) => sum + this.computeCustomerPayAmount(group.totalAmount + group.transportFare, group.services, discountRules),
      0,
    );
    if (checkoutTotal <= 0) {
      throw new BadRequestException({
        message: 'Invalid total amount for payment',
        error: 'Invalid total amount for payment',
      });
    }

    const groupBookingId = this.resolveGroupBookingId(dto.groupBookingId, targets);
    const depositPercent = dto.depositPercent ?? 100;

    let checkout = existingCheckout;
    if (checkout) {
      checkout = await this.ensurePaymentsForExistingCheckout(
        checkout,
        user.userId,
        groupBookingId,
        providerGroups,
        depositPercent,
      );
    } else {
      try {
        checkout = await this.createCheckoutWithPayments(
          user.userId,
          clientCheckoutId,
          groupBookingId,
          bookingIds,
          providerGroups,
          depositPercent,
        );
      } catch (error) {
        const raceWinner = await this.checkouts.findByCustomerAndClientCheckoutId(
          user.userId,
          clientCheckoutId,
        );
        if (!raceWinner) {
          throw error;
        }
        checkout = raceWinner;
      }
    }
    if (!checkout) {
      throw new BadRequestException({
        message: 'Unable to initialize payment checkout',
        error: 'Unable to initialize payment checkout',
      });
    }

    const resolvedCallback = callbackUrl ?? dto.callbackUrl;
    const initialized = await this.initializeCheckoutWithPaystack(checkout, user.email, bookingIds, resolvedCallback);

    return {
      success: true,
      message: 'Payment initialized',
      data: {
        paymentUrl: initialized.paystackAuthorizationUrl,
        reference: initialized.paystackReference,
        checkoutId: initialized.id,
      },
    };
  }

  async verifyPayment(reference: string) {
    const checkout = await this.checkouts.findByPaystackReference(reference);
    if (checkout) {
      if (checkout.status === 'paid') {
        const payments = await this.payments.listByCheckoutId(checkout.id);
        return {
          success: true,
          message: 'Payment already verified',
          data: { checkout, payments },
        };
      }

      const response = (await this.paystack.verifyTransaction(reference)) as PaystackData<{
        status?: string;
        authorization?: { authorization_code?: string };
      }>;
      const txData = response.data;
      if (txData.status !== 'success') {
        return {
          success: false,
          message: txData.status === 'failed' ? 'Payment failed' : 'Payment pending',
          data: {
            reference,
            status: txData.status ?? 'pending',
            checkoutId: checkout.id,
          },
        };
      }

      const updated = await this.markCheckoutPaid(checkout.id, txData.authorization?.authorization_code);
      return {
        success: true,
        message: 'Payment verified successfully',
        data: updated,
      };
    }

    const payment = await this.payments.findByPaystackReference(reference);
    if (!payment) {
      throw new NotFoundException({
        message: 'Payment record not found',
        error: 'Payment record not found',
      });
    }

    const isBalanceRef = payment.paystackRemainingRef === reference;

    if (isBalanceRef) {
      if (payment.remainingStatus === 'captured') {
        return { success: true, message: 'Balance payment already verified', data: payment };
      }

      const response = (await this.paystack.verifyTransaction(reference)) as PaystackData<{
        status?: string;
      }>;
      if (response.data.status !== 'success') {
        return {
          success: false,
          message: response.data.status === 'failed' ? 'Payment failed' : 'Payment pending',
          data: { reference, status: response.data.status ?? 'pending', paymentId: payment.id },
        };
      }

      await this.markRemainingCaptured(payment);
      const refreshed = await this.payments.findById(payment.id);
      return { success: true, message: 'Balance payment verified successfully', data: refreshed };
    }

    if (payment.depositStatus === 'paid') {
      return {
        success: true,
        message: 'Payment already verified',
        data: payment,
      };
    }

    const response = (await this.paystack.verifyTransaction(reference)) as PaystackData<{
      status?: string;
      authorization?: { authorization_code?: string };
    }>;
    const txData = response.data;
    if (txData.status !== 'success') {
      return {
        success: false,
        message: txData.status === 'failed' ? 'Payment failed' : 'Payment pending',
        data: {
          reference,
          status: txData.status ?? 'pending',
          paymentId: payment.id,
        },
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.payments.update(
        payment.id,
        {
          depositStatus: 'paid',
          depositPaidAt: new Date(),
          authorizationCode: txData.authorization?.authorization_code ?? null,
          remainingStatus: 'authorized',
        },
        tx,
      );

      await this.applyDepositLedger(updatedPayment, tx);
      await this.syncBookingPaymentStatus(updatedPayment, 'paid', tx);
      return updatedPayment;
    });

    return {
      success: true,
      message: 'Payment verified successfully',
      data: updated,
    };
  }

  async handleWebhook(payload: unknown, rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) {
      throw new BadRequestException({ message: 'Paystack not configured', error: 'Paystack not configured' });
    }

    const rawPayload = rawBody ?? Buffer.from(JSON.stringify(payload ?? {}));
    const hash = createHmac('sha512', secret).update(rawPayload).digest('hex');
    if (!signature || hash !== signature) {
      throw new BadRequestException({ message: 'Invalid signature', error: 'Invalid signature' });
    }

    const event = payload as Record<string, any>;
    const eventId = this.resolveWebhookEventId(event);

    const existing = await this.webhookEvents.findByEventId(eventId);
    if (existing) {
      return { status: 200, message: 'Already processed' };
    }

    await this.webhookEvents.create({
      paystackEventId: eventId,
      event: event?.event ?? 'unknown',
      reference: event?.data?.reference ?? null,
      payload: event as Prisma.InputJsonValue,
    });

    setImmediate(() => {
      this.processWebhookEvent(event).catch((error) => {
        this.logger.error('Webhook processing failed', error instanceof Error ? error.stack : undefined);
      });
    });

    return { status: 200, message: 'Webhook received' };
  }

  async createSubaccount(user: AuthUserPayload, dto: CreateSubaccountDto) {
    if (user.accountType !== dto.userType) {
      throw new BadRequestException({
        message: 'User type mismatch',
        error: 'User type mismatch',
      });
    }

    const existing = await this.subaccounts.findByUserId(user.userId);
    if (existing) {
      throw new BadRequestException({
        message: 'Subaccount already exists',
        error: 'Subaccount already exists',
      });
    }

    const bankCode = await this.resolveBankCode(dto.bankName);
    if (!bankCode) {
      throw new BadRequestException({
        message: 'Invalid bank name',
        error: 'Invalid bank name',
      });
    }

    const response = (await this.paystack.createSubaccount({
      business_name: dto.accountName,
      settlement_bank: bankCode,
      account_number: dto.accountNumber,
      percentage_charge: 10,
    })) as PaystackData<{ subaccount_code: string }>;

    const subaccount = await this.subaccounts.create({
      user: { connect: { id: user.userId } },
      userType: dto.userType as ProviderTypeValue,
      paystackSubaccountCode: response.data.subaccount_code,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
    });

    await this.updateProviderBankDetails(user.userId, dto.userType, subaccount);

    return {
      success: true,
      message: 'Bank details added successfully',
      data: subaccount,
    };
  }

  async getSubaccount(user: AuthUserPayload) {
    const subaccount = await this.subaccounts.findByUserId(user.userId);
    if (!subaccount) {
      throw new NotFoundException({
        message: 'No bank details found',
        error: 'No bank details found',
      });
    }

    return { success: true, data: subaccount };
  }

  async getBankList() {
    const response = (await this.paystack.listBanks()) as PaystackData<
      Array<{ name: string; code: string }>
    >;
    const banks = Array.isArray(response.data)
      ? response.data.map((bank) => ({
          name: bank.name,
          code: bank.code,
        }))
      : [];

    return { success: true, data: banks };
  }

  async listServiceDiscounts() {
    const discounts = await this.serviceDiscounts.findAll();
    return { success: true, data: discounts };
  }

  async createServiceDiscount(dto: { serviceKeyword: string; discountPercent: number; maxPrice?: number }) {
    const discount = await this.serviceDiscounts.create({
      serviceKeyword: dto.serviceKeyword.toLowerCase().trim(),
      discountPercent: dto.discountPercent,
      maxPrice: dto.maxPrice ?? null,
    });
    return { success: true, data: discount };
  }

  async updateServiceDiscount(id: string, dto: { serviceKeyword?: string; discountPercent?: number; maxPrice?: number; isActive?: boolean }) {
    const existing = await this.serviceDiscounts.findById(id);
    if (!existing) {
      throw new NotFoundException({ message: 'Discount rule not found', error: 'Discount rule not found' });
    }
    const discount = await this.serviceDiscounts.update(id, {
      ...(dto.serviceKeyword !== undefined && { serviceKeyword: dto.serviceKeyword.toLowerCase().trim() }),
      ...(dto.discountPercent !== undefined && { discountPercent: dto.discountPercent }),
      ...(dto.maxPrice !== undefined && { maxPrice: dto.maxPrice }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return { success: true, data: discount };
  }

  async deleteServiceDiscount(id: string) {
    const existing = await this.serviceDiscounts.findById(id);
    if (!existing) {
      throw new NotFoundException({ message: 'Discount rule not found', error: 'Discount rule not found' });
    }
    await this.serviceDiscounts.delete(id);
    return { success: true, message: 'Discount rule deleted' };
  }

  async resolveAccountNumber(accountNumber: string, bankCode: string) {
    if (!accountNumber || !bankCode) {
      throw new BadRequestException({
        message: 'Account number and bank code are required',
        error: 'Account number and bank code are required',
      });
    }

    const response = (await this.paystack.resolveAccountNumber(
      accountNumber,
      bankCode,
    )) as PaystackData<{ account_number: string; account_name: string }>;

    return {
      success: true,
      data: {
        accountNumber: response.data.account_number,
        accountName: response.data.account_name,
      },
    };
  }

  async withdrawFunds(user: AuthUserPayload, dto: WithdrawFundsDto) {
    const provider = await this.resolveProviderProfile(user.userId, user.accountType);
    if (!provider) {
      throw new NotFoundException({
        message: 'Provider profile not found',
        error: 'Provider profile not found',
      });
    }

    const wallet = this.normalizeWallet(provider.wallet as Record<string, number> | null);
    if (wallet.availableBalance < dto.amount) {
      throw new BadRequestException({
        message: 'Insufficient balance',
        error: 'Insufficient balance',
      });
    }

    const subaccount = await this.subaccounts.findByUserId(user.userId);
    if (!subaccount) {
      throw new BadRequestException({
        message: 'Bank details not set up',
        error: 'Bank details not set up',
      });
    }

    const bankCode = await this.resolveBankCode(subaccount.bankName);
    if (!bankCode) {
      throw new BadRequestException({
        message: 'Bank not found. Please update your bank details.',
        error: 'Bank not found',
      });
    }

    const request = await this.withdrawals.create({
      providerId: user.userId,
      providerType: user.accountType as ProviderTypeValue,
      amount: dto.amount,
    });

    const recipient = (await this.paystack.createTransferRecipient({
      type: 'nuban',
      name: subaccount.accountName,
      account_number: subaccount.accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    })) as PaystackData<{ recipient_code: string }>;

    const transfer = (await this.paystack.createTransfer({
      source: 'balance',
      amount: dto.amount * 100,
      recipient: recipient.data.recipient_code,
      reason: 'Primlook withdrawal',
    })) as PaystackData<{ transfer_code: string }>;

    const updatedWallet = await this.prisma.$transaction(async (tx) => {
      await this.withdrawals.update(
        request.id,
        {
          status: 'initiated',
          transferCode: transfer.data.transfer_code,
          recipientCode: recipient.data.recipient_code,
        },
        tx,
      );

      await this.ledger.create(
        {
          providerId: user.userId,
          providerType: user.accountType as ProviderTypeValue,
          entryType: 'withdrawal_debit',
          amount: dto.amount,
          metadata: {
            transferCode: transfer.data.transfer_code,
            recipientCode: recipient.data.recipient_code,
            withdrawalRequestId: request.id,
          } as Prisma.InputJsonValue,
        },
        tx,
      );

      return this.applyWalletDelta(
        user.userId,
        user.accountType,
        {
          availableBalance: -dto.amount,
          totalWithdrawn: dto.amount,
        },
        tx,
      );
    });

    return {
      success: true,
      message: 'Withdrawal initiated',
      transferCode: transfer.data.transfer_code,
      withdrawalRequestId: request.id,
      newBalance: updatedWallet.availableBalance,
    };
  }

  async processRefund(dto: RefundPaymentDto) {
    const payment = await this.payments.findById(dto.paymentId);
    if (!payment) {
      throw new NotFoundException({ message: 'Payment not found', error: 'Payment not found' });
    }

    if (payment.checkoutId) {
      const checkout = await this.checkouts.findById(payment.checkoutId);
      if (!checkout?.paystackReference) {
        throw new BadRequestException({
          message: 'Refund not available',
          error: 'Refund not available',
        });
      }

      const checkoutPayments = await this.payments.listByCheckoutId(checkout.id);
      const refundablePayments = checkoutPayments.filter((item) => item.depositStatus === 'paid');
      const refundAmount = refundablePayments.reduce((sum, item) => sum + (item.depositAmount || 0), 0);

      if (!refundAmount || refundAmount <= 0) {
        throw new BadRequestException({ message: 'Refund not available', error: 'Refund not available' });
      }

      await this.paystack.refund({
        transaction: checkout.paystackReference,
        amount: Math.round(refundAmount * 100),
      });

      const updated = await this.prisma.$transaction(async (tx) => {
        const updatedCheckout = await this.checkouts.update(
          checkout.id,
          {
            status: 'refunded',
            refundedAt: new Date(),
          },
          tx,
        );

        const updatedPayments = [] as typeof refundablePayments;
        for (const refundable of refundablePayments) {
          const updatedPayment = await this.payments.update(
            refundable.id,
            {
              depositStatus: 'refunded',
              refundAmount: refundable.depositAmount,
              refundReason: dto.reason ?? null,
              refundedAt: new Date(),
            },
            tx,
          );
          await this.applyRefundLedger(updatedPayment, dto.reason ?? undefined, tx);
          await this.syncBookingPaymentStatus(updatedPayment, 'refunded', tx);
          updatedPayments.push(updatedPayment);
        }

        return { checkout: updatedCheckout, payments: updatedPayments };
      });

      return {
        success: true,
        message: 'Refund processed successfully',
        refundAmount,
        data: updated,
      };
    }

    const refundAmount = payment.depositAmount;
    if (!refundAmount || refundAmount <= 0) {
      throw new BadRequestException({ message: 'Refund not available', error: 'Refund not available' });
    }

    await this.paystack.refund({
      transaction: payment.paystackDepositRef,
      amount: Math.round(refundAmount * 100),
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.payments.update(
        payment.id,
        {
          depositStatus: 'refunded',
          refundAmount,
          refundReason: dto.reason ?? null,
          refundedAt: new Date(),
        },
        tx,
      );

      await this.applyRefundLedger(updatedPayment, dto.reason ?? undefined, tx);
      await this.syncBookingPaymentStatus(updatedPayment, 'refunded', tx);
      return updatedPayment;
    });

    return {
      success: true,
      message: 'Refund processed successfully',
      refundAmount,
      data: updated,
    };
  }

  async findPaymentByBookingId(bookingId: string) {
    return this.payments.findByBookingId(bookingId);
  }

  async generateBalancePaymentLink(bookingId: string, callbackUrl?: string) {
    const payment = await this.payments.findByBookingId(bookingId);
    if (!payment) {
      throw new NotFoundException({ message: 'Payment record not found for this booking', error: 'Payment record not found' });
    }

    if (payment.depositStatus !== 'paid') {
      throw new BadRequestException({ message: 'Deposit has not been paid yet', error: 'Deposit not paid' });
    }

    if (payment.remainingAmount <= 0) {
      throw new BadRequestException({ message: 'No remaining balance to pay', error: 'No remaining balance' });
    }

    if (payment.remainingStatus === 'captured') {
      throw new BadRequestException({ message: 'Remaining balance already paid', error: 'Already paid' });
    }

    const customer = await this.users.findById(payment.customerId);
    if (!customer) {
      throw new NotFoundException({ message: 'Customer not found', error: 'Customer not found' });
    }

    const reference = `REM_${payment.id}_${Date.now()}`;
    const paystackData = {
      email: customer.email,
      amount: Math.round(payment.remainingAmount * 100),
      reference,
      callback_url: callbackUrl ?? undefined,
      channels: PAYSTACK_CHANNELS,
      currency: 'NGN',
      metadata: {
        paymentId: payment.id,
        bookingId,
        type: 'balance',
      },
    };

    const response = (await this.paystack.initializeTransaction(paystackData)) as PaystackData<{
      authorization_url: string;
      reference: string;
    }>;

    await this.payments.update(payment.id, {
      paystackRemainingRef: response.data.reference,
    });

    return {
      success: true,
      message: 'Balance payment link generated',
      data: {
        paymentUrl: response.data.authorization_url,
        reference: response.data.reference,
        remainingAmount: payment.remainingAmount,
      },
    };
  }

  async markBalanceCashPaid(bookingId: string, vendorUserId: string) {
    const payment = await this.payments.findByBookingId(bookingId);
    if (!payment) {
      throw new NotFoundException({ message: 'Payment record not found for this booking', error: 'Payment record not found' });
    }

    if (payment.depositStatus !== 'paid') {
      throw new BadRequestException({ message: 'Deposit has not been paid yet', error: 'Deposit not paid' });
    }

    if (payment.remainingAmount <= 0) {
      throw new BadRequestException({ message: 'No remaining balance to collect', error: 'No remaining balance' });
    }

    if (payment.remainingStatus === 'captured') {
      throw new BadRequestException({ message: 'Remaining balance already paid', error: 'Already paid' });
    }

    if (payment.providerId !== vendorUserId) {
      throw new BadRequestException({ message: 'Only the booking provider can mark cash payment', error: 'Unauthorized' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await this.payments.update(
        payment.id,
        {
          remainingStatus: 'captured',
          remainingCapturedAt: new Date(),
        },
        tx,
      );

      const bookingIds = payment.bookingIds?.length ? payment.bookingIds : [payment.bookingId];
      const client = tx as unknown as {
        booking?: { updateMany: (args: any) => Promise<unknown> };
      };
      if (client.booking?.updateMany) {
        await client.booking.updateMany({
          where: { id: { in: bookingIds } },
          data: { paymentStatus: 'paid', paymentMethod: 'cash_balance' },
        });
      }

      return updatedPayment;
    });

    return {
      success: true,
      message: 'Remaining balance marked as cash paid',
      data: updated,
    };
  }

  async initializeBalancePayment(user: AuthUserPayload, bookingId: string, callbackUrl?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    if (booking.customerId !== user.userId) {
      throw new BadRequestException({ message: 'Only the booking customer can pay the balance', error: 'Unauthorized' });
    }

    return this.generateBalancePaymentLink(bookingId, callbackUrl);
  }

  async getProviderWallet(user: AuthUserPayload) {
    const provider = await this.resolveProviderProfile(user.userId, user.accountType);
    if (!provider) {
      throw new NotFoundException({
        message: 'Provider profile not found',
        error: 'Provider profile not found',
      });
    }

    const wallet = this.normalizeWallet(provider.wallet as Record<string, number> | null);
    return { success: true, wallet };
  }

  async getCustomerWalletSummary(user: AuthUserPayload) {
    const payments = await this.payments.listByCustomerId(user.userId);
    const totalSpent = payments
      .filter((p) => p.depositStatus === 'paid')
      .reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalRefunded = payments
      .filter((p) => p.depositStatus === 'refunded')
      .reduce((sum, p) => sum + (p.refundAmount || p.totalAmount || 0), 0);
    return {
      success: true,
      wallet: { totalSpent, totalRefunded, transactionCount: payments.length },
    };
  }

  async getCustomerPayments(user: AuthUserPayload) {
    const payments = await this.payments.listByCustomerId(user.userId);
    const enriched = await Promise.all(
      payments.map(async (payment) => ({
        ...payment,
        providerId: await this.buildProviderSnapshot(payment.providerId, payment.providerType),
      })),
    );

    return { success: true, payments: enriched, total: enriched.length };
  }

  async getSalonPayments(user: AuthUserPayload) {
    const salon = await this.salons.findByUserId(user.userId);
    if (!salon) {
      throw new NotFoundException({
        message: 'Salon profile not found',
        error: 'Salon profile not found',
      });
    }

    const payments = await this.payments.listByProvider(user.userId, 'salon');
    const enriched = await this.attachCustomerSnapshots(payments);

    return {
      success: true,
      payments: enriched,
      total: enriched.length,
      wallet: salon.wallet ?? {},
    };
  }

  async getStylistPayments(user: AuthUserPayload) {
    const stylist = await this.stylists.findByUserId(user.userId);
    if (!stylist) {
      throw new NotFoundException({
        message: 'Stylist profile not found',
        error: 'Stylist profile not found',
      });
    }

    const payments = await this.payments.listByProvider(user.userId, 'stylist');
    const enriched = await this.attachCustomerSnapshots(payments);

    return {
      success: true,
      payments: enriched,
      total: enriched.length,
      wallet: stylist.wallet ?? {},
    };
  }

  private async loadBookingTargets(
    customerId: string,
    dto: InitializePaymentDto,
  ): Promise<BookingPaymentTarget[]> {
    const explicitBookingIds = this.resolveBookingIds(dto);
    const normalizedGroupBookingId = dto.groupBookingId?.trim();
    if (explicitBookingIds.length === 0 && !normalizedGroupBookingId) {
      throw new BadRequestException({
        message: 'bookingId, bookingIds, or groupBookingId is required',
        error: 'bookingId, bookingIds, or groupBookingId is required',
      });
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        customerId,
        ...(explicitBookingIds.length > 0
          ? { id: { in: explicitBookingIds } }
          : normalizedGroupBookingId
            ? { groupBookingId: normalizedGroupBookingId }
            : {}),
      },
      select: {
        id: true,
        customerId: true,
        providerType: true,
        salonId: true,
        stylistId: true,
        totalAmount: true,
        transportFare: true,
        services: true,
        paymentStatus: true,
        groupBookingId: true,
      },
    });

    if (!bookings.length) {
      throw new NotFoundException({
        message: 'No bookings found for payment initialization',
        error: 'No bookings found for payment initialization',
      });
    }

    if (explicitBookingIds.length > 0) {
      const found = new Set(bookings.map((item) => item.id));
      const missing = explicitBookingIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new NotFoundException({
          message: 'One or more bookings were not found',
          error: `Missing bookings: ${missing.join(', ')}`,
        });
      }
    }

    return bookings.map((booking) => ({
      ...booking,
      providerType: booking.providerType as ProviderTypeValue,
      transportFare: booking.transportFare ?? 0,
    }));
  }

  private resolveBookingIds(dto: InitializePaymentDto) {
    const ids = new Set<string>();
    if (dto.bookingId?.trim()) {
      ids.add(dto.bookingId.trim());
    }
    for (const bookingId of dto.bookingIds ?? []) {
      const normalized = bookingId?.trim();
      if (normalized) {
        ids.add(normalized);
      }
    }
    return Array.from(ids);
  }

  private assertBookingsUnpaid(bookings: BookingPaymentTarget[]) {
    const blocked = bookings.filter((booking) => booking.paymentStatus !== 'unpaid');
    if (blocked.length > 0) {
      throw new BadRequestException({
        message: 'One or more bookings are already paid',
        error: 'One or more bookings are already paid',
      });
    }
  }

  private resolveClientCheckoutId(dto: InitializePaymentDto, bookingIds: string[]) {
    if (dto.clientCheckoutId?.trim()) {
      return dto.clientCheckoutId.trim();
    }

    if (dto.groupBookingId?.trim()) {
      const hash = createHash('sha256').update(bookingIds.join('|')).digest('hex').slice(0, 24);
      return `group:${dto.groupBookingId.trim()}:${hash}`;
    }

    if (bookingIds.length === 1) {
      return `single:${bookingIds[0]}`;
    }

    const hash = createHash('sha256').update(bookingIds.join('|')).digest('hex').slice(0, 24);
    return `bookings:${hash}`;
  }

  private resolveGroupBookingId(preferredGroupId: string | undefined, bookings: BookingPaymentTarget[]) {
    if (preferredGroupId?.trim()) {
      return preferredGroupId.trim();
    }

    const values = Array.from(
      new Set(
        bookings
          .map((booking) => booking.groupBookingId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    return values.length === 1 ? values[0] : null;
  }

  private async buildProviderGroups(bookings: BookingPaymentTarget[]) {
    const grouped = new Map<string, ProviderGroup>();

    for (const booking of bookings) {
      const provider = await this.resolveBookingProvider(booking);
      const key = `${booking.providerType}:${provider.userId}`;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          providerType: booking.providerType,
          providerUserId: provider.userId,
          providerEmail: provider.email,
          bookingIds: [booking.id],
          totalAmount: booking.totalAmount,
          transportFare: booking.transportFare ?? 0,
          services: this.extractServiceItems(booking.services),
        });
        continue;
      }

      existing.bookingIds.push(booking.id);
      existing.totalAmount += booking.totalAmount;
      existing.transportFare += booking.transportFare ?? 0;
      existing.services.push(...this.extractServiceItems(booking.services));
    }

    const groups = Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
    await this.applyTransportFeeFallback(groups);
    return groups;
  }

  private async resolveBookingProvider(booking: BookingPaymentTarget) {
    if (booking.providerType === 'salon') {
      if (!booking.salonId) {
        throw new BadRequestException({ message: 'Salon is required', error: 'Salon is required' });
      }
      const salon = await this.prisma.salon.findUnique({
        where: { id: booking.salonId },
        select: { userId: true, email: true },
      });
      if (!salon?.userId) {
        throw new NotFoundException({ message: 'Salon not found', error: 'Salon not found' });
      }
      return { userId: salon.userId, email: salon.email ?? null };
    }

    if (!booking.stylistId) {
      throw new BadRequestException({ message: 'Stylist is required', error: 'Stylist is required' });
    }
    const stylist = await this.prisma.stylist.findUnique({
      where: { id: booking.stylistId },
      select: { userId: true, email: true },
    });
    if (!stylist?.userId) {
      throw new NotFoundException({ message: 'Stylist not found', error: 'Stylist not found' });
    }
    return { userId: stylist.userId, email: stylist.email ?? null };
  }

  private extractServiceItems(services: unknown) {
    if (!Array.isArray(services)) {
      return [] as Array<{ name?: string; service?: string; rate?: number; price?: number }>;
    }

    return services
      .map((service) => (service && typeof service === 'object' ? service : null))
      .filter((service): service is Record<string, unknown> => Boolean(service))
      .map((service) => ({
        name: typeof service.name === 'string' ? service.name : undefined,
        service: typeof service.service === 'string' ? service.service : undefined,
        rate: typeof service.rate === 'number' ? service.rate : undefined,
        price: typeof service.price === 'number' ? service.price : undefined,
      }));
  }

  private computeCustomerPayAmount(
    grossAmount: number,
    services: Array<{ name?: string; service?: string; rate?: number; price?: number }>,
    discountRules: DiscountRule[],
  ) {
    const discount = this.calculateServiceDiscount(services, discountRules);
    return Math.round(grossAmount - discount);
  }

  private async loadActiveDiscountRules(): Promise<DiscountRule[]> {
    const rules = await this.serviceDiscounts.findActive();
    return rules.map((rule) => ({
      serviceKeyword: rule.serviceKeyword.toLowerCase(),
      discountPercent: rule.discountPercent,
      maxPrice: rule.maxPrice,
    }));
  }

  private async applyTransportFeeFallback(groups: ProviderGroup[]) {
    for (const group of groups) {
      if (group.providerType !== 'stylist' || group.transportFare > 0) {
        continue;
      }

      const baseTransportFee = await this.resolveBaseTransportFee(
        group.providerUserId,
        group.providerType,
      );
      if (baseTransportFee > 0) {
        group.transportFare = baseTransportFee;
      }
    }
  }

  private async resolveBaseTransportFee(
    providerUserId: string,
    providerType: ProviderTypeValue,
  ) {
    if (providerType !== 'stylist') {
      return 0;
    }

    const stylist = await this.stylists.findByUserId(providerUserId);
    const pricing = (stylist?.pricing as Record<string, unknown> | null) ?? {};
    const raw = pricing.baseTransportFee;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 0;
  }

  private async createCheckoutWithPayments(
    customerId: string,
    clientCheckoutId: string,
    groupBookingId: string | null,
    bookingIds: string[],
    providerGroups: ProviderGroup[],
    depositPercent: number = 100,
  ): Promise<PaymentCheckout> {
    return this.prisma.$transaction(async (tx) => {
      const discountRules = await this.loadActiveDiscountRules();
      const fullTotal = providerGroups.reduce(
        (sum, group) => sum + this.computeCustomerPayAmount(group.totalAmount + group.transportFare, group.services, discountRules),
        0,
      );
      const clampedPercent = Math.min(100, Math.max(1, depositPercent));
      const checkoutAmount = Math.round(fullTotal * (clampedPercent / 100));

      const checkout = await this.checkouts.create(
        {
          customer: { connect: { id: customerId } },
          groupBookingId,
          bookingIds,
          clientCheckoutId,
          totalAmount: checkoutAmount,
          currency: 'NGN',
          status: 'pending',
        },
        tx,
      );

      await this.createProviderPayments(tx, checkout.id, customerId, groupBookingId, providerGroups, clampedPercent);
      return checkout;
    });
  }

  private async ensurePaymentsForExistingCheckout(
    checkout: PaymentCheckout,
    customerId: string,
    groupBookingId: string | null,
    providerGroups: ProviderGroup[],
    depositPercent: number = 100,
  ) {
    const existingPayments = await this.payments.listByCheckoutId(checkout.id);
    if (existingPayments.length > 0) {
      return checkout;
    }

    const clampedPercent = Math.min(100, Math.max(1, depositPercent));
    await this.prisma.$transaction(async (tx) => {
      await this.createProviderPayments(tx, checkout.id, customerId, groupBookingId, providerGroups, clampedPercent);
    });

    return checkout;
  }

  private async createProviderPayments(
    tx: Prisma.TransactionClient,
    checkoutId: string,
    customerId: string,
    groupBookingId: string | null,
    providerGroups: ProviderGroup[],
    depositPercent: number = 100,
  ) {
    for (const group of providerGroups) {
      const subaccount = await tx.subaccount.findUnique({
        where: { userId: group.providerUserId },
      });
      if (!subaccount) {
        throw new BadRequestException({
          message: 'Provider has not set up bank details',
          error: 'Provider has not set up bank details',
        });
      }

      const providerGross = group.totalAmount + group.transportFare;
      const discountRules = await this.loadActiveDiscountRules();
      const customerPayAmount = this.computeCustomerPayAmount(providerGross, group.services, discountRules);
      if (customerPayAmount <= 0) {
        throw new BadRequestException({
          message: 'Invalid provider amount for payment',
          error: 'Invalid provider amount for payment',
        });
      }

      const depositAmount = Math.round(customerPayAmount * (depositPercent / 100));
      const remainingAmount = customerPayAmount - depositAmount;

      await tx.payment.create({
        data: {
          checkout: { connect: { id: checkoutId } },
          bookingId: group.bookingIds[0],
          bookingType: 'Booking',
          bookingIds: group.bookingIds,
          isGroupBooking: group.bookingIds.length > 1 || Boolean(groupBookingId),
          groupBookingId,
          customerId,
          providerId: group.providerUserId,
          providerType: group.providerType,
          totalAmount: group.totalAmount,
          depositAmount,
          remainingAmount,
          platformFee: Math.round(providerGross * 0.1),
          providerAmount: providerGross,
          subaccountCode: subaccount.paystackSubaccountCode,
        },
      });
    }
  }

  private async initializeCheckoutWithPaystack(
    checkout: PaymentCheckout,
    customerEmail: string,
    bookingIds: string[],
    callbackUrlOverride?: string,
  ) {
    if (checkout.paystackReference && checkout.paystackAuthorizationUrl) {
      return checkout;
    }

    const resolvedCallbackUrl = callbackUrlOverride ?? undefined;
    const paystackData = {
      email: customerEmail,
      amount: Math.round(checkout.totalAmount * 100),
      reference: `CHK_${checkout.id}`,
      callback_url: resolvedCallbackUrl,
      channels: PAYSTACK_CHANNELS,
      currency: 'NGN',
      metadata: {
        checkoutId: checkout.id,
        bookingIds,
        type: 'checkout',
      },
    };

    try {
      const response = (await this.paystack.initializeTransaction(
        paystackData,
      )) as PaystackData<{ authorization_url: string; reference: string }>;

      return this.checkouts.update(checkout.id, {
        paystackReference: response.data.reference,
        paystackAuthorizationUrl: response.data.authorization_url,
        status: 'pending',
        failedAt: null,
      });
    } catch (error) {
      await this.checkouts.update(checkout.id, {
        status: 'failed',
        failedAt: new Date(),
      });
      throw error;
    }
  }

  private async markCheckoutPaid(checkoutId: string, authorizationCode?: string) {
    return this.prisma.$transaction(async (tx) => {
      const checkout = await tx.paymentCheckout.findUnique({ where: { id: checkoutId } });
      if (!checkout) {
        throw new NotFoundException({ message: 'Payment checkout not found', error: 'Payment checkout not found' });
      }

      const updatedCheckout = checkout.status === 'paid'
        ? checkout
        : await tx.paymentCheckout.update({
            where: { id: checkoutId },
            data: {
              status: 'paid',
              paidAt: new Date(),
              failedAt: null,
            },
          });

      const payments = await tx.payment.findMany({
        where: { checkoutId },
        orderBy: { createdAt: 'asc' },
      });

      const updatedPayments = [] as typeof payments;
      for (const payment of payments) {
        const updatedPayment = payment.depositStatus === 'paid'
          ? payment
          : await this.payments.update(
              payment.id,
              {
                depositStatus: 'paid',
                depositPaidAt: new Date(),
                authorizationCode: authorizationCode ?? null,
                remainingStatus: 'authorized',
              },
              tx,
            );

        await this.applyDepositLedger(updatedPayment, tx);
        await this.syncBookingPaymentStatus(updatedPayment, 'paid', tx);
        updatedPayments.push(updatedPayment);
      }

      return { checkout: updatedCheckout, payments: updatedPayments };
    });
  }

  private async markCheckoutFailed(checkoutId: string) {
    return this.prisma.paymentCheckout.update({
      where: { id: checkoutId },
      data: {
        status: 'failed',
        failedAt: new Date(),
      },
    });
  }

  private calculateServiceDiscount(
    services: { name?: string; service?: string; rate?: number; price?: number }[],
    discountRules: DiscountRule[],
  ) {
    if (!discountRules.length) return 0;

    let totalDiscount = 0;
    for (const service of services) {
      const serviceName = (service.service || service.name || '').toLowerCase();
      const servicePrice = service.rate ?? service.price ?? 0;
      if (!serviceName || servicePrice <= 0) continue;

      for (const rule of discountRules) {
        if (!serviceName.includes(rule.serviceKeyword)) continue;
        if (rule.maxPrice !== null && servicePrice > rule.maxPrice) continue;
        totalDiscount += servicePrice * (rule.discountPercent / 100);
        break;
      }
    }
    return totalDiscount;
  }

  private normalizeWallet(wallet: Record<string, number> | null): WalletSnapshot {
    return {
      pendingBalance: wallet?.pendingBalance ?? 0,
      availableBalance: wallet?.availableBalance ?? 0,
      totalEarnings: wallet?.totalEarnings ?? 0,
      totalWithdrawn: wallet?.totalWithdrawn ?? 0,
    };
  }

  private async applyWalletDelta(
    providerId: string,
    providerType: ProviderTypeValue | string,
    delta: Partial<WalletSnapshot>,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const provider = await this.resolveProviderProfile(providerId, providerType, prisma);
    if (!provider) {
      return this.normalizeWallet(null);
    }

    const wallet = this.normalizeWallet(provider.wallet as Record<string, number> | null);
    const updatedWallet: WalletSnapshot = {
      pendingBalance: Math.max(0, wallet.pendingBalance + (delta.pendingBalance ?? 0)),
      availableBalance: Math.max(0, wallet.availableBalance + (delta.availableBalance ?? 0)),
      totalEarnings: Math.max(0, wallet.totalEarnings + (delta.totalEarnings ?? 0)),
      totalWithdrawn: Math.max(0, wallet.totalWithdrawn + (delta.totalWithdrawn ?? 0)),
    };

    await this.persistWallet(providerId, providerType, updatedWallet, prisma);
    return updatedWallet;
  }

  private async persistWallet(
    providerId: string,
    providerType: ProviderTypeValue | string,
    wallet: WalletSnapshot,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const payload = { wallet: wallet as Prisma.InputJsonValue };
    if (providerType === 'salon') {
      const salon = await this.salons.findByUserId(providerId, prisma);
      if (salon) {
        await this.salons.update(salon.id, payload, prisma);
      }
      return;
    }

    if (providerType === 'stylist') {
      const stylist = await this.stylists.findByUserId(providerId, prisma);
      if (stylist) {
        await this.stylists.update(stylist.id, payload, prisma);
      }
    }
  }

  private async resolveProviderProfile(
    providerId: string,
    providerType: ProviderTypeValue | string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (providerType === 'salon') {
      return this.salons.findByUserId(providerId, prisma);
    }
    if (providerType === 'stylist') {
      return this.stylists.findByUserId(providerId, prisma);
    }
    return null;
  }

  private async updateProviderBankDetails(
    userId: string,
    userType: ProviderTypeValue | ProviderTypeDto,
    subaccount: { bankName: string; accountNumber: string; accountName: string; paystackSubaccountCode: string },
  ) {
    const bankDetails = {
      bankName: subaccount.bankName,
      accountNumber: subaccount.accountNumber,
      accountName: subaccount.accountName,
      paystackSubaccountCode: subaccount.paystackSubaccountCode,
    };

    if (userType === 'salon') {
      const salon = await this.salons.findByUserId(userId);
      if (salon) {
        await this.salons.update(salon.id, {
          bankDetails: bankDetails as Prisma.InputJsonValue,
        });
      }
      return;
    }

    const stylist = await this.stylists.findByUserId(userId);
    if (stylist) {
      await this.stylists.update(stylist.id, {
        bankDetails: bankDetails as Prisma.InputJsonValue,
      });
    }
  }

  private async resolveBankCode(bankName: string) {
    const response = (await this.paystack.listBanks()) as PaystackData<
      Array<{ name?: string; code?: string }>
    >;
    const banks = Array.isArray(response.data) ? response.data : [];
    const bank = banks.find(
      (item: { name?: string; code?: string }) =>
        item.name?.toLowerCase() === bankName.toLowerCase(),
    );
    return bank?.code;
  }

  private async markDepositPaid(payment: {
    id: string;
    depositStatus: string;
    providerId: string;
    providerType: ProviderTypeValue;
    providerAmount: number;
    bookingType: string;
    bookingId: string;
    bookingIds?: string[];
  }) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = payment.depositStatus === 'paid'
        ? payment
        : await this.payments.update(
            payment.id,
            {
              depositStatus: 'paid',
              depositPaidAt: new Date(),
              remainingStatus: 'authorized',
            },
            tx,
          );

      await this.applyDepositLedger(updatedPayment, tx);
      await this.syncBookingPaymentStatus(updatedPayment, 'paid', tx);
      return updatedPayment;
    });

    return updated;
  }

  private async applyDepositLedger(
    payment: { id: string; providerId: string; providerType: ProviderTypeValue; providerAmount: number },
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const created = await this.createLedgerEntryIfMissing(
      {
        paymentId: payment.id,
        providerId: payment.providerId,
        providerType: payment.providerType,
        entryType: 'deposit_pending_credit',
        amount: payment.providerAmount,
      },
      prisma,
    );

    if (!created) {
      return;
    }

    await this.applyWalletDelta(
      payment.providerId,
      payment.providerType,
      { pendingBalance: payment.providerAmount },
      prisma,
    );
  }

  private async applyRefundLedger(
    payment: { id: string; providerId: string; providerType: ProviderTypeValue; providerAmount: number },
    reason?: string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const created = await this.createLedgerEntryIfMissing(
      {
        paymentId: payment.id,
        providerId: payment.providerId,
        providerType: payment.providerType,
        entryType: 'refund_debit',
        amount: payment.providerAmount,
        metadata: reason ? ({ reason } as Prisma.InputJsonValue) : undefined,
      },
      prisma,
    );

    if (!created) {
      return;
    }

    await this.applyWalletDelta(
      payment.providerId,
      payment.providerType,
      { pendingBalance: -payment.providerAmount },
      prisma,
    );
  }

  private async applyPayoutReleaseLedger(
    payment: { id: string; providerId: string; providerType: ProviderTypeValue; providerAmount: number },
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const created = await this.createLedgerEntryIfMissing(
      {
        paymentId: payment.id,
        providerId: payment.providerId,
        providerType: payment.providerType,
        entryType: 'payout_release_credit',
        amount: payment.providerAmount,
      },
      prisma,
    );

    if (!created) {
      return;
    }

    await this.applyWalletDelta(
      payment.providerId,
      payment.providerType,
      {
        pendingBalance: -payment.providerAmount,
        availableBalance: payment.providerAmount,
        totalEarnings: payment.providerAmount,
      },
      prisma,
    );
  }

  private async createLedgerEntryIfMissing(
    params: {
      paymentId: string;
      providerId: string;
      providerType: ProviderTypeValue;
      entryType: LedgerEntryTypeValue;
      amount: number;
      metadata?: Prisma.InputJsonValue;
    },
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const existing = await this.ledger.findByPaymentAndType(
      params.paymentId,
      params.entryType,
      prisma,
    );
    if (existing) {
      return false;
    }

    await this.ledger.create(
      {
        payment: { connect: { id: params.paymentId } },
        providerId: params.providerId,
        providerType: params.providerType,
        entryType: params.entryType,
        amount: params.amount,
        metadata: params.metadata,
      },
      prisma,
    );
    return true;
  }

  private async processWebhookEvent(event: Record<string, any>) {
    if (event?.event === 'charge.success') {
      const reference = event?.data?.reference as string | undefined;
      if (!reference) {
        return;
      }

      const checkout = await this.checkouts.findByPaystackReference(reference);
      if (checkout) {
        const authorizationCode = event?.data?.authorization?.authorization_code as string | undefined;
        await this.markCheckoutPaid(checkout.id, authorizationCode);
        return;
      }

      const payment = await this.payments.findByPaystackReference(reference);
      if (!payment) {
        return;
      }
      if (reference.startsWith('DEP_')) {
        await this.markDepositPaid(payment);
      } else if (reference.startsWith('REM_')) {
        await this.markRemainingCaptured(payment);
      }
      return;
    }

    if (event?.event === 'charge.failed') {
      const reference = event?.data?.reference as string | undefined;
      if (!reference) {
        return;
      }
      const checkout = await this.checkouts.findByPaystackReference(reference);
      if (checkout && checkout.status === 'pending') {
        await this.markCheckoutFailed(checkout.id);
      }
    }
  }

  private async syncBookingPaymentStatus(
    payment: { bookingType: string; bookingId: string; bookingIds?: string[]; remainingAmount?: number },
    status: 'paid' | 'refunded',
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const client = prisma as unknown as {
      booking?: { updateMany: (args: any) => Promise<unknown> };
    };

    if (payment.bookingType !== 'Booking' || !client.booking?.updateMany) {
      return;
    }

    const bookingIds = payment.bookingIds?.length ? payment.bookingIds : [payment.bookingId];
    const resolvedStatus =
      status === 'paid' && (payment.remainingAmount ?? 0) > 0
        ? 'partial'
        : status;
    await client.booking.updateMany({
      where: { id: { in: bookingIds } },
      data: { paymentStatus: resolvedStatus },
    });
  }

  async releaseProviderPayout(paymentId: string) {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundException({ message: 'Payment not found', error: 'Payment not found' });
    }

    if (payment.payoutStatus !== 'pending') {
      return { success: false, message: 'Payment not eligible for release' };
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await this.payments.update(
        payment.id,
        { payoutStatus: 'released', payoutReleasedAt: new Date() },
        tx,
      );
      await this.applyPayoutReleaseLedger(updated, tx);
    });

    return { success: true, message: 'Payout released to provider' };
  }

  private async markRemainingCaptured(payment: {
    id: string;
    remainingStatus: string;
    bookingType: string;
    bookingId: string;
    bookingIds?: string[];
  }) {
    if (payment.remainingStatus === 'captured') {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payments.update(
        payment.id,
        {
          remainingStatus: 'captured',
          remainingCapturedAt: new Date(),
        },
        tx,
      );

      await this.syncBookingPaymentStatus(
        { ...payment, remainingAmount: 0 },
        'paid',
        tx,
      );
    });
  }

  private resolveWebhookEventId(event: Record<string, any>) {
    const eventType = event?.event ?? 'unknown';
    const dataId = event?.data?.id ?? event?.data?.reference ?? 'unknown';
    return `${eventType}:${dataId}`;
  }

  private async buildProviderSnapshot(providerId: string, providerType: ProviderTypeValue) {
    const user = await this.users.findById(providerId);
    if (!user) {
      return { _id: providerId, name: 'Provider', email: '' };
    }

    const providerName = await this.resolveProviderName(providerId, providerType, user);

    return {
      _id: providerId,
      name: providerName,
      email: user.email,
    };
  }

  private async resolveProviderName(providerId: string, providerType: ProviderTypeValue, user: User) {
    if (providerType === 'salon') {
      const salon = await this.salons.findByUserId(providerId);
      if (salon?.business_name) {
        return salon.business_name;
      }
    }

    if (providerType === 'stylist') {
      const stylist = await this.stylists.findByUserId(providerId);
      if (stylist?.business_name) {
        return stylist.business_name;
      }
    }

    return this.buildUserFullName(user);
  }

  private async attachCustomerSnapshots(payments: Array<{ customerId: string } & Record<string, any>>) {
    return Promise.all(
      payments.map(async (payment) => {
        const customer = await this.users.findById(payment.customerId);
        return {
          ...payment,
          customerId: {
            _id: payment.customerId,
            name: customer ? this.buildUserFullName(customer) : 'Customer',
            email: customer?.email ?? '',
          },
        };
      }),
    );
  }

  private buildUserFullName(user?: Pick<User, 'firstName' | 'middleName' | 'lastName'> | null) {
    if (!user) {
      return '';
    }

    return [user.firstName ?? null, user.middleName ?? null, user.lastName ?? null]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ');
  }
}
