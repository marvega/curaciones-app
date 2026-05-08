# PDF Ficha Clínica Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar visualmente el PDF de la ficha clínica con estilo institucional (header con franja teal, tablas reales, badge de estado, pie con folio y paginación), manteniendo `pdfkit` y sin cambios al modelo de datos ni al endpoint.

**Architecture:** Refactor del único archivo `backend/src/patients/patient-pdf.service.ts` introduciendo helpers privados (`drawHeader`, `drawPatientCard`, `drawTable`, `drawFooter`, `formatFolio`). Constantes institucionales y paleta extraídas a un archivo nuevo `backend/src/patients/pdf-constants.ts`. Cero cambios en frontend, controller, módulo, schema o dependencias.

**Tech Stack:** NestJS, TypeScript, pdfkit (ya instalado en `backend/package.json` v0.18.0), tamaño página LETTER.

**Spec:** `docs/superpowers/specs/2026-04-27-pdf-ficha-clinica-redesign-design.md`

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `backend/src/patients/pdf-constants.ts` | **Crear** | Constantes institucionales (`INSTITUTIONAL_INFO`) y paleta (`COLORS`) |
| `backend/src/patients/patient-pdf.service.ts` | **Modificar** | Refactor del método `generatePdf` con helpers privados |

---

## Task 1: Crear branch y archivo de constantes

**Files:**
- Create: `backend/src/patients/pdf-constants.ts`

- [ ] **Step 1: Crear branch desde main**

```bash
git checkout main
git pull origin main
git checkout -b feat/pdf-ficha-clinica-redesign
```

- [ ] **Step 2: Crear archivo de constantes**

Crear `backend/src/patients/pdf-constants.ts` con el siguiente contenido completo:

```ts
export const INSTITUTIONAL_INFO = {
  name: 'CESFAM POMPEYA',
  dependency: 'Servicio de Salud Viña del Mar–Quillota–Petorca',
  address: 'Frodden 1721, Quilpué',
};

export const COLORS = {
  primary: '#00897B',
  primaryDark: '#00695C',
  textDark: '#212121',
  textMuted: '#616161',
  rowAlt: '#F5F7F8',
  border: '#CFD8DC',
  badgeActive: '#43A047',
  badgeInactive: '#757575',
};

export const PAGE = {
  size: 'LETTER' as const,
  margin: 50,
  width: 612,
  height: 792,
  contentWidth: 512,
};
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/patients/pdf-constants.ts
git commit -m "feat(backend): add institutional PDF constants and color palette"
```

---

## Task 2: Cambiar tamaño de página a LETTER y agregar formatFolio

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Importar constantes y cambiar tamaño de página**

En `backend/src/patients/patient-pdf.service.ts`:

Reemplazar el bloque de imports (líneas 1-7) por:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientStatusChange } from './patient-status-change.entity';
import { INSTITUTIONAL_INFO, COLORS, PAGE } from './pdf-constants';
```

Reemplazar línea 47 (`const doc = new PDFDocument({ size: 'A4', margin: 50 });`) por:

```ts
const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin });
```

- [ ] **Step 2: Agregar método privado formatFolio**

Antes del cierre de la clase (antes del último `}`), agregar:

```ts
  private formatFolio(patientId: number): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${patientId}-${yyyy}-${mm}-${dd}`;
  }
```

- [ ] **Step 3: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): switch PDF to LETTER size and add folio helper"
```

---

## Task 3: Implementar drawHeader (franja institucional)

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Agregar método privado drawHeader**

Después de `formatFolio` (dentro de la clase), agregar:

```ts
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
```

- [ ] **Step 2: Reemplazar el bloque de título original**

Localizar líneas que contienen el título actual:

```ts
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
```

Reemplazar todo ese bloque por:

```ts
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
```

- [ ] **Step 3: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Smoke test rápido del PDF**

Iniciar el backend y descargar un PDF para verificar que el header se renderiza:

```bash
cd backend && npm run start:dev
```

En otra terminal o desde el frontend, descargar un PDF de paciente y abrirlo. **Verificar visualmente:** franja teal arriba con nombre del CESFAM en blanco, dependencia y dirección debajo, título "FICHA CLÍNICA" en teal, folio y "Generado:" en una línea.

- [ ] **Step 5: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): add institutional header with teal banner to patient PDF"
```

---

## Task 4: Implementar drawPatientCard con badge de estado

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Agregar método drawPatientCard**

Después de `drawHeader`, agregar:

```ts
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
```

- [ ] **Step 2: Reemplazar la sección "Patient info" original**

Localizar el bloque que comienza con `// Patient info` y termina justo antes de `// Curaciones` (aprox. líneas 68-93 del archivo original). Reemplazarlo por:

```ts
      this.drawPatientCard(doc, patient);
```

- [ ] **Step 3: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Smoke test visual**

Reiniciar `npm run start:dev`, descargar PDF de un paciente activo y otro dado de alta. **Verificar:** recuadro con borde gris claro, datos en grilla de 2 columnas, badge verde "ACTIVO" o gris "DADO DE ALTA" según corresponda, dirección en la fila inferior ocupando todo el ancho.

- [ ] **Step 5: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): add patient data card with status badge"
```

---

## Task 5: Implementar drawTable genérico

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Agregar tipos y método drawTable**

Después del método `drawPatientCard`, agregar:

```ts
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
```

- [ ] **Step 2: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): add generic table renderer for PDF"
```

---

## Task 6: Aplicar drawTable a curaciones

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Reemplazar la sección Curaciones**

Localizar el bloque que comienza con `// Curaciones` y termina justo antes de `// Appointments` (aprox. líneas 95-128 del archivo original tras los cambios anteriores). Reemplazarlo por:

```ts
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
```

- [ ] **Step 2: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 3: Smoke test visual**

Descargar PDF de un paciente con varias curaciones, uno con observaciones largas, uno sin curaciones. **Verificar:** tabla con header teal blanco, columnas Fecha/Tipo/Cant./Observaciones, filas alternadas, observaciones largas hacen wrap, paciente sin curaciones muestra texto centrado en cursiva.

- [ ] **Step 4: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): render curaciones as styled table in PDF"
```

---

## Task 7: Aplicar drawTable a citas

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Reemplazar la sección Appointments**

Localizar el bloque que comienza con `// Appointments` y termina justo antes de `// Status changes`. Reemplazarlo por:

```ts
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
```

- [ ] **Step 2: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 3: Smoke test visual**

Descargar PDF y verificar que las citas se muestran como tabla de 2 columnas (Fecha, Hora) con la misma estética que la tabla de curaciones.

- [ ] **Step 4: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): render appointments as styled table in PDF"
```

---

## Task 8: Estilizar sección Historial de Estado

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Reemplazar la sección Status changes**

Localizar el bloque que comienza con `// Status changes` y termina justo antes de `doc.end();`. Reemplazarlo por:

```ts
      // Historial de Estado
      if (statusChanges.length > 0) {
        doc
          .fillColor(COLORS.primary)
          .font('Helvetica-Bold')
          .fontSize(12)
          .text('HISTORIAL DE ESTADO', PAGE.margin, doc.y);
        doc.moveDown(0.3);

        const typeLabelsStatus: Record<string, string> = {
          discharge: 'Alta',
          readmission: 'Reingreso',
        };
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10);
        for (const sc of statusChanges) {
          const fecha = new Date(sc.createdAt).toLocaleDateString('es-CL');
          const tipo = typeLabelsStatus[sc.type] || sc.type;
          const usuario = sc.performedBy?.username || 'Sistema';
          doc.text(`• ${fecha} — ${tipo} (por ${usuario})`, PAGE.margin, doc.y, {
            width: PAGE.contentWidth,
          });
        }
      }
```

- [ ] **Step 2: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): align status history styling with rest of PDF"
```

---

## Task 9: Implementar drawFooter con paginación

**Files:**
- Modify: `backend/src/patients/patient-pdf.service.ts`

- [ ] **Step 1: Agregar método drawFooter**

Después del método `drawTable`, agregar:

```ts
  private drawFooter(doc: PDFKit.PDFDocument, pageNumber: number): void {
    const margin = PAGE.margin;
    const footerY = PAGE.height - margin + 6;

    doc.save();
    doc
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .moveTo(margin, footerY - 4)
      .lineTo(margin + PAGE.contentWidth, footerY - 4)
      .stroke();

    doc
      .fillColor(COLORS.textMuted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `${INSTITUTIONAL_INFO.name} · ${INSTITUTIONAL_INFO.address}`,
        margin,
        footerY,
        { width: PAGE.contentWidth / 2, align: 'left', lineBreak: false },
      );

    doc.text(`Pág. ${pageNumber}`, margin + PAGE.contentWidth / 2, footerY, {
      width: PAGE.contentWidth / 2,
      align: 'right',
      lineBreak: false,
    });
    doc.restore();
  }
```

- [ ] **Step 2: Registrar handler pageAdded en generatePdf**

Localizar el bloque dentro de la `Promise` donde se crea el `doc`:

```ts
      const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
```

Justo después de `doc.on('error', reject);`, agregar:

```ts
      let pageNumber = 1;
      this.drawFooter(doc, pageNumber);
      doc.on('pageAdded', () => {
        pageNumber += 1;
        this.drawFooter(doc, pageNumber);
        // Reset cursor para que el contenido empiece bajo los márgenes
        doc.x = PAGE.margin;
        doc.y = PAGE.margin;
      });
```

- [ ] **Step 3: Verificar build**

```bash
cd backend && npm run build
```

Expected: build exitoso.

- [ ] **Step 4: Smoke test visual**

Descargar un PDF de un paciente con muchas curaciones (forzar paginación). **Verificar:** cada página tiene el footer con datos institucionales y "Pág. X" alineado a la derecha. La línea separadora aparece bajo el contenido.

- [ ] **Step 5: Commit**

```bash
git add backend/src/patients/patient-pdf.service.ts
git commit -m "feat(backend): add institutional footer with page numbering"
```

---

## Task 10: Verificación de build y lint

**Files:** ninguno

- [ ] **Step 1: Build limpio**

```bash
cd backend && npm run build
```

Expected: sin errores ni warnings nuevos.

- [ ] **Step 2: Lint**

```bash
cd backend && npm run lint
```

Expected: pasa sin errores.

- [ ] **Step 3: Tests existentes**

```bash
cd backend && npm test
```

Expected: todos los tests existentes siguen pasando. (Aceptable: errores pre-existentes ya conocidos en `appointments` test file — ver memoria 6678.)

---

## Task 11: Verificación visual end-to-end

Esta task es **obligatoria antes de mergear**. Memoria del proyecto: nunca dar por hecho una feature sin testing local completo.

**Files:** ninguno (solo verificación manual)

- [ ] **Step 1: Iniciar backend, frontend y PostgreSQL**

```bash
# Terminal 1 — backend
cd backend && npm run start:dev
```

```bash
# Terminal 2 — frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Caso 1 — Paciente con muchas curaciones (paginación)**

Login en el frontend, abrir un paciente con ≥15 curaciones registradas. Si no existe, usar el paciente con ID 24 (Margarita Acuña — tiene 6 curaciones, suficiente para validar tabla pero no paginación; para forzar paginación, agregar curaciones temporales o seleccionar otro paciente).

Click en "Descargar PDF". Abrir el archivo y verificar:
- Header teal en página 1
- Tabla de curaciones con header teal blanco repetido en cada página nueva
- Footer institucional con "Pág. 1", "Pág. 2"… en cada página

- [ ] **Step 3: Caso 2 — Paciente sin curaciones ni citas**

Crear un paciente nuevo (o usar uno sin actividad). Descargar PDF. **Verificar:**
- Encabezado y card del paciente se renderizan
- Sección Curaciones muestra "Sin curaciones registradas." centrado en gris cursiva
- Sección Citas muestra "Sin citas registradas." centrado en gris cursiva
- Sección Historial de Estado no aparece (correcto)

- [ ] **Step 4: Caso 3 — Curación con observación de 2+ líneas**

Editar una curación existente y agregar una observación larga (200+ caracteres). Descargar PDF. **Verificar:**
- La celda "Observaciones" hace wrap correctamente
- La fila completa crece verticalmente para acomodar el texto
- Las filas alternadas mantienen su color de fondo aún con altura variable
- La línea separadora entre filas queda al final correcto

- [ ] **Step 5: Caso 4 — Paciente activo vs dado de alta**

Descargar PDF de un paciente activo y de uno dado de alta. **Verificar:**
- Activo: badge verde "ACTIVO"
- Dado de alta: badge gris "DADO DE ALTA"
- Si hay historial de estado, la sección aparece al final con bullets

- [ ] **Step 6: Caso 5 — RUT corto y largo**

Verificar con un paciente de RUT corto (`1.234-5`) y otro largo (`19.876.543-K`) que ninguno desborde la celda del card.

- [ ] **Step 7: Caso 6 — Tildes y caracteres especiales**

Verificar con un paciente cuyo nombre tenga tildes (ñ, á, é, í, ó, ú). Descargar PDF y confirmar que se ven correctamente. Helvetica soporta latin-1 completo.

---

## Task 12: Push y crear PR

**Files:** ninguno

- [ ] **Step 1: Push de la branch**

```bash
git push -u origin feat/pdf-ficha-clinica-redesign
```

- [ ] **Step 2: Crear PR**

```bash
gh pr create --title "feat(backend): institutional redesign of patient PDF" --body "$(cat <<'EOF'
## Summary
- Rediseño visual del PDF de ficha clínica con estilo carta institucional del CESFAM Pompeya
- Header con franja teal + datos institucionales
- Tabla real para curaciones (Fecha, Tipo, Cantidad, Observaciones) y citas (Fecha, Hora)
- Card con borde sutil para datos del paciente, badge de estado coloreado
- Folio (formato `<patientId>-YYYY-MM-DD`) y pie con paginación en cada página
- Cambio de tamaño A4 → LETTER (estándar administrativo Chile)
- Sin nuevas dependencias, sin cambios al modelo de datos ni al endpoint

## Test plan
- [ ] Backend build limpio (`npm run build`)
- [ ] Lint pasa (`npm run lint`)
- [ ] PDF de paciente con muchas curaciones (paginación correcta, header tabla repetido)
- [ ] PDF de paciente sin curaciones ni citas (estados vacíos)
- [ ] PDF con observación larga (wrap dentro de celda)
- [ ] PDF de paciente activo (badge verde) y dado de alta (badge gris)
- [ ] PDF con RUT corto y largo (no desborda card)
- [ ] PDF con nombres con tildes (renderiza correctamente)

## Spec
docs/superpowers/specs/2026-04-27-pdf-ficha-clinica-redesign-design.md
EOF
)"
```

- [ ] **Step 3: Esperar CI**

Esperar a que GitHub Actions pase (build backend + frontend). Confirmar que el PR está listo para merge.

---

## Task 13: Verificación post-merge en Render

**Files:** ninguno

Memoria del proyecto: "merged" ≠ "deployed". Verificar Render después del merge.

- [ ] **Step 1: Esperar deploy del backend en Render**

Tras merge a `main`, monitorear el deploy del servicio backend en Render. Confirmar:
- Build exitoso en logs
- Servicio responde sano (`GET /api/health` o login funcional)

- [ ] **Step 2: Verificar PDF en producción**

Login en la URL de producción del frontend. Descargar PDF de un paciente real. **Verificar:**
- Header institucional con franja teal
- Card de paciente con badge correcto
- Tablas con estilo nuevo
- Footer con paginación
- Tamaño Carta (no A4)

Si falla, investigar logs de Render y revertir el merge si es necesario.

---

## Self-Review (post-write)

**1. Spec coverage** — verifico cada decisión del spec contra las tasks:

| Spec | Task |
|---|---|
| `pdf-constants.ts` con INSTITUTIONAL_INFO + COLORS | Task 1 |
| Tamaño LETTER | Task 2 |
| `formatFolio` | Task 2 |
| `drawHeader` (franja teal) | Task 3 |
| Título FICHA CLÍNICA + folio + generado | Task 3 |
| `drawPatientCard` con grilla 2-col + badge | Task 4 |
| `drawTable` genérico con filas alternadas y paginación | Task 5 |
| Curaciones como tabla | Task 6 |
| Citas como tabla | Task 7 |
| Historial de estado con tipografía nueva | Task 8 |
| `drawFooter` con `pageAdded` | Task 9 |
| Estados vacíos centrados | Tasks 6, 7 |
| Manejo de wrap en observaciones largas | Task 5 (drawTable mide `heightOfString`) |
| Verificación visual con casos edge | Task 11 |
| Verificación de Render post-deploy | Task 13 |

Cobertura completa.

**2. Placeholder scan** — sin "TBD", "TODO", "implement later", "similar to". Cada task contiene código real.

**3. Type/method consistency** — `drawHeader`, `drawPatientCard`, `drawTable`, `drawFooter`, `formatFolio` se usan con la misma firma en cada referencia. `INSTITUTIONAL_INFO`, `COLORS`, `PAGE` se importan una sola vez en Task 2 y se usan consistente en todas las tasks siguientes.
