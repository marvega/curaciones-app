import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from './establishment.entity';

@Injectable()
export class EstablishmentsService {
  constructor(
    @InjectRepository(Establishment)
    private readonly repo: Repository<Establishment>,
  ) {}

  list(): Promise<Establishment[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findById(id: number): Promise<Establishment> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Establishment ${id} not found`);
    return e;
  }
}
