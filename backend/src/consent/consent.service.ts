import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentSignature } from './consent-signature.entity';
import * as fs from 'fs';
import * as path from 'path';

const SIGNATURES_DIR = path.join(process.cwd(), 'uploads', 'signatures');

@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(ConsentSignature)
    private readonly signatureRepo: Repository<ConsentSignature>,
  ) {
    if (!fs.existsSync(SIGNATURES_DIR)) {
      fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
    }
  }

  async saveSignature(
    patientId: number,
    witnessedById: number,
    signatureDataUrl: string,
    consentText?: string,
  ): Promise<ConsentSignature> {
    const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
    const filename = `signature-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
    const filePath = path.join(SIGNATURES_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const signature = this.signatureRepo.create({
      patientId,
      witnessedById,
      filename,
      consentText,
    });
    return this.signatureRepo.save(signature);
  }

  async findByPatient(patientId: number): Promise<ConsentSignature[]> {
    return this.signatureRepo.find({
      where: { patientId },
      relations: ['witnessedBy'],
      order: { signedAt: 'DESC' },
    });
  }

  getSignaturesDir(): string {
    return SIGNATURES_DIR;
  }
}
