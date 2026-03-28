import { ChatController } from './chat.controller';

describe('ChatController', () => {
  let controller: ChatController;
  let service: {
    getConversations: jest.Mock;
    getMessages: jest.Mock;
    sendMessage: jest.Mock;
    markConversationRead: jest.Mock;
    getUnreadCount: jest.Mock;
  };
  let gateway: { broadcastNewMessage: jest.Mock };

  const req = {
    id: 'request-1',
    user: {
      userId: 'user-1',
      email: 'vendor@primlook.com',
      accountType: 'salon',
    },
  } as any;

  beforeEach(() => {
    service = {
      getConversations: jest.fn(),
      getMessages: jest.fn(),
      sendMessage: jest.fn(),
      markConversationRead: jest.fn(),
      getUnreadCount: jest.fn(),
    };

    gateway = { broadcastNewMessage: jest.fn().mockResolvedValue(undefined) };
    controller = new ChatController(service as any, gateway as any);
  });

  it('getConversations forwards userId and query', async () => {
    const query = { limit: 20 } as any;

    await controller.getConversations(req, query);

    expect(service.getConversations).toHaveBeenCalledWith('user-1', query);
  });

  it('getMessages forwards userId, conversationId and query', async () => {
    const query = { limit: 10 } as any;

    await controller.getMessages(req, 'conversation-1', query);

    expect(service.getMessages).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      query,
    );
  });

  it('sendMessage forwards userId, dto and requestId and broadcasts', async () => {
    const dto = { conversationId: 'conversation-1', text: 'Hello' } as any;
    const sendResult = { result: { message: {}, participantUserIds: [] } };
    service.sendMessage.mockResolvedValue(sendResult);

    const result = await controller.sendMessage(req, dto);

    expect(service.sendMessage).toHaveBeenCalledWith('user-1', dto, 'request-1');
    expect(gateway.broadcastNewMessage).toHaveBeenCalledWith(sendResult, 'user-1');
    expect(result).toBe(sendResult);
  });

  it('markConversationRead forwards userId, conversationId and requestId', async () => {
    await controller.markConversationRead(req, 'conversation-1');

    expect(service.markConversationRead).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      'request-1',
    );
  });

  it('getUnreadCount forwards userId', async () => {
    await controller.getUnreadCount(req);

    expect(service.getUnreadCount).toHaveBeenCalledWith('user-1');
  });
});
