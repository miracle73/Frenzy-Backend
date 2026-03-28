import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { BookingCancelledBy, BookingPaymentStatus, BookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRepository } from '../../common/prisma/repositories/user.repository';
import { SalonRepository } from '../../common/prisma/repositories/salon.repository';
import { StylistRepository } from '../../common/prisma/repositories/stylist.repository';
import { MailService } from '../../common/mail/mail.service';
import type { AuthUserPayload } from '../auth/types/auth.types';
import { PaymentsService } from '../payments/payments.service';
import { CheckAvailabilityDto, AvailabilityItemDto } from './dto/check-availability.dto';
import { CreateBookingDto, BookingPersonDto } from './dto/create-booking.dto';
import { VendorCreateBookingDto } from './dto/vendor-create-booking.dto';
import { RateBookingDto } from './dto/rate-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'in_progress'];

type ProviderTypeValue = 'salon' | 'stylist';

type BookingTimeSlot = {
  preferredDate: string;
  preferredTime: string;
  totalDuration: number;
  salonId?: string;
  stylistId?: string;
  providerType?: string;
  serviceType?: string;
};

type AvailabilityResult = {
  available: boolean;
  reason?: string;
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly salons: SalonRepository,
    private readonly stylists: StylistRepository,
    private readonly users: UserRepository,
    private readonly payments: PaymentsService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createBooking(user: AuthUserPayload, dto: CreateBookingDto) {
    if (!user?.userId) {
      throw new BadRequestException({
        success: false,
        message: 'Authentication required',
      });
    }

    const isMulti = Array.isArray(dto.persons) && dto.persons.length > 0;
    if (!isMulti) {
      return this.createSingleBooking(user, dto, dto.callbackUrl);
    }

    const groupBookingId = dto.groupBookingId ?? randomUUID();
    const persons = dto.persons ?? [];
    const validations = await this.validateMultiBookingPersons(persons);
    if (validations.errors.length > 0) {
      throw new BadRequestException({
        success: false,
        message: 'One or more multi-booking entries are invalid',
        errors: validations.errors,
      });
    }

    const createdBookings = await this.prisma.$transaction(async (tx) => {
      const records: any[] = [];
      for (const item of validations.valid) {
        const booking = await tx.booking.create({
          data: this.buildBookingCreateInput(
            user.userId,
            item.person,
            {
              isGroupBooking: true,
              groupBookingId,
              personName: item.person.personName,
            },
            item.providerType,
            item.providerId,
            item.preferredDate,
            item.serviceType,
          ),
          include: { salon: true, stylist: true, customer: true },
        });
        records.push(booking);
      }
      return records;
    });

    const response: Record<string, unknown> = {
      success: true,
      message: `Successfully created ${createdBookings.length} booking(s)`,
      bookings: createdBookings,
      groupBookingId,
    };

    await this.attachPaymentInitialization(response, user, createdBookings, groupBookingId, dto.callbackUrl);

    return response;
  }

  async getBookedSlots(providerType: string, providerId: string, date: string) {
    if (!providerType || !providerId || !date) {
      throw new BadRequestException({
        message: 'providerType, providerId, and date are required',
        error: 'providerType, providerId, and date are required',
      });
    }

    const normalizedType = providerType === 'salon' ? 'salon' : 'stylist';
    const preferredDate = this.normalizePreferredDate(date);
    const start = this.startOfDay(preferredDate);
    const end = this.endOfDay(preferredDate);

    const bookings = await this.prisma.booking.findMany({
      where: {
        ...(normalizedType === 'salon' ? { salonId: providerId } : { stylistId: providerId }),
        status: { in: ACTIVE_STATUSES },
        preferredDate: { gte: start, lt: end },
      },
      select: {
        preferredTime: true,
        totalDuration: true,
      },
    });

    const slots = bookings
      .filter((b) => b.preferredTime)
      .map((b) => ({
        time: b.preferredTime,
        duration: b.totalDuration ?? 0,
      }));

    return { success: true, slots };
  }

  async checkAvailability(dto: CheckAvailabilityDto) {
    const items = Array.isArray(dto.persons) && dto.persons.length > 0 ? dto.persons : [dto];
    const results: AvailabilityResult[] = [];

    for (const person of items) {
      results.push(await this.evaluateAvailability(person));
    }

    if (Array.isArray(dto.persons) && dto.persons.length > 0) {
      return { success: true, results };
    }

    return {
      success: true,
      available: results[0]?.available ?? false,
      reason: results[0]?.reason,
    };
  }

  async getCustomerBookings(user: AuthUserPayload, status?: string) {
    const statusFilter = this.coerceBookingStatus(status);
    const bookings = await this.prisma.booking.findMany({
      where: {
        customerId: user.userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        salon: true,
        stylist: true,
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, bookings, total: bookings.length };
  }

  async getProviderBookings(user: AuthUserPayload, status?: string) {
    const provider = await this.resolveProviderProfile(user);
    if (!provider) {
      throw new NotFoundException({ message: 'Provider profile not found', error: 'Provider profile not found' });
    }

    const statusFilter = this.coerceBookingStatus(status);

    const bookings = await this.prisma.booking.findMany({
      where: {
        ...(provider.providerType === 'salon'
          ? { salonId: provider.providerId }
          : { stylistId: provider.providerId }),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        salon: true,
        stylist: true,
        customer: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, bookings, total: bookings.length };
  }

  async getBookingById(user: AuthUserPayload, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { salon: true, stylist: true, customer: true },
    });

    if (!booking) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    if (!(await this.canAccessBooking(user, booking))) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    return { success: true, booking };
  }

  async updateBookingStatus(
    user: AuthUserPayload,
    bookingId: string,
    dto: UpdateBookingStatusDto,
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    if (!(await this.canAccessBooking(user, booking))) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    const updates: Prisma.BookingUpdateInput = {};

    if (dto.status) {
      updates.status = dto.status as BookingStatus;
      if (dto.status === 'cancelled') {
        // Prevent cancellation when service is already in progress
        if (booking.status === 'in_progress') {
          throw new BadRequestException({
            message: 'Cannot cancel a booking that is already in progress',
            error: 'CANCEL_IN_PROGRESS',
          });
        }

        // Prevent cancellation within 2 hours of appointment
        const appointmentDateTime = this.parseBookingDateTime(
          booking.preferredDate,
          booking.preferredTime,
        );
        if (appointmentDateTime) {
          const hoursUntil = (appointmentDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursUntil >= 0 && hoursUntil < 2) {
            throw new BadRequestException({
              message: 'Cannot cancel within 2 hours of the appointment time',
              error: 'CANCEL_TOO_LATE',
            });
          }
        }

        updates.cancelledAt = new Date();
        updates.cancellationReason = dto.reason ?? null;
        const cancelledBy = ['customer', 'stylist', 'salon', 'admin'].includes(user.accountType)
          ? (user.accountType as BookingCancelledBy)
          : null;
        updates.cancelledBy = cancelledBy;
      }
      if (dto.status === 'confirmed') {
        updates.acceptedAt = new Date();
      }
      if (dto.status === 'in_progress') {
        updates.startedAt = new Date();
      }
      if (dto.status === 'completed') {
        updates.completedAt = new Date();
      }
    }

    if (dto.paymentStatus) {
      updates.paymentStatus = dto.paymentStatus as BookingPaymentStatus;
    }

    if (dto.transportFare !== undefined) {
      updates.transportFare = dto.transportFare;
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: updates,
      include: { salon: true, stylist: true, customer: true },
    });

    // Auto-release payout when booking is completed and paid
    if (
      dto.status === 'completed' &&
      booking.paymentStatus === 'paid'
    ) {
      try {
        const payment = await this.payments.findPaymentByBookingId(bookingId);
        if (payment) {
          await this.payments.releaseProviderPayout(payment.id);
          this.logger.log(`bookings.auto_payout_release bookingId=${bookingId} paymentId=${payment.id}`);
        }
      } catch (payoutError) {
        this.logger.warn(
          `bookings.auto_payout_release_failed bookingId=${bookingId} error=${
            payoutError instanceof Error ? payoutError.message : String(payoutError)
          }`,
        );
      }
    }

    // Auto-refund when booking is cancelled and was paid (customer or vendor)
    if (
      dto.status === 'cancelled' &&
      booking.paymentStatus === 'paid'
    ) {
      try {
        const payment = await this.payments.findPaymentByBookingId(bookingId);
        if (payment) {
          const cancellerLabel = user.accountType === 'customer' ? 'Customer' : 'Vendor';
          await this.payments.processRefund({
            paymentId: payment.id,
            reason: dto.reason ?? `${cancellerLabel} cancelled booking`,
          });
          this.logger.log(`bookings.auto_refund bookingId=${bookingId} paymentId=${payment.id} by=${user.accountType}`);
        }
      } catch (refundError) {
        this.logger.warn(
          `bookings.auto_refund_failed bookingId=${bookingId} error=${
            refundError instanceof Error ? refundError.message : String(refundError)
          }`,
        );
      }
    }

    return { success: true, booking: updated };
  }

  async rateBooking(user: AuthUserPayload, bookingId: string, dto: RateBookingDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    if (booking.status !== 'completed') {
      throw new BadRequestException({
        message: 'You can only rate a completed booking',
        error: 'BOOKING_NOT_COMPLETED',
      });
    }

    const isCustomer = booking.customerId === user.userId;
    const isProvider = await this.canAccessBooking(user, booking) && !isCustomer;

    if (!isCustomer && !isProvider) {
      throw new NotFoundException({ message: 'Booking not found', error: 'Booking not found' });
    }

    const ratingData = { score: dto.rating, comment: dto.comment } as Prisma.InputJsonValue;

    if (isCustomer) {
      if (booking.rating) {
        throw new BadRequestException({ message: 'You have already rated this booking', error: 'ALREADY_RATED' });
      }
      const updated = await this.prisma.booking.update({
        where: { id: bookingId },
        data: { rating: ratingData },
        include: { salon: true, stylist: true, customer: true },
      });
      return { success: true, booking: updated };
    }

    // Provider rating
    if (booking.providerRating) {
      throw new BadRequestException({ message: 'You have already rated this customer', error: 'ALREADY_RATED' });
    }
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { providerRating: ratingData },
      include: { salon: true, stylist: true, customer: true },
    });
    return { success: true, booking: updated };
  }

  private parseBookingDateTime(
    preferredDate: Date | string,
    preferredTime: string,
  ): Date | null {
    try {
      const dateStr = preferredDate instanceof Date
        ? preferredDate.toISOString().split('T')[0]
        : new Date(preferredDate).toISOString().split('T')[0];
      const timeParts = preferredTime.match(/(\d{1,2}):(\d{2})/);
      if (!timeParts) return null;
      return new Date(`${dateStr}T${timeParts[1].padStart(2, '0')}:${timeParts[2]}:00`);
    } catch {
      return null;
    }
  }

  async getProviderSummary(user: AuthUserPayload) {
    const provider = await this.resolveProviderProfile(user);
    if (!provider) {
      throw new NotFoundException({ message: 'Provider profile not found', error: 'Provider profile not found' });
    }

    const where = provider.providerType === 'salon'
      ? { salonId: provider.providerId }
      : { stylistId: provider.providerId };

    const todayStart = this.startOfDay(new Date());
    const todayEnd = this.endOfDay(todayStart);

    const [totalBookings, pendingBookings, todayBookings] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.count({ where: { ...where, status: 'pending' } }),
      this.prisma.booking.count({
        where: {
          ...where,
          preferredDate: { gte: todayStart, lt: todayEnd },
        },
      }),
    ]);

    return {
      success: true,
      summary: {
        totalBookings,
        todayBookings,
        pendingBookings,
      },
    };
  }

  async lookupCustomer(email?: string, phone?: string) {
    if (!email && !phone) {
      throw new BadRequestException({
        message: 'Provide email or phone to search',
        error: 'Provide email or phone to search',
      });
    }

    let user = email ? await this.users.findByEmail(email.toLowerCase().trim()) : null;
    if (!user && phone) {
      user = await this.users.findByPhone(phone.trim());
    }

    if (!user) {
      return { found: false };
    }

    return {
      found: true,
      customer: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImgUrl: user.profileImgUrl,
      },
    };
  }

  async createBookingForCustomer(vendorUser: AuthUserPayload, dto: VendorCreateBookingDto) {
    const provider = await this.resolveProviderProfile(vendorUser);
    if (!provider) {
      throw new NotFoundException({
        message: 'Provider profile not found',
        error: 'Provider profile not found',
      });
    }

    const email = dto.customerEmail.toLowerCase().trim();
    let customer = await this.users.findByEmail(email);
    let isNewUser = false;
    let generatedPassword: string | null = null;

    if (!customer) {
      generatedPassword = randomBytes(4).toString('hex');
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      customer = await this.users.create({
        email,
        phoneNumber: dto.customerPhone.trim(),
        firstName: dto.customerFirstName.trim(),
        lastName: dto.customerLastName.trim(),
        accountType: 'customer',
        password: hashedPassword,
        verifyStatus: true,
      });
      isNewUser = true;
    }

    const serviceType = this.resolveServiceType(provider.providerType, dto.serviceType);
    const preferredDate = this.normalizePreferredDate(dto.preferredDate);

    const depositPercent = dto.depositPercent ?? 100;

    const bookingData = this.buildBookingCreateInput(
      customer.id,
      {
        services: dto.services,
        totalAmount: dto.totalAmount,
        totalDuration: dto.totalDuration,
        transportFare: dto.transportFare ?? 0,
        location: dto.location,
        customerPhone: dto.customerPhone,
        preferredDate: dto.preferredDate,
        preferredTime: dto.preferredTime,
        notes: dto.notes,
        ...(provider.providerType === 'salon'
          ? { salonId: provider.providerId }
          : { stylistId: provider.providerId }),
      },
      { isGroupBooking: false },
      provider.providerType,
      provider.providerId,
      preferredDate,
      serviceType,
    );

    bookingData.depositPercent = depositPercent;

    const booking = await this.prisma.booking.create({
      data: bookingData,
      include: { salon: true, stylist: true, customer: true },
    });

    let paymentUrl: string | null = null;
    try {
      const fakeUserPayload: AuthUserPayload = {
        userId: customer.id,
        email: customer.email,
        accountType: 'customer',
      };
      const vendorCallbackBase = this.config.get<string>('VENDOR_PAYMENT_CALLBACK_URL') ?? '';
      const vendorCallbackUrl = vendorCallbackBase
        ? `${vendorCallbackBase}/payment/vendor-verify`
        : undefined;
      const paymentResult = await this.payments.initializePayment(fakeUserPayload, {
        bookingId: booking.id,
        clientCheckoutId: `vendor-booking:${booking.id}`,
        depositPercent,
      } as any, vendorCallbackUrl);

      if (paymentResult?.data?.paymentUrl) {
        paymentUrl = paymentResult.data.paymentUrl;
      }
    } catch (error: any) {
      this.logger.error(`Payment init failed for vendor-created booking: ${error?.message}`, error?.stack);
    }

    try {
      await this.prisma.favourite.upsert({
        where: {
          userId_providerType_providerId: {
            userId: customer.id,
            providerType: provider.providerType,
            providerId: provider.providerId,
          },
        },
        create: {
          userId: customer.id,
          providerType: provider.providerType,
          providerId: provider.providerId,
        },
        update: {},
      });
    } catch (error: any) {
      this.logger.warn(`Auto-favourite failed: ${error?.message}`);
    }

    try {
      const providerName =
        provider.providerType === 'salon'
          ? (await this.salons.findById(provider.providerId))?.business_name || 'Your service provider'
          : (await this.stylists.findById(provider.providerId))?.business_name || 'Your service provider';

      const serviceList = dto.services.map((s: any) => s.name || s.service || 'Service').join(', ');
      const paymentLine = paymentUrl
        ? `\n\nPay for your appointment here: ${paymentUrl}`
        : '';

      if (isNewUser && generatedPassword) {
        await this.mailService.sendMail({
          to: email,
          subject: `Your Primlook appointment with ${providerName}`,
          text:
            `Hi ${dto.customerFirstName},\n\n` +
            `${providerName} has booked an appointment for you on Primlook.\n\n` +
            `Services: ${serviceList}\n` +
            `Date: ${dto.preferredDate}\n` +
            `Time: ${dto.preferredTime}\n` +
            paymentLine +
            `\n\nYour Primlook account has been created:\n` +
            `Email: ${email}\n` +
            `Password: ${generatedPassword}\n\n` +
            `You can sign in at any time and change your password.\n\n` +
            `— Primlook`,
        });
      } else {
        await this.mailService.sendMail({
          to: email,
          subject: `New appointment with ${providerName}`,
          text:
            `Hi ${customer.firstName || dto.customerFirstName},\n\n` +
            `${providerName} has booked an appointment for you.\n\n` +
            `Services: ${serviceList}\n` +
            `Date: ${dto.preferredDate}\n` +
            `Time: ${dto.preferredTime}\n` +
            paymentLine +
            `\n\n— Primlook`,
        });
      }
    } catch (error: any) {
      this.logger.error(`Email send failed for vendor-created booking: ${error?.message}`, error?.stack);
    }

    return {
      success: true,
      message: isNewUser
        ? 'Booking created. New customer account created and credentials sent via email.'
        : 'Booking created. Payment link sent to customer.',
      booking,
      paymentUrl,
      isNewUser,
    };
  }

  private async createSingleBooking(user: AuthUserPayload, dto: BookingPersonDto, callbackUrl?: string) {
    const duplicate = await this.findDuplicateBooking(user.userId, dto);
    if (duplicate) {
      return {
        success: true,
        message: 'Booking already created',
        booking: duplicate,
      };
    }

    const { booking } = await this.createBookingFromPerson(
      user,
      dto,
      { isGroupBooking: false },
    );

    const response: Record<string, unknown> = {
      success: true,
      message: 'Booking created',
      booking,
    };

    await this.attachPaymentInitialization(response, user, [booking], null, callbackUrl);

    return response;
  }

  private async createBookingFromPerson(
    user: AuthUserPayload,
    person: BookingPersonDto,
    options: { isGroupBooking: boolean; groupBookingId?: string | null; personName?: string },
  ) {
    const providerType = this.resolveProviderType(person);
    const provider = await this.fetchProvider(providerType, person);

    await this.assertAvailability(providerType, provider, person);

    const conflict = await this.findConflictingBooking(providerType, provider.id, person);
    if (conflict) {
      throw new BadRequestException('This time slot is already booked with this provider');
    }

    const serviceType = this.resolveServiceType(providerType, person.serviceType);
    const preferredDate = this.normalizePreferredDate(person.preferredDate);

    const bookingData = this.buildBookingCreateInput(user.userId, person, options, providerType, provider.id, preferredDate, serviceType);

    const booking = await this.prisma.booking.create({
      data: bookingData,
      include: { salon: true, stylist: true, customer: true },
    });

    return {
      booking,
      providerType,
      providerUserId: provider.userId ?? null,
      providerEmail: provider.email ?? null,
    };
  }

  private async attachPaymentInitialization(
    response: Record<string, unknown>,
    user: AuthUserPayload,
    bookings: Array<{ id: string; totalAmount: number; services?: unknown }>,
    groupBookingId: string | null,
    callbackUrl?: string,
  ) {
    const enablePayment = String(process.env.ENABLE_PAYMENT || '').trim().toLowerCase() === 'true';
    if (!enablePayment || bookings.length === 0) {
      return;
    }

    const bookingIds = bookings.map((booking) => booking.id);

    try {
      const sortedBookingIds = bookingIds.slice().sort();
      const paymentResult = await this.payments.initializePayment(user, {
        bookingId: bookings[0].id,
        isGroupBooking: bookingIds.length > 1,
        groupBookingId: groupBookingId ?? undefined,
        bookingIds: bookingIds.length > 1 ? bookingIds : undefined,
        clientCheckoutId: `bookings:${sortedBookingIds.join('|')}`,
        callbackUrl,
      } as any);

      if (paymentResult?.data?.paymentUrl) {
        response.paymentUrl = paymentResult.data.paymentUrl;
      }
      if (paymentResult?.data?.reference) {
        response.paymentReference = paymentResult.data.reference;
      }
    } catch (error: any) {
      const detail = error?.response?.message || error?.message || String(error);
      this.logger.error(`Payment initialization failed: ${detail}`, error?.stack);
      response.paymentError = `Payment initialization failed: ${detail}`;
    }
  }

  private async evaluateAvailability(person: AvailabilityItemDto): Promise<AvailabilityResult> {
    try {
      const providerType = this.resolveProviderType(person);
      const provider = await this.fetchProvider(providerType, person);

      await this.assertAvailability(providerType, provider, person);

      const conflict = await this.findConflictingBooking(providerType, provider.id, person);
      if (conflict) {
        return { available: false, reason: 'This time slot is already booked with this provider' };
      }

      return { available: true };
    } catch (error) {
      return { available: false, reason: error instanceof Error ? error.message : 'Unavailable' };
    }
  }

  private resolveProviderType(person: { providerType?: string; salonId?: string; stylistId?: string }): ProviderTypeValue {
    if (person.providerType === 'salon' || person.providerType === 'stylist') {
      return person.providerType as ProviderTypeValue;
    }
    return person.salonId ? 'salon' : 'stylist';
  }

  private resolveServiceType(providerType: ProviderTypeValue, serviceType?: string) {
    if (serviceType === 'salon' || serviceType === 'home_service') {
      return serviceType;
    }
    return providerType === 'salon' ? 'salon' : 'home_service';
  }

  private async fetchProvider(providerType: ProviderTypeValue, person: BookingTimeSlot) {
    if (providerType === 'salon') {
      if (!person.salonId) {
        throw new BadRequestException('Salon is required');
      }
      const salon = await this.salons.findById(person.salonId);
      if (!salon) {
        throw new NotFoundException('Salon not found');
      }
      return salon as any;
    }

    if (!person.stylistId) {
      throw new BadRequestException('Stylist is required');
    }

    const stylist = await this.stylists.findById(person.stylistId);
    if (!stylist) {
      throw new NotFoundException('Stylist not found');
    }
    if (stylist.status !== 'active') {
      throw new BadRequestException('Stylist is not currently available');
    }
    return stylist as any;
  }

  private async assertAvailability(providerType: ProviderTypeValue, provider: any, person: BookingTimeSlot) {
    if (providerType === 'salon') {
      const result = this.validateSalonHours(provider, person.preferredDate, person.preferredTime, person.totalDuration);
      if (!result.ok) {
        throw new BadRequestException(result.reason ?? 'Selected time is unavailable for this salon');
      }
      return;
    }

    const result = this.validateStylistAvailability(provider, person.preferredDate, person.preferredTime, person.totalDuration);
    if (!result.ok) {
      throw new BadRequestException(result.reason ?? 'Selected time is unavailable for this stylist');
    }
  }

  private validateSalonHours(
    salon: any,
    preferredDate: string,
    preferredTime: string,
    totalDuration: number,
  ) {
    const openHours = Array.isArray(salon?.openHours) ? salon.openHours : [];
    if (openHours.length === 0) {
      return { ok: true } as const;
    }

    const date = new Date(preferredDate);
    const dayName = DAY_NAMES[date.getDay()];
    const entry = openHours.find((item: any) => (item?.day || '').toLowerCase() === dayName);
    if (!entry) {
      return { ok: true } as const;
    }
    if (entry.open === false) {
      return { ok: false, reason: `Salon is closed on ${dayName}` } as const;
    }

    const startMinutes = this.parseTimeToMinutes(preferredTime);
    const duration = Number(totalDuration || 0);
    const windowStart = this.parseTimeToMinutes(entry.openTime);
    const windowEnd = this.parseTimeToMinutes(entry.closeTime);

    if (startMinutes === null || windowStart === null || windowEnd === null) {
      return { ok: true } as const;
    }

    const within = this.isWithinWindow(startMinutes, duration, windowStart, windowEnd);
    return within
      ? ({ ok: true } as const)
      : ({ ok: false, reason: `Selected time is outside salon hours (${entry.openTime} - ${entry.closeTime})` } as const);
  }

  private validateStylistAvailability(
    stylist: any,
    preferredDate: string,
    preferredTime: string,
    totalDuration: number,
  ) {
    const availability = stylist?.availability as Record<string, any> | null;
    if (!availability) {
      return { ok: true } as const;
    }
    if (availability.isAvailable === false) {
      return { ok: false, reason: 'Stylist is currently unavailable' } as const;
    }

    const date = new Date(preferredDate);
    const dayName = DAY_NAMES[date.getDay()];
    if (Array.isArray(availability.workingDays) && availability.workingDays.length > 0) {
      if (!availability.workingDays.map((day: string) => day.toLowerCase()).includes(dayName)) {
        return { ok: false, reason: `Stylist does not work on ${dayName}` } as const;
      }
    }

    const workingHours = availability.workingHours || {};
    if (workingHours.start || workingHours.end) {
      const startMinutes = this.parseTimeToMinutes(preferredTime);
      const duration = Number(totalDuration || 0);
      const windowStart = this.parseTimeToMinutes(workingHours.start);
      const windowEnd = this.parseTimeToMinutes(workingHours.end);
      if (startMinutes !== null && windowStart !== null && windowEnd !== null) {
        const within = this.isWithinWindow(startMinutes, duration, windowStart, windowEnd);
        if (!within) {
          return {
            ok: false,
            reason: `Selected time is outside working hours (${workingHours.start || ''} - ${workingHours.end || ''})`,
          } as const;
        }
      }
    }

    return { ok: true } as const;
  }

  private parseTimeToMinutes(value?: string | null): number | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();

    const ampmMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (ampmMatch) {
      let hour = Number(ampmMatch[1]);
      const minute = Number(ampmMatch[2]);
      const period = ampmMatch[3];
      if (period === 'pm' && hour < 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      return hour * 60 + minute;
    }

    const parts = normalized.split(':');
    if (parts.length < 2) return null;
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  }

  private isWithinWindow(startMin: number, duration: number, windowStart: number, windowEnd: number) {
    const endMin = startMin + duration;
    return startMin >= windowStart && endMin <= windowEnd;
  }

  private normalizePreferredDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid preferred date');
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private startOfDay(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private endOfDay(date: Date) {
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    return end;
  }

  private async findConflictingBooking(
    providerType: ProviderTypeValue,
    providerId: string,
    person: BookingTimeSlot,
  ) {
    const preferredDate = this.normalizePreferredDate(person.preferredDate);
    const start = this.startOfDay(preferredDate);
    const end = this.endOfDay(preferredDate);

    const existing = await this.prisma.booking.findMany({
      where: {
        ...(providerType === 'salon' ? { salonId: providerId } : { stylistId: providerId }),
        status: { in: ACTIVE_STATUSES },
        preferredDate: { gte: start, lt: end },
      },
    });

    const newStart = this.parseTimeToMinutes(person.preferredTime);
    if (newStart === null) {
      return null;
    }

    const duration = Number(person.totalDuration || 0);
    const newEnd = newStart + duration + 5;
    const newStartBuffered = newStart - 5;

    return existing.find((booking) => {
      const existingStart = this.parseTimeToMinutes(booking.preferredTime);
      if (existingStart === null) return false;
      const existingEnd = existingStart + Number(booking.totalDuration || 0) + 5;
      return existingStart < newEnd && existingEnd > newStartBuffered;
    });
  }

  private async findDuplicateBooking(customerId: string, dto: BookingPersonDto) {
    const providerType = this.resolveProviderType(dto);
    const providerId = providerType === 'salon' ? dto.salonId : dto.stylistId;
    if (!providerId) {
      return null;
    }

    const preferredDate = this.normalizePreferredDate(dto.preferredDate);
    const start = this.startOfDay(preferredDate);
    const end = this.endOfDay(preferredDate);
    const createdAt = new Date(Date.now() - 50_000);

    return this.prisma.booking.findFirst({
      where: {
        customerId,
        ...(providerType === 'salon' ? { salonId: providerId } : { stylistId: providerId }),
        preferredTime: dto.preferredTime,
        preferredDate: { gte: start, lt: end },
        createdAt: { gte: createdAt },
      },
      include: { salon: true, stylist: true, customer: true },
    });
  }

  private buildBookingCreateInput(
    customerId: string,
    person: BookingPersonDto,
    options: { isGroupBooking: boolean; groupBookingId?: string | null; personName?: string },
    providerType: ProviderTypeValue,
    providerId: string,
    preferredDate: Date,
    serviceType: 'salon' | 'home_service',
  ): Prisma.BookingCreateInput {
    const bookingData: Prisma.BookingCreateInput = {
      customer: { connect: { id: customerId } },
      providerType,
      serviceType,
      services: person.services as unknown as Prisma.InputJsonValue,
      totalAmount: person.totalAmount,
      totalDuration: person.totalDuration,
      transportFare: person.transportFare ?? 0,
      location: person.location as Prisma.InputJsonValue,
      customerPhone: person.customerPhone,
      preferredDate,
      preferredTime: person.preferredTime,
      notes: person.notes,
      styleImageUrls: [
        ...(person.styleImageUrls ?? []),
        ...(person.styleImageUrl && !person.styleImageUrls?.includes(person.styleImageUrl) ? [person.styleImageUrl] : []),
      ],
      isGroupBooking: options.isGroupBooking,
      groupBookingId: options.groupBookingId ?? null,
      personName: options.personName ?? person.personName,
      status: 'pending',
      paymentStatus: 'unpaid',
    };

    if (providerType === 'salon') {
      bookingData.salon = { connect: { id: providerId } };
    } else {
      bookingData.stylist = { connect: { id: providerId } };
    }

    return bookingData;
  }

  private async validateMultiBookingPersons(persons: BookingPersonDto[]) {
    const valid: Array<{
      person: BookingPersonDto;
      providerType: ProviderTypeValue;
      providerId: string;
      serviceType: 'salon' | 'home_service';
      preferredDate: Date;
      startMinutes: number;
      endMinutes: number;
    }> = [];
    const errors: Array<{ person: string; error: string }> = [];

    for (let index = 0; index < persons.length; index += 1) {
      const person = persons[index];
      const personLabel = person.personName?.trim() || `Person ${index + 1}`;

      try {
        const providerType = this.resolveProviderType(person);
        const provider = await this.fetchProvider(providerType, person);
        await this.assertAvailability(providerType, provider, person);

        const preferredDate = this.normalizePreferredDate(person.preferredDate);
        const serviceType = this.resolveServiceType(providerType, person.serviceType);

        const startMinutes = this.parseTimeToMinutes(person.preferredTime);
        if (startMinutes === null) {
          throw new BadRequestException('Invalid preferred time');
        }

        const duration = Number(person.totalDuration || 0);
        if (!Number.isFinite(duration) || duration <= 0) {
          throw new BadRequestException('Invalid total duration');
        }
        const endMinutes = startMinutes + duration + 5;
        const startBuffered = startMinutes - 5;

        const conflictInBatch = valid.find((existing) =>
          existing.providerType === providerType &&
          existing.providerId === provider.id &&
          this.sameCalendarDay(existing.person.preferredDate, person.preferredDate) &&
          existing.startMinutes < endMinutes &&
          existing.endMinutes > startBuffered,
        );
        if (conflictInBatch) {
          throw new BadRequestException(
            `${personLabel} overlaps with ${conflictInBatch.person.personName || 'another booking'} at this provider`,
          );
        }

        const conflict = await this.findConflictingBooking(providerType, provider.id, person);
        if (conflict) {
          throw new BadRequestException('This time slot is already booked with this provider');
        }

        valid.push({
          person,
          providerType,
          providerId: provider.id,
          serviceType,
          preferredDate,
          startMinutes,
          endMinutes,
        });
      } catch (error: any) {
        errors.push({
          person: personLabel,
          error: this.readableError(error),
        });
      }
    }

    return {
      valid,
      errors,
    };
  }

  private sameCalendarDay(leftValue: string, rightValue: string) {
    const left = this.normalizePreferredDate(leftValue);
    const right = this.normalizePreferredDate(rightValue);
    return left.getTime() === right.getTime();
  }

  private readableError(error: any) {
    if (error?.response?.message) {
      const message = error.response.message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    if (error?.message) {
      return String(error.message);
    }

    return 'Failed to create booking';
  }

  private async resolveProviderProfile(user: AuthUserPayload) {
    if (user.accountType === 'salon') {
      const salon = await this.salons.findByUserId(user.userId);
      if (!salon) return null;
      return { providerType: 'salon' as ProviderTypeValue, providerId: salon.id };
    }

    if (user.accountType === 'stylist') {
      const stylist = await this.stylists.findByUserId(user.userId);
      if (!stylist) return null;
      return { providerType: 'stylist' as ProviderTypeValue, providerId: stylist.id };
    }

    return null;
  }

  private async canAccessBooking(
    user: AuthUserPayload,
    booking: { customerId: string; salonId?: string | null; stylistId?: string | null },
  ) {
    if (booking.customerId === user.userId) return true;

    if (user.accountType === 'salon' && booking.salonId) {
      const salon = await this.salons.findByUserId(user.userId);
      return salon?.id === booking.salonId;
    }

    if (user.accountType === 'stylist' && booking.stylistId) {
      const stylist = await this.stylists.findByUserId(user.userId);
      return stylist?.id === booking.stylistId;
    }

    return false;
  }

  private coerceBookingStatus(status?: string): BookingStatus | undefined {
    if (!status) return undefined;
    const normalized = status.toLowerCase();
    if ((ACTIVE_STATUSES as string[]).includes(normalized)) return normalized as BookingStatus;
    if (['completed', 'cancelled', 'no_show', 'pending', 'confirmed', 'in_progress'].includes(normalized)) {
      return normalized as BookingStatus;
    }
    return undefined;
  }
}
