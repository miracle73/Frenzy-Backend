import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { extractAccessToken, hashToken } from '../../../common/utils/token.util';
import { AuthUserPayload } from '../types/auth.types';

const tokenExtractor = (req: { headers?: Record<string, string | undefined> }) =>
  extractAccessToken(req as any);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([tokenExtractor]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
      passReqToCallback: true,
    });
  }

  async validate(
    req: { headers?: Record<string, string | undefined> },
    payload: AuthUserPayload,
  ): Promise<AuthUserPayload> {
    const accessToken = extractAccessToken(req as any);
    if (accessToken) {
      const tokenHash = hashToken(accessToken);
      const blocked = await this.prisma.accessTokenBlocklist.findUnique({
        where: { tokenHash },
      });
      if (blocked) {
        throw new UnauthorizedException({
          message: 'Token is revoked',
          error: 'Token is revoked',
          msg: 'Token is revoked',
        });
      }
    }

    return payload;
  }
}
