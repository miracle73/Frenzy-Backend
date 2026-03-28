import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PaystackResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

@Injectable()
export class PaystackClient {
  private readonly secretKey: string | undefined;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    this.baseUrl =
      this.configService.get<string>('PAYSTACK_BASE_URL') ?? 'https://api.paystack.co';
  }

  async initializeTransaction(payload: Record<string, unknown>) {
    return this.request('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async verifyTransaction(reference: string) {
    return this.request(`/transaction/verify/${reference}`, { method: 'GET' });
  }

  async createSubaccount(payload: Record<string, unknown>) {
    return this.request('/subaccount', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listBanks() {
    return this.request('/bank', { method: 'GET' });
  }

  async resolveAccountNumber(accountNumber: string, bankCode: string) {
    return this.request(
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { method: 'GET' },
    );
  }

  async createTransferRecipient(payload: Record<string, unknown>) {
    return this.request('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createTransfer(payload: Record<string, unknown>) {
    return this.request('/transfer', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async refund(payload: Record<string, unknown>) {
    return this.request('/refund', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<PaystackResponse<T>> {
    if (!this.secretKey) {
      throw new ServiceUnavailableException({
        message: 'Paystack is not configured',
        error: 'Paystack is not configured',
      });
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const payload = (await response.json().catch(() => null)) as PaystackResponse<T> | null;

    if (!response.ok || !payload || payload.status === false) {
      throw new BadRequestException({
        message: payload?.message ?? 'Paystack request failed',
        error: payload?.message ?? 'Paystack request failed',
      });
    }

    return payload;
  }
}
