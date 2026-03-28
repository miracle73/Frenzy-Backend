import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class NewPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(6)
  confirmPassword: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}
