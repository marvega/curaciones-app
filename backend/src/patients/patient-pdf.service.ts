import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { Patient } from './patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientStatusChange } from './patient-status-change.entity';

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

    const curaciones = await this.curacionRepo.find({
      where: { patientId },
      order: { date: 'DESC' },
    });

    const appointments = await this.appointmentRepo.find({
      where: { patientId },
      order: { date: 'DESC', time: 'DESC' },
    });

    const statusChanges = await this.statusChangeRepo.find({
      where: { patientId },
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('Ficha Clínica', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(
          `Generado: ${new Date().toLocaleDateString('es-CL')}`,
          { align: 'center' },
        );
      doc.moveDown(1);

      // Patient info
      doc.fontSize(14).font('Helvetica-Bold').text('Datos del Paciente');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');

      const info: [string, string][] = [
        ['Nombre', `${patient.firstName} ${patient.lastName}`],
        ['RUT', patient.rut],
        [
          'Fecha de Nacimiento',
          new Date(patient.birthDate + 'T00:00:00').toLocaleDateString('es-CL'),
        ],
        ['Género', patient.gender],
        ['Teléfono', patient.phone || 'No registrado'],
        ['Dirección', patient.address || 'No registrada'],
        [
          'Estado',
          patient.status === 'active' ? 'Activo' : 'Dado de Alta',
        ],
      ];

      for (const [label, value] of info) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value);
      }
      doc.moveDown(1);

      // Curaciones
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`Curaciones (${curaciones.length})`);
      doc.moveDown(0.3);
      if (curaciones.length === 0) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .text('Sin curaciones registradas.');
      } else {
        const typeLabels: Record<string, string> = {
          avanzada: 'Avanzada',
          pie_diabetico: 'Pie Diabético',
          ulcera_venosa: 'Úlcera Venosa',
        };
        for (const c of curaciones) {
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(
              `${new Date(c.date + 'T00:00:00').toLocaleDateString('es-CL')} — ${typeLabels[c.type] || c.type}`,
            );
          if (c.observations) {
            doc
              .font('Helvetica')
              .text(`  Observaciones: ${c.observations}`);
          }
          doc.font('Helvetica').text(`  Cantidad: ${c.quantity || 1}`);
          doc.moveDown(0.2);
        }
      }
      doc.moveDown(0.5);

      // Appointments
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`Citas (${appointments.length})`);
      doc.moveDown(0.3);
      if (appointments.length === 0) {
        doc.fontSize(10).font('Helvetica').text('Sin citas registradas.');
      } else {
        for (const a of appointments) {
          doc
            .fontSize(10)
            .font('Helvetica')
            .text(
              `${new Date(a.date + 'T00:00:00').toLocaleDateString('es-CL')} a las ${a.time}`,
            );
        }
      }
      doc.moveDown(0.5);

      // Status changes
      if (statusChanges.length > 0) {
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Historial de Estado');
        doc.moveDown(0.3);
        const typeLabelsStatus: Record<string, string> = {
          discharge: 'Alta',
          readmission: 'Reingreso',
        };
        for (const sc of statusChanges) {
          doc
            .fontSize(10)
            .font('Helvetica')
            .text(
              `${new Date(sc.createdAt).toLocaleDateString('es-CL')} — ${typeLabelsStatus[sc.type] || sc.type} (por ${sc.performedBy?.username || 'Sistema'})`,
            );
        }
      }

      doc.end();
    });
  }
}
