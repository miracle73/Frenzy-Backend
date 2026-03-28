import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymentsService } from './payments.service';

const createMocks = () => {
  const config = { get: jest.fn() };
  const paystack = {
    initializeTransaction: jest.fn(),
    verifyTransaction: jest.fn(),
    createSubaccount: jest.fn(),
    listBanks: jest.fn(),
    createTransferRecipient: jest.fn(),
    createTransfer: jest.fn(),
    refund: jest.fn(),
  };
  const payments = {
    create: jest.fn(),
    findByPaystackDepositRef: jest.fn(),
    update: jest.fn(),
    findByPaystackReference: jest.fn(),
    findById: jest.fn(),
    listByCustomerId: jest.fn(),
    listByProvider: jest.fn(),
    listByCheckoutId: jest.fn(),
  };
  const checkouts = {
    create: jest.fn(),
    findById: jest.fn(),
    findByPaystackReference: jest.fn(),
    findByCustomerAndClientCheckoutId: jest.fn(),
    update: jest.fn(),
  };
  const ledger = {
    create: jest.fn(),
    findByPaymentAndType: jest.fn(),
  };
  const withdrawals = {
    create: jest.fn(),
    update: jest.fn(),
  };
  const serviceDiscounts = {
    findActive: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const subaccounts = {
    findByUserId: jest.fn(),
    create: jest.fn(),
  };
  const webhookEvents = {
    findByEventId: jest.fn(),
    create: jest.fn(),
  };
  const users = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
  };
  const salons = {
    findByUserId: jest.fn(),
    update: jest.fn(),
  };
  const stylists = {
    findByUserId: jest.fn(),
    update: jest.fn(),
  };
  const prisma = {
    booking: {
      findMany: jest.fn(),
    },
    salon: {
      findUnique: jest.fn(),
    },
    stylist: {
      findUnique: jest.fn(),
    },
    paymentCheckout: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    subaccount: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
  };

  return {
    config,
    paystack,
    checkouts,
    payments,
    ledger,
    withdrawals,
    serviceDiscounts,
    subaccounts,
    webhookEvents,
    users,
    salons,
    stylists,
    prisma,
  };
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    mocks.config.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'https://primlook.test';
      if (key === 'PAYSTACK_SECRET_KEY') return 'test_secret';
      return undefined;
    });

    service = new PaymentsService(
      mocks.config as any,
      mocks.paystack as any,
      mocks.checkouts as any,
      mocks.payments as any,
      mocks.ledger as any,
      mocks.withdrawals as any,
      mocks.serviceDiscounts as any,
      mocks.subaccounts as any,
      mocks.webhookEvents as any,
      mocks.users as any,
      mocks.salons as any,
      mocks.stylists as any,
      mocks.prisma as any,
    );
  });

  it('verifies payment and writes ledger + wallet snapshot', async () => {
    const payment = {
      id: 'payment-1',
      depositStatus: 'pending',
      providerId: 'provider-1',
      providerType: 'salon',
      providerAmount: 120,
    };
    mocks.checkouts.findByPaystackReference.mockResolvedValue(null);
    mocks.payments.findByPaystackDepositRef.mockResolvedValue(payment);
    mocks.paystack.verifyTransaction.mockResolvedValue({
      data: { status: 'success', authorization: { authorization_code: 'AUTH' } },
    });
    mocks.payments.update.mockResolvedValue({ ...payment, depositStatus: 'paid' });
    mocks.ledger.findByPaymentAndType.mockResolvedValue(null);
    mocks.salons.findByUserId.mockResolvedValue({
      id: 'salon-1',
      wallet: { pendingBalance: 0, availableBalance: 0, totalEarnings: 0, totalWithdrawn: 0 },
    });

    await service.verifyPayment('DEP_payment-1');

    expect(mocks.ledger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'provider-1',
        entryType: 'deposit_pending_credit',
        amount: 120,
      }),
      expect.anything(),
    );
    expect(mocks.salons.update).toHaveBeenCalledWith(
      'salon-1',
      expect.objectContaining({
        wallet: expect.objectContaining({ pendingBalance: 120 }),
      }),
      expect.anything(),
    );
  });

  it('returns early for duplicate webhook events', async () => {
    const payload = {
      event: 'charge.success',
      data: { id: 'evt-1', reference: 'DEP_payment-1' },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha512', 'test_secret').update(rawBody).digest('hex');

    mocks.webhookEvents.findByEventId.mockResolvedValue({ id: 'evt-1' });

    const result = await service.handleWebhook(payload, rawBody, signature);

    expect(result).toEqual({ status: 200, message: 'Already processed' });
    expect(mocks.payments.findByPaystackReference).not.toHaveBeenCalled();
  });

  it('records withdrawal ledger and updates wallet snapshot', async () => {
    const user = { userId: 'user-1', email: 'a@b.com', accountType: 'stylist' };
    mocks.stylists.findByUserId.mockResolvedValue({
      id: 'stylist-1',
      wallet: { pendingBalance: 0, availableBalance: 500, totalEarnings: 0, totalWithdrawn: 0 },
    });
    mocks.subaccounts.findByUserId.mockResolvedValue({
      bankName: 'GTB',
      accountNumber: '123',
      accountName: 'Test',
      paystackSubaccountCode: 'SUB',
    });
    mocks.paystack.listBanks.mockResolvedValue({ data: [{ name: 'GTB', code: '058' }] });
    mocks.paystack.createTransferRecipient.mockResolvedValue({ data: { recipient_code: 'RCPT' } });
    mocks.paystack.createTransfer.mockResolvedValue({ data: { transfer_code: 'TRX' } });
    mocks.withdrawals.create.mockResolvedValue({ id: 'withdraw-1' });
    mocks.withdrawals.update.mockResolvedValue({ id: 'withdraw-1' });

    await service.withdrawFunds(user as any, { amount: 100 });

    expect(mocks.ledger.create).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: 'withdrawal_debit', amount: 100 }),
      expect.anything(),
    );
    expect(mocks.stylists.update).toHaveBeenCalledWith(
      'stylist-1',
      expect.objectContaining({
        wallet: expect.objectContaining({ availableBalance: 400, totalWithdrawn: 100 }),
      }),
      expect.anything(),
    );
  });

  it('rejects refund when no deposit amount', async () => {
    mocks.payments.findById.mockResolvedValue({ id: 'payment-1', depositAmount: 0 });

    await expect(service.processRefund({ paymentId: 'payment-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('processes refund and records ledger', async () => {
    const payment = {
      id: 'payment-1',
      depositAmount: 100,
      providerAmount: 80,
      providerId: 'provider-1',
      providerType: 'salon',
      paystackDepositRef: 'DEP_payment-1',
    };
    mocks.payments.findById.mockResolvedValue(payment);
    mocks.paystack.refund.mockResolvedValue({ data: {} });
    mocks.payments.update.mockResolvedValue({ ...payment, depositStatus: 'refunded' });
    mocks.ledger.findByPaymentAndType.mockResolvedValue(null);
    mocks.salons.findByUserId.mockResolvedValue({
      id: 'salon-1',
      wallet: { pendingBalance: 80, availableBalance: 0, totalEarnings: 0, totalWithdrawn: 0 },
    });

    await service.processRefund({ paymentId: 'payment-1', reason: 'cancel' });

    expect(mocks.ledger.create).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: 'refund_debit', amount: 80 }),
      expect.anything(),
    );
    expect(mocks.salons.update).toHaveBeenCalledWith(
      'salon-1',
      expect.objectContaining({
        wallet: expect.objectContaining({ pendingBalance: 0 }),
      }),
      expect.anything(),
    );
  });

  it('initializes one checkout with provider-scoped payment rows for mixed providers', async () => {
    const user = { userId: 'customer-1', email: 'customer@test.com', accountType: 'customer' };
    const bookings = [
      {
        id: 'booking-1',
        customerId: 'customer-1',
        providerType: 'salon',
        salonId: 'salon-profile-1',
        stylistId: null,
        totalAmount: 10000,
        transportFare: 0,
        services: [{ name: 'Cut', price: 5000 }],
        paymentStatus: 'unpaid',
        groupBookingId: 'group-1',
      },
      {
        id: 'booking-2',
        customerId: 'customer-1',
        providerType: 'stylist',
        salonId: null,
        stylistId: 'stylist-profile-1',
        totalAmount: 15000,
        transportFare: 1000,
        services: [{ name: 'Braids', price: 7000 }],
        paymentStatus: 'unpaid',
        groupBookingId: 'group-1',
      },
    ];

    mocks.prisma.booking.findMany.mockResolvedValue(bookings);
    mocks.checkouts.findByCustomerAndClientCheckoutId.mockResolvedValue(null);
    mocks.prisma.salon.findUnique.mockResolvedValue({ userId: 'salon-user-1', email: 'salon@test.com' });
    mocks.prisma.stylist.findUnique.mockResolvedValue({ userId: 'stylist-user-1', email: 'stylist@test.com' });
    mocks.checkouts.create.mockResolvedValue({ id: 'checkout-1', totalAmount: 26000 } as any);
    mocks.checkouts.update.mockResolvedValue({
      id: 'checkout-1',
      totalAmount: 26000,
      paystackReference: 'CHK_checkout-1',
      paystackAuthorizationUrl: 'https://paystack.test/checkout',
      status: 'pending',
    } as any);
    mocks.paystack.initializeTransaction.mockResolvedValue({
      data: {
        reference: 'CHK_checkout-1',
        authorization_url: 'https://paystack.test/checkout',
      },
    });

    const tx = {
      subaccount: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ paystackSubaccountCode: 'SUB1' })
          .mockResolvedValueOnce({ paystackSubaccountCode: 'SUB2' }),
      },
      payment: {
        create: jest.fn(),
      },
    };
    mocks.prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));

    const result = await service.initializePayment(user as any, {
      bookingIds: ['booking-1', 'booking-2'],
      groupBookingId: 'group-1',
      clientCheckoutId: 'checkout-key-1',
    } as any);

    expect(mocks.checkouts.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.data.reference).toBe('CHK_checkout-1');
  });
});
