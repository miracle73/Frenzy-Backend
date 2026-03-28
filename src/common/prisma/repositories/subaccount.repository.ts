import { Injectable } from '@nestjs/common';
import { Prisma, Subaccount } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SubaccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<Subaccount | null> {
    return this.prisma.subaccount.findUnique({ where: { userId } });
  }

  create(data: Prisma.SubaccountCreateInput): Promise<Subaccount> {
    return this.prisma.subaccount.create({ data });
  }
}
