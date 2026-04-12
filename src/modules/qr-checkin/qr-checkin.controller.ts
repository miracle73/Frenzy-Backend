import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QrCheckinService } from './qr-checkin.service';
import { QrCheckInDto, QrUpdateStatusDto, QrRecordPaymentDto } from './dto/qr-checkin.dto';

@ApiTags('qr-checkin')
@Controller('qr')
export class QrCheckinController {
  constructor(private readonly qrService: QrCheckinService) {}

  // ─── PUBLIC: Create a new salon ───
  @Post('salon/create')
  @HttpCode(HttpStatus.CREATED)
  createSalon(@Body() body: { name: string; email: string; password: string; firstName?: string; lastName?: string }) {
    return this.qrService.createSalon(body);
  }

  // ─── PUBLIC: Get salon by slug (customer check-in page) ───
  @Get('salon/:slug/public')
  @HttpCode(HttpStatus.OK)
  getSalonBySlug(@Param('slug') slug: string) {
    return this.qrService.getSalonBySlug(slug);
  }

  // ─── PUBLIC: Get salon info by ID (dashboard) ───
  @Get('salon/:salonId/info')
  @HttpCode(HttpStatus.OK)
  getSalonInfo(@Param('salonId') salonId: string) {
    return this.qrService.getSalonInfo(salonId);
  }

  // ─── PUBLIC: Generate slug for salon ───
  @Post('salon/:salonId/generate-slug')
  @HttpCode(HttpStatus.OK)
  generateSlug(@Param('salonId') salonId: string) {
    return this.qrService.generateSalonSlug(salonId);
  }

  // ─── PUBLIC: Customer phone lookup ───
  @Get('customer-lookup')
  @HttpCode(HttpStatus.OK)
  lookupCustomer(
    @Query('phone') phone?: string,
    @Query('email') email?: string,
    @Query('salonId') salonId?: string,
  ) {
    return this.qrService.lookupCustomer(phone, email, salonId);
  }

  // ─── PUBLIC: Customer self check-in ───
  @Post('check-in')
  @HttpCode(HttpStatus.CREATED)
  checkIn(@Body() dto: QrCheckInDto) {
    return this.qrService.checkIn(dto);
  }

  // ─── PUBLIC: Get today's queue ───
  @Get('queue/:salonId')
  @HttpCode(HttpStatus.OK)
  getQueue(@Param('salonId') salonId: string) {
    return this.qrService.getQueue(salonId);
  }

  // ─── Update booking status (start/complete/cancel) ───
  @Patch('appointments/:id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: QrUpdateStatusDto,
  ) {
    return this.qrService.updateStatus(id, dto);
  }

  // ─── Record cash/transfer payment ───
  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  recordPayment(@Body() dto: QrRecordPaymentDto) {
    return this.qrService.recordPayment(dto);
  }

  // ─── PUBLIC: Initialize Paystack payment for walk-in ───
  @Post('payments/initialize')
  @HttpCode(HttpStatus.OK)
  initializePayment(@Body() body: { bookingId: string; callbackUrl?: string }) {
    return this.qrService.initializePayment(body.bookingId, body.callbackUrl);
  }

  // ─── Get payment status ───
  @Get('payments/:bookingId/status')
  @HttpCode(HttpStatus.OK)
  getPaymentStatus(@Param('bookingId') bookingId: string) {
    return this.qrService.getPaymentStatus(bookingId);
  }

  // ─── PUBLIC: Get salon by email ───
  @Get('salon-by-email')
  @HttpCode(HttpStatus.OK)
  getSalonByEmail(@Query('email') email: string) {
    return this.qrService.getSalonByEmail(email);
  }

  @Get('salon/:salonId/services')
  @HttpCode(HttpStatus.OK)
  getServices(@Param('salonId') salonId: string) {
    return this.qrService.getServices(salonId);
  }

  @Post('salon/:salonId/services')
  @HttpCode(HttpStatus.CREATED)
  addService(@Param('salonId') salonId: string, @Body() body: { name: string; price: number }) {
    return this.qrService.addService(salonId, body);
  }

  @Put('salon/:salonId/services/:serviceId')
  @HttpCode(HttpStatus.OK)
  updateService(
    @Param('salonId') salonId: string,
    @Param('serviceId') serviceId: string,
    @Body() body: { name?: string; price?: number },
  ) {
    return this.qrService.updateService(salonId, serviceId, body);
  }

  @Delete('salon/:salonId/services/:serviceId')
  @HttpCode(HttpStatus.OK)
  deleteService(
    @Param('salonId') salonId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.qrService.deleteService(salonId, serviceId);
  }
}
