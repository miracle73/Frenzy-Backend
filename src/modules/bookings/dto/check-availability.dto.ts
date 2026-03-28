import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AvailabilityItemDto {
  @IsOptional()
  @IsString()
  salonId?: string;

  @IsOptional()
  @IsString()
  stylistId?: string;

  @IsOptional()
  @IsIn(['salon', 'stylist'])
  providerType?: string;

  @IsString()
  preferredDate: string;

  @IsString()
  preferredTime: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalDuration: number;
}

export class CheckAvailabilityDto extends AvailabilityItemDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityItemDto)
  persons?: AvailabilityItemDto[];
}
