import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from './establishment.entity';
import { findScoped, findOneScoped } from '../common/org-scoped.repository';

@Injectable()
export class EstablishmentsService {
  constructor(
    @InjectRepository(Establishment)
    private readonly repo: Repository<Establishment>,
  ) {}

  list(): Promise<Establishment[]> {
    return findScoped(this.repo, { order: { id: 'ASC' } });
  }

  async findById(id: number): Promise<Establishment> {
    const e = await findOneScoped(this.repo, { where: { id } });
    if (!e) throw new NotFoundException(`Establishment ${id} not found`);
    return e;
  }
}
