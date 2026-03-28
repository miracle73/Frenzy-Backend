import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

const USER_PREVIEW_SELECT = {
  id: true,
  email: true,
  firstName: true,
  middleName: true,
  lastName: true,
  profileImgUrl: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const CONVERSATION_INCLUDE = {
  participants: {
    include: {
      user: {
        select: USER_PREVIEW_SELECT,
      },
    },
  },
  lastMessage: {
    include: {
      sender: {
        select: USER_PREVIEW_SELECT,
      },
    },
  },
} satisfies Prisma.ConversationInclude;

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_INCLUDE;
}>;

type MessageWithSender = Prisma.ChatMessageGetPayload<{
  include: {
    sender: {
      select: typeof USER_PREVIEW_SELECT;
    };
  };
}>;

export interface Envelope<T> {
  status: number;
  success: boolean;
  result: T;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private messagesSentCount = 0;
  private readReceiptsEmittedCount = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getConversations(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<
    Envelope<{
      conversations: Awaited<ReturnType<ChatService['buildConversationPreviewForUser']>>[];
      nextCursor: string | null;
      hasMore: boolean;
    }>
  > {
    const limit = this.resolveLimit(query.limit);
    const cursorDate = this.resolveCursor(query.cursor);

    const where: Prisma.ConversationWhereInput = {
      participants: { some: { userId } },
      ...(cursorDate
        ? {
            OR: [
              { lastMessageAt: { lt: cursorDate } },
              {
                AND: [{ lastMessageAt: null }, { updatedAt: { lt: cursorDate } }],
              },
            ],
          }
        : {}),
    };

    const conversations = await this.prisma.conversation.findMany({
      where,
      include: CONVERSATION_INCLUDE,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit + 1,
    });

    const hasMore = conversations.length > limit;
    const page = hasMore ? conversations.slice(0, limit) : conversations;

    const previews = await Promise.all(
      page.map((conversation) => this.mapConversationPreview(conversation, userId)),
    );

    const tail = page[page.length - 1];
    const nextCursor = hasMore
      ? (tail?.lastMessageAt ?? tail?.updatedAt)?.toISOString() ?? null
      : null;

    return this.ok(200, {
      conversations: previews,
      nextCursor,
      hasMore,
    });
  }

  async getMessages(
    userId: string,
    conversationId: string,
    query: PaginationQueryDto,
  ): Promise<
    Envelope<{
      messages: ReturnType<ChatService['formatMessage']>[];
      nextCursor: string | null;
      hasMore: boolean;
    }>
  > {
    await this.ensureParticipant(userId, conversationId);

    const limit = this.resolveLimit(query.limit);
    const cursorDate = this.resolveCursor(query.cursor);

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      include: {
        sender: {
          select: USER_PREVIEW_SELECT,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore
      ? page[page.length - 1]?.createdAt.toISOString() ?? null
      : null;

    return this.ok(200, {
      messages: page.map((message) => this.formatMessage(message)),
      nextCursor,
      hasMore,
    });
  }

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
    requestId?: string,
  ): Promise<
    Envelope<{
      message: ReturnType<ChatService['formatMessage']>;
      conversationPreview: Awaited<ReturnType<ChatService['buildConversationPreviewForUser']>>;
      participantUserIds: string[];
    }>
  > {
    const text = dto.text?.trim();
    if (!text) {
      throw new BadRequestException({
        message: 'Message text is required',
        error: 'Message text is required',
      });
    }

    const conversation = await this.resolveConversationForSend(
      userId,
      dto.conversationId,
      dto.toUserId,
    );

    if (dto.clientMessageId?.trim()) {
      const existing = await this.prisma.chatMessage.findFirst({
        where: {
          conversationId: conversation.id,
          senderId: userId,
          clientMessageId: dto.clientMessageId.trim(),
        },
        include: {
          sender: {
            select: USER_PREVIEW_SELECT,
          },
        },
      });

      if (existing) {
        const preview = await this.buildConversationPreviewForUser(
          conversation.id,
          userId,
        );
        return this.ok(200, {
          message: this.formatMessage(existing),
          conversationPreview: preview,
          participantUserIds: conversation.participants.map((participant) => participant.userId),
        });
      }
    }

    const senderParticipant = conversation.participants.find(
      (participant) => participant.userId === userId,
    );

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          text,
          clientMessageId: dto.clientMessageId?.trim() || undefined,
        },
        include: {
          sender: {
            select: USER_PREVIEW_SELECT,
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageId: created.id,
          lastMessageAt: created.createdAt,
        },
      });

      if (senderParticipant) {
        await tx.conversationParticipant.update({
          where: { id: senderParticipant.id },
          data: {
            lastReadMessageId: created.id,
            lastReadAt: created.createdAt,
          },
        });
      }

      return created;
    });

    this.messagesSentCount += 1;
    this.logger.log(
      `chat.send_message requestId=${requestId ?? 'n/a'} userId=${userId} conversationId=${conversation.id} messagesSent=${this.messagesSentCount}`,
    );

    const preview = await this.buildConversationPreviewForUser(conversation.id, userId);

    return this.ok(201, {
      message: this.formatMessage(message),
      conversationPreview: preview,
      participantUserIds: conversation.participants.map((participant) => participant.userId),
    });
  }

  async markConversationRead(
    userId: string,
    conversationId: string,
    requestId?: string,
  ): Promise<
    Envelope<{
      conversationId: string;
      readerUserId: string;
      lastReadAt: string | null;
      participantUserIds: string[];
      unreadCount: number;
    }>
  > {
    const conversation = await this.ensureParticipant(userId, conversationId);
    const participant = conversation.participants.find(
      (item) => item.userId === userId,
    );

    if (!participant) {
      throw new ForbiddenException({
        message: 'Not allowed to mark this conversation as read',
        error: 'Forbidden',
      });
    }

    const latestMessage = await this.prisma.chatMessage.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });

    if (latestMessage) {
      await this.prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: {
          lastReadMessageId: latestMessage.id,
          lastReadAt: latestMessage.createdAt,
        },
      });
    }

    const unreadCount = await this.computeUnreadCount(userId);

    this.readReceiptsEmittedCount += 1;
    this.logger.log(
      `chat.mark_read requestId=${requestId ?? 'n/a'} userId=${userId} conversationId=${conversationId} readReceipts=${this.readReceiptsEmittedCount}`,
    );

    return this.ok(200, {
      conversationId,
      readerUserId: userId,
      lastReadAt: latestMessage ? latestMessage.createdAt.toISOString() : null,
      participantUserIds: conversation.participants.map((item) => item.userId),
      unreadCount,
    });
  }

  async getUnreadCount(userId: string): Promise<Envelope<{ unreadCount: number }>> {
    const unreadCount = await this.computeUnreadCount(userId);
    return this.ok(200, { unreadCount });
  }

  async assertConversationAccess(userId: string, conversationId: string): Promise<void> {
    await this.ensureParticipant(userId, conversationId);
  }

  async buildConversationPreviewForUser(
    conversationId: string,
    userId: string,
  ): Promise<{
    id: string;
    type: string;
    lastMessageAt: string | null;
    unreadCount: number;
    counterparty: {
      id: string;
      name: string;
      email: string;
      profileImgUrl: string | null;
      lastSeenAt: string | null;
    } | null;
    lastMessage: ReturnType<ChatService['formatMessage']> | null;
  }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });

    if (!conversation) {
      throw new NotFoundException({
        message: 'Conversation not found',
        error: 'Conversation not found',
      });
    }

    return this.mapConversationPreview(conversation, userId);
  }

  private async resolveConversationForSend(
    senderId: string,
    conversationId?: string,
    toUserId?: string,
  ): Promise<ConversationWithRelations> {
    if (conversationId?.trim()) {
      return this.ensureParticipant(senderId, conversationId.trim());
    }

    if (!toUserId?.trim()) {
      throw new BadRequestException({
        message: 'conversationId or toUserId is required',
        error: 'conversationId or toUserId is required',
      });
    }

    const recipientId = toUserId.trim();
    if (recipientId === senderId) {
      throw new BadRequestException({
        message: 'Cannot send a message to yourself',
        error: 'Cannot send a message to yourself',
      });
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true },
    });

    if (!recipient) {
      throw new NotFoundException({
        message: 'Recipient not found',
        error: 'Recipient not found',
      });
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { userId: senderId } } },
          { participants: { some: { userId: recipientId } } },
        ],
      },
      include: CONVERSATION_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        type: 'direct',
        participants: {
          create: [{ userId: senderId }, { userId: recipientId }],
        },
      },
      include: CONVERSATION_INCLUDE,
    });
  }

  private async ensureParticipant(
    userId: string,
    conversationId: string,
  ): Promise<ConversationWithRelations> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });

    if (!conversation) {
      throw new NotFoundException({
        message: 'Conversation not found',
        error: 'Conversation not found',
      });
    }

    const isParticipant = conversation.participants.some(
      (participant) => participant.userId === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException({
        message: 'You are not a participant in this conversation',
        error: 'Forbidden',
      });
    }

    return conversation;
  }

  private async mapConversationPreview(
    conversation: ConversationWithRelations,
    userId: string,
  ): Promise<{
    id: string;
    type: string;
    lastMessageAt: string | null;
    unreadCount: number;
    counterparty: {
      id: string;
      name: string;
      email: string;
      profileImgUrl: string | null;
      lastSeenAt: string | null;
    } | null;
    lastMessage: ReturnType<ChatService['formatMessage']> | null;
  }> {
    const selfParticipant = conversation.participants.find(
      (participant) => participant.userId === userId,
    );

    if (!selfParticipant) {
      throw new ForbiddenException({
        message: 'You are not a participant in this conversation',
        error: 'Forbidden',
      });
    }

    const otherParticipant =
      conversation.participants.find((participant) => participant.userId !== userId) ??
      selfParticipant;

    const unreadCount = await this.prisma.chatMessage.count({
      where: {
        conversationId: conversation.id,
        senderId: { not: userId },
        ...(selfParticipant.lastReadAt
          ? { createdAt: { gt: selfParticipant.lastReadAt } }
          : {}),
      },
    });

    return {
      id: conversation.id,
      type: conversation.type,
      lastMessageAt: (conversation.lastMessageAt ?? conversation.updatedAt).toISOString(),
      unreadCount,
      counterparty: otherParticipant
        ? {
            id: otherParticipant.user.id,
            name: this.buildDisplayName(otherParticipant.user),
            email: otherParticipant.user.email,
            profileImgUrl: otherParticipant.user.profileImgUrl ?? null,
            lastSeenAt: otherParticipant.user.updatedAt
              ? otherParticipant.user.updatedAt.toISOString()
              : null,
          }
        : null,
      lastMessage: conversation.lastMessage
        ? this.formatMessage(conversation.lastMessage)
        : null,
    };
  }

  private formatMessage(message: MessageWithSender) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: {
        id: message.sender.id,
        name: this.buildDisplayName(message.sender),
        email: message.sender.email,
        profileImgUrl: message.sender.profileImgUrl ?? null,
      },
      text: message.text,
      clientMessageId: message.clientMessageId ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private async computeUnreadCount(userId: string): Promise<number> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    });

    if (!participants.length) {
      return 0;
    }

    const unreadByConversation = await Promise.all(
      participants.map((participant) =>
        this.prisma.chatMessage.count({
          where: {
            conversationId: participant.conversationId,
            senderId: { not: userId },
            ...(participant.lastReadAt
              ? { createdAt: { gt: participant.lastReadAt } }
              : {}),
          },
        }),
      ),
    );

    return unreadByConversation.reduce((total, count) => total + count, 0);
  }

  private buildDisplayName(user: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }): string {
    const fullName = [user.firstName, user.middleName, user.lastName]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ')
      .trim();

    if (fullName) {
      return fullName;
    }

    if (user.email) {
      return user.email.split('@')[0];
    }

    return 'Unknown User';
  }

  private resolveLimit(limit?: number): number {
    if (!limit || Number.isNaN(limit)) {
      return 20;
    }
    return Math.min(Math.max(limit, 1), 50);
  }

  private resolveCursor(cursor?: string): Date | undefined {
    if (!cursor) {
      return undefined;
    }

    const parsed = new Date(cursor);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        message: 'Invalid cursor value',
        error: 'Invalid cursor value',
      });
    }

    return parsed;
  }

  private ok<T>(status: number, result: T): Envelope<T> {
    return {
      status,
      success: true,
      result,
    };
  }
}
