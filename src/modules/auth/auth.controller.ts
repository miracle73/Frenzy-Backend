import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
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
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from './types/auth.types';

@ApiBearerAuth('jwt')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60, limit: 5 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('verify-otp')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60, limit: 8 } })
  verifyOtp(@Query() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('signup')
  @HttpCode(HttpStatus.OK)
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60, limit: 10 } })
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Get('authenticated')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  authenticated(@Req() req: AuthenticatedRequest) {
    return this.authService.getAuthenticatedUser(req.user);
  }

  @Post('signout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  signOut(@Req() req: AuthenticatedRequest, @Body() dto: SignOutDto) {
    return this.authService.signOut(req.user, dto, req);
  }

  @Post('password-reset')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60, limit: 5 } })
  passwordReset(@Body() dto: PasswordResetDto) {
    return this.authService.passwordReset(dto);
  }

  @Post('new-password')
  @HttpCode(HttpStatus.OK)
  newPassword(@Body() dto: NewPasswordDto) {
    return this.authService.newPassword(dto);
  }

  @Post('new-password-without-token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60, limit: 5 } })
  newPasswordWithoutToken(@Body() dto: NewPasswordWithoutTokenDto) {
    return this.authService.newPasswordWithoutToken(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user, dto);
  }

  @Post('updateUser')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  updateUser(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ) {
    return this.authService.updateUser(req.user, dto);
  }

  @Get('getUserByEmail')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getUserByEmail(@Query('email') email: string) {
    return this.authService.getUserByEmail(email);
  }
}
