import { Module, Global } from '@nestjs/common';
import { KMS_SERVICE } from './kms.service';
import { AwsKmsService } from './aws-kms.service';
import { InMemoryKmsService } from './in-memory-kms.service';

@Global()
@Module({
  providers: [
    {
      provide: KMS_SERVICE,
      useClass: process.env.KMS_BACKEND === 'memory' ? InMemoryKmsService : AwsKmsService,
    },
  ],
  exports: [KMS_SERVICE],
})
export class KmsModule {}
