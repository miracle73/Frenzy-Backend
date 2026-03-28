import { Request } from 'express';

export interface AuthUserPayload {
  userId: string;
  email: string;
  accountType: string;
}

export type AuthenticatedRequest = Request & { user: AuthUserPayload };
