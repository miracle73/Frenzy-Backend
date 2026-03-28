import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const shouldValidateSingleFields = (value: unknown): boolean => {
  const maybe = value as { persons?: unknown };
  if (!Array.isArray(maybe?.persons)) {
    return true;
  }
  return maybe.persons.length === 0;
};

export class BookingServiceItemDto {
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

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  duration?: number;
}

export class BookingLocationDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  landmark?: string;
}

export class BookingPersonDto {
  @IsOptional()
  @IsString()
  personName?: string;

  @IsOptional()
  @IsString()
  salonId?: string;

  @IsOptional()
  @IsString()
  stylistId?: string;

  @IsOptional()
  @IsIn(['salon', 'stylist'])
  providerType?: string;

  @IsOptional()
  @IsIn(['salon', 'home_service'])
  serviceType?: string;

  @ValidateIf(shouldValidateSingleFields)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingServiceItemDto)
  services: BookingServiceItemDto[];

  @ValidateIf(shouldValidateSingleFields)
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalAmount: number;

  @ValidateIf(shouldValidateSingleFields)
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalDuration: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  transportFare?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BookingLocationDto)
  location?: BookingLocationDto;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ValidateIf(shouldValidateSingleFields)
  @IsString()
  preferredDate: string;

  @ValidateIf(shouldValidateSingleFields)
  @IsString()
  preferredTime: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  styleImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styleImageUrls?: string[];
}

export class CreateBookingDto extends BookingPersonDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingPersonDto)
  persons?: BookingPersonDto[];

  @IsOptional()
  @IsBoolean()
  isGroupBooking?: boolean;

  @IsOptional()
  @IsString()
  groupBookingId?: string;

  @IsOptional()
  @IsString()
  clientCheckoutId?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;
}
