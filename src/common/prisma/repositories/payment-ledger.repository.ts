import { Injectable } from '@nestjs/common';
import { Prisma, PaymentLedger } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type LedgerEntryTypeValue =
  | 'deposit_pending_credit'
  | 'payout_release_credit'
  | 'withdrawal_debit'
  | 'refund_debit';

@Injectable()
export class PaymentLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.PaymentLedgerCreateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PaymentLedger> {
    return prisma.paymentLedger.create({ data });
  }

  findByPaymentAndType(
    paymentId: string,
    entryType: LedgerEntryTypeValue,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PaymentLedger | null> {
    return prisma.paymentLedger.findFirst({
      where: {
        paymentId,
        entryType,
      },
    });
  }
}
