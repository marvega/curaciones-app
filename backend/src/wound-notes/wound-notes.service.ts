import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoundNote } from './wound-note.entity';
import { CreateWoundNoteDto } from './create-wound-note.dto';

@Injectable()
export class WoundNotesService {
  constructor(
    @InjectRepository(WoundNote)
    private readonly repo: Repository<WoundNote>,
  ) {}

  async create(
    dto: CreateWoundNoteDto,
    recordedById: number,
  ): Promise<WoundNote | null> {
    const note = this.repo.create({
      ...dto,
      recordedById,
      woundArea:
        dto.woundWidth != null && dto.woundLength != null
          ? +(dto.woundWidth * dto.woundLength).toFixed(2)
          : null,
    });
    const saved = await this.repo.save(note);
    return this.repo.findOne({
      where: { id: saved.id },
      relations: ['recordedBy'],
    });
  }

  async findByCuracion(curacionId: number): Promise<WoundNote | null> {
    return this.repo.findOne({
      where: { curacionId },
      relations: ['recordedBy'],
    });
  }

  async findByPatient(patientId: number): Promise<WoundNote[]> {
    return this.repo
      .createQueryBuilder('wn')
      .innerJoinAndSelect('wn.curacion', 'c')
      .innerJoinAndSelect('wn.recordedBy', 'u')
      .where('c.patientId = :patientId', { patientId })
      .orderBy('c.date', 'DESC')
      .getMany();
  }

  async getEvolutionData(
    patientId: number,
  ): Promise<
    { date: string; woundArea: number | null; woundColor: string | null; healingStage: string | null }[]
  > {
    const notes = await this.repo
      .createQueryBuilder('wn')
      .innerJoin('wn.curacion', 'c')
      .addSelect('c.date', 'date')
      .where('c.patientId = :patientId', { patientId })
      .orderBy('c.date', 'ASC')
      .getRawAndEntities();

    return notes.raw.map((r, i) => ({
      date: r.c_date,
      woundArea: notes.entities[i].woundArea,
      woundColor: notes.entities[i].woundColor,
      healingStage: notes.entities[i].healingStage,
    }));
  }
}
