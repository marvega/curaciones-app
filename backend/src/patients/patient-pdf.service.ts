import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  TCreatedPdf,
  TDocumentDefinitions,
  TFontDictionary,
} from 'pdfmake/interfaces';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import type { EncryptedField } from '../kms/encrypted-field';
import { getCurrentOrgId } from '../common/org-context';

interface PdfMakeServer {
  setFonts(fonts: TFontDictionary): void;
  setUrlAccessPolicy?(cb: (url: string) => boolean): void;
  createPdf(docDef: TDocumentDefinitions): TCreatedPdf;
}

// pdfmake's CJS entry exports a class instance; @types declares only named
// exports, which `import *` cannot bind to prototype methods correctly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as PdfMakeServer;
import { Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import {
  PatientStatusChange,
  PatientStatus,
  PatientStatusChangeType,
} from './patient-status-change.entity';
import {
  buildFichaDocDef,
  FichaData,
  FichaCuracion,
  FichaCita,
  FichaHistorial,
} from './patient-pdf.template';

const CURACION_TYPE_LABELS: Record<string, string> = {
  avanzada: 'Avanzada',
  pie_diabetico: 'Pie Diabético',
  ulcera_venosa: 'Úlcera Venosa',
};

const STATUS_LABELS: Record<PatientStatus, string> = {
  [PatientStatus.ACTIVE]: 'EN TRATAMIENTO',
  [PatientStatus.DISCHARGED]: 'DADO DE ALTA',
};

const STATUS_CHANGE_LABELS: Record<PatientStatusChangeType, string> = {
  [PatientStatusChangeType.DISCHARGE]: 'Alta del programa de curaciones',
  [PatientStatusChangeType.READMISSION]: 'Reingreso al programa',
};

const FONTS: TFontDictionary = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

pdfmake.setFonts(FONTS);
// Block external URL fetches; templates only use built-in fonts and no images.
pdfmake.setUrlAccessPolicy?.(() => false);

const formatDateCL = (isoDate: string): string => {
  const d = new Date(isoDate + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const formatDateTimeCL = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};

const computeAge = (birthDateIso: string): string => {
  const birth = new Date(birthDateIso + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return `${age} ${age === 1 ? 'año' : 'años'}`;
};

const formatFolio = (patientId: number): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${patientId}-${yyyy}-${mm}-${dd}`;
};

@Injectable()
export class PatientPdfService {
  constructor(
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    @InjectRepository(Curacion)
    private curacionRepo: Repository<Curacion>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(PatientStatusChange)
    private statusChangeRepo: Repository<PatientStatusChange>,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) {
      throw new Error('No organization context — cannot decrypt patient PII');
    }
    return orgId;
  }

  async generatePdf(patientId: number): Promise<Buffer> {
    const patient = await this.patientRepo.findOne({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const [curaciones, appointments, statusChanges] = await Promise.all([
      this.curacionRepo.find({
        where: { patientId },
        order: { date: 'DESC' },
      }),
      this.appointmentRepo.find({
        where: { patientId },
        order: { date: 'DESC', time: 'DESC' },
      }),
      this.statusChangeRepo.find({
        where: { patientId },
        relations: ['performedBy'],
        order: { createdAt: 'DESC' },
      }),
    ]);

    const data = await this.buildFichaData(
      patient,
      curaciones,
      appointments,
      statusChanges,
    );
    return this.renderPdf(buildFichaDocDef(data));
  }

  private async buildFichaData(
    patient: Patient,
    curaciones: Curacion[],
    appointments: Appointment[],
    statusChanges: PatientStatusChange[],
  ): Promise<FichaData> {
    const orgId = this.requireOrgId();

    // Decrypt patient PII fields.
    const rutPlain = await this.kms.decrypt(
      patient.rut as EncryptedField,
      `Patient.rut:${patient.id}`,
      orgId,
    );
    const phonePlain = patient.phone
      ? await this.kms.decrypt(
          patient.phone as EncryptedField,
          `Patient.phone:${patient.id}`,
          orgId,
        )
      : null;
    const addressPlain = patient.address
      ? await this.kms.decrypt(
          patient.address as EncryptedField,
          `Patient.address:${patient.id}`,
          orgId,
        )
      : null;

    // Decrypt observations on each curación in parallel.
    const fichaCuraciones: FichaCuracion[] = await Promise.all(
      curaciones.map(async (c) => {
        const obs = c.observations
          ? await this.kms.decrypt(
              c.observations as EncryptedField,
              `Curacion.observations:${c.id}`,
              orgId,
            )
          : '';
        return {
          fecha: formatDateCL(c.date),
          tipo: CURACION_TYPE_LABELS[c.type] ?? c.type,
          cantidad: c.quantity || 1,
          obs,
        };
      }),
    );

    const fichaCitas: FichaCita[] = appointments.map((a) => ({
      fecha: formatDateCL(a.date),
      hora: a.time,
    }));

    const fichaHistorial: FichaHistorial[] = statusChanges.map((sc) => ({
      fecha: formatDateTimeCL(sc.createdAt).split(' ')[0],
      evento: STATUS_CHANGE_LABELS[sc.type] ?? sc.type,
      por: sc.performedBy?.username ?? 'Sistema',
    }));

    return {
      folio: formatFolio(patient.id),
      generado: formatDateTimeCL(new Date()),
      nombre: `${patient.firstName} ${patient.lastName}`,
      rut: rutPlain,
      nacimiento: formatDateCL(patient.birthDate),
      edad: computeAge(patient.birthDate),
      genero: patient.gender,
      telefono: phonePlain || 'No registrado',
      direccion: addressPlain || 'No registrada',
      estado: STATUS_LABELS[patient.status] ?? patient.status,
      curaciones: fichaCuraciones,
      citas: fichaCitas,
      historial: fichaHistorial,
    };
  }

  private renderPdf(docDef: TDocumentDefinitions): Promise<Buffer> {
    return pdfmake.createPdf(docDef).getBuffer();
  }
}
