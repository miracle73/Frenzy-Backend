import { Injectable } from '@nestjs/common';
import { PaymentCheckout, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PaymentCheckoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.PaymentCheckoutCreateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PaymentCheckout> {
    return prisma.paymentCheckout.create({ data });
  }

  findById(id: string): Promise<PaymentCheckout | null> {
    return this.prisma.paymentCheckout.findUnique({ where: { id } });
  }

  findByPaystackReference(paystackReference: string): Promise<PaymentCheckout | null> {
    return this.prisma.paymentCheckout.findUnique({ where: { paystackReference } });
  }

  findByCustomerAndClientCheckoutId(
    customerId: string,
    clientCheckoutId: string,
  ): Promise<PaymentCheckout | null> {
    return this.prisma.paymentCheckout.findUnique({
      where: {
        customerId_clientCheckoutId: {
          customerId,
          clientCheckoutId,
        },
      },
    });
  }

  update(
    id: string,
    data: Prisma.PaymentCheckoutUpdateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PaymentCheckout> {
    return prisma.paymentCheckout.update({ where: { id }, data });
  }

  listPayments(checkoutId: string) {
    return this.prisma.payment.findMany({ where: { checkoutId } });
  }
}
