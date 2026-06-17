export interface KycProvider {
  name: string;
  generateVerificationUrl(userId: string): Promise<string>;
  getVerificationStatus(referenceId: string): Promise<{
    status: 'PENDING' | 'REVIEWING' | 'APPROVED' | 'REJECTED';
    reason?: string;
  }>;
}

export class SumsubProvider implements KycProvider {
  name = 'SUMSUB';
  private apiToken = process.env.SUMSUB_API_TOKEN || '';
  private secretKey = process.env.SUMSUB_SECRET_KEY || '';

  async generateVerificationUrl(userId: string): Promise<string> {
    // Standard sandbox/mock or real Sumsub integration URL
    // In production, this would make a REST request to Sumsub API to get an access token and return the widget URL
    return `https://api.sumsub.com/idensic/static/v1/sandbox.html?userId=${userId}&clientId=${this.apiToken}`;
  }

  async getVerificationStatus(referenceId: string) {
    // In production, poll Sumsub API or receive callback
    return { status: 'APPROVED' as const };
  }
}

export class VeriffProvider implements KycProvider {
  name = 'VERIFF';

  async generateVerificationUrl(userId: string): Promise<string> {
    return `https://station.veriff.com/v1/sessions/mock-session-${userId}`;
  }

  async getVerificationStatus(referenceId: string) {
    return { status: 'APPROVED' as const };
  }
}

export class PersonaProvider implements KycProvider {
  name = 'PERSONA';

  async generateVerificationUrl(userId: string): Promise<string> {
    return `https://withpersona.com/verify?inquiry-template-id=mock-template&reference-id=${userId}`;
  }

  async getVerificationStatus(referenceId: string) {
    return { status: 'APPROVED' as const };
  }
}

// Registry / Factory pattern to support future switching
export class KycService {
  private static providers: Record<string, KycProvider> = {
    SUMSUB: new SumsubProvider(),
    VERIFF: new VeriffProvider(),
    PERSONA: new PersonaProvider(),
  };

  static getProvider(name?: string): KycProvider {
    const providerName = name || process.env.KYC_PROVIDER || 'SUMSUB';
    const provider = this.providers[providerName];
    if (!provider) {
      throw new Error(`KYC Provider ${providerName} is not registered`);
    }
    return provider;
  }
}
