import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceDiscountDto {
  @ApiProperty({ description: 'Keyword to match in service name (case-insensitive)', example: 'haircut' })
  @IsString()
  serviceKeyword: string;

  @ApiProperty({ description: 'Discount percentage (0-100)', example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @ApiPropertyOptional({ description: 'Max service price eligible for this discount', example: 4000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;
}

export class UpdateServiceDiscountDto {
  @ApiPropertyOptional({ example: 'braids' })
  @IsOptional()
  @IsString()
  serviceKeyword?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
