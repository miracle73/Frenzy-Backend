import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class WithdrawFundsDto {
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  amount: number;
}
