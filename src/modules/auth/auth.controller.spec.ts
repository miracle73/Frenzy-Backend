import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    register: jest.Mock;
    verifyOtp: jest.Mock;
    signUp: jest.Mock;
    signIn: jest.Mock;
    refresh: jest.Mock;
    getAuthenticatedUser: jest.Mock;
    signOut: jest.Mock;
    passwordReset: jest.Mock;
    newPassword: jest.Mock;
    newPasswordWithoutToken: jest.Mock;
    changePassword: jest.Mock;
    updateUser: jest.Mock;
    getUserByEmail: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    email: 'user@example.com',
    accountType: 'user',
  };
  const req = { user } as any;

  beforeEach(() => {
    service = {
      register: jest.fn(),
      verifyOtp: jest.fn(),
      signUp: jest.fn(),
      signIn: jest.fn(),
      refresh: jest.fn(),
      getAuthenticatedUser: jest.fn(),
      signOut: jest.fn(),
      passwordReset: jest.fn(),
      newPassword: jest.fn(),
      newPasswordWithoutToken: jest.fn(),
      changePassword: jest.fn(),
      updateUser: jest.fn(),
      getUserByEmail: jest.fn(),
    };
    controller = new AuthController(service as any);
  });

  it('register forwards dto', async () => {
    const dto = { email: 'user@example.com' } as any;

    await controller.register(dto);

    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('verifyOtp forwards query dto', async () => {
    const dto = { email: 'user@example.com', otp: '123456' } as any;

    await controller.verifyOtp(dto);

    expect(service.verifyOtp).toHaveBeenCalledWith(dto);
  });

  it('signUp forwards dto', async () => {
    const dto = { email: 'user@example.com' } as any;

    await controller.signUp(dto);

    expect(service.signUp).toHaveBeenCalledWith(dto);
  });

  it('signIn forwards dto', async () => {
    const dto = { email: 'user@example.com', password: 'password' } as any;

    await controller.signIn(dto);

    expect(service.signIn).toHaveBeenCalledWith(dto);
  });

  it('refresh forwards dto', async () => {
    const dto = { refreshToken: 'token' } as any;

    await controller.refresh(dto);

    expect(service.refresh).toHaveBeenCalledWith(dto);
  });

  it('authenticated forwards user payload', async () => {
    await controller.authenticated(req);

    expect(service.getAuthenticatedUser).toHaveBeenCalledWith(user);
  });

  it('signOut forwards user and request context', async () => {
    const dto = { refreshToken: 'token' } as any;

    await controller.signOut(req, dto);

    expect(service.signOut).toHaveBeenCalledWith(user, dto, req);
  });

  it('passwordReset forwards dto', async () => {
    const dto = { email: 'user@example.com' } as any;

    await controller.passwordReset(dto);

    expect(service.passwordReset).toHaveBeenCalledWith(dto);
  });

  it('newPassword forwards dto', async () => {
    const dto = { token: 'token', password: 'new-password' } as any;

    await controller.newPassword(dto);

    expect(service.newPassword).toHaveBeenCalledWith(dto);
  });

  it('newPasswordWithoutToken forwards dto', async () => {
    const dto = { email: 'user@example.com', password: 'new-password' } as any;

    await controller.newPasswordWithoutToken(dto);

    expect(service.newPasswordWithoutToken).toHaveBeenCalledWith(dto);
  });

  it('changePassword forwards user and dto', async () => {
    const dto = { currentPassword: 'old', newPassword: 'new' } as any;

    await controller.changePassword(req, dto);

    expect(service.changePassword).toHaveBeenCalledWith(user, dto);
  });

  it('updateUser forwards user and dto', async () => {
    const dto = { firstName: 'Jane' } as any;

    await controller.updateUser(req, dto);

    expect(service.updateUser).toHaveBeenCalledWith(user, dto);
  });

  it('getUserByEmail forwards email', async () => {
    await controller.getUserByEmail('user@example.com');

    expect(service.getUserByEmail).toHaveBeenCalledWith('user@example.com');
  });
});
