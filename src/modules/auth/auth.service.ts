import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { Request } from 'express';
import { User } from '@prisma/client';
import { MailService } from '../../common/mail/mail.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRepository } from '../../common/prisma/repositories/user.repository';
import { SalonRepository } from '../../common/prisma/repositories/salon.repository';
import { StylistRepository } from '../../common/prisma/repositories/stylist.repository';
import { parseToE164 } from '../../common/utils/phone.util';
import { extractAccessToken } from '../../common/utils/token.util';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SignUpDto } from './dto/signup.dto';
import { SignInDto } from './dto/signin.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { NewPasswordWithoutTokenDto } from './dto/new-password-without-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignOutDto } from './dto/signout.dto';
import { AuthUserPayload } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly salons: SalonRepository,
    private readonly stylists: StylistRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto): Promise<{ status: number; msg: string }> {
    const email = dto.email.toLowerCase().trim();
    const { e164: phoneNumber, countryCode, countryCallCode } = parseToE164(
      dto.phoneNumber,
      dto.countryCode,
      dto.countryCallCode,
    );
    const existing = await this.users.findByEmail(email);
    const existingByPhone = await this.users.findByPhone(phoneNumber);

    if (existingByPhone && existingByPhone.id !== existing?.id) {
      throw new ConflictException('User already exists with this phone number');
    }

    if (existing?.password) {
      throw new BadRequestException({
        message: 'User already registered',
        error: 'User already registered',
        msg: 'User already registered',
      });
    }

    let resetVerification = false;
    if (existing?.verifyStatus) {
      const verifiedTtlMinutes = this.getNumber('OTP_VERIFIED_TTL_MINUTES', 10);
      const verificationExpired = existing.otpVerifiedAt
        ? Date.now() - existing.otpVerifiedAt.getTime() > verifiedTtlMinutes * 60 * 1000
        : true;

      if (!verificationExpired) {
        throw new BadRequestException({
          message: 'User already verified',
          error: 'User already verified',
          msg: 'User already verified',
        });
      }

      resetVerification = true;
    }

    const otpTtlMinutes = this.getNumber('OTP_TTL_MINUTES', 10);

    if (existing) {
      // Guard against race conditions (e.g. double-tap sending two register
      // requests simultaneously).  If an OTP was generated less than 5 seconds
      // ago, return early without regenerating so the already-emailed OTP
      // stays valid.
      if (existing.otpExpiresAt && !resetVerification) {
        const otpCreatedAt =
          existing.otpExpiresAt.getTime() - otpTtlMinutes * 60 * 1000;
        if (Date.now() - otpCreatedAt < 5_000) {
          return { status: 201, msg: 'OTP resent successfully' };
        }
      }

      const otp = this.generateOtp();
      const otpHash = this.hashToken(otp);
      const otpExpiresAt = this.addMinutes(otpTtlMinutes);

      await this.users.update(existing.id, {
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        verifyStatus: resetVerification ? false : existing.verifyStatus,
        otpVerifiedAt: resetVerification ? null : existing.otpVerifiedAt,
        phoneNumber: phoneNumber ?? existing.phoneNumber,
        countryCode: countryCode ?? existing.countryCode,
        countryCallCode: countryCallCode ?? existing.countryCallCode,
        accountType: dto.accountType,
      });

      await this.sendOtpEmail(email, otp);

      return { status: 201, msg: 'OTP resent successfully' };
    }

    const otp = this.generateOtp();
    const otpHash = this.hashToken(otp);
    const otpExpiresAt = this.addMinutes(otpTtlMinutes);

    await this.users.create({
      email,
      phoneNumber,
      countryCode,
      countryCallCode,
      accountType: dto.accountType,
      otpHash,
      otpExpiresAt,
    });

    await this.sendOtpEmail(email, otp);

    return { status: 201, msg: 'Registration successful' };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ status: number; msg: string }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user) {
      throw new BadRequestException({
        message: 'User not found',
        error: 'User not found',
        msg: 'User not found',
      });
    }

    if (!user.otpHash || !user.otpExpiresAt) {
      throw new BadRequestException({
        message: 'OTP expired',
        error: 'OTP expired',
        msg: 'OTP expired',
      });
    }

    const maxAttempts = this.getNumber('OTP_MAX_ATTEMPTS', 5);
    if (user.otpAttempts >= maxAttempts) {
      throw new HttpException(
        {
          message: 'OTP max attempts exceeded',
          error: 'OTP max attempts exceeded',
          msg: 'OTP max attempts exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'OTP expired',
        error: 'OTP expired',
        msg: 'OTP expired',
      });
    }

    const hashed = this.hashToken(dto.otp.trim());
    if (hashed !== user.otpHash) {
      await this.users.update(user.id, {
        otpAttempts: user.otpAttempts + 1,
      });
      throw new BadRequestException({
        message: 'OTP does not match',
        error: 'OTP does not match',
        msg: 'OTP does not match',
      });
    }

    await this.users.update(user.id, {
      verifyStatus: true,
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpVerifiedAt: new Date(),
    });

    return { status: 201, msg: 'user verified succesfully' };
  }

  async signUp(dto: SignUpDto): Promise<{
    status: number;
    msg: string;
    token: string;
    refreshToken: string;
  }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        error: 'User not found',
        msg: 'User not found',
      });
    }

    if (user.password) {
      throw new BadRequestException({
        message: 'User has already signed up',
        error: 'User has already signed up',
        msg: 'User has already signed up',
      });
    }

    if (!user.verifyStatus) {
      throw new BadRequestException({
        message: 'User is not verified yet',
        error: 'User is not verified yet',
        msg: 'User is not verified yet',
      });
    }

    const verifiedTtlMinutes = this.getNumber('OTP_VERIFIED_TTL_MINUTES', 10);
    if (
      user.otpVerifiedAt &&
      Date.now() - user.otpVerifiedAt.getTime() > verifiedTtlMinutes * 60 * 1000
    ) {
      throw new BadRequestException({
        message: 'Verification expired, please verify again',
        error: 'Verification expired, please verify again',
        msg: 'Verification expired, please verify again',
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const updatedUser = await this.users.update(user.id, {
      firstName: dto.firstName,
      middleName: dto.middleName ?? undefined,
      lastName: dto.lastName,
      password: hashedPassword,
      referralCode: dto.referralCode ?? undefined,
    });

    if (updatedUser.accountType === 'stylist') {
      const existingStylist = await this.stylists.findByUserId(user.id);
      if (!existingStylist) {
        await this.stylists.create({
          email: updatedUser.email,
          business_name: dto.businessName ?? undefined,
          phoneNumber: updatedUser.phoneNumber ?? undefined,
          user: { connect: { id: updatedUser.id } },
        });
      }
    }

    if (updatedUser.accountType === 'salon') {
      const existingSalon = await this.salons.findByUserId(user.id);
      if (!existingSalon) {
        await this.salons.create({
          email: updatedUser.email,
          business_name: dto.businessName ?? undefined,
          user: { connect: { id: updatedUser.id } },
        });
      }
    }

    const token = this.createJwtToken(updatedUser);
    const refresh = this.createRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: updatedUser.id,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
      },
    });

    return {
      status: 200,
      msg: 'Signup successful',
      token,
      refreshToken: refresh.token,
    };
  }

  async signIn(dto: SignInDto): Promise<{
    status: number;
    token: string;
    refreshToken: string;
    accountType: string;
    _id: string;
    email: string;
    name?: string;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
  }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        error: 'Invalid email or password',
        msg: 'Invalid email or password',
      });
    }

    if (!user.verifyStatus) {
      throw new BadRequestException({
        message: 'User is not verified yet',
        error: 'User is not verified yet',
        msg: 'User is not verified yet',
      });
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        error: 'Invalid email or password',
        msg: 'Invalid email or password',
      });
    }

    const token = this.createJwtToken(user);
    const refresh = this.createRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refresh.tokenHash,
        expiresAt: refresh.expiresAt,
      },
    });

    return {
      status: 200,
      token,
      refreshToken: refresh.token,
      accountType: user.accountType,
      _id: user.id,
      email: user.email,
      name: this.buildFullName(user),
      firstName: user.firstName ?? null,
      middleName: user.middleName ?? null,
      lastName: user.lastName ?? null,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{ status: number; token: string; refreshToken: string }> {
    const refreshToken = dto.refreshToken?.trim();
    if (!refreshToken) {
      throw new BadRequestException({
        message: 'Refresh token is required',
        error: 'Refresh token is required',
        msg: 'Refresh token is required',
      });
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        error: 'Invalid refresh token',
        msg: 'Invalid refresh token',
      });
    }

    const rotated = this.createRefreshToken();
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: rotated.tokenHash,
      },
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: rotated.tokenHash,
        expiresAt: rotated.expiresAt,
      },
    });

    const token = this.createJwtToken(stored.user);

    return { status: 200, token, refreshToken: rotated.token };
  }

  async getAuthenticatedUser(userPayload: AuthUserPayload) {
    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'Token is missing',
        error: 'Token is missing',
        msg: 'Token is missing',
      });
    }

    return { status: 200, ...this.formatUser(user) };
  }

  async signOut(
    userPayload: AuthUserPayload,
    dto: SignOutDto,
    req: Request,
  ): Promise<{ status: number; msg: string }> {
    const accessToken = extractAccessToken(req);
    if (accessToken) {
      const decoded = this.jwtService.decode(accessToken) as { exp?: number } | null;
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tokenHash = this.hashToken(accessToken);
      await this.prisma.accessTokenBlocklist.upsert({
        where: { tokenHash },
        update: {},
        create: { tokenHash, expiresAt },
      });
    }

    if (dto.refreshToken) {
      const refreshTokenHash = this.hashToken(dto.refreshToken.trim());
      await this.prisma.refreshToken.updateMany({
        where: {
          tokenHash: refreshTokenHash,
          userId: userPayload.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId: userPayload.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { status: 200, msg: 'Signout successful' };
  }

  async passwordReset(dto: PasswordResetDto): Promise<{ status: number; msg: string }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user) {
      return {
        status: 201,
        msg: 'If an account exists, a reset link has been sent',
      };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = this.addMinutes(
      this.getNumber('PASSWORD_RESET_TTL_MINUTES', 15),
    );

    await this.users.update(user.id, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    });

    await this.sendPasswordResetEmail(email, token);

    return { status: 201, msg: 'Password reset email sent' };
  }

  async newPassword(dto: NewPasswordDto): Promise<{ status: number; msg: string }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException({
        message: 'Passwords do not match',
        error: 'Passwords do not match',
        msg: 'Passwords do not match',
      });
    }

    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      throw new BadRequestException({
        message: 'Invalid or expired reset token',
        error: 'Invalid or expired reset token',
        msg: 'Invalid or expired reset token',
      });
    }

    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        message: 'Reset token expired',
        error: 'Reset token expired',
        msg: 'Reset token expired',
      });
    }

    const tokenHash = this.hashToken(dto.token);
    if (tokenHash !== user.passwordResetTokenHash) {
      throw new BadRequestException({
        message: 'Invalid reset token',
        error: 'Invalid reset token',
        msg: 'Invalid reset token',
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.users.update(user.id, {
      password: hashedPassword,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    });

    return { status: 200, msg: 'Password updated' };
  }

  async newPasswordWithoutToken(
    dto: NewPasswordWithoutTokenDto,
  ): Promise<{ status: number; msg: string }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException({
        message: 'Passwords do not match',
        error: 'Passwords do not match',
        msg: 'Passwords do not match',
      });
    }

    const email = dto.email.toLowerCase().trim();
    const user = await this.users.findByEmail(email);

    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        error: 'User not found',
        msg: 'User not found',
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    await this.users.update(user.id, {
      password: hashedPassword,
    });

    return { status: 200, msg: 'Password updated' };
  }

  async changePassword(
    userPayload: AuthUserPayload,
    dto: ChangePasswordDto,
  ): Promise<{ status: number; msg: string }> {
    const user = await this.users.findById(userPayload.userId);

    if (!user || !user.password) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        error: 'Invalid credentials',
        msg: 'Invalid credentials',
      });
    }

    const valid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!valid) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        error: 'Invalid credentials',
        msg: 'Invalid credentials',
      });
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException({
        message: 'New password must be different from old password',
        error: 'New password must be different from old password',
        msg: 'New password must be different from old password',
      });
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.users.update(user.id, { password: hashedPassword });

    return { status: 200, msg: 'Password updated' };
  }

  async updateUser(userPayload: AuthUserPayload, dto: UpdateUserDto) {
    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        error: 'User not found',
        msg: 'User not found',
      });
    }

    const data: Record<string, unknown> = {};

    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName;
    }
    if (dto.middleName !== undefined) {
      data.middleName = dto.middleName;
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName;
    }

    const existingCountryCode = (user as { countryCode?: string }).countryCode;
    const existingCountryCallCode = (user as { countryCallCode?: string })
      .countryCallCode;

    if (dto.phoneNumber !== undefined) {
      const { e164, countryCode, countryCallCode } = parseToE164(
        dto.phoneNumber,
        dto.countryCode ?? existingCountryCode,
        dto.countryCallCode ?? existingCountryCallCode,
      );

      const existingWithPhone = await this.users.findByPhone(e164);
      if (existingWithPhone && existingWithPhone.id !== user.id) {
        throw new ConflictException('User already exists with this phone number');
      }

      data.phoneNumber = e164;

      if (dto.countryCode !== undefined) {
        data.countryCode = dto.countryCode;
      } else if (!existingCountryCode && countryCode) {
        data.countryCode = countryCode;
      }

      data.countryCallCode =
        countryCallCode ?? dto.countryCallCode ?? existingCountryCallCode;
    } else {
      if (dto.countryCode !== undefined) {
        data.countryCode = dto.countryCode;
      }
      if (dto.countryCallCode !== undefined) {
        data.countryCallCode = dto.countryCallCode;
      }
    }

    const updated = await this.users.update(user.id, data);

    if (dto.businessName !== undefined) {
      if (user.accountType === 'salon') {
        const salon = await this.salons.findByUserId(user.id);
        if (salon) {
          await this.salons.update(salon.id, { business_name: dto.businessName });
        } else {
          await this.salons.create({
            email: user.email,
            business_name: dto.businessName,
            user: { connect: { id: user.id } },
          });
        }
      }

      if (user.accountType === 'stylist') {
        const stylist = await this.stylists.findByUserId(user.id);
        if (stylist) {
          await this.stylists.update(stylist.id, { business_name: dto.businessName });
        } else {
          await this.stylists.create({
            email: user.email,
            business_name: dto.businessName,
            phoneNumber: user.phoneNumber ?? undefined,
            user: { connect: { id: user.id } },
          });
        }
      }
    }

    return { status: 200, ...this.formatUser(updated) };
  }

  async getUserByEmail(email: string) {
    const user = await this.users.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        error: 'User not found',
        msg: 'User not found',
      });
    }

    return { status: 200, ...this.formatUser(user) };
  }

  private generateOtp(): string {
    return randomInt(0, 10000).toString().padStart(4, '0');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private addMinutes(minutes: number): Date {
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private getNumber(key: string, fallback: number): number {
    const value = this.configService.get<number>(key);
    return value ?? fallback;
  }

  private createJwtToken(user: User): string {
    return this.jwtService.sign({
      userId: user.id,
      email: user.email,
      accountType: user.accountType,
    });
  }

  private createRefreshToken(): { token: string; tokenHash: string; expiresAt: Date } {
    const token = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);
    const ttlDays = this.getNumber('REFRESH_TOKEN_TTL_DAYS', 30);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    return { token, tokenHash, expiresAt };
  }

  private formatUser(user: User) {
    const fullName = this.buildFullName(user);
    return {
      _id: user.id,
      id: user.id,
      name: fullName,
      firstName: user.firstName ?? '',
      middleName: user.middleName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      accountType: user.accountType,
      phoneNumber: user.phoneNumber ?? '',
      countryCode: (user as { countryCode?: string }).countryCode ?? '',
      countryCallCode: (user as { countryCallCode?: string }).countryCallCode ?? '',
      referralCode: user.referralCode ?? '',
      profileImgUrl: user.profileImgUrl ?? '',
    };
  }

  private buildFullName(user: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
  }): string {
    return [user.firstName, user.middleName, user.lastName]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ');
  }

  private async sendOtpEmail(email: string, otp: string): Promise<void> {
    const ttl = this.getNumber('OTP_TTL_MINUTES', 10);
    const text = `Your Primlook verification code is ${otp}. It expires in ${ttl} minutes.`;
    await this.mailService.sendMail({
      to: email,
      subject: 'Verify your email',
      text,
      html: `<p>${text}</p>`,
    });
  }

  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const baseUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${baseUrl}/new-password?email=${encodeURIComponent(
      email,
    )}&token=${encodeURIComponent(token)}`;
    const text = `Reset your Primlook password: ${resetUrl}`;
    await this.mailService.sendMail({
      to: email,
      subject: 'Reset your password',
      text,
      html: `<p>Reset your Primlook password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
  }
}
