import { Injectable } from '@nestjs/common';
import { Prisma, Stylist } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class StylistRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Stylist | null> {
    return this.prisma.stylist.findUnique({ where: { id } });
  }

  findByUserId(
    userId: string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Stylist | null> {
    return prisma.stylist.findUnique({ where: { userId } });
  }

  findByEmail(email: string): Promise<Stylist | null> {
    return this.prisma.stylist.findUnique({ where: { email } });
  }

  create(data: Prisma.StylistCreateInput): Promise<Stylist> {
    return this.prisma.stylist.create({ data });
  }

  update(
    id: string,
    data: Prisma.StylistUpdateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Stylist> {
    return prisma.stylist.update({ where: { id }, data });
  }
}
