import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientStatusChange } from './patient-status-change.entity';
import { INSTITUTIONAL_INFO, COLORS, PAGE } from './pdf-constants';

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
    const { default: PDFDocument } = await import('pdfkit');

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
      const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawHeader(doc);

      // Título y folio
      const folio = this.formatFolio(patientId);
      const generadoTxt = `Generado: ${new Date().toLocaleDateString('es-CL')} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;

      doc
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('FICHA CLÍNICA', PAGE.margin, doc.y);

      doc.moveDown(0.2);
      const folioY = doc.y;
      doc
        .fillColor(COLORS.textMuted)
        .font('Helvetica')
        .fontSize(9)
        .text(`Folio: ${folio}`, PAGE.margin, folioY, {
          width: PAGE.contentWidth / 2,
          align: 'left',
        });
      doc.text(generadoTxt, PAGE.margin + PAGE.contentWidth / 2, folioY, {
        width: PAGE.contentWidth / 2,
        align: 'right',
      });

      doc.moveDown(0.5);
      doc
        .strokeColor(COLORS.primary)
        .lineWidth(0.5)
        .moveTo(PAGE.margin, doc.y)
        .lineTo(PAGE.margin + PAGE.contentWidth, doc.y)
        .stroke();
      doc.moveDown(0.8);
      doc.fillColor(COLORS.textDark);

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

  private formatFolio(patientId: number): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${patientId}-${yyyy}-${mm}-${dd}`;
  }

  private drawHeader(doc: PDFKit.PDFDocument): void {
    const bannerHeight = 60;
    const margin = PAGE.margin;

    // Franja teal de ancho completo
    doc.save();
    doc.rect(0, 0, PAGE.width, bannerHeight).fill(COLORS.primary);
    doc.restore();

    // Nombre del CESFAM
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(INSTITUTIONAL_INFO.name, margin, 16, {
        width: PAGE.contentWidth,
        align: 'left',
      });

    // Dependencia + dirección en una línea
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica')
      .fontSize(10)
      .text(
        `${INSTITUTIONAL_INFO.dependency} · ${INSTITUTIONAL_INFO.address}`,
        margin,
        42,
        { width: PAGE.contentWidth, align: 'left' },
      );

    // Reset cursor debajo del banner con espaciado
    doc.fillColor(COLORS.textDark);
    doc.y = bannerHeight + 16;
    doc.x = margin;
  }
}
