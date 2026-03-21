import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentSignature } from './consent-signature.entity';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsentSignature])],
  controllers: [ConsentController],
  providers: [ConsentService],
})
export class ConsentModule {}
