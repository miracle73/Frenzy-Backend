import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export enum ProviderTypeDto {
  salon = 'salon',
  stylist = 'stylist',
}

class PaymentServiceItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  rate?: number;
}

export class InitializePaymentDto {
  @IsOptional()
  @IsString()
  bookingId?: string;

  // Deprecated client hint. Amount is now computed server-side from bookings.
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalAmount?: number;

  // Deprecated client hint retained for backward compatibility.
  @IsOptional()
  @IsEnum(ProviderTypeDto)
  providerType?: ProviderTypeDto;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  providerEmail?: string;

  @IsOptional()
  @IsBoolean()
  isGroupBooking?: boolean;

  @IsOptional()
  @IsString()
  groupBookingId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bookingIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentServiceItemDto)
  services?: PaymentServiceItemDto[];

  @IsOptional()
  @IsString()
  clientCheckoutId?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  depositPercent?: number;
}
