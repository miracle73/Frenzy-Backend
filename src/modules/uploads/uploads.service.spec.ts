import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { UploadsService } from './uploads.service';
import type { UploadFile } from './uploads.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
    },
  },
}));

const createMocks = (cloudinaryReady = true) => {
  const users = {
    findById: jest.fn(),
    update: jest.fn(),
  };
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
  const prisma = {};
  const configService = {
    get: jest.fn((key: string) => {
      if (!cloudinaryReady) {
        return undefined;
      }
      const values: Record<string, string> = {
        CLOUDINARY_CLOUDNAME: 'cloud-name',
        CLOUDINARY_APIKEY: 'api-key',
        CLOUDINARY_APISECRET: 'api-secret',
      };
      return values[key];
    }),
  };

  return { users, salons, stylists, prisma, configService };
};

describe('UploadsService', () => {
  const userPayload = {
    userId: 'user-1',
    email: 'test@example.com',
    accountType: 'user',
  };

  const file: UploadFile = {
    buffer: Buffer.from('sample'),
    mimetype: 'image/png',
    originalname: 'sample.png',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when user is missing for profile uploads', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks();
    users.findById.mockResolvedValue(null);
    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    await expect(service.uploadProfilePic(userPayload, file)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uploads profile photo and updates user', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks();
    const updatedUser = { id: 'user-1', profileImgUrl: 'https://cdn/img.png' };
    users.findById.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    users.update.mockResolvedValue(updatedUser);
    (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
      secure_url: updatedUser.profileImgUrl,
    });

    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    const result = await service.uploadProfilePic(userPayload, file);

    expect(result).toEqual({ status: 201, _doc: updatedUser });
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
      `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
      expect.objectContaining({ folder: 'primlook', resource_type: 'auto' }),
    );
    expect(users.update).toHaveBeenCalledWith('user-1', {
      profileImgUrl: updatedUser.profileImgUrl,
    });
  });

  it('appends to salon gallery without trimming previous images', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks();
    const existingGallery = Array.from({ length: 9 }, (_, idx) => `img-${idx + 1}`);
    salons.findByUserId.mockResolvedValue({
      id: 'salon-1',
      business_gallery: existingGallery,
    });
    salons.update.mockResolvedValue({ id: 'salon-1', business_gallery: [] });
    (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
      secure_url: 'img-10',
    });

    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    await service.uploadSalonGallery(userPayload, file);

    expect(salons.update).toHaveBeenCalledWith('salon-1', {
      business_gallery: [...existingGallery, 'img-10'],
    });
  });

  it('creates a salon before updating logo when none exists', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks();
    users.findById.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
    salons.findByUserId.mockResolvedValue(null);
    salons.create.mockResolvedValue({ id: 'salon-1' });
    salons.update.mockResolvedValue({ id: 'salon-1', business_logo: 'logo.png' });
    (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
      secure_url: 'logo.png',
    });

    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    await service.uploadSalonLogo(userPayload, file);

    expect(salons.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      user: { connect: { id: 'user-1' } },
    });
    expect(salons.update).toHaveBeenCalledWith('salon-1', {
      business_logo: 'logo.png',
    });
  });

  it('rejects uploads when Cloudinary is not configured', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks(false);
    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    await expect(service.uploadPreferenceImage(userPayload, file)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects uploads when file is missing', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks();
    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    await expect(
      service.uploadPreferenceImage(userPayload, undefined as unknown as UploadFile),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects uploads when file exceeds the max size', async () => {
    const { users, salons, stylists, prisma, configService } = createMocks();
    const service = new UploadsService(
      users as any,
      salons as any,
      stylists as any,
      prisma as any,
      configService as any,
    );

    const oversizedFile: UploadFile = {
      ...file,
      size: 3 * 1024 * 1024 + 1,
    };

    await expect(service.uploadPreferenceImage(userPayload, oversizedFile)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
  });
});
