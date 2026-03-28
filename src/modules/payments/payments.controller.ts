import {
  Body,
  Controller,
  Delete,
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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { CreateSubaccountDto } from './dto/create-subaccount.dto';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { WithdrawFundsDto } from './dto/withdraw-funds.dto';
import { CreateServiceDiscountDto, UpdateServiceDiscountDto } from './dto/service-discount.dto';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payment')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  initializePayment(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitializePaymentDto,
  ) {
    return this.paymentsService.initializePayment(req.user, dto);
  }

  @Get('verify')
  @HttpCode(HttpStatus.OK)
  verifyPayment(@Query() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(dto.reference);
  }

  @Post('subaccount')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  createSubaccount(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSubaccountDto,
  ) {
    return this.paymentsService.createSubaccount(req.user, dto);
  }

  @Get('subaccount')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getSubaccount(@Req() req: AuthenticatedRequest) {
    return this.paymentsService.getSubaccount(req.user);
  }

  @Get('banks')
  @HttpCode(HttpStatus.OK)
  getBanks() {
    return this.paymentsService.getBankList();
  }

  @Get('resolve-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  resolveAccount(
    @Query('account_number') accountNumber: string,
    @Query('bank_code') bankCode: string,
  ) {
    return this.paymentsService.resolveAccountNumber(accountNumber, bankCode);
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  withdrawFunds(@Req() req: AuthenticatedRequest, @Body() dto: WithdrawFundsDto) {
    return this.paymentsService.withdrawFunds(req.user, dto);
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  processRefund(@Body() dto: RefundPaymentDto) {
    return this.paymentsService.processRefund(dto);
  }

  @Post('balance-link/:bookingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  generateBalancePaymentLink(@Param('bookingId') bookingId: string) {
    const callbackBase = this.configService.get<string>('VENDOR_PAYMENT_CALLBACK_URL') ?? '';
    const callbackUrl = callbackBase ? `${callbackBase}/payment/vendor-verify` : undefined;
    return this.paymentsService.generateBalancePaymentLink(bookingId, callbackUrl);
  }

  @Post('mark-cash-paid/:bookingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  markBalanceCashPaid(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
  ) {
    return this.paymentsService.markBalanceCashPaid(bookingId, req.user.userId);
  }

  @Post('balance-initialize/:bookingId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  initializeBalancePayment(
    @Req() req: AuthenticatedRequest,
    @Param('bookingId') bookingId: string,
    @Body() body: { callbackUrl?: string },
  ) {
    return this.paymentsService.initializeBalancePayment(req.user, bookingId, body.callbackUrl);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const payload = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString('utf8'))
      : req.body;

    return this.paymentsService.handleWebhook(
      payload,
      rawBody ?? (Buffer.isBuffer(req.body) ? req.body : undefined),
      req.headers['x-paystack-signature'] as string | undefined,
    );
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getProviderWallet(@Req() req: AuthenticatedRequest) {
    return this.paymentsService.getProviderWallet(req.user);
  }

  @Get('customer-wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getCustomerWalletSummary(@Req() req: AuthenticatedRequest) {
    return this.paymentsService.getCustomerWalletSummary(req.user);
  }

  @Get('customer-payments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getCustomerPayments(@Req() req: AuthenticatedRequest) {
    return this.paymentsService.getCustomerPayments(req.user);
  }

  @Get('salon-payments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getSalonPayments(@Req() req: AuthenticatedRequest) {
    return this.paymentsService.getSalonPayments(req.user);
  }

  @Get('stylist-payments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getStylistPayments(@Req() req: AuthenticatedRequest) {
    return this.paymentsService.getStylistPayments(req.user);
  }

  @Post('release-payout/:paymentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  releaseProviderPayout(@Param('paymentId') paymentId: string) {
    return this.paymentsService.releaseProviderPayout(paymentId);
  }

  @Get('discounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  listDiscounts() {
    return this.paymentsService.listServiceDiscounts();
  }

  @Post('discounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  createDiscount(@Body() dto: CreateServiceDiscountDto) {
    return this.paymentsService.createServiceDiscount(dto);
  }

  @Patch('discounts/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  updateDiscount(@Param('id') id: string, @Body() dto: UpdateServiceDiscountDto) {
    return this.paymentsService.updateServiceDiscount(id, dto);
  }

  @Delete('discounts/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  deleteDiscount(@Param('id') id: string) {
    return this.paymentsService.deleteServiceDiscount(id);
  }
}
