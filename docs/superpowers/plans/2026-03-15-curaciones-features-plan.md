# Curaciones Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 features to the curaciones clinical app: appointment normalization with standalone appointments, second-friday AM schedule, patient discharge/readmission, and admin-only curacion editing.

**Architecture:** Phased migration strategy to safely normalize appointment data while `synchronize: true` is active. Phase 1 adds new Appointment entity + dual-write (keeping old curacion fields). Phase 2 migrates existing data. Phase 3 removes old fields. Other features build on top of the normalized model.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, React 19, Vite, Tailwind CSS 4, Jest

**Specs:** See `docs/superpowers/specs/2026-03-15-*.md` for full design details.

**Implementation order:**
1. Schedule utility + Appointment entity + module (Chunk 1)
2. Integrate appointments into existing endpoints + dual-write (Chunk 2)
3. Frontend: appointments, agenda, second friday (Chunk 3)
4. Discharge/readmission backend + frontend (Chunk 4)
5. Edit curacion admin-only backend + frontend (Chunk 5)
6. Data migration + Phase 3 cleanup (Chunk 6)

---

## Chunk 1: Schedule Utility + Appointment Entity + Module (Backend)

### Task 1: Schedule utility — `isSecondFriday` and `getSlotsForDate`

**Files:**
- Create: `backend/src/common/schedule.util.ts`
- Create: `backend/src/common/schedule.util.spec.ts`

- [ ] **Step 1: Write tests for isSecondFriday**

```typescript
// backend/src/common/schedule.util.spec.ts
import { isSecondFriday, getSlotsForDate } from './schedule.util';

describe('isSecondFriday', () => {
  it('returns true for the second Friday of March 2026 (13th)', () => {
    expect(isSecondFriday('2026-03-13')).toBe(true);
  });

  it('returns false for the first Friday of March 2026 (6th)', () => {
    expect(isSecondFriday('2026-03-06')).toBe(false);
  });

  it('returns false for a non-Friday (March 12)', () => {
    expect(isSecondFriday('2026-03-12')).toBe(false);
  });

  it('returns true for second Friday of April 2026 (10th)', () => {
    expect(isSecondFriday('2026-04-10')).toBe(true);
  });

  it('returns false for third Friday of April 2026 (17th)', () => {
    expect(isSecondFriday('2026-04-17')).toBe(false);
  });
});

describe('getSlotsForDate', () => {
  it('returns AM slots for a second Friday', () => {
    const slots = getSlotsForDate('2026-03-13');
    expect(slots).toEqual([
      '08:00', '08:30', '09:00', '09:30', '10:00',
      '10:30', '11:00', '11:30', '12:00',
    ]);
  });

  it('returns PM slots for a regular day', () => {
    const slots = getSlotsForDate('2026-03-12');
    expect(slots).toEqual([
      '12:30', '13:00', '13:30', '14:00',
      '14:30', '15:00', '15:30', '16:00',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/common/schedule.util.spec.ts --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement schedule utility**

```typescript
// backend/src/common/schedule.util.ts
const PM_SLOTS = [
  '12:30', '13:00', '13:30', '14:00',
  '14:30', '15:00', '15:30', '16:00',
];

const AM_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00',
  '10:30', '11:00', '11:30', '12:00',
];

export function isSecondFriday(date: string): boolean {
  const d = new Date(date + 'T00:00:00');
  if (d.getDay() !== 5) return false; // not a Friday

  // Count Fridays in the month up to this date
  let fridayCount = 0;
  for (let day = 1; day <= d.getDate(); day++) {
    const check = new Date(d.getFullYear(), d.getMonth(), day);
    if (check.getDay() === 5) fridayCount++;
  }
  return fridayCount === 2;
}

export function getSlotsForDate(date: string): string[] {
  return isSecondFriday(date) ? AM_SLOTS : PM_SLOTS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/common/schedule.util.spec.ts --verbose`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/schedule.util.ts backend/src/common/schedule.util.spec.ts
git commit -m "feat: add schedule utility with isSecondFriday and getSlotsForDate"
```

---

### Task 2: Appointment entity

**Files:**
- Create: `backend/src/appointments/appointment.entity.ts`
- Modify: `backend/src/patients/patient.entity.ts` (add inverse relation)
- Modify: `backend/src/curaciones/curacion.entity.ts` (add inverse relation, KEEP old fields for Phase 1)
- Modify: `backend/src/app.module.ts` (register entity)

- [ ] **Step 1: Create Appointment entity**

```typescript
// backend/src/appointments/appointment.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Curacion } from '../curaciones/curacion.entity';

@Entity('appointments')
@Unique(['date', 'time'])
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patientId: number;

  @Column({ nullable: true, unique: true })
  curacionId: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  time: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Patient, (patient) => patient.appointments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Curacion, (curacion) => curacion.appointment, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;
}
```

- [ ] **Step 2: Add inverse relations to Patient and Curacion entities**

In `backend/src/patients/patient.entity.ts`, add import and relation:

```typescript
import { Appointment } from '../appointments/appointment.entity';
// ... inside the class, after curaciones relation:
@OneToMany(() => Appointment, (appointment) => appointment.patient)
appointments: Appointment[];
```

In `backend/src/curaciones/curacion.entity.ts`, add import and relation (KEEP old nextAppointment fields for now):

```typescript
import { Appointment } from '../appointments/appointment.entity';
// ... inside the class, after patient relation:
@OneToOne(() => Appointment, (appointment) => appointment.curacion)
appointment: Appointment;
```

- [ ] **Step 3: Register entity in AppModule**

In `backend/src/app.module.ts`, add `Appointment` to entities array:

```typescript
import { Appointment } from './appointments/appointment.entity';
// ...
entities: [Patient, Curacion, MonthlyCycle, User, Appointment],
```

- [ ] **Step 4: Verify the app compiles**

Run: `cd backend && npx nest build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/appointments/appointment.entity.ts backend/src/patients/patient.entity.ts backend/src/curaciones/curacion.entity.ts backend/src/app.module.ts
git commit -m "feat: add Appointment entity with relations to Patient and Curacion"
```

---

### Task 3: AppointmentsModule — DTO, service, controller

**Files:**
- Create: `backend/src/appointments/create-appointment.dto.ts`
- Create: `backend/src/appointments/appointments.service.ts`
- Create: `backend/src/appointments/appointments.controller.ts`
- Create: `backend/src/appointments/appointments.module.ts`
- Modify: `backend/src/app.module.ts` (import module)

- [ ] **Step 1: Create DTO**

```typescript
// backend/src/appointments/create-appointment.dto.ts
import { IsNumber, IsDateString, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsNumber()
  patientId: number;

  @IsDateString()
  date: string;

  @IsString()
  time: string;
}
```

- [ ] **Step 2: Create AppointmentsService**

```typescript
// backend/src/appointments/appointments.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Appointment } from './appointment.entity';
import { CreateAppointmentDto } from './create-appointment.dto';
import { getSlotsForDate } from '../common/schedule.util';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
  ) {}

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const validSlots = getSlotsForDate(dto.date);
    if (!validSlots.includes(dto.time)) {
      throw new BadRequestException(
        `Horario ${dto.time} no es válido para la fecha ${dto.date}. Horarios disponibles: ${validSlots.join(', ')}`,
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (dto.date < today) {
      throw new BadRequestException('La fecha debe ser futura');
    }

    const existing = await this.appointmentRepo.findOne({
      where: { date: dto.date, time: dto.time },
    });
    if (existing) {
      throw new BadRequestException(
        `El horario ${dto.time} del ${dto.date} ya está ocupado`,
      );
    }

    const appointment = this.appointmentRepo.create(dto);
    return this.appointmentRepo.save(appointment);
  }

  async createLinked(
    patientId: number,
    curacionId: number,
    date: string,
    time: string,
  ): Promise<Appointment> {
    const validSlots = getSlotsForDate(date);
    if (!validSlots.includes(time)) {
      throw new BadRequestException(
        `Horario ${time} no es válido para la fecha ${date}`,
      );
    }

    const existing = await this.appointmentRepo.findOne({
      where: { date, time },
    });
    if (existing) {
      throw new BadRequestException(
        `El horario ${time} del ${date} ya está ocupado`,
      );
    }

    const appointment = this.appointmentRepo.create({
      patientId,
      curacionId,
      date,
      time,
    });
    return this.appointmentRepo.save(appointment);
  }

  async remove(id: number): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({ where: { id } });
    if (!appointment) {
      throw new NotFoundException(`Cita con id ${id} no encontrada`);
    }
    await this.appointmentRepo.remove(appointment);
  }

  async findByPatient(patientId: number): Promise<Appointment[]> {
    return this.appointmentRepo.find({
      where: { patientId },
      relations: ['curacion'],
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async findFutureByPatient(patientId: number): Promise<Appointment[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.appointmentRepo.find({
      where: { patientId, date: MoreThan(today) },
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async deleteFutureByPatient(patientId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const result = await this.appointmentRepo
      .createQueryBuilder()
      .delete()
      .where('"patientId" = :patientId AND date > :today', {
        patientId,
        today,
      })
      .execute();
    return result.affected || 0;
  }

  async getAvailability(date: string): Promise<any[]> {
    const slots = getSlotsForDate(date);
    const appointments = await this.appointmentRepo.find({
      where: { date },
      relations: ['patient'],
    });

    return slots.map((time) => {
      const apt = appointments.find((a) => a.time === time);
      return {
        time,
        available: !apt,
        patient: apt
          ? {
              id: apt.patient.id,
              firstName: apt.patient.firstName,
              lastName: apt.patient.lastName,
              rut: apt.patient.rut,
            }
          : null,
      };
    });
  }

  async getAgenda(from: string, to: string): Promise<any[]> {
    const appointments = await this.appointmentRepo
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.patient', 'patient')
      .leftJoinAndSelect('apt.curacion', 'curacion')
      .where('apt.date >= :from AND apt.date <= :to', { from, to })
      .orderBy('apt.date', 'ASC')
      .addOrderBy('apt.time', 'ASC')
      .getMany();

    return appointments.map((apt) => ({
      id: apt.id,
      date: apt.date,
      time: apt.time,
      source: apt.curacionId ? 'curacion' : 'standalone',
      patient: {
        id: apt.patient.id,
        firstName: apt.patient.firstName,
        lastName: apt.patient.lastName,
        rut: apt.patient.rut,
      },
      curacion: apt.curacion
        ? { id: apt.curacion.id, type: apt.curacion.type }
        : undefined,
    }));
  }

  async findByCuracionId(curacionId: number): Promise<Appointment | null> {
    return this.appointmentRepo.findOne({ where: { curacionId } });
  }

  async updateLinked(
    appointmentId: number,
    date: string,
    time: string,
    skipSlotCheck?: number,
  ): Promise<Appointment> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException(`Cita con id ${appointmentId} no encontrada`);
    }

    const validSlots = getSlotsForDate(date);
    if (!validSlots.includes(time)) {
      throw new BadRequestException(
        `Horario ${time} no es válido para la fecha ${date}`,
      );
    }

    const existing = await this.appointmentRepo.findOne({
      where: { date, time },
    });
    if (existing && existing.id !== skipSlotCheck && existing.id !== appointmentId) {
      throw new BadRequestException(
        `El horario ${time} del ${date} ya está ocupado`,
      );
    }

    appointment.date = date;
    appointment.time = time;
    return this.appointmentRepo.save(appointment);
  }
}
```

- [ ] **Step 3: Create AppointmentsController**

```typescript
// backend/src/appointments/appointments.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './create-appointment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.remove(id);
  }

  @Get('patient/:patientId')
  async findByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
  ) {
    return this.appointmentsService.findByPatient(patientId);
  }
}
```

- [ ] **Step 4: Create AppointmentsModule**

```typescript
// backend/src/appointments/appointments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './appointment.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment])],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
```

- [ ] **Step 5: Register module in AppModule**

In `backend/src/app.module.ts`, add `AppointmentsModule` to imports:

```typescript
import { AppointmentsModule } from './appointments/appointments.module';
// ...
imports: [
  // ... existing modules
  AppointmentsModule,
],
```

- [ ] **Step 6: Build and verify**

Run: `cd backend && npx nest build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add backend/src/appointments/ backend/src/app.module.ts
git commit -m "feat: add AppointmentsModule with CRUD, availability, and agenda"
```

---

## Chunk 2: Integrate Appointments Into Existing Endpoints + Dual-Write (Backend)

### Task 4: Update CuracionesModule to use AppointmentsService

**Files:**
- Modify: `backend/src/curaciones/curaciones.module.ts` (import AppointmentsModule)
- Modify: `backend/src/curaciones/create-curacion.dto.ts` (add appointment fields, remove regex)
- Modify: `backend/src/curaciones/curaciones.service.ts` (dual-write, delegate agenda/availability)
- Modify: `backend/src/curaciones/curaciones.controller.ts` (no changes needed — endpoints stay same)

- [ ] **Step 1: Import AppointmentsModule in CuracionesModule**

In `backend/src/curaciones/curaciones.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Curacion } from './curacion.entity';
import { CuracionesService } from './curaciones.service';
import { CuracionesController } from './curaciones.controller';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [TypeOrmModule.forFeature([Curacion]), AppointmentsModule],
  controllers: [CuracionesController],
  providers: [CuracionesService],
  exports: [CuracionesService],
})
export class CuracionesModule {}
```

- [ ] **Step 2: Update CreateCuracionDto — add appointment fields, remove static regex**

Replace `backend/src/curaciones/create-curacion.dto.ts`:

```typescript
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { CuracionType } from './curacion.entity';

export class CreateCuracionDto {
  @IsNumber()
  patientId: number;

  @IsEnum(CuracionType)
  type: CuracionType;

  @IsDateString()
  date: string;

  // Legacy fields — kept for Phase 1 dual-write
  @IsDateString()
  @IsOptional()
  nextAppointmentDate?: string;

  @IsString()
  @IsOptional()
  nextAppointmentTime?: string;

  // New fields — used to create linked Appointment
  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  observations?: string;
}
```

- [ ] **Step 3: Update CuracionesService — dual-write + delegate to AppointmentsService**

Replace `backend/src/curaciones/curaciones.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Curacion } from './curacion.entity';
import { CreateCuracionDto } from './create-curacion.dto';
import { AppointmentsService } from '../appointments/appointments.service';

@Injectable()
export class CuracionesService {
  constructor(
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async create(dto: CreateCuracionDto): Promise<Curacion> {
    const appointmentDate = dto.appointmentDate || dto.nextAppointmentDate;
    const appointmentTime = dto.appointmentTime || dto.nextAppointmentTime;

    // Dual-write: keep old fields populated for Phase 1
    const curacion = this.curacionRepo.create({
      ...dto,
      nextAppointmentDate: appointmentDate || null,
      nextAppointmentTime: appointmentTime || null,
    });
    const saved = await this.curacionRepo.save(curacion);

    // Also create linked Appointment if date+time provided
    if (appointmentDate && appointmentTime) {
      await this.appointmentsService.createLinked(
        saved.patientId,
        saved.id,
        appointmentDate,
        appointmentTime,
      );
    }

    return this.findOneWithAppointment(saved.id);
  }

  async findOneWithAppointment(id: number): Promise<Curacion> {
    return this.curacionRepo.findOne({
      where: { id },
      relations: ['appointment'],
    });
  }

  async findByPatient(patientId: number): Promise<Curacion[]> {
    return this.curacionRepo.find({
      where: { patientId },
      relations: ['appointment'],
      order: { date: 'DESC' },
    });
  }

  async getAgenda(from: string, to: string): Promise<any[]> {
    return this.appointmentsService.getAgenda(from, to);
  }

  async getAvailability(date: string): Promise<any[]> {
    return this.appointmentsService.getAvailability(date);
  }
}
```

- [ ] **Step 4: Build and verify**

Run: `cd backend && npx nest build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add backend/src/curaciones/
git commit -m "feat: integrate AppointmentsService into CuracionesModule with dual-write"
```

---

### Task 5: Write integration test for appointment creation flow

**Files:**
- Create: `backend/src/appointments/appointments.service.spec.ts`

- [ ] **Step 1: Write unit test for slot validation**

```typescript
// backend/src/appointments/appointments.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './appointment.entity';
import { BadRequestException } from '@nestjs/common';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  const mockRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    findOne: jest.fn(() => Promise.resolve(null)),
    find: jest.fn(() => Promise.resolve([])),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(AppointmentsService);
    jest.clearAllMocks();
  });

  it('rejects an invalid time slot for a regular day', async () => {
    await expect(
      service.create({ patientId: 1, date: '2099-12-01', time: '09:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid PM slot for a regular day', async () => {
    const result = await service.create({
      patientId: 1,
      date: '2099-12-01',
      time: '13:00',
    });
    expect(result).toBeDefined();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('rejects a PM slot on a second Friday', async () => {
    // 2099-12-12 is a Friday; need to find actual second Friday
    // Use a known second Friday: 2026-04-10
    await expect(
      service.create({ patientId: 1, date: '2026-04-10', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an AM slot on a second Friday', async () => {
    const result = await service.create({
      patientId: 1,
      date: '2026-04-10',
      time: '09:00',
    });
    expect(result).toBeDefined();
  });

  it('rejects a past date', async () => {
    await expect(
      service.create({ patientId: 1, date: '2020-01-01', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a double-booked slot', async () => {
    mockRepo.findOne.mockResolvedValueOnce({ id: 99, date: '2099-12-01', time: '13:00' });
    await expect(
      service.create({ patientId: 1, date: '2099-12-01', time: '13:00' }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd backend && npx jest src/appointments/appointments.service.spec.ts --verbose`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/appointments/appointments.service.spec.ts
git commit -m "test: add unit tests for AppointmentsService slot validation"
```

---

## Chunk 3: Frontend — Appointments, Agenda, Second Friday

### Task 6: Frontend types and API functions

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Update types**

In `frontend/src/types/index.ts`, add after the `Curacion` interface:

```typescript
export interface Appointment {
  id: number;
  patientId: number;
  curacionId?: number;
  date: string;
  time: string;
  createdAt: string;
  curacion?: Curacion;
}

export interface AgendaItem {
  id: number;
  date: string;
  time: string;
  source: 'curacion' | 'standalone';
  patient: { id: number; firstName: string; lastName: string; rut: string };
  curacion?: { id: number; type: CuracionType };
}
```

Add `appointment?: Appointment` to the `Curacion` interface (after `patient?: Patient`).

- [ ] **Step 2: Add API functions**

In `frontend/src/services/api.ts`, add at the end (before the last line):

```typescript
// Appointments
export const createAppointment = async (
  patientId: number,
  date: string,
  time: string,
): Promise<Appointment> => {
  const { data } = await api.post('/appointments', { patientId, date, time });
  return data;
};

export const deleteAppointment = async (id: number): Promise<void> => {
  await api.delete(`/appointments/${id}`);
};

export const getPatientAppointments = async (
  patientId: number,
): Promise<Appointment[]> => {
  const { data } = await api.get(`/appointments/patient/${patientId}`);
  return data;
};
```

Update the `getAgenda` return type:

```typescript
import type { ..., Appointment, AgendaItem } from '../types';

export const getAgenda = async (
  from: string,
  to: string,
): Promise<AgendaItem[]> => {
  const { data } = await api.get('/curaciones/agenda', {
    params: { from, to },
  });
  return data;
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat(frontend): add Appointment and AgendaItem types + API functions"
```

---

### Task 7: PatientPage — appointment form + scheduled appointments section

**Files:**
- Modify: `frontend/src/pages/PatientPage.tsx`

This task modifies `PatientPage.tsx` to:
1. Add "Agendar Cita" button
2. Add standalone appointment form
3. Add "Citas Agendadas" section
4. Read next appointment from `curacion.appointment` relation instead of direct fields

- [ ] **Step 1: Add imports and state for appointments**

At top of PatientPage, add to imports from api:

```typescript
import { getPatient, createCuracion, updatePatient, deletePatient, getAvailability, createAppointment, deleteAppointment, getPatientAppointments } from '../services/api';
import type { Patient, CuracionType, Appointment } from '../types';
```

Add new state variables after existing ones:

```typescript
const [showAppointmentForm, setShowAppointmentForm] = useState(false);
const [appointments, setAppointments] = useState<Appointment[]>([]);
const [appointmentForm, setAppointmentForm] = useState({ date: '', time: '' });
const [appointmentAvailability, setAppointmentAvailability] = useState<any[]>([]);
const [loadingAppointmentAvailability, setLoadingAppointmentAvailability] = useState(false);
const [savingAppointment, setSavingAppointment] = useState(false);
```

- [ ] **Step 2: Add loadAppointments function and effects**

After `loadPatient`, add:

```typescript
const loadAppointments = async () => {
  if (!id) return;
  try {
    const data = await getPatientAppointments(parseInt(id));
    const today = new Date().toISOString().split('T')[0];
    setAppointments(data.filter(a => a.date >= today));
  } catch {
    setAppointments([]);
  }
};
```

In the existing `useEffect` that calls `loadPatient`, also call `loadAppointments`:

```typescript
useEffect(() => {
  loadPatient();
  loadAppointments();
}, [id]);
```

Add effect for appointment form availability:

```typescript
useEffect(() => {
  const fetchAvailability = async () => {
    if (appointmentForm.date) {
      setLoadingAppointmentAvailability(true);
      try {
        const data = await getAvailability(appointmentForm.date);
        setAppointmentAvailability(data);
      } catch {
        setAppointmentAvailability([]);
      } finally {
        setLoadingAppointmentAvailability(false);
      }
    } else {
      setAppointmentAvailability([]);
    }
  };
  fetchAvailability();
}, [appointmentForm.date]);
```

- [ ] **Step 3: Add handleSaveAppointment and handleDeleteAppointment**

```typescript
const handleSaveAppointment = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!patient || !appointmentForm.date || !appointmentForm.time) return;
  setSavingAppointment(true);
  try {
    await createAppointment(patient.id, appointmentForm.date, appointmentForm.time);
    setShowAppointmentForm(false);
    setAppointmentForm({ date: '', time: '' });
    await loadAppointments();
  } catch {
    alert('Error al agendar la cita');
  } finally {
    setSavingAppointment(false);
  }
};

const handleDeleteAppointment = async (appointmentId: number) => {
  if (!confirm('¿Desea cancelar esta cita?')) return;
  try {
    await deleteAppointment(appointmentId);
    await loadAppointments();
  } catch {
    alert('Error al cancelar la cita');
  }
};
```

- [ ] **Step 4: Update button area — add "Agendar Cita" button**

Replace the existing button div (the one with "+ Nueva Curacion") with:

```tsx
<div className="flex justify-end gap-2">
  <button
    onClick={() => { setShowAppointmentForm(!showAppointmentForm); setShowForm(false); }}
    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
  >
    {showAppointmentForm ? 'Cancelar' : 'Agendar Cita'}
  </button>
  <button
    onClick={() => { setShowForm(!showForm); setShowAppointmentForm(false); }}
    className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
  >
    {showForm ? 'Cancelar' : '+ Nueva Curación'}
  </button>
</div>
```

- [ ] **Step 5: Add standalone appointment form (after button area, before curacion form)**

```tsx
{showAppointmentForm && (
  <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
    <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">Agendar Cita</h3>
    <form onSubmit={handleSaveAppointment} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
          <input type="date" value={appointmentForm.date}
            onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value, time: '' }))}
            required className="form-control w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hora *</label>
          <select value={appointmentForm.time}
            onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))}
            disabled={!appointmentForm.date || loadingAppointmentAvailability}
            required className="form-control w-full disabled:bg-gray-50">
            <option value="">{loadingAppointmentAvailability ? 'Cargando...' : 'Seleccionar hora'}</option>
            {appointmentAvailability.map((slot) => (
              <option key={slot.time} value={slot.time} disabled={!slot.available}>
                {slot.time} {slot.available ? '(Disponible)' : `(Ocupado: ${slot.patient.firstName} ${slot.patient.lastName})`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" disabled={savingAppointment}
        className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {savingAppointment ? 'Agendando...' : 'Agendar Cita'}
      </button>
    </form>
  </div>
)}
```

- [ ] **Step 6: Add "Citas Agendadas" section (before curacion history)**

Insert before the "Historial de Curaciones" div:

```tsx
{appointments.length > 0 && (
  <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
    <h3 className="text-lg font-semibold text-gray-800 mb-4">
      Citas Agendadas
      <span className="ml-2 text-sm font-normal text-gray-500">({appointments.length})</span>
    </h3>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-2 font-medium text-gray-600">Fecha</th>
            <th className="text-left py-3 px-2 font-medium text-gray-600">Hora</th>
            <th className="text-left py-3 px-2 font-medium text-gray-600">Tipo</th>
            <th className="text-right py-3 px-2 font-medium text-gray-600">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((apt) => (
            <tr key={apt.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-2">{apt.date}</td>
              <td className="py-3 px-2 font-medium">{apt.time}</td>
              <td className="py-3 px-2">
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                  apt.curacionId ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'
                }`}>
                  {apt.curacionId ? 'Seguimiento' : 'Cita Agendada'}
                </span>
              </td>
              <td className="py-3 px-2 text-right">
                <button onClick={() => handleDeleteAppointment(apt.id)}
                  className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors">
                  Cancelar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 7: Update curacion history "Próxima Cita" column**

In the curacion history table body, update the "Próxima Cita" cell:

Replace:
```tsx
<td className="py-3 px-2">
  {c.nextAppointmentDate
    ? `${c.nextAppointmentDate} ${c.nextAppointmentTime || ''}`
    : '-'}
</td>
```

With:
```tsx
<td className="py-3 px-2">
  {c.appointment
    ? `${c.appointment.date} ${c.appointment.time}`
    : (c.nextAppointmentDate
      ? `${c.nextAppointmentDate} ${c.nextAppointmentTime || ''}`
      : '-')}
</td>
```

(Fallback to old fields for Phase 1 compatibility)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/PatientPage.tsx
git commit -m "feat(frontend): add standalone appointment form and scheduled appointments section"
```

---

### Task 8: AgendaPage — use new AgendaItem response

**Files:**
- Modify: `frontend/src/pages/AgendaPage.tsx`

- [ ] **Step 1: Update AgendaPage to use AgendaItem type**

Replace imports:
```typescript
import { getAgenda } from '../services/api';
import type { AgendaItem, CuracionType } from '../types';
```

Replace state:
```typescript
const [appointments, setAppointments] = useState<AgendaItem[]>([]);
```

Update `groupByDate`:
```typescript
const groupByDate = () => {
  const groups: Record<string, AgendaItem[]> = {};
  for (const apt of appointments) {
    const key = apt.date;
    if (!groups[key]) groups[key] = [];
    groups[key].push(apt);
  }
  return groups;
};
```

Update the appointment card in the render — replace the time display, name, and badge:

```tsx
<div className="text-lg font-bold text-teal-700 sm:w-16 text-center">
  {apt.time}
</div>
<div className="flex-1">
  <div className="font-medium text-gray-800">
    {apt.patient.firstName} {apt.patient.lastName}
  </div>
  <div className="text-sm text-gray-500">
    RUT: {apt.patient.rut}
  </div>
</div>
<span className={`px-3 py-1 rounded-full text-xs font-medium ${
  apt.source === 'curacion'
    ? 'bg-teal-100 text-teal-700'
    : 'bg-blue-100 text-blue-700'
}`}>
  {apt.source === 'curacion' && apt.curacion
    ? CURACION_LABELS[apt.curacion.type]
    : 'Cita Agendada'}
</span>
```

Update the navigate onClick:
```tsx
onClick={() => navigate(`/paciente/${apt.patient.id}`)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AgendaPage.tsx
git commit -m "feat(frontend): update AgendaPage to use AgendaItem response shape"
```

---

## Chunk 4: Discharge/Readmission (Backend + Frontend)

### Task 9: PatientStatusChange entity + Patient status field

**Files:**
- Create: `backend/src/patients/patient-status-change.entity.ts`
- Modify: `backend/src/patients/patient.entity.ts` (add status + relation)
- Modify: `backend/src/app.module.ts` (register entity)

- [ ] **Step 1: Create PatientStatusChange entity**

```typescript
// backend/src/patients/patient-status-change.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from './patient.entity';
import { User } from '../users/user.entity';

export enum PatientStatus {
  ACTIVE = 'active',
  DISCHARGED = 'discharged',
}

export enum PatientStatusChangeType {
  DISCHARGE = 'discharge',
  READMISSION = 'readmission',
}

@Entity('patient_status_changes')
export class PatientStatusChange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patientId: number;

  @Column({ type: 'varchar' })
  type: PatientStatusChangeType;

  @Column()
  performedById: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Patient, (patient) => patient.statusChanges, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedById' })
  performedBy: User;
}
```

- [ ] **Step 2: Add status field and relation to Patient entity**

In `backend/src/patients/patient.entity.ts`:

```typescript
import { PatientStatusChange, PatientStatus } from './patient-status-change.entity';

// Inside the class, after address:
@Column({ type: 'varchar', default: PatientStatus.ACTIVE })
status: PatientStatus;

// After appointments relation:
@OneToMany(() => PatientStatusChange, (sc) => sc.patient)
statusChanges: PatientStatusChange[];
```

- [ ] **Step 3: Register entity in AppModule**

```typescript
import { PatientStatusChange } from './patients/patient-status-change.entity';
// entities: [..., PatientStatusChange],
```

- [ ] **Step 4: Build and verify**

Run: `cd backend && npx nest build`

- [ ] **Step 5: Commit**

```bash
git add backend/src/patients/patient-status-change.entity.ts backend/src/patients/patient.entity.ts backend/src/app.module.ts
git commit -m "feat: add PatientStatusChange entity and Patient.status field"
```

---

### Task 10: Discharge/readmit endpoints in PatientsService + Controller

**Files:**
- Modify: `backend/src/patients/patients.module.ts` (import AppointmentsModule + TypeOrm for PatientStatusChange)
- Modify: `backend/src/patients/patients.service.ts` (add discharge, readmit, getStatusHistory)
- Modify: `backend/src/patients/patients.controller.ts` (add endpoints)

- [ ] **Step 1: Update PatientsModule**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './patient.entity';
import { PatientStatusChange } from './patient-status-change.entity';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, PatientStatusChange]),
    AppointmentsModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
```

- [ ] **Step 2: Add discharge/readmit/statusHistory methods to PatientsService**

Add imports and inject repositories:

```typescript
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
```

Add methods (at end of class):

```typescript
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
        await this.appointmentsService.deleteFutureByPatient(id);
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
```

- [ ] **Step 3: Add endpoints to PatientsController**

Add imports:
```typescript
import { Request } from 'express';
import { Req } from '@nestjs/common';
```

Add endpoints after existing ones:

```typescript
  @Post(':id/discharge')
  async discharge(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { cancelAppointment?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.patientsService.discharge(id, user.id, body.cancelAppointment || false);
  }

  @Post(':id/readmit')
  async readmit(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.patientsService.readmit(id, user.id);
  }

  @Get(':id/status-history')
  async getStatusHistory(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.getStatusHistory(id);
  }
```

- [ ] **Step 4: Build and verify**

Run: `cd backend && npx nest build`

- [ ] **Step 5: Commit**

```bash
git add backend/src/patients/
git commit -m "feat: add discharge, readmit, and status-history endpoints"
```

---

### Task 11: Frontend — Discharge/Readmission UI

**Files:**
- Modify: `frontend/src/types/index.ts` (add status types)
- Modify: `frontend/src/services/api.ts` (add API functions)
- Modify: `frontend/src/pages/PatientPage.tsx` (badges, buttons, modals, status history)
- Modify: `frontend/src/pages/PatientsListPage.tsx` (status badge)

- [ ] **Step 1: Update types**

In `frontend/src/types/index.ts`, add `status?: string` to Patient interface.

Add new type:
```typescript
export interface PatientStatusChange {
  id: number;
  patientId: number;
  type: 'discharge' | 'readmission';
  performedBy: { id: number; username: string };
  createdAt: string;
}
```

- [ ] **Step 2: Add API functions**

```typescript
export const dischargePatient = async (
  id: number,
  cancelAppointment?: boolean,
): Promise<Patient> => {
  const { data } = await api.post(`/patients/${id}/discharge`, { cancelAppointment });
  return data;
};

export const readmitPatient = async (id: number): Promise<Patient> => {
  const { data } = await api.post(`/patients/${id}/readmit`);
  return data;
};

export const getPatientStatusHistory = async (
  id: number,
): Promise<PatientStatusChange[]> => {
  const { data } = await api.get(`/patients/${id}/status-history`);
  return data;
};
```

- [ ] **Step 3: Update PatientPage — add discharge/readmit state, modals, badge, status history**

This is a large change. Key additions:
- Import `useAuth` from AuthContext.
- Add state: `showDischargeModal`, `statusHistory`, `dischargeCheckbox` in curacion form.
- Add status badge next to RUT pill.
- Replace button area with conditional logic based on `patient.status`.
- Add discharge confirmation modal (with appointment cancellation option).
- Add "Dar de alta" checkbox in curacion form.
- Add "Historial de Altas y Reingresos" section.
- Block "+ Nueva Curacion" and "Agendar Cita" when discharged, show "Reingresar Paciente" instead.

See spec: `docs/superpowers/specs/2026-03-15-patient-discharge-readmission-design.md` for exact UI behavior.

- [ ] **Step 4: Update PatientsListPage — add status badge**

In the table body, after the patient name cell, add a badge:

```tsx
<td className="py-3 px-3">
  {patient.firstName} {patient.lastName}
  {patient.status === 'discharged' && (
    <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
      Alta
    </span>
  )}
</td>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts frontend/src/pages/PatientPage.tsx frontend/src/pages/PatientsListPage.tsx
git commit -m "feat(frontend): add discharge/readmission UI with badges, modals, and status history"
```

---

## Chunk 5: Edit Curacion — Admin Only (Backend + Frontend)

### Task 12: CuracionEdit entity

**Files:**
- Create: `backend/src/curaciones/curacion-edit.entity.ts`
- Modify: `backend/src/curaciones/curacion.entity.ts` (add inverse relation)
- Modify: `backend/src/app.module.ts` (register entity)

- [ ] **Step 1: Create CuracionEdit entity**

```typescript
// backend/src/curaciones/curacion-edit.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Curacion } from './curacion.entity';
import { User } from '../users/user.entity';

@Entity('curacion_edits')
export class CuracionEdit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  curacionId: number;

  @Column()
  editedById: number;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Curacion, (curacion) => curacion.edits, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'editedById' })
  editedBy: User;
}
```

- [ ] **Step 2: Add inverse relation to Curacion entity and register in AppModule**

In `curacion.entity.ts`, add:
```typescript
import { CuracionEdit } from './curacion-edit.entity';

@OneToMany(() => CuracionEdit, (edit) => edit.curacion)
edits: CuracionEdit[];
```

In `app.module.ts`, add `CuracionEdit` to entities array.

- [ ] **Step 3: Build and commit**

```bash
git add backend/src/curaciones/curacion-edit.entity.ts backend/src/curaciones/curacion.entity.ts backend/src/app.module.ts
git commit -m "feat: add CuracionEdit entity for admin audit trail"
```

---

### Task 13: Edit curacion endpoint (admin only)

**Files:**
- Create: `backend/src/curaciones/update-curacion.dto.ts`
- Modify: `backend/src/curaciones/curaciones.module.ts` (register CuracionEdit repo)
- Modify: `backend/src/curaciones/curaciones.service.ts` (add update + getEdits)
- Modify: `backend/src/curaciones/curaciones.controller.ts` (add PUT + GET edits)

- [ ] **Step 1: Create UpdateCuracionDto**

```typescript
// backend/src/curaciones/update-curacion.dto.ts
import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsNotEmpty } from 'class-validator';
import { CuracionType } from './curacion.entity';

export class UpdateCuracionDto {
  @IsEnum(CuracionType)
  @IsOptional()
  type?: CuracionType;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsDateString()
  @IsOptional()
  appointmentDate?: string;

  @IsString()
  @IsOptional()
  appointmentTime?: string;

  @IsString()
  @IsNotEmpty({ message: 'El motivo de la edición es obligatorio' })
  reason: string;
}
```

- [ ] **Step 2: Update CuracionesModule to register CuracionEdit**

```typescript
import { CuracionEdit } from './curacion-edit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Curacion, CuracionEdit]),
    AppointmentsModule,
  ],
  // ...
})
```

- [ ] **Step 3: Add update and getEdits methods to CuracionesService**

```typescript
import { CuracionEdit } from './curacion-edit.entity';
import { UpdateCuracionDto } from './update-curacion.dto';
import { DataSource } from 'typeorm';

// Add to constructor:
@InjectRepository(CuracionEdit)
private readonly editRepo: Repository<CuracionEdit>,
private readonly dataSource: DataSource,

// Add methods:
async update(
  id: number,
  dto: UpdateCuracionDto,
  editedById: number,
): Promise<Curacion> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const curacion = await queryRunner.manager.findOne(Curacion, {
      where: { id },
      relations: ['appointment'],
    });
    if (!curacion) throw new NotFoundException(`Curación con id ${id} no encontrada`);

    if (dto.type !== undefined) curacion.type = dto.type;
    if (dto.quantity !== undefined) curacion.quantity = dto.quantity;
    await queryRunner.manager.save(curacion);

    // Handle appointment changes
    if (dto.appointmentDate && dto.appointmentTime) {
      if (curacion.appointment) {
        await this.appointmentsService.updateLinked(
          curacion.appointment.id,
          dto.appointmentDate,
          dto.appointmentTime,
        );
      } else {
        await this.appointmentsService.createLinked(
          curacion.patientId,
          curacion.id,
          dto.appointmentDate,
          dto.appointmentTime,
        );
      }
    } else if (
      dto.appointmentDate === null &&
      dto.appointmentTime === null &&
      curacion.appointment
    ) {
      await this.appointmentsService.remove(curacion.appointment.id);
    }

    const edit = queryRunner.manager.create(CuracionEdit, {
      curacionId: id,
      editedById,
      reason: dto.reason,
    });
    await queryRunner.manager.save(edit);

    await queryRunner.commitTransaction();
    return this.findOneWithAppointment(id);
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}

async getEdits(curacionId: number): Promise<CuracionEdit[]> {
  return this.editRepo.find({
    where: { curacionId },
    relations: ['editedBy'],
    order: { createdAt: 'DESC' },
  });
}
```

- [ ] **Step 4: Add endpoints to CuracionesController**

```typescript
import { UpdateCuracionDto } from './update-curacion.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Req } from '@nestjs/common';
import { Request } from 'express';

@Put(':id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateCuracionDto,
  @Req() req: Request,
) {
  const user = req.user as { id: number };
  return this.curacionesService.update(id, dto, user.id);
}

@Get(':id/edits')
async getEdits(@Param('id', ParseIntPipe) id: number) {
  return this.curacionesService.getEdits(id);
}
```

- [ ] **Step 5: Build and verify**

Run: `cd backend && npx nest build`

- [ ] **Step 6: Commit**

```bash
git add backend/src/curaciones/
git commit -m "feat: add admin-only curacion edit endpoint with audit trail"
```

---

### Task 14: Frontend — Edit curacion modal (admin only)

**Files:**
- Modify: `frontend/src/types/index.ts` (add CuracionEdit type)
- Modify: `frontend/src/services/api.ts` (add API functions)
- Modify: `frontend/src/pages/PatientPage.tsx` (edit modal, indicators)

- [ ] **Step 1: Add types and API functions**

Types:
```typescript
export interface CuracionEdit {
  id: number;
  curacionId: number;
  editedBy: { id: number; username: string };
  reason: string;
  createdAt: string;
}
```

API:
```typescript
export const updateCuracion = async (
  id: number,
  data: { type?: string; quantity?: number; appointmentDate?: string; appointmentTime?: string; reason: string },
): Promise<Curacion> => {
  const { data: result } = await api.put(`/curaciones/${id}`, data);
  return result;
};

export const getCuracionEdits = async (id: number): Promise<CuracionEdit[]> => {
  const { data } = await api.get(`/curaciones/${id}/edits`);
  return data;
};
```

- [ ] **Step 2: Add edit modal to PatientPage**

Key additions:
- State: `editingCuracion`, `editForm`, `editAvailability`.
- Make type badge clickable for admin users (check `isAdmin` from `useAuth()`).
- Edit modal with: type select, quantity input, appointment date/time, reason textarea (required).
- Pencil icon indicator on edited curaciones (check `curacion.edits?.length > 0`).
- Tooltip on hover showing last edit info.

See spec: `docs/superpowers/specs/2026-03-15-edit-curacion-design.md` for exact UI behavior.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts frontend/src/pages/PatientPage.tsx
git commit -m "feat(frontend): add admin-only curacion edit modal with audit indicators"
```

---

## Chunk 6: Data Migration + Phase 3 Cleanup

### Task 15: Run data migration (Phase 2)

**Files:**
- Create: `backend/scripts/migrate-appointments.sql`

- [ ] **Step 1: Create migration script**

```sql
-- backend/scripts/migrate-appointments.sql
-- Phase 2: Migrate existing appointment data from curaciones to appointments table
-- PREREQUISITES: Phase 1 must be deployed (appointments table exists)

-- Step 1: Pre-check for duplicate slots
SELECT "nextAppointmentDate" as date, "nextAppointmentTime" as time, COUNT(*) as count
FROM curaciones
WHERE "nextAppointmentDate" IS NOT NULL AND "nextAppointmentTime" IS NOT NULL
GROUP BY "nextAppointmentDate", "nextAppointmentTime"
HAVING COUNT(*) > 1;

-- Step 2: If no duplicates found (or after resolving them), run migration:
BEGIN;

INSERT INTO appointments ("patientId", "curacionId", date, time, "createdAt")
SELECT c."patientId", c.id, c."nextAppointmentDate", c."nextAppointmentTime", c."createdAt"
FROM curaciones c
WHERE c."nextAppointmentDate" IS NOT NULL
  AND c."nextAppointmentTime" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM appointments a WHERE a."curacionId" = c.id
  )
ON CONFLICT DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Run pre-check against production DB**

Run Step 1 query to check for duplicates. Resolve manually if any found.

- [ ] **Step 3: Run migration**

Run Step 2 against the production database.

- [ ] **Step 4: Verify data integrity**

```sql
-- Count should match
SELECT COUNT(*) FROM curaciones WHERE "nextAppointmentDate" IS NOT NULL AND "nextAppointmentTime" IS NOT NULL;
SELECT COUNT(*) FROM appointments WHERE "curacionId" IS NOT NULL;
```

- [ ] **Step 5: Commit migration script**

```bash
git add backend/scripts/migrate-appointments.sql
git commit -m "chore: add Phase 2 appointment data migration script"
```

---

### Task 16: Phase 3 — Remove old columns from Curacion entity

**Files:**
- Modify: `backend/src/curaciones/curacion.entity.ts` (remove old fields)
- Modify: `backend/src/curaciones/create-curacion.dto.ts` (remove legacy fields)
- Modify: `backend/src/curaciones/curaciones.service.ts` (remove dual-write)
- Modify: `frontend/src/types/index.ts` (remove old fields from Curacion)
- Modify: `frontend/src/pages/PatientPage.tsx` (remove fallback to old fields)

- [ ] **Step 1: Remove old fields from Curacion entity**

In `backend/src/curaciones/curacion.entity.ts`, remove:
```typescript
@Column({ type: 'date', nullable: true })
nextAppointmentDate: string;

@Column({ type: 'varchar', nullable: true })
nextAppointmentTime: string;
```

- [ ] **Step 2: Remove legacy fields from CreateCuracionDto**

Remove `nextAppointmentDate` and `nextAppointmentTime` from the DTO. Keep only `appointmentDate` and `appointmentTime`.

- [ ] **Step 3: Remove dual-write from CuracionesService.create**

In the `create` method, remove the lines that set `nextAppointmentDate` and `nextAppointmentTime` on the curacion.

- [ ] **Step 4: Remove old fields from frontend Curacion type**

Remove `nextAppointmentDate` and `nextAppointmentTime` from the `Curacion` interface in `types/index.ts`.

- [ ] **Step 5: Remove fallback in PatientPage**

In the curacion history "Próxima Cita" cell, remove the fallback to old fields. Keep only:
```tsx
{c.appointment ? `${c.appointment.date} ${c.appointment.time}` : '-'}
```

- [ ] **Step 6: Build both frontend and backend**

Run: `cd backend && npx nest build`
Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add backend/src/curaciones/ frontend/src/types/index.ts frontend/src/pages/PatientPage.tsx
git commit -m "feat: Phase 3 — remove legacy appointment fields from Curacion entity"
```

**WARNING:** This deploy will cause `synchronize: true` to DROP the old columns. Only deploy after Phase 2 migration is confirmed successful.

---

### Task 17: Run all tests

- [ ] **Step 1: Run backend tests**

Run: `cd backend && npx jest --verbose`
Expected: All tests pass

- [ ] **Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Manual smoke test**

Start backend and frontend locally. Verify:
1. Create a standalone appointment for a patient.
2. Create a curacion with a linked appointment.
3. Verify agenda shows both types.
4. Verify availability blocks occupied slots.
5. Verify second Friday shows AM slots.
6. Discharge a patient (with and without appointment cancellation).
7. Readmit a patient.
8. Edit a curacion as admin (verify reason is required).
9. Verify non-admin cannot see edit button.
10. Verify status badges in patient list.
