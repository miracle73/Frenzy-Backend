import { SalonOnboardingReminderService } from './salon-onboarding-reminder.service';

const createMocks = () => {
  const prisma = {
    salon: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const mailService = {
    sendMail: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  return { prisma, mailService, configService };
};

describe('SalonOnboardingReminderService', () => {
  let service: SalonOnboardingReminderService;
  let prisma: ReturnType<typeof createMocks>['prisma'];
  let mailService: ReturnType<typeof createMocks>['mailService'];
  let configService: ReturnType<typeof createMocks>['configService'];

  beforeEach(() => {
    ({ prisma, mailService, configService } = createMocks());
    service = new SalonOnboardingReminderService(
      prisma as any,
      mailService as any,
      configService as any,
    );
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends 48h and 96h reminders and updates flags', async () => {
    prisma.salon.findMany
      .mockResolvedValueOnce([
        { id: 'salon-1', email: 'owner@salon.com', business_name: 'Glow Salon' },
        { id: 'salon-2', email: null, business_name: 'No Email Salon' },
      ])
      .mockResolvedValueOnce([
        { id: 'salon-3', email: 'second@salon.com', business_name: null },
      ]);
    mailService.sendMail.mockResolvedValue(undefined);
    prisma.salon.update.mockResolvedValue({});

    await service.handleSalonOnboardingReminders();

    const now = new Date('2025-01-01T00:00:00.000Z');
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const ninetySixHoursAgo = new Date(now.getTime() - 96 * 60 * 60 * 1000);

    expect(prisma.salon.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        profileCompleted: false,
        createdAt: { lte: fortyEightHoursAgo },
        reminder_48h_sent: false,
      },
      select: { id: true, email: true, business_name: true },
    });
    expect(prisma.salon.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        profileCompleted: false,
        createdAt: { lte: ninetySixHoursAgo },
        reminder_96h_sent: false,
      },
      select: { id: true, email: true, business_name: true },
    });

    expect(mailService.sendMail).toHaveBeenCalledTimes(2);
    expect(mailService.sendMail).toHaveBeenNthCalledWith(1, {
      to: 'owner@salon.com',
      subject: 'Complete your Primlook salon setup',
      text: expect.stringContaining('Primlook Vendor app'),
      html: expect.stringContaining('Primlook Vendor'),
    });
    expect(mailService.sendMail).toHaveBeenNthCalledWith(2, {
      to: 'second@salon.com',
      subject: 'Reminder: complete your Primlook salon profile',
      text: expect.stringContaining('Primlook Vendor app'),
      html: expect.stringContaining('Primlook Vendor'),
    });

    expect(prisma.salon.update).toHaveBeenCalledTimes(2);
    expect(prisma.salon.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'salon-1' },
      data: { reminder_48h_sent: true },
    });
    expect(prisma.salon.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'salon-3' },
      data: { reminder_96h_sent: true },
    });
  });
});
