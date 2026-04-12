import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QrCheckInDto {
  @ApiProperty({ description: 'Salon ID (from slug lookup)' })
  @IsString()
  @IsNotEmpty()
  salonId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'Nigerian phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'Service name from salon services JSON' })
  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @ApiProperty({ description: 'Service price in Naira (float)' })
  @IsNotEmpty()
  servicePrice: number;

  @ApiProperty({ description: 'Estimated duration in minutes' })
  @IsOptional()
  serviceDuration?: number;
}

export class QrUpdateStatusDto {
  @ApiProperty({ enum: ['confirmed', 'in_progress', 'completed', 'cancelled'] })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cancellationReason?: string;
}

export class QrRecordPaymentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ enum: ['cash', 'bank_transfer', 'paystack'] })
  @IsString()
  @IsNotEmpty()
  method: string;
}
