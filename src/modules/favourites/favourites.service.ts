import { Injectable } from '@nestjs/common';
import type { ProviderType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUserPayload } from '../auth/types/auth.types';

@Injectable()
export class FavouritesService {
  constructor(private readonly prisma: PrismaService) {}

  async addFavourite(user: AuthUserPayload, providerType: ProviderType, providerId: string) {
    const existing = await this.prisma.favourite.findUnique({
      where: {
        userId_providerType_providerId: {
          userId: user.userId,
          providerType,
          providerId,
        },
      },
    });

    if (existing) {
      return { status: 200, message: 'Already favourited', favourite: existing };
    }

    const favourite = await this.prisma.favourite.create({
      data: {
        userId: user.userId,
        providerType,
        providerId,
      },
    });

    return { status: 201, message: 'Favourite added', favourite };
  }

  async removeFavourite(user: AuthUserPayload, providerType: ProviderType, providerId: string) {
    const existing = await this.prisma.favourite.findUnique({
      where: {
        userId_providerType_providerId: {
          userId: user.userId,
          providerType,
          providerId,
        },
      },
    });

    if (!existing) {
      return { status: 200, message: 'Not in favourites' };
    }

    await this.prisma.favourite.delete({
      where: { id: existing.id },
    });

    return { status: 200, message: 'Favourite removed' };
  }

  async toggleFavourite(user: AuthUserPayload, providerType: ProviderType, providerId: string) {
    const existing = await this.prisma.favourite.findUnique({
      where: {
        userId_providerType_providerId: {
          userId: user.userId,
          providerType,
          providerId,
        },
      },
    });

    if (existing) {
      await this.prisma.favourite.delete({ where: { id: existing.id } });
      return { status: 200, message: 'Favourite removed', isFavourite: false };
    }

    const favourite = await this.prisma.favourite.create({
      data: {
        userId: user.userId,
        providerType,
        providerId,
      },
    });

    return { status: 201, message: 'Favourite added', isFavourite: true, favourite };
  }

  async getUserFavourites(user: AuthUserPayload) {
    const favourites = await this.prisma.favourite.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });

    return { status: 200, result: favourites };
  }

  async getProviderFans(providerType: ProviderType, providerId: string) {
    const fans = await this.prisma.favourite.findMany({
      where: { providerType, providerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            profileImgUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { status: 200, result: fans };
  }

  async isFavourite(user: AuthUserPayload, providerType: ProviderType, providerId: string) {
    const existing = await this.prisma.favourite.findUnique({
      where: {
        userId_providerType_providerId: {
          userId: user.userId,
          providerType,
          providerId,
        },
      },
    });

    return { status: 200, isFavourite: Boolean(existing) };
  }
}
