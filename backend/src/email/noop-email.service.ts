import { Injectable, Logger } from '@nestjs/common';
import { EmailService, SendOptions } from './email.service';

@Injectable()
export class NoopEmailService implements EmailService {
  private readonly logger = new Logger(NoopEmailService.name);
  public sent: SendOptions[] = [];

  async send(options: SendOptions): Promise<{ id: string }> {
    this.logger.log(`[noop-email] to=${options.to} subject=${options.subject}`);
    this.sent.push(options);
    return { id: `noop-${this.sent.length}` };
  }
}
