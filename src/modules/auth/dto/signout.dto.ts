import { IsOptional, IsString } from 'class-validator';

export class SignOutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
