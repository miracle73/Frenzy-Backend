import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AutocompleteDto {
  @ApiProperty({ description: 'Search input text', example: 'Lagos' })
  @IsString()
  @MinLength(2)
  input: string;

  @ApiProperty({ description: 'Country code (ISO 3166-1 alpha-2)', example: 'NG', required: false })
  @IsOptional()
  @IsString()
  country?: string;
}
