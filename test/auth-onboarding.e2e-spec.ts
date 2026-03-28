import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/common/mail/mail.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

class TestMailService {
  private readonly otpByRecipient = new Map<string, string>();

  async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    const match = options.text.match(/\b(\d{4})\b/);
    if (match) {
      this.otpByRecipient.set(options.to, match[1]);
    }
  }

  getOtp(email: string): string {
    const otp = this.otpByRecipient.get(email);
    if (!otp) {
      throw new Error(`OTP not captured for ${email}`);
    }
    return otp;
  }

  reset(): void {
    this.otpByRecipient.clear();
  }
}

describe('Auth onboarding flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailService: TestMailService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const baseEmail = process.env.TEST_EMAIL ?? 'cp.ugorji@gmail.com';
  const password = process.env.TEST_PASSWORD ?? 'Chux@Priml00k';
  const phoneNumber = process.env.TEST_PHONE ?? '+23480552545';
  const countryCode = process.env.TEST_COUNTRY_CODE ?? 'NG';
  const countryCallCode = process.env.TEST_COUNTRY_CALL_CODE ?? '+234';
  const fullName = process.env.TEST_NAME ?? 'Hukwudi Ugorji';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? 'Chukwudi';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Ugorji';
  const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined;
  const businessName = process.env.TEST_BUSINESS_NAME ?? `${firstName} ${lastName} Studio`;

  const emailFor = (accountType: 'salon' | 'stylist') => {
    if (accountType === 'salon') {
      return baseEmail;
    }

    return (
      process.env.TEST_EMAIL_STYLIST ??
      baseEmail.replace('@', '+stylist@')
    );
  };

  const cleanupUser = async (email: string) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.salon.deleteMany({ where: { userId: user.id } });
    await prisma.stylist.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  };

  beforeAll(async () => {
    mailService = new TestMailService();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue(mailService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mailService.reset();
  });

  const runOnboardingFlow = async (accountType: 'salon' | 'stylist') => {
    const email = emailFor(accountType);
    await cleanupUser(email);

    await request(server)
      .post('/api/v1/auth/register')
      .send({
        email,
        phoneNumber,
        countryCode,
        countryCallCode,
        accountType,
      })
      .expect(201);

    const otp = mailService.getOtp(email);

    await request(server)
      .get('/api/v1/auth/verify-otp')
      .query({ email, otp })
      .expect(201);

    await request(server)
      .post('/api/v1/auth/signup')
      .send({
        email,
        firstName,
        middleName,
        lastName,
        businessName,
        password,
      })
      .expect(200);

    const signinResponse = await request(server)
      .post('/api/v1/auth/signin')
      .send({ email, password })
      .expect(200);

    expect(signinResponse.body.token).toBeTruthy();
    expect(signinResponse.body.refreshToken).toBeTruthy();
    expect(signinResponse.body.accountType).toBe(accountType);

    await request(server)
      .post('/api/v1/auth/signout')
      .set('Authorization', `Bearer ${signinResponse.body.token}`)
      .send({ refreshToken: signinResponse.body.refreshToken })
      .expect(200);

    await cleanupUser(email);
  };

  it('onboards a salon user', async () => {
    await runOnboardingFlow('salon');
  });

  it('onboards a stylist user', async () => {
    await runOnboardingFlow('stylist');
  });
});
