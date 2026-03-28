import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserRepository } from '../../common/prisma/repositories/user.repository';
import { SaveAddressDto } from './dto/saved-address.dto';

export interface SavedAddress {
  id: string;
  address: string;
  city?: string;
  state?: string;
  country?: string;
  landmark?: string;
  label?: string;
  lat?: number;
  lng?: number;
  createdAt: string;
}

const MAX_SAVED_ADDRESSES = 10;

@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  async getSavedAddresses(userId: string): Promise<SavedAddress[]> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const raw = user.savedAddresses;
    if (!Array.isArray(raw)) return [];
    return raw as unknown as SavedAddress[];
  }

  async saveAddress(userId: string, dto: SaveAddressDto): Promise<SavedAddress[]> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const existing: SavedAddress[] = Array.isArray(user.savedAddresses)
      ? (user.savedAddresses as unknown as SavedAddress[])
      : [];

    const duplicate = existing.find(
      (addr) =>
        addr.address.toLowerCase().trim() === dto.address.toLowerCase().trim() &&
        (addr.city || '').toLowerCase() === (dto.city || '').toLowerCase() &&
        (addr.state || '').toLowerCase() === (dto.state || '').toLowerCase(),
    );

    if (duplicate) {
      return existing;
    }

    if (existing.length >= MAX_SAVED_ADDRESSES) {
      existing.shift();
    }

    const newAddress: SavedAddress = {
      id: `addr_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      address: dto.address.trim(),
      city: dto.city?.trim() || undefined,
      state: dto.state?.trim() || undefined,
      country: dto.country?.trim() || undefined,
      landmark: dto.landmark?.trim() || undefined,
      label: dto.label?.trim() || undefined,
      lat: dto.lat,
      lng: dto.lng,
      createdAt: new Date().toISOString(),
    };

    const updated = [...existing, newAddress];
    await this.users.update(userId, { savedAddresses: updated as any });
    return updated;
  }

  async deleteAddress(userId: string, addressId: string): Promise<SavedAddress[]> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const existing: SavedAddress[] = Array.isArray(user.savedAddresses)
      ? (user.savedAddresses as unknown as SavedAddress[])
      : [];

    const updated = existing.filter((addr) => addr.id !== addressId);
    await this.users.update(userId, { savedAddresses: updated as any });
    return updated;
  }
}
