import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { hashToken } from '../../common/utils/token.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUserPayload } from '../auth/types/auth.types';
import { ChatService } from './chat.service';
import { ConversationRoomDto } from './dto/conversation-room.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendMessageDto } from './dto/send-message.dto';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: AuthUserPayload;
  };
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private socketAuthFailures = 0;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractHandshakeToken(client);
      if (!token) {
        throw new Error('Missing token');
      }

      const payload = this.jwtService.verify<AuthUserPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET')!,
      });

      const blocked = await this.prisma.accessTokenBlocklist.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true },
      });

      if (blocked) {
        throw new Error('Token revoked');
      }

      client.data.user = payload;
      await client.join(this.userRoom(payload.userId));
      client.emit('chat:connected', { userId: payload.userId });
    } catch {
      this.socketAuthFailures += 1;
      this.logger.warn(
        `chat.socket_auth_failed socketId=${client.id} failures=${this.socketAuthFailures}`,
      );
      client.emit('chat:error', {
        code: 'AUTH_FAILED',
        message: 'Socket authentication failed',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data?.user?.userId;
    if (userId) {
      this.logger.log(`chat.socket_disconnected socketId=${client.id} userId=${userId}`);
    }
  }

  @SubscribeMessage('chat:connect_user')
  connectUser(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const user = this.requireUser(client);
      client.emit('chat:connected', { userId: user.userId });
      return { status: 'ok' };
    } catch (error) {
      this.emitSocketError(client, error, 'CONNECT_USER_FAILED');
      return { status: 'error' };
    }
  }

  @SubscribeMessage('chat:join_conversation')
  async joinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ConversationRoomDto,
  ) {
    try {
      const user = this.requireUser(client);
      await this.chatService.assertConversationAccess(user.userId, dto.conversationId);
      await client.join(this.conversationRoom(dto.conversationId));
      return { status: 'ok' };
    } catch (error) {
      this.emitSocketError(client, error, 'JOIN_CONVERSATION_FAILED');
      return { status: 'error' };
    }
  }

  @SubscribeMessage('chat:leave_conversation')
  async leaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ConversationRoomDto,
  ) {
    await client.leave(this.conversationRoom(dto.conversationId));
    return { status: 'ok' };
  }

  @SubscribeMessage('chat:send_message')
  async sendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    try {
      const user = this.requireUser(client);
      const sendResult = await this.chatService.sendMessage(
        user.userId,
        dto,
        `socket:${client.id}`,
      );

      await this.broadcastNewMessage(sendResult, user.userId);

      return { status: 'ok' };
    } catch (error) {
      this.emitSocketError(client, error, 'SEND_MESSAGE_FAILED');
      return { status: 'error' };
    }
  }

  async broadcastNewMessage(
    sendResult: Awaited<ReturnType<ChatService['sendMessage']>>,
    senderUserId: string,
  ): Promise<void> {
    if (!this.server) {
      return;
    }

    const { message, participantUserIds } = sendResult.result;
    const conversationId = message.conversationId;

    for (const participantUserId of participantUserIds) {
      const previewResponse = await this.chatService.buildConversationPreviewForUser(
        conversationId,
        participantUserId,
      );

      const payload = {
        conversationPreview: previewResponse,
        message,
      };

      this.server.to(this.userRoom(participantUserId)).emit('chat:message_created', payload);
      this.server
        .to(this.userRoom(participantUserId))
        .emit('chat:conversation_updated', {
          conversationPreview: previewResponse,
        });

      const unread = await this.chatService.getUnreadCount(participantUserId);
      this.server
        .to(this.userRoom(participantUserId))
        .emit('chat:unread_count', unread.result);
    }

    const senderPreview = await this.chatService.buildConversationPreviewForUser(
      conversationId,
      senderUserId,
    );
    this.server
      .to(this.conversationRoom(conversationId))
      .emit('chat:message_created', {
        conversationPreview: senderPreview,
        message,
      });
  }

  @SubscribeMessage('chat:mark_read')
  async markRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: MarkReadDto,
  ) {
    try {
      const user = this.requireUser(client);
      const readResult = await this.chatService.markConversationRead(
        user.userId,
        dto.conversationId,
        `socket:${client.id}`,
      );

      const payload = {
        conversationId: readResult.result.conversationId,
        readerUserId: readResult.result.readerUserId,
        lastReadAt: readResult.result.lastReadAt,
      };

      for (const participantUserId of readResult.result.participantUserIds) {
        this.server
          .to(this.userRoom(participantUserId))
          .emit('chat:messages_read', payload);
      }

      this.server
        .to(this.conversationRoom(readResult.result.conversationId))
        .emit('chat:messages_read', payload);

      this.server
        .to(this.userRoom(user.userId))
        .emit('chat:unread_count', { unreadCount: readResult.result.unreadCount });

      return { status: 'ok' };
    } catch (error) {
      this.emitSocketError(client, error, 'MARK_READ_FAILED');
      return { status: 'error' };
    }
  }

  private requireUser(client: AuthenticatedSocket): AuthUserPayload {
    const user = client.data?.user;
    if (!user) {
      throw new Error('Unauthenticated socket user');
    }
    return user;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private conversationRoom(conversationId: string): string {
    return `conversation:${conversationId}`;
  }

  private extractHandshakeToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.toLowerCase().startsWith('bearer ')
        ? authToken.slice(7).trim()
        : authToken.trim();
    }

    const headerAuth = client.handshake.headers.authorization;
    if (typeof headerAuth === 'string' && headerAuth.toLowerCase().startsWith('bearer ')) {
      return headerAuth.slice(7).trim();
    }

    return null;
  }

  private emitSocketError(
    client: AuthenticatedSocket,
    error: unknown,
    code: string,
  ): void {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Socket action failed';

    client.emit('chat:error', { code, message });
  }
}
