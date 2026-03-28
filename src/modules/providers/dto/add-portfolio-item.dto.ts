import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddPortfolioItemDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
