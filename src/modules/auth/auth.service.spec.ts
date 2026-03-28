import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

const createMocks = () => {
  const users = {
    findByEmail: jest.fn(),
    findByPhone: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const salons = {
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const stylists = {
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const jwtService = {
    sign: jest.fn(),
    decode: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const mailService = {
    sendMail: jest.fn(),
  };
  const prisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    accessTokenBlocklist: {
      upsert: jest.fn(),
    },
  };

  return { users, salons, stylists, jwtService, configService, mailService, prisma };
};

describe('AuthService', () => {
  let service: AuthService;
  let users: ReturnType<typeof createMocks>['users'];
  let salons: ReturnType<typeof createMocks>['salons'];
  let stylists: ReturnType<typeof createMocks>['stylists'];
  let jwtService: ReturnType<typeof createMocks>['jwtService'];
  let configService: ReturnType<typeof createMocks>['configService'];
  let mailService: ReturnType<typeof createMocks>['mailService'];
  let prisma: ReturnType<typeof createMocks>['prisma'];

  beforeEach(() => {
    ({ users, salons, stylists, jwtService, configService, mailService, prisma } = createMocks());
    configService.get.mockReturnValue(undefined);
    service = new AuthService(
      users as any,
      salons as any,
      stylists as any,
      jwtService as any,
      configService as any,
      mailService as any,
      prisma as any,
    );
  });

  it('registers a user and sends OTP', async () => {
    const dto = {
      email: 'test@example.com',
      phoneNumber: '+2348055254545',
      accountType: 'salon',
      countryCode: 'NG',
      countryCallCode: '+234',
    };
    users.findByEmail.mockResolvedValue(null);
    users.findByPhone.mockResolvedValue(null);
    users.create.mockResolvedValue({ id: 'user-1' });
    mailService.sendMail.mockResolvedValue(undefined);

    const result = await service.register(dto as any);

    expect(result.msg).toBe('Registration successful');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        phoneNumber: '+2348055254545',
        countryCode: 'NG',
        countryCallCode: '+234',
        accountType: 'salon',
      }),
    );
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects registration when phone number already exists', async () => {
    const dto = {
      email: 'test@example.com',
      phoneNumber: '+2348055254545',
      accountType: 'salon',
    };
    users.findByEmail.mockResolvedValue(null);
    users.findByPhone.mockResolvedValue({ id: 'user-2' });

    await expect(service.register(dto as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects registration when email already registered', async () => {
    const dto = {
      email: 'test@example.com',
      phoneNumber: '+2348055254545',
      accountType: 'salon',
    };
    users.findByEmail.mockResolvedValue({ id: 'user-1', password: 'hashed' });
    users.findByPhone.mockResolvedValue(null);

    await expect(service.register(dto as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips OTP regeneration when register is called within 5 seconds (double-tap guard)', async () => {
    const dto = {
      email: 'test@example.com',
      phoneNumber: '+2348055254545',
      accountType: 'salon',
      countryCode: 'NG',
      countryCallCode: '+234',
    };
    // Simulate existing user whose OTP was generated 2 seconds ago (TTL = 10 min)
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000 - 2_000);
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      otpExpiresAt,
      otpAttempts: 0,
      verifyStatus: false,
    });
    users.findByPhone.mockResolvedValue(null);

    const result = await service.register(dto as any);

    expect(result.msg).toBe('OTP resent successfully');
    // Should NOT have updated the user or sent a new email
    expect(users.update).not.toHaveBeenCalled();
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('rejects registration with invalid phone number format', async () => {
    const dto = {
      email: 'test@example.com',
      phoneNumber: '12345',
      accountType: 'salon',
    };

    await expect(service.register(dto as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies OTP when valid', async () => {
    const otp = '1234';
    const otpHash = (service as any).hashToken(otp);
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      otpHash,
      otpExpiresAt: new Date(Date.now() + 60_000),
      otpAttempts: 0,
    };
    users.findByEmail.mockResolvedValue(user);
    users.update.mockResolvedValue({ ...user, verifyStatus: true });

    const result = await service.verifyOtp({ email: user.email, otp } as any);

    expect(result.msg).toBe('user verified succesfully');
    expect(users.update).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        verifyStatus: true,
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      }),
    );
  });

  it('rejects OTP verification when expired', async () => {
    const otp = '1234';
    const otpHash = (service as any).hashToken(otp);
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      otpHash,
      otpExpiresAt: new Date(Date.now() - 60_000),
      otpAttempts: 0,
    };
    users.findByEmail.mockResolvedValue(user);

    await expect(
      service.verifyOtp({ email: user.email, otp } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects OTP verification when max attempts exceeded', async () => {
    const otp = '1234';
    const otpHash = (service as any).hashToken(otp);
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      otpHash,
      otpExpiresAt: new Date(Date.now() + 60_000),
      otpAttempts: 5,
    };
    users.findByEmail.mockResolvedValue(user);

    await expect(
      service.verifyOtp({ email: user.email, otp } as any),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('rejects signup when user already signed up', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashed',
      verifyStatus: true,
    });

    await expect(
      service.signUp({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'Password1!',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects signup when user is not verified', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: null,
      verifyStatus: false,
    });

    await expect(
      service.signUp({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'Password1!',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signs up a verified user and creates salon profile', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      password: null,
      verifyStatus: true,
      otpVerifiedAt: new Date(),
      accountType: 'salon',
      phoneNumber: '+2348055254545',
    };
    users.findByEmail.mockResolvedValue(user);
    users.update.mockResolvedValue({
      ...user,
      firstName: 'Test',
      lastName: 'User',
      password: 'hashed',
    });
    salons.findByUserId.mockResolvedValue(null);
    salons.create.mockResolvedValue({ id: 'salon-1' });
    jwtService.sign.mockReturnValue('jwt-token');
    jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hashed');

    const result = await service.signUp({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      businessName: 'Test Salon',
      password: 'Password1!',
    } as any);

    expect(result.token).toBe('jwt-token');
    expect(result.refreshToken).toBeTruthy();
    expect(users.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ firstName: 'Test', lastName: 'User', password: 'hashed' }),
    );
    expect(salons.create).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rotates refresh token and issues new access token', async () => {
    const refreshToken = 'refresh-token';
    const tokenHash = (service as any).hashToken(refreshToken);
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      accountType: 'salon',
    };
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: user.id,
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    });
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});
    jwtService.sign.mockReturnValue('new-access');

    const result = await service.refresh({ refreshToken } as any);

    expect(result.token).toBe('new-access');
    expect(result.refreshToken).toBeTruthy();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rt-1' } }),
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('rejects sign-in when password is incorrect', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashed',
      verifyStatus: true,
      accountType: 'salon',
      firstName: 'Test',
      lastName: 'User',
    };
    users.findByEmail.mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

    await expect(
      service.signIn({ email: 'test@example.com', password: 'WrongPass1!' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes refresh token and blocklists access token on signout', async () => {
    const accessToken = 'access-token';
    const refreshToken = 'refresh-token';
    jwtService.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });
    prisma.accessTokenBlocklist.upsert.mockResolvedValue({});
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.signOut(
      { userId: 'user-1', email: 'test@example.com', accountType: 'salon' } as any,
      { refreshToken } as any,
      { headers: { authorization: `Bearer ${accessToken}` } } as any,
    );

    expect(result.msg).toBe('Signout successful');
    expect(prisma.accessTokenBlocklist.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('sends password reset email when user exists', async () => {
    const user = { id: 'user-1', email: 'test@example.com' };
    users.findByEmail.mockResolvedValue(user);
    users.update.mockResolvedValue({});
    mailService.sendMail.mockResolvedValue(undefined);

    const result = await service.passwordReset({ email: user.email } as any);

    expect(result.msg).toBe('Password reset email sent');
    expect(users.update).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ passwordResetTokenHash: expect.any(String) }),
    );
    expect(mailService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('updates password without token when user exists', async () => {
    const user = { id: 'user-1', email: 'test@example.com' };
    users.findByEmail.mockResolvedValue(user);
    users.update.mockResolvedValue({});
    jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hashed');

    const result = await service.newPasswordWithoutToken({
      email: user.email,
      password: 'Password1!',
      confirmPassword: 'Password1!',
    } as any);

    expect(result.msg).toBe('Password updated');
    expect(users.update).toHaveBeenCalledWith(user.id, { password: 'hashed' });
  });

  it('rejects new password without token when passwords mismatch', async () => {
    await expect(
      service.newPasswordWithoutToken({
        email: 'test@example.com',
        password: 'Password1!',
        confirmPassword: 'Password2!',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects change password when new matches old', async () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashed',
    };
    users.findById.mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

    await expect(
      service.changePassword(
        { userId: user.id, email: user.email, accountType: 'salon' } as any,
        { oldPassword: 'Password1!', newPassword: 'Password1!' } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates user phone with normalization and uniqueness check', async () => {
    const user = {
      id: 'user-1',
      firstName: 'Old',
      lastName: 'Name',
      email: 'test@example.com',
      phoneNumber: '+2348055254545',
      countryCode: 'NG',
      countryCallCode: '+234',
      accountType: 'salon',
    };
    users.findById.mockResolvedValue(user);
    users.findByPhone.mockResolvedValue(null);
    users.update.mockResolvedValue({
      ...user,
      firstName: 'New',
      lastName: 'Name',
      phoneNumber: '+2348055254546',
      countryCode: 'NG',
      countryCallCode: '+234',
    });

    const result = await service.updateUser(
      { userId: 'user-1' } as any,
      {
        firstName: 'New',
        lastName: 'Name',
        phoneNumber: '+2348055254546',
        countryCode: 'NG',
        countryCallCode: '+234',
      } as any,
    );

    expect(users.update).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        firstName: 'New',
        lastName: 'Name',
        phoneNumber: '+2348055254546',
        countryCode: 'NG',
        countryCallCode: '+234',
      }),
    );
    expect(result.phoneNumber).toBe('+2348055254546');
  });

  it('rejects update when phone number is already in use', async () => {
    const user = {
      id: 'user-1',
      firstName: 'Old',
      lastName: 'Name',
      email: 'test@example.com',
      phoneNumber: '+2348055254545',
      countryCode: 'NG',
      countryCallCode: '+234',
      accountType: 'salon',
    };
    users.findById.mockResolvedValue(user);
    users.findByPhone.mockResolvedValue({ id: 'user-2' });

    await expect(
      service.updateUser(
        { userId: 'user-1' } as any,
        {
          phoneNumber: '+2348055254546',
          countryCode: 'NG',
          countryCallCode: '+234',
        } as any,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
