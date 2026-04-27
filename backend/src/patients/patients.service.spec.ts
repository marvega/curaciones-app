import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { Patient } from './patient.entity';
import { PatientStatusChange, PatientStatus, PatientStatusChangeType } from './patient-status-change.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { DataSource } from 'typeorm';

describe('PatientsService', () => {
  let service: PatientsService;

  const mockPatientRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    remove: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockStatusChangeRepo = {
    find: jest.fn(),
  };

  const mockAppointmentsService = {
    deleteFutureByPatient: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn().mockImplementation((_entity, data) => data),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: getRepositoryToken(Patient), useValue: mockPatientRepo },
        { provide: getRepositoryToken(PatientStatusChange), useValue: mockStatusChangeRepo },
        { provide: AppointmentsService, useValue: mockAppointmentsService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(PatientsService);
    jest.clearAllMocks();

    // Reset mockQueryRunner mocks
    mockQueryRunner.connect.mockReset();
    mockQueryRunner.startTransaction.mockReset();
    mockQueryRunner.commitTransaction.mockReset();
    mockQueryRunner.rollbackTransaction.mockReset();
    mockQueryRunner.release.mockReset();
    mockQueryRunner.manager.findOne.mockReset();
    mockQueryRunner.manager.save.mockReset();
    mockQueryRunner.manager.create.mockReset().mockImplementation((_entity, data) => data);
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
  });

  const samplePatient: Patient = {
    id: 1,
    rut: '11111111-1',
    firstName: 'Ana',
    lastName: 'González',
    birthDate: '1985-03-15',
    gender: 'Femenino',
    phone: '+56912345678',
    address: 'Av. Principal 123',
    status: PatientStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    curaciones: [],
    appointments: [],
    statusChanges: [],
  };

  // 1. findByRut — returns patient with curaciones
  it('findByRut returns patient with curaciones', async () => {
    mockPatientRepo.findOne.mockResolvedValue(samplePatient);

    const result = await service.findByRut('11111111-1');

    expect(result).toEqual(samplePatient);
    expect(mockPatientRepo.findOne).toHaveBeenCalledWith({
      where: { rut: '11111111-1' },
      relations: ['curaciones'],
    });
  });

  // 2. findById — returns patient when found
  it('findById returns patient when found', async () => {
    mockPatientRepo.findOne.mockResolvedValue(samplePatient);

    const result = await service.findById(1);

    expect(result).toEqual(samplePatient);
    expect(mockPatientRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['curaciones'],
    });
  });

  // 3. findById — throws NotFoundException when not found
  it('findById throws NotFoundException when not found', async () => {
    mockPatientRepo.findOne.mockResolvedValue(null);

    await expect(service.findById(999)).rejects.toThrow(NotFoundException);
  });

  // 4. create — creates with valid data
  it('create creates patient with valid data', async () => {
    const dto = {
      rut: '99999999-9',
      firstName: 'Test',
      lastName: 'Patient',
      birthDate: '1990-01-01',
      gender: 'Masculino',
      phone: '+56900000000',
      address: 'Test 123',
    };
    mockPatientRepo.findOne.mockResolvedValue(null); // no existing
    mockPatientRepo.create.mockReturnValue(dto);
    mockPatientRepo.save.mockResolvedValue({ id: 2, ...dto });

    const result = await service.create(dto);

    expect(result.id).toBe(2);
    expect(mockPatientRepo.create).toHaveBeenCalledWith(dto);
    expect(mockPatientRepo.save).toHaveBeenCalled();
  });

  // 5. create — throws ConflictException when RUT exists
  it('create throws ConflictException when RUT already exists', async () => {
    mockPatientRepo.findOne.mockResolvedValue(samplePatient);

    await expect(
      service.create({
        rut: '11111111-1',
        firstName: 'Dup',
        lastName: 'Dup',
        birthDate: '1990-01-01',
        gender: 'Masculino',
      }),
    ).rejects.toThrow(ConflictException);
  });

  // 6. update — updates and returns patient
  it('update updates and returns patient', async () => {
    mockPatientRepo.findOne.mockResolvedValue({ ...samplePatient });
    mockPatientRepo.save.mockResolvedValue({
      ...samplePatient,
      phone: '+56900000000',
    });

    const result = await service.update(1, { phone: '+56900000000' });

    expect(result.phone).toBe('+56900000000');
    expect(mockPatientRepo.save).toHaveBeenCalled();
  });

  // 7. remove — removes existing patient
  it('remove removes existing patient', async () => {
    mockPatientRepo.findOne.mockResolvedValue(samplePatient);

    await service.remove(1);

    expect(mockPatientRepo.remove).toHaveBeenCalledWith(samplePatient);
  });

  // 8. findPaginated — returns paginated results with correct shape
  it('findPaginated returns paginated results with correct shape', async () => {
    const patients = [samplePatient];
    mockPatientRepo.findAndCount.mockResolvedValue([patients, 1]);

    const result = await service.findPaginated(1, 20);

    expect(result).toEqual({
      data: patients,
      total: 1,
      page: 1,
      totalPages: 1,
    });
    expect(mockPatientRepo.findAndCount).toHaveBeenCalledWith({
      order: { lastName: 'ASC', firstName: 'ASC' },
      skip: 0,
      take: 20,
    });
  });

  // 9. findPaginated — calculates totalPages correctly (45 items, 20/page = 3 pages)
  it('findPaginated calculates totalPages correctly', async () => {
    mockPatientRepo.findAndCount.mockResolvedValue([[], 45]);

    const result = await service.findPaginated(1, 20);

    expect(result.totalPages).toBe(3);
    expect(result.total).toBe(45);
  });

  // 10. discharge — discharges active patient in transaction, commits
  it('discharge discharges active patient in transaction and commits', async () => {
    const activePatient = { ...samplePatient, status: PatientStatus.ACTIVE };
    mockQueryRunner.manager.findOne.mockResolvedValue(activePatient);
    mockQueryRunner.manager.save.mockResolvedValue(activePatient);
    // findById call after commit
    mockPatientRepo.findOne.mockResolvedValue({
      ...samplePatient,
      status: PatientStatus.DISCHARGED,
    });

    const result = await service.discharge(1, 10, false);

    expect(mockQueryRunner.connect).toHaveBeenCalled();
    expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
    expect(result.status).toBe(PatientStatus.DISCHARGED);
  });

  // 11. discharge — cancels future appointments when flag is true
  it('discharge cancels future appointments when cancelAppointment is true', async () => {
    const activePatient = { ...samplePatient, status: PatientStatus.ACTIVE };
    mockQueryRunner.manager.findOne.mockResolvedValue(activePatient);
    mockQueryRunner.manager.save.mockResolvedValue(activePatient);
    mockPatientRepo.findOne.mockResolvedValue({
      ...samplePatient,
      status: PatientStatus.DISCHARGED,
    });

    await service.discharge(1, 10, true);

    expect(mockAppointmentsService.deleteFutureByPatient).toHaveBeenCalledWith(
      1,
      mockQueryRunner.manager,
    );
  });

  // 12. discharge — throws BadRequestException if already discharged, rollbacks
  it('discharge throws BadRequestException if already discharged and rollbacks', async () => {
    const dischargedPatient = { ...samplePatient, status: PatientStatus.DISCHARGED };
    mockQueryRunner.manager.findOne.mockResolvedValue(dischargedPatient);

    await expect(service.discharge(1, 10, false)).rejects.toThrow(BadRequestException);
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  // 13. readmit — readmits discharged patient, commits
  it('readmit readmits discharged patient and commits', async () => {
    const dischargedPatient = { ...samplePatient, status: PatientStatus.DISCHARGED };
    mockQueryRunner.manager.findOne.mockResolvedValue(dischargedPatient);
    mockQueryRunner.manager.save.mockResolvedValue(dischargedPatient);
    mockPatientRepo.findOne.mockResolvedValue({
      ...samplePatient,
      status: PatientStatus.ACTIVE,
    });

    const result = await service.readmit(1, 10);

    expect(mockQueryRunner.connect).toHaveBeenCalled();
    expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
    expect(result.status).toBe(PatientStatus.ACTIVE);
  });

  // 14. readmit — throws BadRequestException if already active
  it('readmit throws BadRequestException if patient is already active', async () => {
    const activePatient = { ...samplePatient, status: PatientStatus.ACTIVE };
    mockQueryRunner.manager.findOne.mockResolvedValue(activePatient);

    await expect(service.readmit(1, 10)).rejects.toThrow(BadRequestException);
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  // 15. getStatusHistory — returns with correct find options
  it('getStatusHistory returns with correct find options', async () => {
    const changes = [{ id: 1, patientId: 1, type: PatientStatusChangeType.DISCHARGE }];
    mockStatusChangeRepo.find.mockResolvedValue(changes);

    const result = await service.getStatusHistory(1);

    expect(result).toEqual(changes);
    expect(mockStatusChangeRepo.find).toHaveBeenCalledWith({
      where: { patientId: 1 },
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
    });
  });
});
