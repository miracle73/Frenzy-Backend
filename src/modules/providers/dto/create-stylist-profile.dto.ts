import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateStylistProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  business_name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @IsOptional()
  @IsObject()
  experience?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  portfolio?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  availability?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  pricing?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  location?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['active', 'inactive', 'suspended', 'pending_approval'])
  status?: string;
}
