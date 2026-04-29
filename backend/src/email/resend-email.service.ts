import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { EmailService, SendOptions } from './email.service';

@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: Resend;
  private readonly from: string;

  constructor() {
    this.client = new Resend(process.env.RESEND_API_KEY!);
    this.from = process.env.EMAIL_FROM || 'Curaciones <noreply@curaciones.placeholder>';
  }

  async send(options: SendOptions): Promise<{ id: string }> {
    const html = await render(options.react);
    const res = await this.client.emails.send({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html,
      text: options.text,
      tags: options.tags
        ? Object.entries(options.tags).map(([name, value]) => ({ name, value }))
        : undefined,
    });
    if (res.error) {
      this.logger.error(`Resend send failed: ${res.error.message}`);
      throw new Error(`Email send failed: ${res.error.message}`);
    }
    return { id: res.data?.id || '' };
  }
}
