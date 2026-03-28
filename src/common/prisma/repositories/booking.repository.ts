import { Injectable } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BookingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.BookingCreateInput): Promise<Booking> {
    return this.prisma.booking.create({ data });
  }

  createMany(data: Prisma.BookingCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return this.prisma.booking.createMany({ data });
  }

  findById(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.BookingUpdateInput): Promise<Booking> {
    return this.prisma.booking.update({ where: { id }, data });
  }

  updateMany(where: Prisma.BookingUpdateManyArgs['where'], data: Prisma.BookingUpdateManyArgs['data']) {
    return this.prisma.booking.updateMany({ where, data });
  }

  findMany(args: Prisma.BookingFindManyArgs): Promise<Booking[]> {
    return this.prisma.booking.findMany(args);
  }

  count(args: Prisma.BookingCountArgs): Promise<number> {
    return this.prisma.booking.count(args);
  }
}
