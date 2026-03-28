import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  countryCallCode?: string;

  @IsString()
  @IsIn(['customer', 'salon', 'stylist'])
  accountType: 'customer' | 'salon' | 'stylist';
}
