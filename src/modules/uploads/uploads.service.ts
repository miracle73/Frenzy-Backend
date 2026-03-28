import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { Prisma, Salon, Stylist, User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SalonRepository } from '../../common/prisma/repositories/salon.repository';
import { StylistRepository } from '../../common/prisma/repositories/stylist.repository';
import { UserRepository } from '../../common/prisma/repositories/user.repository';
import type { AuthUserPayload } from '../auth/types/auth.types';

const CLOUDINARY_FOLDER = 'primlook';
const MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024;

export type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size?: number;
};

@Injectable()
export class UploadsService {
  private readonly cloudinaryReady: boolean;

  constructor(
    private readonly users: UserRepository,
    private readonly salons: SalonRepository,
    private readonly stylists: StylistRepository,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUDNAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_APIKEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_APISECRET');
    this.cloudinaryReady = Boolean(cloudName && apiKey && apiSecret);

    if (this.cloudinaryReady) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
    }
  }

  async uploadProfilePic(userPayload: AuthUserPayload, file: UploadFile) {
    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new NotFoundException({ message: 'User not found', error: 'User not found' });
    }

    const url = await this.uploadImage(file);
    const updatedUser = await this.users.update(user.id, { profileImgUrl: url });

    return { status: 201, _doc: updatedUser };
  }

  async uploadSalonLogo(userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    const updatedSalon = await this.upsertSalon(userPayload, { business_logo: url });

    return { status: 201, preference: url, _doc: updatedSalon };
  }

  async uploadSalonBanner(userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    const updatedSalon = await this.upsertSalon(userPayload, { business_banner: url });

    return { status: 201, preference: url, _doc: updatedSalon };
  }

  async uploadSalonGallery(userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    const salon = await this.getSalonOrThrow(userPayload);
    const existingGallery = salon.business_gallery ?? [];
    const business_gallery = [...existingGallery, url];

    const updatedSalon = await this.salons.update(salon.id, { business_gallery });
    return { status: 201, _doc: updatedSalon };
  }

  async uploadBookingStyle(_userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    return { status: 201, styleImageUrl: url };
  }

  async uploadPreferenceImage(_userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    return { status: 201, preference: url };
  }

  async uploadStylistGallery(_userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    return { status: 201, imageGallery: url };
  }

  async uploadStylistBanner(_userPayload: AuthUserPayload, file: UploadFile) {
    const url = await this.uploadImage(file);
    return { status: 201, bannerImage: url };
  }

  private async uploadImage(file: UploadFile) {
    if (!file || !file.buffer) {
      throw new BadRequestException({ message: 'No file provided', error: 'No file provided' });
    }
    if (typeof file.size === 'number' && file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException({
        message: 'File exceeds maximum size',
        error: 'File exceeds maximum size',
      });
    }
    if (!this.cloudinaryReady) {
      throw new ServiceUnavailableException({
        message: 'Cloudinary is not configured',
        error: 'Cloudinary is not configured',
      });
    }

    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'auto',
      folder: CLOUDINARY_FOLDER,
    });

    return uploadResult.secure_url;
  }

  private async getSalonOrThrow(userPayload: AuthUserPayload): Promise<Salon> {
    const salon = await this.salons.findByUserId(userPayload.userId);
    if (salon) {
      return salon;
    }

    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new NotFoundException({ message: 'User not found', error: 'User not found' });
    }

    return this.salons.create({
      email: user.email,
      user: { connect: { id: user.id } },
    });
  }

  private async upsertSalon(userPayload: AuthUserPayload, data: Prisma.SalonUpdateInput) {
    const salon = await this.getSalonOrThrow(userPayload);
    return this.salons.update(salon.id, data);
  }

  private async getStylistOrThrow(userPayload: AuthUserPayload): Promise<Stylist> {
    const stylist = await this.stylists.findByUserId(userPayload.userId);
    if (stylist) {
      return stylist;
    }

    const user = await this.users.findById(userPayload.userId);
    if (!user) {
      throw new NotFoundException({ message: 'User not found', error: 'User not found' });
    }

    return this.stylists.create({
      user: { connect: { id: user.id } },
      email: user.email,
      phoneNumber: user.phoneNumber ?? undefined,
      business_name: this.buildUserFullName(user),
      status: 'pending_approval',
    });
  }

  private buildUserFullName(user: User) {
    return [user.firstName, user.middleName, user.lastName]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ');
  }
}
