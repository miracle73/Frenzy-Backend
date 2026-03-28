import { Injectable } from '@nestjs/common';
import { Prisma, PaystackWebhookEvent } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PaystackWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEventId(paystackEventId: string): Promise<PaystackWebhookEvent | null> {
    return this.prisma.paystackWebhookEvent.findUnique({ where: { paystackEventId } });
  }

  create(data: Prisma.PaystackWebhookEventCreateInput): Promise<PaystackWebhookEvent> {
    return this.prisma.paystackWebhookEvent.create({ data });
  }
}
