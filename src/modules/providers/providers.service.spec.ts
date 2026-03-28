import { NotFoundException } from '@nestjs/common';
import { ProvidersService } from './providers.service';

const createMocks = () => {
  const salons = {
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const stylists = {
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const users = {
    findById: jest.fn(),
  };
  const prisma = {
    salon: {
      findMany: jest.fn(),
    },
    stylist: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  return { salons, stylists, users, prisma };
};

describe('ProvidersService', () => {
  let service: ProvidersService;
  let salons: ReturnType<typeof createMocks>['salons'];
  let stylists: ReturnType<typeof createMocks>['stylists'];
  let users: ReturnType<typeof createMocks>['users'];
  let prisma: ReturnType<typeof createMocks>['prisma'];

  beforeEach(() => {
    ({ salons, stylists, users, prisma } = createMocks());
    service = new ProvidersService(
      salons as any,
      stylists as any,
      users as any,
      prisma as any,
    );
  });

  it('creates a salon profile and marks completion when required fields are present', async () => {
    const user = { id: 'user-1', email: 'owner@salon.com' };
    users.findById.mockResolvedValue(user);
    salons.findByUserId.mockResolvedValue(null);
    salons.create.mockResolvedValue({ id: 'salon-1', profileCompleted: true });

    const dto = {
      business_name: 'Glow Salon',
      business_logo: 'logo.png',
      business_banner: 'banner.png',
      full_address: '123 Main St',
      state: 'Lagos',
      city: 'Ikeja',
      area: 'GRA',
      about: 'Premium salon',
      businessGallery: ['a.png', 'b.png'],
    };

    const result = await service.updateSalonDetails(
      { userId: user.id, email: user.email, accountType: 'salon' },
      dto as any,
    );

    expect(result.status).toBe(201);
    expect(salons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: user.email,
        profileCompleted: true,
        business_gallery: ['a.png', 'b.png'],
      }),
    );
  });

  it('throws when updating salon profile for missing user', async () => {
    users.findById.mockResolvedValue(null);

    await expect(
      service.updateSalonDetails(
        { userId: 'missing-user', email: 'missing@salon.com', accountType: 'salon' },
        { business_name: 'Glow' } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a stylist profile with derived business name', async () => {
    const user = {
      id: 'user-2',
      email: 'stylist@primlook.com',
      firstName: 'Ada',
      middleName: null,
      lastName: 'Lovelace',
      phoneNumber: '+2348011111111',
    };
    stylists.findByUserId.mockResolvedValue(null);
    users.findById.mockResolvedValue(user);
    stylists.create.mockResolvedValue({ id: 'stylist-1', userId: user.id });

    const result = await service.createStylistProfile(
      { userId: user.id, email: user.email, accountType: 'stylist' },
      {} as any,
    );

    expect(result.status).toBe(201);
    expect(stylists.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: user.email,
        phoneNumber: user.phoneNumber,
        business_name: 'Ada Lovelace',
      }),
    );
  });

  it('updates stylist availability preserving existing fields', async () => {
    const stylist = {
      id: 'stylist-2',
      availability: { workingDays: ['monday'], workingHours: ['9-5'] },
    };
    stylists.findByUserId.mockResolvedValue(stylist);
    stylists.update.mockResolvedValue({ id: stylist.id });

    const dto = { workingDays: ['monday', 'tuesday'], isAvailable: true };
    const result = await service.updateStylistAvailability(
      { userId: 'user-2', email: 'stylist@primlook.com', accountType: 'stylist' },
      dto as any,
    );

    expect(result.status).toBe(200);
    expect(stylists.update).toHaveBeenCalledWith(stylist.id, {
      availability: {
        workingDays: ['monday', 'tuesday'],
        workingHours: ['9-5'],
        isAvailable: true,
      },
      status: undefined,
    });
  });

  it('adds portfolio item to existing stylist portfolio', async () => {
    const stylist = {
      id: 'stylist-3',
      portfolio: [{ imageUrl: 'old.png', category: 'general' }],
    };
    stylists.findByUserId.mockResolvedValue(stylist);
    stylists.update.mockResolvedValue({ id: stylist.id });

    const result = await service.addStylistPortfolioItem(
      { userId: 'user-3', email: 'stylist3@primlook.com', accountType: 'stylist' },
      { imageUrl: 'new.png', description: 'Fresh look', category: 'bridal' } as any,
    );

    expect(result.status).toBe(200);
    expect(stylists.update).toHaveBeenCalledWith(stylist.id, {
      portfolio: [
        { imageUrl: 'old.png', category: 'general' },
        expect.objectContaining({
          imageUrl: 'new.png',
          description: 'Fresh look',
          category: 'bridal',
        }),
      ],
    });
  });

  it('updates stylist pricing by merging existing fields', async () => {
    const stylist = {
      id: 'stylist-4',
      pricing: {
        basePrice: 100,
        baseTransportFee: 20,
        currency: 'NGN',
        services: [{ name: 'Braids', price: 1000 }],
      },
    } as any;
    stylists.findByUserId.mockResolvedValue(stylist);
    stylists.update.mockResolvedValue({ id: stylist.id });

    const result = await service.updateStylistPricing(
      { userId: 'user-4', email: 'stylist4@primlook.com', accountType: 'stylist' },
      { basePrice: 120 } as any,
    );

    expect(result.status).toBe(200);
    expect(stylists.update).toHaveBeenCalledWith(stylist.id, {
      pricing: {
        basePrice: 120,
        baseTransportFee: 20,
        currency: 'NGN',
        services: [{ name: 'Braids', price: 1000 }],
      },
    });
  });

  it('returns a public stylist list with display names', async () => {
    prisma.stylist.findMany.mockResolvedValue([
      {
        id: 'stylist-10',
        userId: 'user-10',
        business_name: 'Studio Luxe',
        email: 'studio@primlook.com',
        phoneNumber: null,
        bio: null,
        specializations: [],
        experience: null,
        portfolio: [],
        imageGallery: [],
        bannerImage: null,
        availability: null,
        pricing: null,
        location: null,
        ratings: null,
        reviews: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-10',
          email: 'studio@primlook.com',
          firstName: 'Studio',
          middleName: null,
          lastName: 'Owner',
        },
      },
      {
        id: 'stylist-11',
        userId: 'user-11',
        business_name: null,
        email: 'ada@primlook.com',
        phoneNumber: null,
        bio: null,
        specializations: [],
        experience: null,
        portfolio: [],
        imageGallery: [],
        bannerImage: null,
        availability: null,
        pricing: null,
        location: null,
        ratings: null,
        reviews: null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-11',
          email: 'ada@primlook.com',
          firstName: 'Ada',
          middleName: null,
          lastName: 'Lovelace',
        },
      },
    ] as any);

    const result = await service.getStylistList();

    expect(result.status).toBe(200);
    expect(result.result[0].name).toBe('Studio Luxe');
    expect(result.result[1].name).toBe('Ada Lovelace');
    expect(result.result[1].user?.name).toBe('Ada Lovelace');
  });

  it('builds analytics response from wallet and ratings data', async () => {
    prisma.stylist.findUnique.mockResolvedValue({
      wallet: { totalEarnings: 5000, pendingBalance: 200 },
      ratings: { average: 4.5, count: 10 },
    } as any);

    const result = await service.getStylistAnalytics({
      userId: 'user-12',
      email: 'analytics@primlook.com',
      accountType: 'stylist',
    });

    expect(result.status).toBe(200);
    expect(result.result).toBeDefined();
    expect(result.result?.earnings).toEqual({ total: 5000, pending: 200 });
    expect(result.result?.ratings).toEqual({ average: 4.5, count: 10 });
    expect(result.result?.bookings.monthly).toHaveLength(12);
  });
});
