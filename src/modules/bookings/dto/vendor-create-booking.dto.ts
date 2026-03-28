import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BookingLocationDto, BookingServiceItemDto } from './create-booking.dto';

export class VendorCreateBookingDto {
  @IsEmail()
  customerEmail: string;

  @IsString()
  @MinLength(6)
  customerPhone: string;

  @IsString()
  @MinLength(1)
  customerFirstName: string;

  @IsString()
  @MinLength(1)
  customerLastName: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingServiceItemDto)
  services: BookingServiceItemDto[];

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalAmount: number;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalDuration: number;

  @IsString()
  preferredDate: string;

  @IsString()
  preferredTime: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BookingLocationDto)
  location?: BookingLocationDto;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  transportFare?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  depositPercent?: number;
}
