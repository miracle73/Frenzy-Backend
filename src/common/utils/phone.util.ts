import { BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function parseToE164(
  phone: string,
  countryCode?: string,
  countryCallCode?: string,
): { e164: string; countryCallCode?: string; countryCode?: string } {
  const raw = (phone || '').trim();
  if (!raw) {
    throw new BadRequestException('Phone number is required');
  }

  if (raw.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(raw);
    if (!parsed || !parsed.isValid()) {
      throw new BadRequestException('Invalid phone number');
    }
    return {
      e164: parsed.number.toString(),
      countryCallCode: `+${parsed.countryCallingCode}`,
      countryCode: parsed.country,
    };
  }

  if (!countryCode && !countryCallCode) {
    throw new BadRequestException(
      'Provide countryCode or countryCallCode when phone does not start with +',
    );
  }

  if (countryCode) {
    const parsed = parsePhoneNumberFromString(raw, countryCode as any);
    if (!parsed || !parsed.isValid()) {
      throw new BadRequestException('Invalid phone number');
    }
    return {
      e164: parsed.number.toString(),
      countryCallCode: `+${parsed.countryCallingCode}`,
      countryCode: parsed.country,
    };
  }

  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  const ccDigits = (countryCallCode || '').replace(/\D/g, '');
  const composed = `+${ccDigits}${digits}`;
  const parsed = parsePhoneNumberFromString(composed);
  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException('Invalid phone number');
  }
  return {
    e164: parsed.number.toString(),
    countryCallCode: `+${parsed.countryCallingCode}`,
    countryCode: parsed.country,
  };
}
