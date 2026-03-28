import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveAddressDto {
  @ApiProperty({ example: '12 Allen Avenue, Ikeja' })
  @IsString()
  address: string;

  @ApiProperty({ example: 'Ikeja', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: 'Nigeria', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'Near the big church', required: false })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiProperty({ example: 'Home', required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ example: 6.5244, required: false })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiProperty({ example: 3.3792, required: false })
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class DeleteAddressDto {
  @ApiProperty({ example: 'addr_abc123' })
  @IsString()
  addressId: string;
}
