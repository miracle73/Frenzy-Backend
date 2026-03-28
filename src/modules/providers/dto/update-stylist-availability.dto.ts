import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateStylistAvailabilityDto {
  @IsOptional()
  @IsObject()
  availability?: Record<string, { available: boolean; start?: string; end?: string }>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workingDays?: string[];

  @IsOptional()
  @IsObject()
  workingHours?: { start: string; end: string };

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsIn(['active', 'inactive', 'suspended', 'pending_approval'])
  status?: string;
}
