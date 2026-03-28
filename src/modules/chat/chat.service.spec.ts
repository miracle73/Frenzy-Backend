import { ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';

const createPrismaMock = () => ({
  conversation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  conversationParticipant: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  chatMessage: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('ChatService', () => {
  let service: ChatService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ChatService(prisma as any);
  });

  it('creates a direct conversation on first send when conversationId is absent', async () => {
    const createdConversation = {
      id: 'conversation-1',
      type: 'direct',
      lastMessageId: null,
      lastMessageAt: null,
      updatedAt: new Date('2026-01-01T10:00:00.000Z'),
      participants: [
        { id: 'p1', userId: 'sender-1' },
        { id: 'p2', userId: 'receiver-1' },
      ],
      lastMessage: null,
    };

    prisma.user.findUnique.mockResolvedValue({ id: 'receiver-1' });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue(createdConversation as any);
    prisma.chatMessage.findFirst.mockResolvedValue(null);

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        chatMessage: {
          create: jest.fn().mockResolvedValue({
            id: 'message-1',
            conversationId: 'conversation-1',
            senderId: 'sender-1',
            text: 'Hello there',
            clientMessageId: 'client-1',
            createdAt: new Date('2026-01-01T10:10:00.000Z'),
            sender: {
              id: 'sender-1',
              email: 'sender@primlook.com',
              firstName: 'Sender',
              middleName: null,
              lastName: 'One',
              profileImgUrl: null,
              updatedAt: new Date(),
            },
          }),
        },
        conversation: {
          update: jest.fn().mockResolvedValue({}),
        },
        conversationParticipant: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    jest.spyOn(service, 'buildConversationPreviewForUser').mockResolvedValue({
      id: 'conversation-1',
      type: 'direct',
      lastMessageAt: '2026-01-01T10:10:00.000Z',
      unreadCount: 0,
      counterparty: {
        id: 'receiver-1',
        name: 'Receiver One',
        email: 'receiver@primlook.com',
        profileImgUrl: null,
        lastSeenAt: null,
      },
      lastMessage: null,
    });

    const result = await service.sendMessage('sender-1', {
      toUserId: 'receiver-1',
      text: 'Hello there',
      clientMessageId: 'client-1',
    });

    expect(prisma.conversation.create).toHaveBeenCalled();
    expect(result.status).toBe(201);
    expect(result.result.message.id).toBe('message-1');
  });

  it('returns existing message for duplicate clientMessageId sends', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      type: 'direct',
      lastMessageId: 'message-1',
      lastMessageAt: new Date('2026-01-01T10:10:00.000Z'),
      updatedAt: new Date('2026-01-01T10:10:00.000Z'),
      participants: [
        { id: 'p1', userId: 'sender-1' },
        { id: 'p2', userId: 'receiver-1' },
      ],
      lastMessage: null,
    } as any);

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      text: 'Hello there',
      clientMessageId: 'client-1',
      createdAt: new Date('2026-01-01T10:10:00.000Z'),
      sender: {
        id: 'sender-1',
        email: 'sender@primlook.com',
        firstName: 'Sender',
        middleName: null,
        lastName: 'One',
        profileImgUrl: null,
        updatedAt: new Date(),
      },
    });

    jest.spyOn(service, 'buildConversationPreviewForUser').mockResolvedValue({
      id: 'conversation-1',
      type: 'direct',
      lastMessageAt: '2026-01-01T10:10:00.000Z',
      unreadCount: 0,
      counterparty: {
        id: 'receiver-1',
        name: 'Receiver One',
        email: 'receiver@primlook.com',
        profileImgUrl: null,
        lastSeenAt: null,
      },
      lastMessage: null,
    });

    const result = await service.sendMessage('sender-1', {
      conversationId: 'conversation-1',
      text: 'Hello there',
      clientMessageId: 'client-1',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.result.message.id).toBe('message-1');
  });

  it('computes unread count across conversations', async () => {
    prisma.conversationParticipant.findMany.mockResolvedValue([
      {
        conversationId: 'conversation-1',
        lastReadAt: new Date('2026-01-01T09:00:00.000Z'),
      },
      {
        conversationId: 'conversation-2',
        lastReadAt: null,
      },
    ]);

    prisma.chatMessage.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    const result = await service.getUnreadCount('user-1');

    expect(result.result.unreadCount).toBe(4);
  });

  it('marks only the current participant as read', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      type: 'direct',
      lastMessageId: 'message-10',
      lastMessageAt: new Date('2026-01-01T10:20:00.000Z'),
      updatedAt: new Date('2026-01-01T10:20:00.000Z'),
      participants: [
        { id: 'participant-self', userId: 'user-1' },
        { id: 'participant-other', userId: 'user-2' },
      ],
      lastMessage: null,
    } as any);

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: 'message-10',
      conversationId: 'conversation-1',
      senderId: 'user-2',
      text: 'Hi',
      createdAt: new Date('2026-01-01T10:20:00.000Z'),
    });

    prisma.conversationParticipant.findMany.mockResolvedValue([
      {
        conversationId: 'conversation-1',
        lastReadAt: new Date('2026-01-01T10:20:00.000Z'),
      },
    ]);
    prisma.chatMessage.count.mockResolvedValue(0);

    await service.markConversationRead('user-1', 'conversation-1');

    expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-self' },
      data: {
        lastReadMessageId: 'message-10',
        lastReadAt: new Date('2026-01-01T10:20:00.000Z'),
      },
    });
    expect(prisma.conversationParticipant.update).toHaveBeenCalledTimes(1);
  });

  it('rejects message fetch when user is not a participant', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      type: 'direct',
      lastMessageId: null,
      lastMessageAt: null,
      updatedAt: new Date(),
      participants: [{ id: 'participant-other', userId: 'user-2' }],
      lastMessage: null,
    } as any);

    await expect(
      service.getMessages('user-1', 'conversation-1', {} as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
