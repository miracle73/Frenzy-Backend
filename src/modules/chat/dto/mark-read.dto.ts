import { IsString } from 'class-validator';

export class MarkReadDto {
  @IsString()
  conversationId: string;
}
