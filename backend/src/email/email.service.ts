export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

export interface SendOptions {
  to: string;
  subject: string;
  react: any;          // react element (compiled by EmailService impl)
  text?: string;       // optional fallback
  tags?: Record<string, string>;
}

export interface EmailService {
  send(options: SendOptions): Promise<{ id: string }>;
}
