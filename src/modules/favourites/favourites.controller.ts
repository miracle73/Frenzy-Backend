import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { FavouritesService } from './favourites.service';
import { ToggleFavouriteDto } from './dto/toggle-favourite.dto';

@ApiTags('favourites')
@Controller('favourites')
export class FavouritesController {
  constructor(private readonly favouritesService: FavouritesService) {}

  @Post('toggle')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  toggle(@Req() req: AuthenticatedRequest, @Body() dto: ToggleFavouriteDto) {
    return this.favouritesService.toggleFavourite(req.user, dto.providerType, dto.providerId);
  }

  @Post('add')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  add(@Req() req: AuthenticatedRequest, @Body() dto: ToggleFavouriteDto) {
    return this.favouritesService.addFavourite(req.user, dto.providerType, dto.providerId);
  }

  @Delete('remove')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  remove(@Req() req: AuthenticatedRequest, @Body() dto: ToggleFavouriteDto) {
    return this.favouritesService.removeFavourite(req.user, dto.providerType, dto.providerId);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  getMyFavourites(@Req() req: AuthenticatedRequest) {
    return this.favouritesService.getUserFavourites(req.user);
  }

  @Get('fans/:providerType/:providerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  getProviderFans(
    @Param('providerType') providerType: ProviderType,
    @Param('providerId') providerId: string,
  ) {
    return this.favouritesService.getProviderFans(providerType, providerId);
  }

  @Get('check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  checkFavourite(
    @Req() req: AuthenticatedRequest,
    @Query('providerType') providerType: ProviderType,
    @Query('providerId') providerId: string,
  ) {
    return this.favouritesService.isFavourite(req.user, providerType, providerId);
  }
}
