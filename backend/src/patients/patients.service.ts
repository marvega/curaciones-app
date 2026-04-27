import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Patient } from './patient.entity';
import { PatientStatusChange, PatientStatus, PatientStatusChangeType } from './patient-status-change.entity';
import { CreatePatientDto } from './create-patient.dto';
import { UpdatePatientDto } from './update-patient.dto';
import { AppointmentsService } from '../appointments/appointments.service';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(PatientStatusChange)
    private readonly statusChangeRepo: Repository<PatientStatusChange>,
    private readonly appointmentsService: AppointmentsService,
    private readonly dataSource: DataSource,
  ) {}

  async findByRut(rut: string): Promise<Patient | null> {
    return this.patientRepo.findOne({
      where: { rut },
      relations: ['curaciones'],
    });
  }

  async findById(id: number): Promise<Patient> {
    const patient = await this.patientRepo.findOne({
      where: { id },
      relations: ['curaciones'],
    });
    if (!patient) {
      throw new NotFoundException(`Paciente con id ${id} no encontrado`);
    }
    return patient;
  }

  async create(dto: CreatePatientDto): Promise<Patient> {
    const existing = await this.patientRepo.findOne({
      where: { rut: dto.rut },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un paciente con RUT ${dto.rut}`);
    }
    const patient = this.patientRepo.create(dto);
    return this.patientRepo.save(patient);
  }

  async update(id: number, dto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.findById(id);
    Object.assign(patient, dto);
    return this.patientRepo.save(patient);
  }

  async remove(id: number): Promise<void> {
    const patient = await this.findById(id);
    await this.patientRepo.remove(patient);
  }

  async seed(): Promise<{ created: number; patients: Patient[] }> {
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

    const created: Patient[] = [];
    for (const data of seedData) {
      const existing = await this.patientRepo.findOne({ where: { rut: data.rut } });
      if (!existing) {
        const patient = this.patientRepo.create(data);
        const saved = await this.patientRepo.save(patient);
        created.push(saved);
      }
    }
    return { created: created.length, patients: created };
  }

  async findAll(): Promise<Patient[]> {
    return this.patientRepo.find({ order: { lastName: 'ASC' } });
  }

  async findPaginated(
    page: number,
    limit: number,
  ): Promise<{ data: Patient[]; total: number; page: number; totalPages: number }> {
    const [data, total] = await this.patientRepo.findAndCount({
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
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
  }) {
    const qb = this.patientRepo.createQueryBuilder('p');

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
    qb.select('DISTINCT p.id', 'id')
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
  ): Promise<Patient> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const patient = await queryRunner.manager.findOne(Patient, {
        where: { id },
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

  async readmit(id: number, performedById: number): Promise<Patient> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const patient = await queryRunner.manager.findOne(Patient, {
        where: { id },
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
    return this.statusChangeRepo.find({
      where: { patientId: id },
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
    });
  }
}
