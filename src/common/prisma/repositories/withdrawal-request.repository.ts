import { Injectable } from '@nestjs/common';
import { Prisma, WithdrawalRequest } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WithdrawalRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.WithdrawalRequestCreateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<WithdrawalRequest> {
    return prisma.withdrawalRequest.create({ data });
  }

  update(
    id: string,
    data: Prisma.WithdrawalRequestUpdateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<WithdrawalRequest> {
    return prisma.withdrawalRequest.update({ where: { id }, data });
  }
}
