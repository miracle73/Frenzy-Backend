import { Injectable } from '@nestjs/common';
import { Prisma, ServiceDiscount } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ServiceDiscountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(): Promise<ServiceDiscount[]> {
    return this.prisma.serviceDiscount.findMany({ where: { isActive: true } });
  }

  findAll(): Promise<ServiceDiscount[]> {
    return this.prisma.serviceDiscount.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findById(id: string): Promise<ServiceDiscount | null> {
    return this.prisma.serviceDiscount.findUnique({ where: { id } });
  }

  create(data: Prisma.ServiceDiscountCreateInput): Promise<ServiceDiscount> {
    return this.prisma.serviceDiscount.create({ data });
  }

  update(id: string, data: Prisma.ServiceDiscountUpdateInput): Promise<ServiceDiscount> {
    return this.prisma.serviceDiscount.update({ where: { id }, data });
  }

  delete(id: string): Promise<ServiceDiscount> {
    return this.prisma.serviceDiscount.delete({ where: { id } });
  }
}
