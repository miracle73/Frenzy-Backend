import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailService } from '../../../common/mail/mail.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const HOURS_48_MS = 48 * 60 * 60 * 1000;
const HOURS_96_MS = 96 * 60 * 60 * 1000;

type ReminderType = '48h' | '96h';

type ReminderSalon = {
  id: string;
  email: string | null;
  business_name: string | null;
};

@Injectable()
export class SalonOnboardingReminderService {
  private readonly logger = new Logger(SalonOnboardingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async handleSalonOnboardingReminders(): Promise<void> {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - HOURS_48_MS);
    const ninetySixHoursAgo = new Date(now.getTime() - HOURS_96_MS);

    try {
      const [salons48, salons96] = await Promise.all([
        this.prisma.salon.findMany({
          where: {
            profileCompleted: false,
            createdAt: { lte: fortyEightHoursAgo },
            reminder_48h_sent: false,
          },
          select: { id: true, email: true, business_name: true },
        }),
        this.prisma.salon.findMany({
          where: {
            profileCompleted: false,
            createdAt: { lte: ninetySixHoursAgo },
            reminder_96h_sent: false,
          },
          select: { id: true, email: true, business_name: true },
        }),
      ]);

      await this.sendReminderBatch(salons48, '48h');
      await this.sendReminderBatch(salons96, '96h');
    } catch (error) {
      this.logger.error(
        'Salon onboarding reminders failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async sendReminderBatch(
    salons: ReminderSalon[],
    type: ReminderType,
  ): Promise<void> {
    if (!salons.length) {
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const salon of salons) {
      if (!salon.email) {
        this.logger.warn(`Salon ${salon.id} has no email address. Skipping reminder.`);
        continue;
      }

      try {
        await this.sendReminderEmail(salon, type);
        successCount += 1;
      } catch (error) {
        errorCount += 1;
        this.logger.error(
          `Failed to send ${type} reminder to salon ${salon.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (successCount || errorCount) {
      this.logger.log(
        `Salon onboarding reminders (${type}): sent=${successCount}, failed=${errorCount}`,
      );
    }
  }

  private async sendReminderEmail(
    salon: ReminderSalon,
    type: ReminderType,
  ): Promise<void> {
    const recipient = salon.email;
    if (!recipient) {
      return;
    }

    const businessName = salon.business_name || 'Salon Owner';
    const subject =
      type === '96h'
        ? 'Reminder: complete your Primlook salon profile'
        : 'Complete your Primlook salon setup';
    const text = `Hi ${businessName},\n\nComplete your salon profile on Primlook by opening the Primlook Vendor app.\n\nThanks,\nPrimlook`;
    const html = `<p>Hi ${businessName},</p><p>Complete your salon profile by opening the <strong>Primlook Vendor</strong> app.</p><p>Thanks,<br />Primlook</p>`;

    await this.mailService.sendMail({ to: recipient, subject, text, html });

    await this.prisma.salon.update({
      where: { id: salon.id },
      data: type === '96h' ? { reminder_96h_sent: true } : { reminder_48h_sent: true },
    });
  }
}
