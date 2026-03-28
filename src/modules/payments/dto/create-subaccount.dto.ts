import { IsEnum, IsString } from 'class-validator';
import { ProviderTypeDto } from './initialize-payment.dto';

export class CreateSubaccountDto {
  @IsString()
  bankName: string;

  @IsString()
  accountNumber: string;

  @IsString()
  accountName: string;

  @IsEnum(ProviderTypeDto)
  userType: ProviderTypeDto;
}
