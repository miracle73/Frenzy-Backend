import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { BookingRepository } from './repositories/booking.repository';
import { PaymentLedgerRepository } from './repositories/payment-ledger.repository';
import { PaymentCheckoutRepository } from './repositories/payment-checkout.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { PaystackWebhookEventRepository } from './repositories/paystack-webhook-event.repository';
import { SalonRepository } from './repositories/salon.repository';
import { StylistRepository } from './repositories/stylist.repository';
import { SubaccountRepository } from './repositories/subaccount.repository';
import { UserRepository } from './repositories/user.repository';
import { ServiceDiscountRepository } from './repositories/service-discount.repository';
import { WithdrawalRequestRepository } from './repositories/withdrawal-request.repository';

@Global()
@Module({
  providers: [
    PrismaService,
    BookingRepository,
    UserRepository,
    SalonRepository,
    StylistRepository,
    PaymentLedgerRepository,
    PaymentCheckoutRepository,
    PaymentRepository,
    SubaccountRepository,
    PaystackWebhookEventRepository,
    ServiceDiscountRepository,
    WithdrawalRequestRepository,
  ],
  exports: [
    PrismaService,
    BookingRepository,
    UserRepository,
    SalonRepository,
    StylistRepository,
    PaymentLedgerRepository,
    PaymentCheckoutRepository,
    PaymentRepository,
    SubaccountRepository,
    PaystackWebhookEventRepository,
    ServiceDiscountRepository,
    WithdrawalRequestRepository,
  ],
})
export class PrismaModule {}
