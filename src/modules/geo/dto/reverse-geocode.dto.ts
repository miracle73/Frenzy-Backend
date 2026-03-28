import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReverseGeocodeDto {
  @ApiProperty({ description: 'Latitude', example: 6.5244 })
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'Longitude', example: 3.3792 })
  @IsNumber()
  lng: number;
}
