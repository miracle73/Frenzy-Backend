import { Module } from '@nestjs/common';
import { MailModule } from '../../common/mail/mail.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SalonOnboardingReminderService } from './jobs/salon-onboarding-reminder.service';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

@Module({
  imports: [MailModule, PrismaModule],
  controllers: [ProvidersController],
  providers: [ProvidersService, SalonOnboardingReminderService],
})
export class ProvidersModule {}
