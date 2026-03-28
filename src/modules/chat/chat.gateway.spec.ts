import { ChatGateway } from './chat.gateway';

describe('ChatGateway', () => {
  const createClient = () => ({
    id: 'socket-1',
    handshake: {
      auth: { token: 'token-1' },
      headers: {},
    },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  const createGateway = () => {
    const chatService = {
      assertConversationAccess: jest.fn(),
      sendMessage: jest.fn(),
      buildConversationPreviewForUser: jest.fn(),
      getUnreadCount: jest.fn(),
      markConversationRead: jest.fn(),
    };

    const jwtService = {
      verify: jest.fn(),
    };

    const configService = {
      get: jest.fn().mockReturnValue('secret'),
    };

    const prisma = {
      accessTokenBlocklist: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const gateway = new ChatGateway(
      chatService as any,
      jwtService as any,
      configService as any,
      prisma as any,
    );

    const emit = jest.fn();
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit }),
    } as any;

    return { gateway, chatService, jwtService, prisma, emit };
  };

  it('rejects socket connection when token validation fails', async () => {
    const { gateway, jwtService } = createGateway();
    const client = createClient();

    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    await gateway.handleConnection(client as any);

    expect(client.emit).toHaveBeenCalledWith(
      'chat:error',
      expect.objectContaining({ code: 'AUTH_FAILED' }),
    );
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects unauthorized join request', async () => {
    const { gateway, chatService } = createGateway();
    const client = createClient();
    client.data.user = {
      userId: 'user-1',
      email: 'user@primlook.com',
      accountType: 'salon',
    };

    chatService.assertConversationAccess.mockRejectedValue(
      new Error('forbidden'),
    );

    await gateway.joinConversation(client as any, {
      conversationId: 'conversation-1',
    });

    expect(client.emit).toHaveBeenCalledWith(
      'chat:error',
      expect.objectContaining({ code: 'JOIN_CONVERSATION_FAILED' }),
    );
  });

  it('emits message events to user and conversation rooms', async () => {
    const { gateway, chatService, emit } = createGateway();
    const client = createClient();
    client.data.user = {
      userId: 'user-1',
      email: 'user@primlook.com',
      accountType: 'salon',
    };

    chatService.sendMessage.mockResolvedValue({
      status: 201,
      success: true,
      result: {
        message: {
          id: 'message-1',
          conversationId: 'conversation-1',
          senderId: 'user-1',
          text: 'Hi',
          createdAt: new Date().toISOString(),
        },
        conversationPreview: { id: 'conversation-1' },
        participantUserIds: ['user-1', 'user-2'],
      },
    });

    chatService.buildConversationPreviewForUser
      .mockResolvedValueOnce({ id: 'conversation-1', unreadCount: 0 })
      .mockResolvedValueOnce({ id: 'conversation-1', unreadCount: 1 })
      .mockResolvedValueOnce({ id: 'conversation-1', unreadCount: 0 });

    chatService.getUnreadCount
      .mockResolvedValueOnce({ result: { unreadCount: 0 } })
      .mockResolvedValueOnce({ result: { unreadCount: 1 } });

    await gateway.sendMessage(client as any, {
      conversationId: 'conversation-1',
      text: 'Hi',
      clientMessageId: 'client-1',
    });

    expect((gateway.server.to as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        ['user:user-1'],
        ['user:user-2'],
        ['conversation:conversation-1'],
      ]),
    );
    expect(emit).toHaveBeenCalledWith(
      'chat:message_created',
      expect.any(Object),
    );
    expect(emit).toHaveBeenCalledWith(
      'chat:conversation_updated',
      expect.any(Object),
    );
  });

  it('emits read receipt updates', async () => {
    const { gateway, chatService, emit } = createGateway();
    const client = createClient();
    client.data.user = {
      userId: 'user-1',
      email: 'user@primlook.com',
      accountType: 'salon',
    };

    chatService.markConversationRead.mockResolvedValue({
      status: 200,
      success: true,
      result: {
        conversationId: 'conversation-1',
        readerUserId: 'user-1',
        lastReadAt: new Date().toISOString(),
        participantUserIds: ['user-1', 'user-2'],
        unreadCount: 0,
      },
    });

    await gateway.markRead(client as any, { conversationId: 'conversation-1' });

    expect(emit).toHaveBeenCalledWith(
      'chat:messages_read',
      expect.objectContaining({ conversationId: 'conversation-1' }),
    );
  });
});
