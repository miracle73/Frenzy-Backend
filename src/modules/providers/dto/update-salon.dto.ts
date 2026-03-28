import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSalonDto {
  @IsOptional()
  @IsString()
  business_name?: string;

  @IsOptional()
  @IsString()
  business_logo?: string;

  @IsOptional()
  @IsString()
  business_banner?: string;

  @IsOptional()
  @IsString()
  website_link?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stylist_count?: number;

  @IsOptional()
  @IsString()
  full_address?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  lga?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  address_line_2?: string;

  @IsOptional()
  @IsString()
  about?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  services?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  openHours?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  business_gallery?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  businessGallery?: string[];
}
