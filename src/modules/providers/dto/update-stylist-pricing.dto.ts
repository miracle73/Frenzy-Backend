import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateStylistPricingDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseTransportFee?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  transportFee?: number;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  services?: Record<string, unknown>[];
}
