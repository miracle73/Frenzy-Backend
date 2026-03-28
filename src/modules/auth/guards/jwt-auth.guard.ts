import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: unknown, user: any, info?: { name?: string; message?: string }) {
    if (err || info || !user) {
      let message = 'Token is missing';
      if (info?.name === 'TokenExpiredError') {
        message = 'Token is expired';
      } else if (err || info?.message) {
        message = 'Token is invalid';
      }

      throw new UnauthorizedException({
        message,
        error: message,
        msg: message,
      });
    }

    return user;
  }
}
