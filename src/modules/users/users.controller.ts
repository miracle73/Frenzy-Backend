import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { UsersService } from './users.service';
import { SaveAddressDto, DeleteAddressDto } from './dto/saved-address.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  getSavedAddresses(@Req() req: AuthenticatedRequest) {
    return this.usersService.getSavedAddresses(req.user.userId);
  }

  @Post('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  saveAddress(@Req() req: AuthenticatedRequest, @Body() dto: SaveAddressDto) {
    return this.usersService.saveAddress(req.user.userId, dto);
  }

  @Delete('addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  deleteAddress(@Req() req: AuthenticatedRequest, @Body() dto: DeleteAddressDto) {
    return this.usersService.deleteAddress(req.user.userId, dto.addressId);
  }
}
