import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoundPhoto } from './wound-photo.entity';
import { findScoped, findOneScoped } from '../common/org-scoped.repository';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'photos');

@Injectable()
export class WoundPhotosService {
  constructor(
    @InjectRepository(WoundPhoto)
    private readonly photoRepo: Repository<WoundPhoto>,
  ) {
    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }

  getUploadDir(): string {
    return UPLOAD_DIR;
  }

  async create(
    patientId: number,
    uploadedById: number,
    file: Express.Multer.File,
    photoDate: string,
    description?: string,
  ): Promise<WoundPhoto> {
    const photo = this.photoRepo.create({
      patientId,
      uploadedById,
      filename: file.filename,
      photoDate,
      description,
    });
    return this.photoRepo.save(photo);
  }

  async findByPatient(patientId: number): Promise<WoundPhoto[]> {
    return findScoped(this.photoRepo, {
      where: { patientId },
      relations: ['uploadedBy'],
      order: { photoDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async remove(id: number): Promise<void> {
    const photo = await findOneScoped(this.photoRepo, { where: { id } });
    if (!photo) throw new NotFoundException('Foto no encontrada');

    // Delete file from disk
    const filePath = path.join(UPLOAD_DIR, photo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.photoRepo.remove(photo);
  }
}
