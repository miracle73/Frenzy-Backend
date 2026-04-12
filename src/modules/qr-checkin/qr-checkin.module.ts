import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { MailModule } from '../../common/mail/mail.module';
import { PaystackClient } from '../payments/paystack.client';
import { QrCheckinController } from './qr-checkin.controller';
import { QrCheckinService } from './qr-checkin.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [QrCheckinController],
  providers: [QrCheckinService, PaystackClient],
  exports: [QrCheckinService],
})
export class QrCheckinModule {}