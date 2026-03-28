import { Injectable } from '@nestjs/common';
import { Prisma, Salon } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SalonRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Salon | null> {
    return this.prisma.salon.findUnique({ where: { id } });
  }

  findByUserId(
    userId: string,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Salon | null> {
    return prisma.salon.findUnique({ where: { userId } });
  }

  findByEmail(email: string): Promise<Salon | null> {
    return this.prisma.salon.findUnique({ where: { email } });
  }

  create(data: Prisma.SalonCreateInput): Promise<Salon> {
    return this.prisma.salon.create({ data });
  }

  update(
    id: string,
    data: Prisma.SalonUpdateInput,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Salon> {
    return prisma.salon.update({ where: { id }, data });
  }
}
