import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type AutocompletePrediction = {
  placeId: string;
  description: string;
};

export type PlaceDetailsResult = {
  placeId: string;
  formattedAddress: string;
  components: Record<string, string>;
  plusCode?: string;
  location: { lat: number; lng: number } | null;
};

export type ReverseGeocodeResult = {
  formattedAddress: string;
  components: Record<string, string>;
  plusCode?: string;
  lat: number;
  lng: number;
};

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    return this.config.get<string>('GOOGLE_MAPS_API_KEY') || '';
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.data as T;
    if (entry) this.cache.delete(key);
    return undefined;
  }

  private setCache(key: string, data: unknown, ttlSeconds: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private round(n: number): number {
    return Math.round(n * 1e5) / 1e5;
  }

  async autocomplete(
    input: string,
    country: string = 'NG',
  ): Promise<AutocompletePrediction[]> {
    const trimmed = (input || '').trim();
    if (!this.apiKey || !trimmed) return [];

    const cacheKey = `ac:${country}:${trimmed.toLowerCase()}`;
    const cached = this.getCached<AutocompletePrediction[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json',
        {
          params: {
            input: trimmed,
            types: 'geocode',
            components: `country:${country.toLowerCase()}`,
            key: this.apiKey,
          },
        },
      );

      const predictions = res.data?.predictions;
      if (!Array.isArray(predictions)) return [];

      const mapped: AutocompletePrediction[] = predictions
        .map((p: any) => ({
          placeId: String(p.place_id || ''),
          description: String(p.description || ''),
        }))
        .filter((p) => p.placeId && p.description);

      this.setCache(cacheKey, mapped, 3600);
      return mapped;
    } catch (err) {
      this.logger.warn(
        `[autocomplete] error: ${(err as Error).message}`,
      );
      return [];
    }
  }

  async placeDetails(placeId: string): Promise<PlaceDetailsResult | null> {
    const trimmed = (placeId || '').trim();
    if (!this.apiKey || !trimmed) return null;

    const cacheKey = `pd:${trimmed}`;
    const cached = this.getCached<PlaceDetailsResult>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: trimmed,
            fields:
              'formatted_address,address_component,geometry,plus_code',
            key: this.apiKey,
          },
        },
      );

      const result = res.data?.result;
      if (!result) return null;

      const comps: Record<string, string> = {};
      (result.address_components || []).forEach((c: any) => {
        (c.types || []).forEach((t: string) => {
          comps[t] = c.long_name;
        });
      });

      let location: { lat: number; lng: number } | null = null;
      const loc = result.geometry?.location;
      if (loc && loc.lat !== undefined && loc.lng !== undefined) {
        location = { lat: Number(loc.lat), lng: Number(loc.lng) };
      }

      const plusCode: string | undefined =
        result.plus_code?.global_code || result.plus_code?.compound_code;

      const details: PlaceDetailsResult = {
        placeId: trimmed,
        formattedAddress: result.formatted_address || '',
        components: comps,
        plusCode,
        location,
      };

      this.setCache(cacheKey, details, 86400);
      return details;
    } catch (err) {
      this.logger.warn(
        `[placeDetails] error: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<ReverseGeocodeResult | null> {
    if (!this.apiKey) return null;

    const rounded = { lat: this.round(lat), lng: this.round(lng) };
    const cacheKey = `rg:${rounded.lat},${rounded.lng}`;
    const cached = this.getCached<ReverseGeocodeResult>(cacheKey);
    if (cached) return cached;

    try {
      const res = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            latlng: `${rounded.lat},${rounded.lng}`,
            key: this.apiKey,
          },
        },
      );

      const results = res.data?.results;
      if (!Array.isArray(results) || !results.length) return null;

      const place = results[0];
      const comps: Record<string, string> = {};
      (place.address_components || []).forEach((c: any) => {
        (c.types || []).forEach((t: string) => {
          comps[t] = c.long_name;
        });
      });

      const plusCode: string | undefined =
        place.plus_code?.global_code || place.plus_code?.compound_code;

      const result: ReverseGeocodeResult = {
        formattedAddress: place.formatted_address || 'Current Location',
        components: comps,
        plusCode,
        lat: rounded.lat,
        lng: rounded.lng,
      };

      this.setCache(cacheKey, result, 86400);
      return result;
    } catch (err) {
      this.logger.warn(
        `[reverseGeocode] error: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
