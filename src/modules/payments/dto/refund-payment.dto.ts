import { IsOptional, IsString } from 'class-validator';

export class RefundPaymentDto {
  @IsString()
  paymentId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
