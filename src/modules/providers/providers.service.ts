import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Salon, Stylist, User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SalonRepository } from '../../common/prisma/repositories/salon.repository';
import { StylistRepository } from '../../common/prisma/repositories/stylist.repository';
import { UserRepository } from '../../common/prisma/repositories/user.repository';
import type { AuthUserPayload } from '../auth/types/auth.types';
import { AddPortfolioItemDto } from './dto/add-portfolio-item.dto';
import { CreateStylistProfileDto } from './dto/create-stylist-profile.dto';
import { UpdateSalonDto } from './dto/update-salon.dto';
import { UpdateStylistAvailabilityDto } from './dto/update-stylist-availability.dto';
import { UpdateStylistBasicsDto } from './dto/update-stylist-basics.dto';
import { UpdateStylistPricingDto } from './dto/update-stylist-pricing.dto';
import { UpdateStylistProfileDto } from './dto/update-stylist-profile.dto';

const SALON_PROFILE_REQUIRED_FIELDS = [
  'business_name',
  'business_logo',
  'business_banner',
  'full_address',
  'state',
  'city',
  'area',
  'about',
];

const PUBLIC_SALON_FIELDS = {
  id: true,
  userId: true,
  email: true,
  business_name: true,
  business_logo: true,
  business_banner: true,
  website_link: true,
  stylist_count: true,
  full_address: true,
  state: true,
  city: true,
  area: true,
  about: true,
  profileCompleted: true,
  services: true,
  openHours: true,
  business_gallery: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SalonSelect;

const PUBLIC_STYLIST_FIELDS = {
  id: true,
  userId: true,
  business_name: true,
  email: true,
  phoneNumber: true,
  bio: true,
  specializations: true,
  experience: true,
  portfolio: true,
  imageGallery: true,
  bannerImage: true,
  availability: true,
  pricing: true,
  location: true,
  ratings: true,
  reviews: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  },
} satisfies Prisma.StylistSelect;

type PublicStylist = Prisma.StylistGetPayload<{ select: typeof PUBLIC_STYLIST_FIELDS }>;
type PublicStylistUser = NonNullable<PublicStylist['user']>;
type NameParts = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

@Injectable()
export class ProvidersService {
  constructor(
    private readonly salons: SalonRepository,
    private readonly stylists: StylistRepository,
    private readonly users: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  async updateSalonDetails(userPayload: AuthUserPayload, dto: UpdateSalonDto) {
    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new NotFoundException({ message: 'User not found', error: 'User not found' });
    }

    const existingSalon = await this.salons.findByUserId(user.id);
    const updates: Prisma.SalonUpdateInput = this.buildSalonUpdates(dto, existingSalon);
    const mergedData = { ...(existingSalon ?? {}), ...updates } as Record<string, unknown>;
    updates.profileCompleted = SALON_PROFILE_REQUIRED_FIELDS.every((field) => {
      const value = mergedData[field];
      return value !== undefined && value !== null && String(value).trim() !== '';
    });

    const savedSalon = existingSalon
      ? await this.salons.update(existingSalon.id, updates)
      : await this.salons.create({
          ...(updates as Prisma.SalonCreateInput),
          email: user.email,
          user: { connect: { id: user.id } },
        });

    return { status: 201, _doc: savedSalon };
  }

  async getSalonDetails(userPayload: AuthUserPayload, userId?: string) {
    const salon = userId
      ? await this.findSalonByUserId(userId)
      : await this.salons.findByUserId(userPayload.userId);

    if (!salon) {
      return { status: 400, message: 'Salon not found' };
    }

    return { status: 200, _doc: salon };
  }

  async getSalonList() {
    const salons = await this.prisma.salon.findMany({
      where: {
        user: { subaccount: { isNot: null } },
      },
      select: PUBLIC_SALON_FIELDS,
    });
    return { status: 200, result: salons };
  }

  async getStylistList() {
    const stylists = await this.prisma.stylist.findMany({
      where: {
        user: { subaccount: { isNot: null } },
      },
      select: PUBLIC_STYLIST_FIELDS,
    });
    const result = stylists.map((stylist) => this.formatStylistPublic(stylist));
    return { status: 200, result };
  }

  async getStylistProfile(userPayload: AuthUserPayload) {
    const stylist = await this.prisma.stylist.findUnique({
      where: { userId: userPayload.userId },
      include: { user: true },
    });

    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    return { status: 200, success: true, result: this.formatStylistPrivate(stylist) };
  }

  async createStylistProfile(userPayload: AuthUserPayload, dto: CreateStylistProfileDto) {
    const existing = await this.stylists.findByUserId(userPayload.userId);
    if (existing) {
      return { status: 400, success: false, message: 'Stylist profile already exists' };
    }

    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new NotFoundException({ message: 'User not found', error: 'User not found' });
    }

    const created = await this.stylists.create({
      user: { connect: { id: user.id } },
      email: dto.email ?? user.email,
      phoneNumber: dto.phoneNumber ?? user.phoneNumber ?? undefined,
      business_name: dto.business_name ?? dto.name ?? this.buildUserFullName(user),
      bio: dto.bio ?? undefined,
      specializations: dto.specializations ?? undefined,
      experience: this.toJson(dto.experience),
      portfolio: this.toJson(dto.portfolio),
      availability: this.toJson(dto.availability),
      pricing: this.toJson(dto.pricing),
      location: this.toJson(dto.location),
      status: (dto.status as Stylist['status']) ?? 'pending_approval',
    });

    return { status: 201, success: true, result: this.formatStylistPrivate({ ...created, user }) };
  }

  async updateStylistProfile(userPayload: AuthUserPayload, dto: UpdateStylistProfileDto) {
    const stylist = await this.stylists.findByUserId(userPayload.userId);
    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    const updates: Prisma.StylistUpdateInput = {
      business_name: dto.business_name ?? dto.name ?? undefined,
      email: dto.email ?? undefined,
      phoneNumber: dto.phoneNumber ?? undefined,
      bio: dto.bio ?? undefined,
      specializations: dto.specializations ?? undefined,
      experience: this.toJson(dto.experience),
      portfolio: this.toJson(dto.portfolio),
      availability: this.toJson(dto.availability),
      pricing: this.toJson(dto.pricing),
      location: this.toJson(dto.location),
      status: dto.status as Stylist['status'] | undefined,
    };

    const updated = await this.stylists.update(stylist.id, updates);
    return { status: 200, success: true, result: this.formatStylistPrivate(updated) };
  }

  async updateStylistBasics(userPayload: AuthUserPayload, dto: UpdateStylistBasicsDto) {
    const stylist = await this.stylists.findByUserId(userPayload.userId);
    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    const updates: Prisma.StylistUpdateInput = {
      business_name: dto.name ?? undefined,
      email: dto.email ?? undefined,
      phoneNumber: dto.phoneNumber ?? undefined,
      bannerImage: dto.bannerImage ?? undefined,
      bio: dto.bio ?? undefined,
    };

    if (dto.specializations) {
      updates.specializations = dto.specializations;
    }

    if (dto.imageGallery) {
      updates.imageGallery = dto.imageGallery;
    }

    if (dto.imageUrl) {
      const existingPortfolio = Array.isArray(stylist.portfolio)
        ? (stylist.portfolio as Record<string, unknown>[])
        : [];
      const filtered = existingPortfolio.filter((item) => item?.category !== 'profile');
      updates.portfolio = [
        ...filtered,
        {
          imageUrl: dto.imageUrl,
          description: 'Profile Picture',
          category: 'profile',
          uploadedAt: new Date().toISOString(),
        },
      ] as Prisma.InputJsonValue;
    }

    const updated = await this.stylists.update(stylist.id, updates);
    return { status: 200, success: true, result: this.formatStylistPrivate(updated) };
  }

  async addStylistPortfolioItem(userPayload: AuthUserPayload, dto: AddPortfolioItemDto) {
    const stylist = await this.stylists.findByUserId(userPayload.userId);
    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    const existingPortfolio = Array.isArray(stylist.portfolio)
      ? (stylist.portfolio as Record<string, unknown>[])
      : [];
    const updated = await this.stylists.update(stylist.id, {
      portfolio: [
        ...existingPortfolio,
        {
          imageUrl: dto.imageUrl,
          description: dto.description ?? '',
          category: dto.category ?? 'general',
          uploadedAt: new Date().toISOString(),
        },
      ] as Prisma.InputJsonValue,
    });

    return { status: 200, success: true, result: this.formatStylistPrivate(updated) };
  }

  async updateStylistAvailability(
    userPayload: AuthUserPayload,
    dto: UpdateStylistAvailabilityDto,
  ) {
    const stylist = await this.stylists.findByUserId(userPayload.userId);
    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    let updatedAvailability: Record<string, unknown>;

    if (dto.availability) {
      // Per-day schedule format from frontend
      const currentAvailability =
        (stylist.availability as Record<string, unknown> | null) ?? {};
      updatedAvailability = { ...currentAvailability, ...dto.availability };
    } else {
      // Legacy field-based format
      const currentAvailability =
        (stylist.availability as Record<string, unknown> | null) ?? {};
      updatedAvailability = {
        ...currentAvailability,
        ...(dto.workingDays ? { workingDays: dto.workingDays } : {}),
        ...(dto.workingHours ? { workingHours: dto.workingHours } : {}),
        ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
      };
    }

    const updated = await this.stylists.update(stylist.id, {
      availability: updatedAvailability as Prisma.InputJsonValue,
      status: dto.status as Stylist['status'] | undefined,
    });

    return { status: 200, success: true, result: this.formatStylistPrivate(updated) };
  }

  async updateStylistPricing(userPayload: AuthUserPayload, dto: UpdateStylistPricingDto) {
    const stylist = await this.stylists.findByUserId(userPayload.userId);
    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    const currentPricing = (stylist.pricing as Record<string, unknown> | null) ?? {};
    const updatedPricing = {
      ...currentPricing,
      ...(dto.basePrice !== undefined ? { basePrice: dto.basePrice } : {}),
      ...(dto.baseTransportFee !== undefined ? { baseTransportFee: dto.baseTransportFee } : {}),
      ...(dto.transportFee !== undefined ? { transportFee: dto.transportFee } : {}),
      ...(dto.currency ? { currency: dto.currency } : {}),
      ...(dto.services ? { services: dto.services } : {}),
    };

    const updated = await this.stylists.update(stylist.id, {
      pricing: updatedPricing as Prisma.InputJsonValue,
    });

    return { status: 200, success: true, result: this.formatStylistPrivate(updated) };
  }

  async getStylistAnalytics(userPayload: AuthUserPayload) {
    const stylist = await this.prisma.stylist.findUnique({
      where: { userId: userPayload.userId },
    });

    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    const wallet = (stylist.wallet as Record<string, number> | null) ?? {};
    const ratings = (stylist.ratings as Record<string, number> | null) ?? {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      status: 200,
      success: true,
      result: {
        earnings: {
          total: wallet.totalEarnings ?? 0,
          pending: wallet.pendingBalance ?? 0,
        },
        ratings: {
          average: ratings.average ?? 0,
          count: ratings.count ?? 0,
        },
        bookings: {
          total: 0,
          monthly: months.map((month) => ({ month, value: 0 })),
        },
      },
    };
  }

  async getStylistPaymentRecords(userPayload: AuthUserPayload) {
    const stylist = await this.prisma.stylist.findUnique({
      where: { userId: userPayload.userId },
    });

    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    const wallet = (stylist.wallet as Record<string, number> | null) ?? {};

    return {
      status: 200,
      success: true,
      result: {
        walletBalance: wallet.availableBalance ?? 0,
        transactions: [],
      },
    };
  }

  async getStylistAllTransactions(userPayload: AuthUserPayload) {
    const stylist = await this.prisma.stylist.findUnique({
      where: { userId: userPayload.userId },
    });

    if (!stylist) {
      return { status: 404, success: false, message: 'Stylist profile not found' };
    }

    return {
      status: 200,
      success: true,
      result: {
        transactions: [],
      },
    };
  }

  private buildSalonUpdates(dto: UpdateSalonDto, existingSalon: Salon | null) {
    const updates: Prisma.SalonUpdateInput = {};
    if (dto.business_name !== undefined) {
      updates.business_name = dto.business_name;
    }
    if (dto.business_logo !== undefined) {
      updates.business_logo = dto.business_logo;
    }
    if (dto.business_banner !== undefined) {
      updates.business_banner = dto.business_banner;
    }
    if (dto.website_link !== undefined) {
      updates.website_link = dto.website_link;
    }
    if (dto.stylist_count !== undefined) {
      updates.stylist_count = dto.stylist_count;
    }
    if (dto.full_address !== undefined) {
      updates.full_address = dto.full_address;
    }
    if (dto.state !== undefined) {
      updates.state = dto.state;
    }
    if (dto.city !== undefined) {
      updates.city = dto.city;
    }
    if (dto.lga !== undefined) {
      updates.lga = dto.lga;
    }
    if (dto.area !== undefined) {
      updates.area = dto.area;
    }
    if (dto.country !== undefined) {
      updates.country = dto.country;
    }
    if (dto.lat !== undefined) {
      updates.lat = dto.lat;
    }
    if (dto.lng !== undefined) {
      updates.lng = dto.lng;
    }
    if (dto.address_line_2 !== undefined) {
      updates.address_line_2 = dto.address_line_2;
    }
    if (dto.about !== undefined) {
      updates.about = dto.about;
    }
    if (dto.services !== undefined) {
      updates.services = dto.services as Prisma.InputJsonValue;
    }
    if (dto.openHours !== undefined) {
      updates.openHours = dto.openHours as Prisma.InputJsonValue;
    }
    if (dto.business_gallery !== undefined) {
      updates.business_gallery = dto.business_gallery;
    }

    if (dto.businessGallery?.length) {
      const existingGallery = existingSalon?.business_gallery ?? [];
      updates.business_gallery = [...existingGallery, ...dto.businessGallery];
    }

    return updates;
  }

  private async findSalonByUserId(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      return null;
    }
    return this.salons.findByUserId(user.id);
  }

  private formatStylistPublic(stylist: PublicStylist) {
    const displayName = this.buildStylistDisplayName(stylist, stylist.user ?? undefined);
    const { user, ...rest } = stylist;

    return {
      ...rest,
      name: displayName,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: displayName,
            firstName: user.firstName ?? null,
            middleName: user.middleName ?? null,
            lastName: user.lastName ?? null,
          }
        : undefined,
    };
  }

  private formatStylistPrivate(stylist: Stylist & { user?: User | null }) {
    const displayName = this.buildStylistDisplayName(stylist, stylist.user ?? undefined);
    return {
      ...stylist,
      name: displayName,
      profilePicture: stylist.user?.profileImgUrl ?? null,
    };
  }

  private buildStylistDisplayName(
    stylist: { business_name?: string | null; name?: string | null },
    user?: NameParts | PublicStylistUser | User | null,
  ) {
    if (stylist.business_name) {
      return stylist.business_name;
    }
    if (stylist.name) {
      return stylist.name;
    }
    return this.buildUserFullName(user);
  }

  private toJson(value?: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return value as Prisma.InputJsonValue;
  }

  private buildUserFullName(user?: NameParts | PublicStylistUser | User | null) {
    if (!user) {
      return '';
    }
    if ('firstName' in user || 'middleName' in user || 'lastName' in user) {
      return [user.firstName ?? null, user.middleName ?? null, user.lastName ?? null]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' ');
    }

    if ('name' in user && user.name) {
      return user.name;
    }

    return '';
  }
}
