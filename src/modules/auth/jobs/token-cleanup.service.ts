import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup(): Promise<void> {
    const now = new Date();

    try {
      const [refreshResult, accessResult] = await Promise.all([
        this.prisma.refreshToken.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        this.prisma.accessTokenBlocklist.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
      ]);

      if (refreshResult.count || accessResult.count) {
        this.logger.log(
          `Token cleanup: refreshTokens=${refreshResult.count}, accessBlocklist=${accessResult.count}`,
        );
      }
    } catch (error) {
      this.logger.error('Token cleanup failed', error instanceof Error ? error.stack : undefined);
    }
  }
}
