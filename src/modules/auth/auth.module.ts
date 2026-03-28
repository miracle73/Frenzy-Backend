import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenCleanupService } from './jobs/token-cleanup.service';
import { MailModule } from '../../common/mail/mail.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>('JWT_EXPIRES_IN');
        const resolvedExpiresIn: number | StringValue = expiresIn
          ? /^\d+$/.test(expiresIn)
            ? Number(expiresIn)
            : (expiresIn as StringValue)
          : '24h';

        return {
          secret: config.get<string>('JWT_SECRET')!,
          signOptions: {
            expiresIn: resolvedExpiresIn,
          },
        };
      },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
