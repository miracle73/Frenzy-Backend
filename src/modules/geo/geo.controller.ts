import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GeoService } from './geo.service';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { PlaceDetailsDto } from './dto/place-details.dto';
import { ReverseGeocodeDto } from './dto/reverse-geocode.dto';

@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Post('autocomplete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Proxy Google Places autocomplete' })
  @ApiResponse({ status: 200, description: 'Autocomplete predictions.' })
  async autocomplete(@Body() dto: AutocompleteDto) {
    const predictions = await this.geoService.autocomplete(
      dto.input,
      dto.country || 'NG',
    );
    return { predictions };
  }

  @Post('place-details')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Proxy Google Place details lookup' })
  @ApiResponse({ status: 200, description: 'Resolved place details.' })
  async placeDetails(@Body() dto: PlaceDetailsDto) {
    const result = await this.geoService.placeDetails(dto.placeId);
    return result;
  }

  @Post('reverse-geocode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse geocode lat/lng to address' })
  @ApiResponse({ status: 200, description: 'Resolved address.' })
  async reverseGeocode(@Body() dto: ReverseGeocodeDto) {
    const result = await this.geoService.reverseGeocode(dto.lat, dto.lng);
    if (!result) {
      return {
        formattedAddress: 'Current Location',
        components: {},
        plusCode: null,
        lat: dto.lat,
        lng: dto.lng,
      };
    }
    return result;
  }
}
