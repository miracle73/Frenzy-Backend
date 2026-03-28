import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
} from '@nestjs/common';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { UploadsService } from './uploads.service';
import type { UploadFile } from './uploads.service';

const MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024;
const IMAGE_FILE_PIPE = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_SIZE_BYTES }),
    new FileTypeValidator({ fileType: /(jpeg|jpg|png|gif|webp|pdf)$/i }),
  ],
  fileIsRequired: true,
});

const uploadInterceptor = FileInterceptor('image', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

const uploadBodySchema = {
  schema: {
    type: 'object',
    properties: {
      image: { type: 'string', format: 'binary' },
    },
  },
};

@ApiTags('uploads')
@Controller('updates')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('pic')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadProfilePic(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadProfilePic(req.user, file);
  }

  @Post('businesslogo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadSalonLogo(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadSalonLogo(req.user, file);
  }

  @Post('businessbanner')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadSalonBanner(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadSalonBanner(req.user, file);
  }

  @Post('businessgallery')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadSalonGallery(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadSalonGallery(req.user, file);
  }

  @Post('booking_style')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadBookingStyle(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadBookingStyle(req.user, file);
  }

  @Post('preference_image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadPreferenceImage(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadPreferenceImage(req.user, file);
  }

  @Post('stylist_gallery')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadStylistGallery(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadStylistGallery(req.user, file);
  }

  @Post('stylist_banner')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(uploadInterceptor)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(uploadBodySchema)
  @HttpCode(HttpStatus.CREATED)
  uploadStylistBanner(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(IMAGE_FILE_PIPE) file: UploadFile,
  ) {
    return this.uploadsService.uploadStylistBanner(req.user, file);
  }
}
