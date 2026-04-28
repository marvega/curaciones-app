import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
  renderFichaHtml,
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
  ) {}

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

    const data = this.buildFichaData(
      patient,
      curaciones,
      appointments,
      statusChanges,
    );
    const html = renderFichaHtml(data);
    return this.htmlToPdfBuffer(html);
  }

  private buildFichaData(
    patient: Patient,
    curaciones: Curacion[],
    appointments: Appointment[],
    statusChanges: PatientStatusChange[],
  ): FichaData {
    const fichaCuraciones: FichaCuracion[] = curaciones.map((c) => ({
      fecha: formatDateCL(c.date),
      tipo: CURACION_TYPE_LABELS[c.type] ?? c.type,
      cantidad: c.quantity || 1,
      obs: c.observations ?? '',
    }));

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
      rut: patient.rut,
      nacimiento: formatDateCL(patient.birthDate),
      edad: computeAge(patient.birthDate),
      genero: patient.gender,
      telefono: patient.phone || 'No registrado',
      direccion: patient.address || 'No registrada',
      estado: STATUS_LABELS[patient.status] ?? patient.status,
      curaciones: fichaCuraciones,
      citas: fichaCitas,
      historial: fichaHistorial,
    };
  }

  private async htmlToPdfBuffer(html: string): Promise<Buffer> {
    const browser = await this.launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        preferCSSPageSize: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private async launchBrowser() {
    const { default: puppeteer } = await import('puppeteer-core');
    if (process.platform === 'linux') {
      const { default: chromium } = await import('@sparticuz/chromium');
      return puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }
    return puppeteer.launch({
      headless: true,
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
}
