import { Module, Global } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.service';
import { ResendEmailService } from './resend-email.service';
import { NoopEmailService } from './noop-email.service';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SERVICE,
      useClass: process.env.EMAIL_BACKEND === 'noop' ? NoopEmailService : ResendEmailService,
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
