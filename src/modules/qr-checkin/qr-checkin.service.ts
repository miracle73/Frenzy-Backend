import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QrCheckInDto, QrUpdateStatusDto, QrRecordPaymentDto } from './dto/qr-checkin.dto';
import * as bcrypt from 'bcryptjs';
import { PaystackClient } from '../payments/paystack.client';
import { MailService } from '../../common/mail/mail.service';

@Injectable()
export class QrCheckinService {
  private readonly logger = new Logger(QrCheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly mailService: MailService,
  ) {}

  // ─── Generate slug from business name ───
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ─── Normalize Nigerian phone ───
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+234')) return cleaned;
    if (cleaned.startsWith('234') && cleaned.length === 13) return '+' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+234' + cleaned.substring(1);
    if (cleaned.length === 10 && !cleaned.startsWith('0')) return '+234' + cleaned;
    return cleaned;
  }

  // ─── GET /qr/salon/:slug — Public salon info + services ───
  async getSalonBySlug(slug: string) {
    const salon = await this.prisma.salon.findFirst({
      where: { slug },
      select: {
        id: true,
        business_name: true,
        business_logo: true,
        services: true,
        slug: true,
      },
    });

    if (!salon) {
      throw new NotFoundException('Salon not found');
    }

    // Parse services JSON — format: [{ name, price, duration? }]
    let services: any[] = [];
    if (salon.services) {
      try {
        const raw = typeof salon.services === 'string' ? JSON.parse(salon.services) : salon.services;
        services = Array.isArray(raw) ? raw : [];
      } catch {
        services = [];
      }
    }

    // Count today's active queue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const queueCount = await this.prisma.booking.count({
      where: {
        salonId: salon.id,
        status: { in: ['pending', 'confirmed', 'in_progress'] },
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    return {
      success: true,
      salon_id: salon.id,
      salon_name: salon.business_name,
      salon_logo_url: salon.business_logo,
      services: services.map((s: any, i: number) => ({
        id: `svc_${i}`,
        name: s.name || s.serviceName || 'Unknown',
        price: Math.round((s.price || 0) * 100), // Convert Naira to kobo for frontend
        duration: s.duration || 60,
      })),
      current_queue_length: queueCount,
    };
  }

  // ─── GET /qr/salon/:salonId/info — Salon info by ID ───
  async getSalonInfo(salonId: string) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: {
        id: true,
        business_name: true,
        business_logo: true,
        slug: true,
        qr_code_base64: true,
        services: true,
      },
    });

    if (!salon) throw new NotFoundException('Salon not found');

    // Auto-generate slug if missing
    if (!salon.slug && salon.business_name) {
      const slug = this.generateSlug(salon.business_name);
      await this.prisma.salon.update({
        where: { id: salonId },
        data: { slug },
      });
      (salon as any).slug = slug;
    }

    return {
      success: true,
      id: salon.id,
      name: salon.business_name,
      slug: salon.slug,
      logo_url: salon.business_logo,
      qr_code_base64: salon.qr_code_base64,
    };
  }

  // ─── POST /qr/salon/:salonId/generate-slug — Generate slug + QR ───
  async generateSalonSlug(salonId: string) {
    const salon = await this.prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) throw new NotFoundException('Salon not found');

    const slug = this.generateSlug(salon.business_name || 'salon');

    // Check uniqueness
    const existing = await this.prisma.salon.findFirst({ where: { slug, id: { not: salonId } } });
    const finalSlug = existing ? `${slug}-${Math.random().toString(36).substring(2, 6)}` : slug;

    await this.prisma.salon.update({
      where: { id: salonId },
      data: { slug: finalSlug },
    });

    return { success: true, slug: finalSlug };
  }

  // ─── GET /qr/customer-lookup — Returning customer check ───
  async lookupCustomer(phone?: string, email?: string, salonId?: string) {
    if (!phone && !email) return { found: false };

    const conditions: any[] = [];
    if (phone) {
      const normalized = this.normalizePhone(phone);
      conditions.push({ phoneNumber: normalized });
    }
    if (email) {
      conditions.push({ email });
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: conditions },
      select: { id: true, firstName: true, lastName: true, email: true, phoneNumber: true },
    });

    if (!user) return { found: false };

    let lastService: string | null = null;
    let lastVisitDate: Date | null = null;
    let visitCount = 0;

    if (salonId) {
      const lastBooking = await this.prisma.booking.findFirst({
        where: { customerId: user.id, salonId },
        orderBy: { createdAt: 'desc' },
        select: { services: true, createdAt: true },
      });

      visitCount = await this.prisma.booking.count({
        where: { customerId: user.id, salonId },
      });

      if (lastBooking) {
        lastVisitDate = lastBooking.createdAt;
        try {
          const svcData = lastBooking.services as any;
          if (Array.isArray(svcData) && svcData.length > 0) {
            lastService = svcData[0]?.name || svcData[0]?.serviceName || null;
          }
        } catch {}
      }
    }

    return {
      found: true,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
      phone: user.phoneNumber,
      visit_count: visitCount,
      last_service: lastService,
      last_visit_date: lastVisitDate,
    };
  }

  // ─── POST /qr/check-in — Walk-in self check-in ───
  async checkIn(dto: QrCheckInDto) {
    const normalized = this.normalizePhone(dto.phone);

    // 1. Find customer by phone OR email
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: normalized },
          ...(dto.email ? [{ email: dto.email }] : []),
        ],
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email || `walkin_${Date.now()}@primlook.temp`,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: normalized,
          accountType: 'customer',
          verifyStatus: false,
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          ...(dto.email && !user.email?.includes('@primlook.temp') ? {} : dto.email ? { email: dto.email } : {}),
          ...(!user.phoneNumber ? { phoneNumber: normalized } : {}),
        },
      });
    }

    // 2. Verify salon
    const salon = await this.prisma.salon.findUnique({ where: { id: dto.salonId } });
    if (!salon) throw new NotFoundException('Salon not found');

    // 3. Queue position — count today's bookings for this salon
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const queueCount = await this.prisma.booking.count({
      where: {
        salonId: dto.salonId,
        status: { in: ['pending', 'confirmed', 'in_progress'] },
        createdAt: { gte: today, lt: tomorrow },
      },
    });
    const queuePosition = queueCount + 1;

    // 4. Create booking
    const now = new Date();
    const booking = await this.prisma.booking.create({
      data: {
        customer: { connect: { id: user.id } },
        salon: { connect: { id: dto.salonId } },
        providerType: 'salon',
        serviceType: 'salon',
        services: [{ name: dto.serviceName, price: dto.servicePrice, duration: dto.serviceDuration || 60 }],
        totalAmount: dto.servicePrice,
        totalDuration: dto.serviceDuration || 60,
        customerPhone: normalized,
        preferredDate: now,
        preferredTime: now.toTimeString().substring(0, 5),
        status: 'pending',
        paymentStatus: 'unpaid',
        notes: `QR walk-in check-in. Queue #${queuePosition}`,
      },
    });

    this.logger.log(`QR check-in: ${dto.firstName} ${dto.lastName} at ${salon.business_name} — ${dto.serviceName} — Queue #${queuePosition}`);

    // 5. Send confirmation email
    const customerEmail = dto.email || user.email;
    if (customerEmail && !customerEmail.includes('@primlook.temp')) {
      try {
        const salonName = salon.business_name || 'Your salon';
        await this.mailService.sendMail({
          to: customerEmail,
          subject: `You're checked in at ${salonName} — Primlook`,
          text:
            `Hi ${dto.firstName},\n\n` +
            `You're checked in at ${salonName}!\n\n` +
            `Service: ${dto.serviceName}\n` +
            `Amount: ₦${dto.servicePrice.toLocaleString()}\n` +
            `Queue Position: #${queuePosition}\n\n` +
            `You'll be attended to shortly. A payment link will be available on your check-in page.\n\n` +
            `— Primlook`,
        });
      } catch (err: any) {
        this.logger.error(`QR check-in email failed: ${err?.message}`);
      }
    }

    return {
      success: true,
      appointment_id: booking.id,
      customer_id: user.id,
      queue_position: queuePosition,
      service_name: dto.serviceName,
      total_price: Math.round(dto.servicePrice * 100),
      payment_id: null,
    };
  }

  // ─── GET /qr/queue/:salonId — Today's walk-in queue ───
  async getQueue(salonId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const bookings = await this.prisma.booking.findMany({
      where: {
        salonId,
        OR: [
          { createdAt: { gte: today, lt: tomorrow } },
          { preferredDate: { gte: today, lt: tomorrow } },
        ],
      },
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Check Payment table for accurate paid status (webhook updates this)
    const bookingIds = bookings.map(b => b.id);
    const paidPayments = await this.prisma.payment.findMany({
      where: {
        bookingId: { in: bookingIds },
        depositStatus: 'paid',
      },
      select: { bookingId: true },
    });
    const paidBookingIds = new Set(paidPayments.map(p => p.bookingId));

    // Also check PaymentCheckout for paid status
    const paidCheckouts = await this.prisma.paymentCheckout.findMany({
      where: {
        bookingIds: { hasSome: bookingIds },
        status: 'paid',
      },
      select: { bookingIds: true },
    });
    for (const c of paidCheckouts) {
      for (const id of c.bookingIds) paidBookingIds.add(id);
    }

    // Sync any mismatched booking payment statuses
    for (const b of bookings) {
      if (paidBookingIds.has(b.id) && b.paymentStatus !== 'paid') {
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { paymentStatus: 'paid' },
        });
        b.paymentStatus = 'paid' as any;
      }
    }

    const queue = bookings.map((b, i) => {
      const firstName = b.customer?.firstName || 'Unknown';
      const lastName = b.customer?.lastName || '';

      let serviceName = 'Unknown';
      try {
        const svcData = b.services as any;
        if (Array.isArray(svcData) && svcData.length > 0) {
          serviceName = svcData[0]?.name || 'Unknown';
        }
      } catch {}

      return {
        id: b.id,
        queue_position: i + 1,
        customer_name: `${firstName} ${lastName.charAt(0) || ''}.`,
        first_name: firstName,
        last_name: lastName,
        service: serviceName,
        total_price: Math.round((b.totalAmount || 0) * 100),
        status: b.status,
        payment_status: paidBookingIds.has(b.id) || b.paymentStatus === 'paid' ? 'paid' : 'pending',
        payment_method: b.paymentMethod || null,
        booking_type: b.notes?.includes('QR walk-in') ? 'self_check_in' : 'booked',
        check_in_source: b.notes?.includes('QR walk-in') ? 'qr_code' : 'app',
        checked_in_at: b.createdAt.toISOString(),
        service_started_at: b.startedAt?.toISOString() || null,
        completed_at: b.completedAt?.toISOString() || null,
      };
    });

    return { success: true, queue };
  }

  // ─── PATCH /qr/appointments/:id/status ───
  async updateStatus(bookingId: string, dto: QrUpdateStatusDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    const validStatuses = ['confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(dto.status)) {
      throw new BadRequestException(`Invalid status. Must be: ${validStatuses.join(', ')}`);
    }

    const now = new Date();
    const updateData: any = { status: dto.status };

    if (dto.status === 'confirmed') updateData.acceptedAt = now;
    if (dto.status === 'in_progress') updateData.startedAt = now;
    if (dto.status === 'completed') updateData.completedAt = now;
    if (dto.status === 'cancelled') {
      updateData.cancelledAt = now;
      updateData.cancellationReason = dto.cancellationReason || 'Cancelled from queue';
      updateData.cancelledBy = 'salon';
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
    });

    return { success: true, appointment: updated };
  }

  // ─── POST /qr/payments — Record cash/transfer payment ───
  async recordPayment(dto: QrRecordPaymentDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: dto.bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.paymentStatus === 'paid') {
      throw new BadRequestException('Already paid');
    }

    await this.prisma.booking.update({
      where: { id: dto.bookingId },
      data: {
        paymentStatus: 'paid',
        paymentMethod: dto.method,
      },
    });

    return { success: true };
  }

  // ─── GET /qr/payments/:bookingId/status ───
  async getPaymentStatus(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { paymentStatus: true, paymentMethod: true },
    });

    if (!booking) return { paid: false };
    return {
      paid: booking.paymentStatus === 'paid',
      payment: { status: booking.paymentStatus, method: booking.paymentMethod },
    };
  }


  // ─── GET /qr/salon-by-email?email=... ───
  async getSalonByEmail(email: string) {
    if (!email) throw new BadRequestException('Email is required');

    const salon = await this.prisma.salon.findFirst({
      where: {
        OR: [
          { email },
          { user: { email } },
        ],
      },
      select: {
        id: true,
        business_name: true,
        slug: true,
        business_logo: true,
      },
    });

    if (!salon) throw new NotFoundException('No salon found with this email');

    // Auto-generate slug if missing
    if (!salon.slug && salon.business_name) {
      const slug = this.generateSlug(salon.business_name);
      await this.prisma.salon.update({
        where: { id: salon.id },
        data: { slug },
      });
      (salon as any).slug = slug;
    }

    return {
      success: true,
      id: salon.id,
      name: salon.business_name,
      slug: salon.slug,
    };
  }

  // ─── POST /qr/salon/create — Create salon with user account ───
  async createSalon(data: { name: string; email: string; password: string; firstName?: string; lastName?: string }) {
    const { name, email, password, firstName, lastName } = data;

    if (!name || !email || !password) {
      throw new BadRequestException('name, email, and password are required');
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const slug = this.generateSlug(name);

    // Check slug uniqueness
    const existingSlug = await this.prisma.salon.findFirst({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Math.random().toString(36).substring(2, 6)}` : slug;

    // Create user + salon in one transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: firstName || name,
          lastName: lastName || '',
          accountType: 'salon',
          verifyStatus: true,
        },
      });

      const salon = await tx.salon.create({
        data: {
          userId: user.id,
          email,
          business_name: name,
          slug: finalSlug,
        },
      });

      return { user, salon };
    });

    return {
      success: true,
      id: result.salon.id,
      name: result.salon.business_name,
      slug: result.salon.slug,
    };
  }

  // ─── GET /qr/salon/:salonId/services ───
  async getServices(salonId: string) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { services: true },
    });
    if (!salon) throw new NotFoundException('Salon not found');

    let services: any[] = [];
    if (salon.services) {
      try {
        const raw = typeof salon.services === 'string' ? JSON.parse(salon.services) : salon.services;
        services = Array.isArray(raw) ? raw : [];
      } catch {
        services = [];
      }
    }

    return {
      services: services.map((s: any, i: number) => ({
        id: s.id || `svc_${i}`,
        name: s.name || 'Unknown',
        price: Math.round((s.price || 0) * 100), // kobo
        duration: s.duration || 60,
      })),
    };
  }

  // ─── POST /qr/salon/:salonId/services ───
  async addService(salonId: string, data: { name: string; price: number }) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { services: true },
    });
    if (!salon) throw new NotFoundException('Salon not found');

    let services: any[] = [];
    if (salon.services) {
      try {
        const raw = typeof salon.services === 'string' ? JSON.parse(salon.services) : salon.services;
        services = Array.isArray(raw) ? raw : [];
      } catch {
        services = [];
      }
    }

    const newService = {
      id: `svc_${Date.now()}`,
      name: data.name,
      price: data.price / 100, // kobo to Naira for storage
      duration: 60,
    };
    services.push(newService);

    await this.prisma.salon.update({
      where: { id: salonId },
      data: { services: services as any },
    });

    return { id: newService.id, name: newService.name, price: data.price };
  }

  // ─── PUT /qr/salon/:salonId/services/:serviceId ───
  async updateService(salonId: string, serviceId: string, data: { name?: string; price?: number }) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { services: true },
    });
    if (!salon) throw new NotFoundException('Salon not found');

    let services: any[] = [];
    if (salon.services) {
      try {
        const raw = typeof salon.services === 'string' ? JSON.parse(salon.services) : salon.services;
        services = Array.isArray(raw) ? raw : [];
      } catch {
        services = [];
      }
    }

    const svc = services.find((s: any) => s.id === serviceId);
    if (!svc) throw new NotFoundException('Service not found');

    if (data.name !== undefined) svc.name = data.name;
    if (data.price !== undefined) svc.price = data.price / 100; // kobo to Naira

    await this.prisma.salon.update({
      where: { id: salonId },
      data: { services: services as any },
    });

    return { id: svc.id, name: svc.name, price: data.price ?? Math.round(svc.price * 100) };
  }

  // ─── DELETE /qr/salon/:salonId/services/:serviceId ───
  async deleteService(salonId: string, serviceId: string) {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      select: { services: true },
    });
    if (!salon) throw new NotFoundException('Salon not found');

    let services: any[] = [];
    if (salon.services) {
      try {
        const raw = typeof salon.services === 'string' ? JSON.parse(salon.services) : salon.services;
        services = Array.isArray(raw) ? raw : [];
      } catch {
        services = [];
      }
    }

    const idx = services.findIndex((s: any) => s.id === serviceId);
    if (idx === -1) throw new NotFoundException('Service not found');

    services.splice(idx, 1);

    await this.prisma.salon.update({
      where: { id: salonId },
      data: { services: services as any },
    });

    return { success: true };
  }


  // ─── POST /qr/payments/initialize — Paystack payment for QR walk-in ───
  async initializePayment(bookingId: string, callbackUrl?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true, salon: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.paymentStatus === 'paid') {
      throw new BadRequestException('Already paid');
    }

    const email = booking.customer?.email || '';
    const amount = Math.round(booking.totalAmount * 100); // Naira to kobo
    const clientCheckoutId = `qr_checkout_${bookingId}`;

    // Check for existing checkout
    const existingCheckout = await this.prisma.paymentCheckout.findUnique({
      where: {
        customerId_clientCheckoutId: {
          customerId: booking.customerId,
          clientCheckoutId,
        },
      },
    });

    // If already has Paystack URL, return it
    if (existingCheckout?.paystackAuthorizationUrl && existingCheckout.status === 'pending') {
      return {
        success: true,
        data: {
          paymentUrl: existingCheckout.paystackAuthorizationUrl,
          reference: existingCheckout.paystackReference,
        },
      };
    }

    // If exists but no URL or failed, delete and recreate
    if (existingCheckout) {
      await this.prisma.payment.deleteMany({ where: { checkoutId: existingCheckout.id } });
      await this.prisma.paymentCheckout.delete({ where: { id: existingCheckout.id } });
    }

    const reference = `qr_${bookingId.substring(0, 8)}_${Date.now()}`;

    // Create checkout record
    const checkout = await this.prisma.paymentCheckout.create({
      data: {
        customerId: booking.customerId,
        bookingIds: [bookingId],
        clientCheckoutId,
        totalAmount: booking.totalAmount,
        currency: 'NGN',
        status: 'pending',
      },
    });

    // Create payment record — bookingType MUST be 'Booking' for syncBookingPaymentStatus to work
    await this.prisma.payment.create({
      data: {
        checkoutId: checkout.id,
        bookingId: bookingId,
        bookingType: 'Booking',
        bookingIds: [bookingId],
        customerId: booking.customerId,
        providerId: booking.salonId || '',
        providerType: 'salon',
        totalAmount: booking.totalAmount,
        depositAmount: booking.totalAmount,
        remainingAmount: 0,
        platformFee: 0,
        providerAmount: booking.totalAmount,
        depositStatus: 'pending',
        paystackDepositRef: reference,
      },
    });

    // Call Paystack
    try {
      const response = await this.paystack.initializeTransaction({
        email: email.includes('@primlook.temp') ? `customer_${Date.now()}@primlook.com` : email,
        amount,
        reference,
        callback_url: callbackUrl || undefined,
        currency: 'NGN',
        metadata: {
          bookingId,
          type: 'qr_walkin',
          checkoutId: checkout.id,
        },
      }) as { data: { authorization_url: string; reference: string } };

      // Update checkout with Paystack details
      await this.prisma.paymentCheckout.update({
        where: { id: checkout.id },
        data: {
          paystackReference: response.data.reference,
          paystackAuthorizationUrl: response.data.authorization_url,
        },
      });

      return {
        success: true,
        data: {
          paymentUrl: response.data.authorization_url,
          reference: response.data.reference,
        },
      };
    } catch (err: any) {
      // Clean up on Paystack failure
      await this.prisma.payment.deleteMany({ where: { checkoutId: checkout.id } });
      await this.prisma.paymentCheckout.delete({ where: { id: checkout.id } });
      throw new BadRequestException(err.message || 'Payment initialization failed');
    }
  }
}
