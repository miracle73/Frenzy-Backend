import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  getConversations(
    @Req() req: AuthenticatedRequest & { id?: string },
    @Query() query: PaginationQueryDto,
  ) {
    return this.chatService.getConversations(req.user.userId, query);
  }

  @Get('conversations/:conversationId/messages')
  @HttpCode(HttpStatus.OK)
  getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.chatService.getMessages(req.user.userId, conversationId, query);
  }

  @Post('messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Req() req: AuthenticatedRequest & { id?: string },
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.chatService.sendMessage(req.user.userId, dto, req.id);
    // Broadcast via WebSocket so all participants receive the message in real-time
    await this.chatGateway.broadcastNewMessage(result, req.user.userId).catch(() => {});
    return result;
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(HttpStatus.OK)
  markConversationRead(
    @Req() req: AuthenticatedRequest & { id?: string },
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.markConversationRead(
      req.user.userId,
      conversationId,
      req.id,
    );
  }

  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.chatService.getUnreadCount(req.user.userId);
  }
}
