import { createHash } from 'crypto';
import { Request } from 'express';

export const extractAccessToken = (
  req?: Request | { headers?: Record<string, string | undefined> },
): string | null => {
  if (!req?.headers) {
    return null;
  }

  const authorization = req.headers.authorization;
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  const legacyToken = req.headers.token;
  if (typeof legacyToken === 'string') {
    return legacyToken.trim();
  }

  return null;
};

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
