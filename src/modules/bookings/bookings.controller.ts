import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { BookingsService } from './bookings.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RateBookingDto } from './dto/rate-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { VendorCreateBookingDto } from './dto/vendor-create-booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  createBooking(@Req() req: AuthenticatedRequest, @Body() dto: CreateBookingDto) {
    return this.bookingsService.createBooking(req.user, dto);
  }

  @Post('check-availability')
  @HttpCode(HttpStatus.OK)
  checkAvailability(@Body() dto: CheckAvailabilityDto) {
    return this.bookingsService.checkAvailability(dto);
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getProviderSummary(@Req() req: AuthenticatedRequest) {
    return this.bookingsService.getProviderSummary(req.user);
  }

  @Get('customer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getCustomerBookings(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    return this.bookingsService.getCustomerBookings(req.user, status);
  }

  @Get('provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getProviderBookings(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    return this.bookingsService.getProviderBookings(req.user, status);
  }

  @Get('booked-slots')
  @HttpCode(HttpStatus.OK)
  getBookedSlots(
    @Query('providerType') providerType: string,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
  ) {
    return this.bookingsService.getBookedSlots(providerType, providerId, date);
  }

  @Get('lookup-customer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  lookupCustomer(
    @Query('email') email?: string,
    @Query('phone') phone?: string,
  ) {
    return this.bookingsService.lookupCustomer(email, phone);
  }

  @Post('vendor-create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  vendorCreateBooking(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VendorCreateBookingDto,
  ) {
    return this.bookingsService.createBookingForCustomer(req.user, dto);
  }

  @Get(':bookingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getBookingById(@Req() req: AuthenticatedRequest, @Param('bookingId') bookingId: string) {
    return this.bookingsService.getBookingById(req.user, bookingId);
  }

  @Patch(':bookingId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  updateBookingStatus(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateBookingStatus(req.user, bookingId, dto);
  }

  @Post(':bookingId/rate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  rateBooking(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() dto: RateBookingDto,
  ) {
    return this.bookingsService.rateBooking(req.user, bookingId, dto);
  }
}
