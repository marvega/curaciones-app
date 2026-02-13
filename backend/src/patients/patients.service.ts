import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { CreatePatientDto } from './create-patient.dto';
import { UpdatePatientDto } from './update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
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
}
