import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  let controller: UploadsController;
  let service: {
    uploadProfilePic: jest.Mock;
    uploadSalonLogo: jest.Mock;
    uploadSalonBanner: jest.Mock;
    uploadSalonGallery: jest.Mock;
    uploadBookingStyle: jest.Mock;
    uploadPreferenceImage: jest.Mock;
    uploadStylistGallery: jest.Mock;
    uploadStylistBanner: jest.Mock;
  };

  const user = {
    userId: 'user-1',
    email: 'user@example.com',
    accountType: 'user',
  };
  const req = { user } as any;
  const file = {
    buffer: Buffer.from('sample'),
    mimetype: 'image/png',
    originalname: 'sample.png',
  } as any;

  beforeEach(() => {
    service = {
      uploadProfilePic: jest.fn(),
      uploadSalonLogo: jest.fn(),
      uploadSalonBanner: jest.fn(),
      uploadSalonGallery: jest.fn(),
      uploadBookingStyle: jest.fn(),
      uploadPreferenceImage: jest.fn(),
      uploadStylistGallery: jest.fn(),
      uploadStylistBanner: jest.fn(),
    };
    controller = new UploadsController(service as any);
  });

  it('uploadProfilePic forwards user and file', async () => {
    await controller.uploadProfilePic(req, file);

    expect(service.uploadProfilePic).toHaveBeenCalledWith(user, file);
  });

  it('uploadSalonLogo forwards user and file', async () => {
    await controller.uploadSalonLogo(req, file);

    expect(service.uploadSalonLogo).toHaveBeenCalledWith(user, file);
  });

  it('uploadSalonBanner forwards user and file', async () => {
    await controller.uploadSalonBanner(req, file);

    expect(service.uploadSalonBanner).toHaveBeenCalledWith(user, file);
  });

  it('uploadSalonGallery forwards user and file', async () => {
    await controller.uploadSalonGallery(req, file);

    expect(service.uploadSalonGallery).toHaveBeenCalledWith(user, file);
  });

  it('uploadBookingStyle forwards user and file', async () => {
    await controller.uploadBookingStyle(req, file);

    expect(service.uploadBookingStyle).toHaveBeenCalledWith(user, file);
  });

  it('uploadPreferenceImage forwards user and file', async () => {
    await controller.uploadPreferenceImage(req, file);

    expect(service.uploadPreferenceImage).toHaveBeenCalledWith(user, file);
  });

  it('uploadStylistGallery forwards user and file', async () => {
    await controller.uploadStylistGallery(req, file);

    expect(service.uploadStylistGallery).toHaveBeenCalledWith(user, file);
  });

  it('uploadStylistBanner forwards user and file', async () => {
    await controller.uploadStylistBanner(req, file);

    expect(service.uploadStylistBanner).toHaveBeenCalledWith(user, file);
  });
});
