import { IsString } from 'class-validator';

export class ConversationRoomDto {
  @IsString()
  conversationId: string;
}
