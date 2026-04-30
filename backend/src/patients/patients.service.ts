import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { Patient } from './patient.entity';
import { PatientStatusChange, PatientStatus, PatientStatusChangeType } from './patient-status-change.entity';
import { CreatePatientDto } from './create-patient.dto';
import { UpdatePatientDto } from './update-patient.dto';
import { AppointmentsService } from '../appointments/appointments.service';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import type { EncryptedField } from '../kms/encrypted-field';
import { getCurrentOrgId } from '../common/org-context';
import { findScoped, findOneScoped } from '../common/org-scoped.repository';

/**
 * Patient projection where the encrypted PII columns have been resolved back to
 * plaintext strings (or null). Controllers, templates, and the frontend consume
 * this shape, not the raw entity. The fields that remain as `EncryptedField` on
 * the entity are widened to `string | null` here.
 */
export type DecryptedPatient = Omit<Patient, 'rut' | 'phone' | 'address'> & {
  rut: string;
  phone: string | null;
  address: string | null;
};

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(PatientStatusChange)
    private readonly statusChangeRepo: Repository<PatientStatusChange>,
    private readonly appointmentsService: AppointmentsService,
    private readonly dataSource: DataSource,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) {
      throw new Error('No organization context — cannot perform encrypted patient operation');
    }
    return orgId;
  }

  /**
   * Decrypts the encrypted PII columns on a Patient entity in place and returns
   * the same object cast to `DecryptedPatient`. Safe for in-memory use only —
   * never pass the result back to `repo.save()`.
   *
   * Also decrypts `curaciones[].observations` when the curaciones relation has
   * been loaded, since the column transformer is a passthrough and the raw
   * EncryptedField object would otherwise leak to the SPA and crash React.
   */
  private async decryptPatient(p: Patient): Promise<DecryptedPatient> {
    const orgId = this.requireOrgId();
    const tasks: Promise<void>[] = [];
    const out: any = p;

    if (p.rut && typeof p.rut === 'object') {
      tasks.push(
        this.kms.decrypt(p.rut as EncryptedField, `Patient.rut:${p.id}`, orgId).then((s) => {
          out.rut = s;
        }),
      );
    }
    if (p.phone && typeof p.phone === 'object') {
      tasks.push(
        this.kms.decrypt(p.phone as EncryptedField, `Patient.phone:${p.id}`, orgId).then((s) => {
          out.phone = s;
        }),
      );
    } else {
      out.phone = null;
    }
    if (p.address && typeof p.address === 'object') {
      tasks.push(
        this.kms.decrypt(p.address as EncryptedField, `Patient.address:${p.id}`, orgId).then((s) => {
          out.address = s;
        }),
      );
    } else {
      out.address = null;
    }
    if (Array.isArray((p as any).curaciones)) {
      for (const c of (p as any).curaciones as Array<{
        id: number;
        observations: EncryptedField | string | null;
      }>) {
        if (c.observations && typeof c.observations === 'object') {
          tasks.push(
            this.kms
              .decrypt(c.observations as EncryptedField, `Curacion.observations:${c.id}`, orgId)
              .then((s) => {
                c.observations = s;
              }),
          );
        }
      }
    }
    await Promise.all(tasks);
    return out as DecryptedPatient;
  }

  private async decryptMany(patients: Patient[]): Promise<DecryptedPatient[]> {
    return Promise.all(patients.map((p) => this.decryptPatient(p)));
  }

  async findByRut(rut: string): Promise<DecryptedPatient | null> {
    const patient = await findOneScoped(this.patientRepo, {
      where: { rutHash: sha256Hex(rut) },
      relations: ['curaciones'],
    });
    return patient ? this.decryptPatient(patient) : null;
  }

  async findById(id: number): Promise<DecryptedPatient> {
    const patient = await findOneScoped(this.patientRepo, {
      where: { id },
      relations: ['curaciones'],
    });
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${id} no encontrado`);
    }
    return this.decryptPatient(patient);
  }

  async create(dto: CreatePatientDto): Promise<DecryptedPatient> {
    const orgId = this.requireOrgId();
    const rutHash = sha256Hex(dto.rut);
    const existing = await findOneScoped(this.patientRepo, { where: { rutHash } });
    if (existing) {
      throw new ConflictException(`Ya existe un paciente con RUT ${dto.rut}`);
    }

    // Phase 1: insert with placeholder AAD so we can capture the generated id.
    const placeholderRut = await this.kms.encrypt(dto.rut, 'Patient.rut:0', orgId);
    const draft = this.patientRepo.create({
      organizationId: orgId,
      rut: placeholderRut,
      rutHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      birthDate: dto.birthDate,
      gender: dto.gender,
      phone: null,
      address: null,
    } as Partial<Patient>);
    const saved = await this.patientRepo.save(draft);

    // Phase 2: re-encrypt now that we have the real id, and encrypt the
    // optional phone/address columns with the row-bound AAD.
    const updates: Partial<Patient> = {
      rut: await this.kms.encrypt(dto.rut, `Patient.rut:${saved.id}`, orgId),
    };
    if (dto.phone) {
      updates.phone = await this.kms.encrypt(dto.phone, `Patient.phone:${saved.id}`, orgId);
    }
    if (dto.address) {
      updates.address = await this.kms.encrypt(dto.address, `Patient.address:${saved.id}`, orgId);
    }
    await this.patientRepo.update(saved.id, updates as any);

    const reloaded = await findOneScoped(this.patientRepo, { where: { id: saved.id } });
    if (!reloaded) {
      throw new NotFoundException(`Paciente con id ${saved.id} no encontrado`);
    }
    return this.decryptPatient(reloaded);
  }

  async update(id: number, dto: UpdatePatientDto): Promise<DecryptedPatient> {
    const orgId = this.requireOrgId();
    const patient = await findOneScoped(this.patientRepo, { where: { id } });
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${id} no encontrado`);
    }

    if (dto.firstName !== undefined) patient.firstName = dto.firstName;
    if (dto.lastName !== undefined) patient.lastName = dto.lastName;
    if (dto.birthDate !== undefined) patient.birthDate = dto.birthDate;
    if (dto.gender !== undefined) patient.gender = dto.gender;

    if (dto.phone !== undefined) {
      patient.phone = dto.phone
        ? await this.kms.encrypt(dto.phone, `Patient.phone:${id}`, orgId)
        : null;
    }
    if (dto.address !== undefined) {
      patient.address = dto.address
        ? await this.kms.encrypt(dto.address, `Patient.address:${id}`, orgId)
        : null;
    }

    const saved = await this.patientRepo.save(patient);
    return this.decryptPatient(saved);
  }

  async remove(id: number): Promise<void> {
    const patient = await findOneScoped(this.patientRepo, { where: { id } });
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${id} no encontrado`);
    }
    await this.patientRepo.remove(patient);
  }

  async seed(): Promise<{ created: number; patients: DecryptedPatient[] }> {
    const seedData = [
      { rut: '11111111-1', firstName: 'Ana', lastName: 'González', birthDate: '1985-03-15', gender: 'Femenino', phone: '+56912345678', address: 'Av. Principal 123' },
      { rut: '22222222-2', firstName: 'Carlos', lastName: 'Rodríguez', birthDate: '1972-07-22', gender: 'Masculino', phone: '+56987654321', address: 'Calle Los Robles 45' },
      { rut: '33333333-3', firstName: 'María', lastName: 'Silva', birthDate: '1990-11-08', gender: 'Femenino', phone: '+56955443322', address: 'Pasaje Las Flores 7' },
      { rut: '44444444-4', firstName: 'Pedro', lastName: 'Martínez', birthDate: '1965-01-30', gender: 'Masculino', phone: '+56933221100', address: 'Plaza Central 89' },
      { rut: '55555555-5', firstName: 'Laura', lastName: 'López', birthDate: '1988-09-12', gender: 'Femenino', phone: '+56911223344', address: 'Barrio Norte 156' },
      { rut: '66666666-6', firstName: 'Roberto', lastName: 'Hernández', birthDate: '1955-04-25', gender: 'Masculino', phone: '+56966778899', address: 'Camino Real 234' },
      { rut: '77777777-7', firstName: 'Sofía', lastName: 'Torres', birthDate: '1992-12-03', gender: 'Femenino', phone: '+56999887766', address: 'Av. Sur 67' },
      { rut: '88888888-8', firstName: 'José', lastName: 'Ramírez', birthDate: '1978-06-18', gender: 'Masculino', phone: '+56944332211', address: 'Villa Verde 12' },
    ];

    const created: DecryptedPatient[] = [];
    for (const data of seedData) {
      const rutHash = sha256Hex(data.rut);
      const existing = await findOneScoped(this.patientRepo, { where: { rutHash } });
      if (!existing) {
        const saved = await this.create(data);
        created.push(saved);
      }
    }
    return { created: created.length, patients: created };
  }

  async findAll(): Promise<DecryptedPatient[]> {
    const patients = await findScoped(this.patientRepo, { order: { lastName: 'ASC' } });
    return this.decryptMany(patients);
  }

  async findPaginated(
    page: number,
    limit: number,
  ): Promise<{ data: DecryptedPatient[]; total: number; page: number; totalPages: number }> {
    const orgId = this.requireOrgId();
    const [data, total] = await this.patientRepo.findAndCount({
      where: { organizationId: orgId },
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: await this.decryptMany(data),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAdvanced(filters: {
    page: number;
    limit: number;
    status?: string;
    gender?: string;
    curacionType?: string;
    dateFrom?: string;
    dateTo?: string;
    ageMin?: number;
    ageMax?: number;
    q?: string;
  }) {
    const orgId = this.requireOrgId();
    const qb = this.patientRepo.createQueryBuilder('p');
    qb.andWhere('p."organizationId" = :orgId', { orgId });

    if (filters.q && filters.q.trim() !== '') {
      const trimmed = filters.q.trim().slice(0, 100);
      const qNorm = trimmed.replace(/[.\-\s]/g, '');
      const qLike = `%${trimmed}%`;
      const qNormLike = `%${qNorm}%`;
      // TODO(phase-13.2): rut/phone are jsonb-encrypted; raw ILIKE on
      // ciphertext won't match plaintext. Search will need a deterministic
      // index (e.g. blind-index column) or re-decrypt server-side. For now
      // these clauses are kept for shape compatibility with existing tests
      // and degrade gracefully (no matches against encrypted blobs).
      qb.andWhere(
        `(
          REPLACE(REPLACE(p.rut, '.', ''), '-', '') ILIKE :qNormLike
          OR p."firstName" ILIKE :qLike
          OR p."lastName" ILIKE :qLike
          OR (p."firstName" || ' ' || p."lastName") ILIKE :qLike
          OR (p.phone IS NOT NULL AND p.phone ILIKE :qLike)
        )`,
        { qLike, qNormLike },
      );
    }

    if (filters.status) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }

    if (filters.gender) {
      qb.andWhere('p.gender = :gender', { gender: filters.gender });
    }

    if (filters.curacionType) {
      qb.innerJoin('p.curaciones', 'c', 'c.type = :cType', { cType: filters.curacionType });
    }

    if (filters.dateFrom || filters.dateTo) {
      if (!filters.curacionType) {
        qb.innerJoin('p.curaciones', 'c');
      }
      if (filters.dateFrom) {
        qb.andWhere('c.date >= :dateFrom', { dateFrom: filters.dateFrom });
      }
      if (filters.dateTo) {
        qb.andWhere('c.date <= :dateTo', { dateTo: filters.dateTo });
      }
    }

    if (filters.ageMin !== undefined) {
      const maxBirthDate = new Date();
      maxBirthDate.setFullYear(maxBirthDate.getFullYear() - filters.ageMin);
      qb.andWhere('p."birthDate" <= :maxBirth', { maxBirth: maxBirthDate.toISOString().split('T')[0] });
    }

    if (filters.ageMax !== undefined) {
      const minBirthDate = new Date();
      minBirthDate.setFullYear(minBirthDate.getFullYear() - filters.ageMax - 1);
      qb.andWhere('p."birthDate" >= :minBirth', { minBirth: minBirthDate.toISOString().split('T')[0] });
    }

    // Distinct because joins can duplicate rows
    qb.distinct(true)
      .select('p.id', 'id')
      .addSelect('p."firstName"', 'firstName')
      .addSelect('p."lastName"', 'lastName')
      .addSelect('p.rut', 'rut')
      .addSelect('p.gender', 'gender')
      .addSelect('p.status', 'status')
      .addSelect('p."birthDate"', 'birthDate')
      .addSelect('p.phone', 'phone');

    const total = await qb.getCount();

    const data = await qb
      .orderBy('p."lastName"', 'ASC')
      .offset((filters.page - 1) * filters.limit)
      .limit(filters.limit)
      .getRawMany();

    return {
      data,
      total,
      page: filters.page,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async discharge(
    id: number,
    performedById: number,
    cancelAppointment: boolean,
  ): Promise<DecryptedPatient> {
    const orgId = this.requireOrgId();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const patient = await queryRunner.manager.findOne(Patient, {
        where: { id, organizationId: orgId },
      });
      if (!patient) throw new NotFoundException(`Paciente con id ${id} no encontrado`);
      if (patient.status !== PatientStatus.ACTIVE) {
        throw new BadRequestException('El paciente ya está dado de alta');
      }

      patient.status = PatientStatus.DISCHARGED;
      await queryRunner.manager.save(patient);

      const statusChange = queryRunner.manager.create(PatientStatusChange, {
        patientId: id,
        type: PatientStatusChangeType.DISCHARGE,
        performedById,
      });
      await queryRunner.manager.save(statusChange);

      if (cancelAppointment) {
        await this.appointmentsService.deleteFutureByPatient(id, queryRunner.manager);
      }

      await queryRunner.commitTransaction();
      return this.findById(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async readmit(id: number, performedById: number): Promise<DecryptedPatient> {
    const orgId = this.requireOrgId();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const patient = await queryRunner.manager.findOne(Patient, {
        where: { id, organizationId: orgId },
      });
      if (!patient) throw new NotFoundException(`Paciente con id ${id} no encontrado`);
      if (patient.status !== PatientStatus.DISCHARGED) {
        throw new BadRequestException('El paciente no está dado de alta');
      }

      patient.status = PatientStatus.ACTIVE;
      await queryRunner.manager.save(patient);

      const statusChange = queryRunner.manager.create(PatientStatusChange, {
        patientId: id,
        type: PatientStatusChangeType.READMISSION,
        performedById,
      });
      await queryRunner.manager.save(statusChange);

      await queryRunner.commitTransaction();
      return this.findById(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getStatusHistory(id: number): Promise<PatientStatusChange[]> {
    return findScoped(this.statusChangeRepo, {
      where: { patientId: id },
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
    });
  }
}
