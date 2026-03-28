import { IsEnum, IsString } from 'class-validator';
import { ProviderType } from '@prisma/client';

export class ToggleFavouriteDto {
  @IsEnum(ProviderType)
  providerType: ProviderType;

  @IsString()
  providerId: string;
}
