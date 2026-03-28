import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { AddPortfolioItemDto } from './dto/add-portfolio-item.dto';
import { CreateStylistProfileDto } from './dto/create-stylist-profile.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { UpdateStylistAvailabilityDto } from './dto/update-stylist-availability.dto';
import { UpdateStylistBasicsDto } from './dto/update-stylist-basics.dto';
import { UpdateStylistPricingDto } from './dto/update-stylist-pricing.dto';
import { UpdateStylistProfileDto } from './dto/update-stylist-profile.dto';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@Controller('updates')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post('salon-details')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  updateSalonDetails(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSalonDto) {
    return this.providersService.updateSalonDetails(req.user, dto);
  }

  @Get('salon-details')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getSalonDetails(
    @Req() req: AuthenticatedRequest,
    @Query('_id') userId?: string,
  ) {
    return this.providersService.getSalonDetails(req.user, userId);
  }

  @Get('retrieve-salons')
  @HttpCode(HttpStatus.OK)
  getSalonList() {
    return this.providersService.getSalonList();
  }

  @Get('retrieve-stylists')
  @HttpCode(HttpStatus.OK)
  getStylistList() {
    return this.providersService.getStylistList();
  }

  @Get('stylist-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getStylistProfile(@Req() req: AuthenticatedRequest) {
    return this.providersService.getStylistProfile(req.user);
  }

  @Post('stylist-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  createStylistProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateStylistProfileDto,
  ) {
    return this.providersService.createStylistProfile(req.user, dto);
  }

  @Put('stylist-profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  updateStylistProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateStylistProfileDto,
  ) {
    return this.providersService.updateStylistProfile(req.user, dto);
  }

  @Put('stylist-profile/basics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  updateStylistProfileBasics(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateStylistBasicsDto,
  ) {
    return this.providersService.updateStylistBasics(req.user, dto);
  }

  @Post('stylist-portfolio')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  addStylistPortfolio(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AddPortfolioItemDto,
  ) {
    return this.providersService.addStylistPortfolioItem(req.user, dto);
  }

  @Put('stylist-availability')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  updateStylistAvailability(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateStylistAvailabilityDto,
  ) {
    return this.providersService.updateStylistAvailability(req.user, dto);
  }

  @Put('stylist-pricing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  updateStylistPricing(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateStylistPricingDto,
  ) {
    return this.providersService.updateStylistPricing(req.user, dto);
  }

  @Get('stylist-analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getStylistAnalytics(@Req() req: AuthenticatedRequest) {
    return this.providersService.getStylistAnalytics(req.user);
  }

  @Get('stylist-payment-records')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getStylistPaymentRecords(@Req() req: AuthenticatedRequest) {
    return this.providersService.getStylistPaymentRecords(req.user);
  }

  @Get('stylist-all-transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getStylistAllTransactions(@Req() req: AuthenticatedRequest) {
    return this.providersService.getStylistAllTransactions(req.user);
  }
}
