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

      this.drawPatientCard(doc, patient);

      // Curaciones
      doc
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(`CURACIONES (${curaciones.length})`, PAGE.margin, doc.y);
      doc.moveDown(0.3);

      if (curaciones.length === 0) {
        doc
          .fillColor(COLORS.textMuted)
          .font('Helvetica-Oblique')
          .fontSize(10)
          .text('Sin curaciones registradas.', PAGE.margin, doc.y, {
            width: PAGE.contentWidth,
            align: 'center',
          });
        doc.fillColor(COLORS.textDark);
        doc.moveDown(1);
      } else {
        const typeLabels: Record<string, string> = {
          avanzada: 'Avanzada',
          pie_diabetico: 'Pie Diabético',
          ulcera_venosa: 'Úlcera Venosa',
        };
        const rows = curaciones.map((c) => [
          new Date(c.date + 'T00:00:00').toLocaleDateString('es-CL'),
          typeLabels[c.type] || c.type,
          String(c.quantity || 1),
          c.observations || '',
        ]);
        this.drawTable(
          doc,
          [
            { header: 'FECHA', width: 70 },
            { header: 'TIPO', width: 130 },
            { header: 'CANT.', width: 50, align: 'center' },
            { header: 'OBSERVACIONES', width: 262 },
          ],
          rows,
        );
      }

      // Citas
      doc
        .fillColor(COLORS.primary)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(`CITAS (${appointments.length})`, PAGE.margin, doc.y);
      doc.moveDown(0.3);

      if (appointments.length === 0) {
        doc
          .fillColor(COLORS.textMuted)
          .font('Helvetica-Oblique')
          .fontSize(10)
          .text('Sin citas registradas.', PAGE.margin, doc.y, {
            width: PAGE.contentWidth,
            align: 'center',
          });
        doc.fillColor(COLORS.textDark);
        doc.moveDown(1);
      } else {
        const rows = appointments.map((a) => [
          new Date(a.date + 'T00:00:00').toLocaleDateString('es-CL'),
          a.time,
        ]);
        this.drawTable(
          doc,
          [
            { header: 'FECHA', width: 256 },
            { header: 'HORA', width: 256, align: 'center' },
          ],
          rows,
        );
      }

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

  private drawPatientCard(doc: PDFKit.PDFDocument, patient: Patient): void {
    const margin = PAGE.margin;
    const cardWidth = PAGE.contentWidth;
    const padding = 12;
    const colWidth = (cardWidth - padding * 2) / 2;

    // Título de sección
    doc
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('DATOS DEL PACIENTE', margin, doc.y);
    doc.moveDown(0.4);

    const cardTopY = doc.y;
    const startX = margin + padding;
    const col2X = startX + colWidth;

    // Reservamos altura provisional; se ajusta al final
    const lineHeight = 16;
    const rows = 4; // 3 filas de 2 columnas + 1 fila completa para dirección
    const cardHeight = padding * 2 + lineHeight * rows;

    // Recuadro
    doc
      .strokeColor(COLORS.border)
      .lineWidth(0.8)
      .rect(margin, cardTopY, cardWidth, cardHeight)
      .stroke();

    const drawField = (
      label: string,
      value: string,
      x: number,
      y: number,
      width: number,
    ) => {
      doc
        .fillColor(COLORS.textMuted)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(label.toUpperCase(), x, y, { width, continued: false });
      doc
        .fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(value, x, y + 8, { width });
    };

    let rowY = cardTopY + padding;
    drawField(
      'Nombre',
      `${patient.firstName} ${patient.lastName}`,
      startX,
      rowY,
      colWidth - 6,
    );
    drawField('RUT', patient.rut, col2X, rowY, colWidth - 6);

    rowY += lineHeight;
    drawField(
      'Fecha de nacimiento',
      new Date(patient.birthDate + 'T00:00:00').toLocaleDateString('es-CL'),
      startX,
      rowY,
      colWidth - 6,
    );
    drawField('Género', patient.gender, col2X, rowY, colWidth - 6);

    rowY += lineHeight;
    drawField(
      'Teléfono',
      patient.phone || 'No registrado',
      startX,
      rowY,
      colWidth - 6,
    );

    // Badge de estado en columna derecha de fila 3
    const isActive = patient.status === 'active';
    const badgeText = isActive ? 'ACTIVO' : 'DADO DE ALTA';
    const badgeColor = isActive ? COLORS.badgeActive : COLORS.badgeInactive;
    doc
      .fillColor(COLORS.textMuted)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('ESTADO', col2X, rowY);
    const badgeY = rowY + 8;
    const badgePaddingX = 8;
    const badgePaddingY = 3;
    doc.font('Helvetica-Bold').fontSize(8);
    const badgeTextWidth = doc.widthOfString(badgeText);
    const badgeWidth = badgeTextWidth + badgePaddingX * 2;
    const badgeHeight = 14;
    doc
      .roundedRect(col2X, badgeY, badgeWidth, badgeHeight, 3)
      .fill(badgeColor);
    doc
      .fillColor('#FFFFFF')
      .text(badgeText, col2X + badgePaddingX, badgeY + badgePaddingY);

    // Dirección en fila completa
    rowY += lineHeight;
    drawField(
      'Dirección',
      patient.address || 'No registrada',
      startX,
      rowY,
      cardWidth - padding * 2,
    );

    // Mover cursor debajo del card
    doc.fillColor(COLORS.textDark);
    doc.x = margin;
    doc.y = cardTopY + cardHeight + 16;
  }

  private drawTable(
    doc: PDFKit.PDFDocument,
    columns: { header: string; width: number; align?: 'left' | 'center' | 'right' }[],
    rows: string[][],
  ): void {
    const margin = PAGE.margin;
    const cellPadX = 6;
    const cellPadY = 5;
    const headerHeight = 22;
    const minRowHeight = 20;

    const drawHeaderRow = (yPos: number) => {
      // Fondo teal del header
      doc
        .rect(margin, yPos, PAGE.contentWidth, headerHeight)
        .fill(COLORS.primary);
      let x = margin;
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
      for (const col of columns) {
        doc.text(col.header, x + cellPadX, yPos + cellPadY, {
          width: col.width - cellPadX * 2,
          align: col.align ?? 'left',
        });
        x += col.width;
      }
    };

    let y = doc.y;
    drawHeaderRow(y);
    y += headerHeight;

    rows.forEach((row, idx) => {
      // Calcular altura de la fila según el contenido más largo
      doc.font('Helvetica').fontSize(9);
      let rowHeight = minRowHeight;
      row.forEach((cell, i) => {
        const colWidth = columns[i].width - cellPadX * 2;
        const h = doc.heightOfString(cell || '—', { width: colWidth });
        if (h + cellPadY * 2 > rowHeight) {
          rowHeight = h + cellPadY * 2;
        }
      });

      // Saltar de página si no entra
      if (y + rowHeight > PAGE.height - PAGE.margin - 30) {
        doc.addPage();
        y = doc.y;
        drawHeaderRow(y);
        y += headerHeight;
      }

      // Fondo alternado
      if (idx % 2 === 1) {
        doc
          .rect(margin, y, PAGE.contentWidth, rowHeight)
          .fill(COLORS.rowAlt);
      }

      // Texto de la fila
      let x = margin;
      doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9);
      for (let i = 0; i < row.length; i++) {
        const col = columns[i];
        doc.text(row[i] || '—', x + cellPadX, y + cellPadY, {
          width: col.width - cellPadX * 2,
          align: col.align ?? 'left',
        });
        x += col.width;
      }

      // Línea inferior fina
      doc
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .moveTo(margin, y + rowHeight)
        .lineTo(margin + PAGE.contentWidth, y + rowHeight)
        .stroke();

      y += rowHeight;
    });

    doc.fillColor(COLORS.textDark);
    doc.x = margin;
    doc.y = y + 10;
  }
}
