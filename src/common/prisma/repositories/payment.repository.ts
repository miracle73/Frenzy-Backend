import { Injectable } from '@nestjs/common';
import { Prisma, Payment } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type ProviderTypeValue = 'salon' | 'stylist';

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.PaymentCreateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Payment> {
    return prisma.payment.create({ data });
  }

  findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  findByPaystackDepositRef(reference: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { paystackDepositRef: reference } });
  }

  findByPaystackReference(reference: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: {
        OR: [{ paystackDepositRef: reference }, { paystackRemainingRef: reference }],
      },
    });
  }

  listByCustomerId(customerId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByProvider(
    providerId: string,
    providerType?: ProviderTypeValue,
  ): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: {
        providerId,
        ...(providerType ? { providerType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBookingId(bookingId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: {
        OR: [
          { bookingId },
          { bookingIds: { has: bookingId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByCheckoutId(
    checkoutId: string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Payment[]> {
    return prisma.payment.findMany({
      where: { checkoutId },
      orderBy: { createdAt: 'asc' },
    });
  }

  update(
    id: string,
    data: Prisma.PaymentUpdateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Payment> {
    return prisma.payment.update({ where: { id }, data });
  }
}
