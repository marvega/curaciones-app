# Rediseño visual de la ficha clínica PDF

**Fecha:** 2026-04-27
**Autor:** Marcelo + Claude (brainstorming)
**Estado:** Aprobado para planificación

## Contexto

La generación actual del PDF de ficha clínica (`backend/src/patients/patient-pdf.service.ts`) produce un documento plano: solo Helvetica negra sobre blanco, sin colores, sin encabezado institucional, sin tablas, sin pie de página. Funciona pero no transmite formalidad clínica ni identidad institucional.

Este rediseño moderniza el PDF al estilo de **carta clínica institucional** del CESFAM Pompeya, manteniendo `pdfkit` como motor (sin nuevas dependencias) y sin cambios al modelo de datos.

## Objetivo

Producir un PDF que:

- Identifique visualmente al CESFAM Pompeya como emisor (encabezado institucional con franja de color).
- Estructure los datos en bloques claros (paciente, curaciones, citas, historial) con jerarquía tipográfica consistente.
- Use tablas reales para curaciones y citas (en lugar de listas).
- Incluya folio y pie institucional para trazabilidad.
- Imprima/se vea bien en tamaño Carta (estándar administrativo en Chile).

## Alcance

**Incluido:**
- Cambios visuales y de layout en `patient-pdf.service.ts`.
- Nueva constante `INSTITUTIONAL_INFO` y paleta `COLORS` en `backend/src/patients/pdf-constants.ts`.
- Helpers privados: `drawHeader`, `drawPatientCard`, `drawTable`, `drawFooter`.
- Cambio de tamaño de página de A4 a LETTER.
- Folio simple (formato `<patientId>-YYYY-MM-DD`).
- Pie institucional con paginación en cada página.

**No incluido:**
- Logo del CESFAM (no disponible en alta resolución; se deja un slot en el header para incorporarlo más adelante sin tocar el resto del diseño).
- Espacio para firma del profesional.
- Campos clínicos nuevos (alergias, comorbilidades, etc.) — fuera de alcance.
- Migración a HTML→PDF (Puppeteer / `@react-pdf/renderer`).
- Cambios al endpoint, controller, frontend, o forma en que se descarga el PDF.
- Numeración correlativa global de fichas (requeriría tabla en BD).

## Decisiones de diseño

| Tema | Decisión |
|---|---|
| Motor PDF | `pdfkit` (mantener) |
| Tamaño página | LETTER (612×792pt) |
| Margen | 50pt en los 4 lados |
| Tipografía | Helvetica (built-in pdfkit) |
| Estilo general | Carta clínica institucional |
| Identidad | Encabezado tipográfico (sin logo aún) |
| Paleta | Teal institucional salud Chile |
| Datos establecimiento | Nombre + dependencia + dirección (sin teléfono) |
| Folio | `<patientId>-YYYY-MM-DD` (calculado en runtime, sin BD) |
| Firma | No se incluye |
| Tablas | Curaciones + citas con header teal y filas alternadas |
| Estado del paciente | Badge coloreado (verde activo / gris alta) |

## Especificación visual

### Constantes institucionales

Archivo nuevo: `backend/src/patients/pdf-constants.ts`

```ts
export const INSTITUTIONAL_INFO = {
  name: 'CESFAM POMPEYA',
  dependency: 'Servicio de Salud Viña del Mar–Quillota–Petorca',
  address: 'Frodden 1721, Quilpué',
};

export const COLORS = {
  primary: '#00897B',       // teal institucional
  primaryDark: '#00695C',
  textDark: '#212121',
  textMuted: '#616161',
  rowAlt: '#F5F7F8',
  border: '#CFD8DC',
  badgeActive: '#43A047',
  badgeInactive: '#757575',
};
```

### Layout

```
┌─────────────────────────────────────────────────┐
│ ████████ FRANJA TEAL (#00897B), 60pt alto ████ │
│   CESFAM POMPEYA              (24pt, blanco)   │
│   Servicio de Salud V-Q-P · Frodden 1721, Q.   │  (10pt, blanco 80%)
└─────────────────────────────────────────────────┘
                                                   ← 12pt espacio
   FICHA CLÍNICA                  (16pt teal, bold)
   Folio: 24-2026-04-27           (9pt gris)        Generado: 27-04-2026 18:42
   ─────────────────────────────                   ← línea fina teal 0.5pt

   DATOS DEL PACIENTE              (12pt teal bold)
   ┌───────────────────────────────────────────┐
   │ Nombre:  Margarita Acuña    │  RUT: 7.099.387-2     │
   │ F. Nac:  05-04-1955         │  Género: Femenino     │
   │ Tel:     954452462          │  Estado: [● ALTA]     │  ← badge gris
   │ Dirección: Frodden 01853 (full width)              │
   └───────────────────────────────────────────┘

   CURACIONES (6)                  (12pt teal bold)
   ┌──────┬──────────────┬─────┬──────────────────────┐
   │FECHA │ TIPO         │ CANT│ OBSERVACIONES        │  ← header teal sólido
   ├──────┼──────────────┼─────┼──────────────────────┤
   │10-02 │ Pie Diabético│  1  │ —                    │
   │03-02 │ Pie Diabético│  1  │ —                    │  ← fila alterna
   └──────┴──────────────┴─────┴──────────────────────┘

   CITAS (6)                       (12pt teal bold)
   ┌──────────────────┬──────────┐
   │ FECHA            │ HORA     │
   ├──────────────────┼──────────┤
   │ 13-02-2026       │ 15:30    │
   └──────────────────┴──────────┘

   HISTORIAL DE ESTADO             (12pt teal bold)
   • 16-03-2026 — Alta (por cynthia)

                                                   ← pie en cada página
   ─────────────────────────────────────────────
   CESFAM Pompeya · Frodden 1721, Quilpué          (8pt gris)     Pág. 1 de 1
```

### Jerarquía tipográfica

| Elemento | Tamaño | Estilo | Color |
|---|---|---|---|
| Nombre CESFAM (header) | 24pt | Helvetica-Bold | Blanco |
| Datos institucionales (header) | 10pt | Helvetica | Blanco 80% |
| Título "FICHA CLÍNICA" | 16pt | Helvetica-Bold | Teal |
| Folio / Generado | 9pt | Helvetica | Gris medio |
| Título de sección | 12pt | Helvetica-Bold | Teal |
| Etiqueta en grilla | 9pt | Helvetica-Bold | Gris oscuro |
| Valor en grilla | 10pt | Helvetica | Gris oscuro |
| Header de tabla | 9pt | Helvetica-Bold | Blanco sobre teal |
| Celda de tabla | 9pt | Helvetica | Gris oscuro |
| Footer | 8pt | Helvetica | Gris medio |

### Tabla de curaciones — distribución de columnas

Ancho útil 512pt (612 página − 100 márgenes):

| Columna | Ancho | Notas |
|---|---|---|
| Fecha | 70pt | Formato DD-MM-YYYY |
| Tipo | 130pt | "Avanzada" / "Pie Diabético" / "Úlcera Venosa" |
| Cantidad | 50pt | Numérico, alineación centrada |
| Observaciones | 262pt | Wrap automático, fila se expande verticalmente |

### Badge de estado

- Activo: fondo verde (`#43A047`), texto blanco "ACTIVO"
- Dado de Alta: fondo gris medio (`#757575`), texto blanco "DADO DE ALTA"
- Padding interno 4pt vertical, 8pt horizontal, esquinas levemente redondeadas (radio 3pt)

### Estados vacíos

- Sin curaciones: texto centrado gris medio "Sin curaciones registradas".
- Sin citas: "Sin citas registradas".
- Sin historial de estado: la sección no se renderiza (ya está así hoy).

## Arquitectura

### Archivos afectados

| Archivo | Cambio |
|---|---|
| `backend/src/patients/pdf-constants.ts` | **Nuevo** — constantes institucionales y paleta |
| `backend/src/patients/patient-pdf.service.ts` | **Modificado** — refactor a helpers + nuevo render |

### Helpers privados (todos en `patient-pdf.service.ts`)

```ts
private drawHeader(doc: PDFKit.PDFDocument): void
// Dibuja franja teal + nombre CESFAM + dependencia/dirección.
// Avanza el cursor (doc.y) al final del header.

private drawPatientCard(doc: PDFKit.PDFDocument, patient: Patient): void
// Dibuja recuadro con borde teal, grilla 2-col con datos del paciente,
// y badge de estado.

private drawTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: string[][],
  options: { startY?: number },
): void
// Tabla genérica reutilizable. Maneja filas alternadas, paginación,
// repetición de header en nueva página.

private drawFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
): void
// Línea separadora + datos institucionales (izq) + paginación (der).
// Se llama desde un handler `pageAdded` para garantizar pie en cada página.

private formatFolio(patientId: number): string
// Retorna "{patientId}-YYYY-MM-DD" usando la fecha de hoy en zona Chile.
```

### Flujo de datos

Sin cambios respecto al actual. El método público `generatePdf(patientId)` sigue:
1. Carga paciente, curaciones, appointments, statusChanges desde TypeORM.
2. Crea `PDFDocument` con `size: 'LETTER', margin: 50`.
3. Registra handler `pageAdded` para dibujar footer.
4. Llama helpers en orden: header → título/folio → patientCard → tabla curaciones → tabla citas → lista historial.
5. `doc.end()` y devuelve el Buffer.

### Manejo de paginación

`pdfkit` no expone "total de páginas" hasta el final. Para mostrar `Pág. X de Y` en el footer se usa una de dos estrategias:

**Opción A (recomendada):** Solo mostrar `Pág. X` en el footer (sin "de Y"). Más simple, cero ambigüedad.

**Opción B:** Renderizar primero a buffer, contar páginas, regenerar con conteo correcto. Doble costo de render.

Decisión: **Opción A** — la paginación con "Pág. 1, Pág. 2…" es suficientemente clara y evita doble render.

## Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Paciente no existe | `NotFoundException('Paciente no encontrado')` (sin cambios) |
| Sin teléfono / dirección | Mostrar "No registrado" en gris medio |
| Observación vacía | Celda muestra `—` |
| 0 curaciones / 0 citas | Texto centrado "Sin {curaciones,citas} registradas" |
| Observación muy larga | Wrap automático en celda, fila crece verticalmente |
| Más de 1 página de contenido | Repetir header de tabla en nueva página, footer auto-dibujado |
| Nombre muy largo en header | El nombre del CESFAM es fijo, no aplica |
| RUT mal formateado | Se muestra tal como está en BD (no se reformatea) |

## Testing

Estrategia priorizada:

1. **Verificación visual manual (obligatoria antes de mergear)** — generar PDFs para los siguientes casos y revisar el render:
   - Paciente con muchas curaciones (>15) → verificar paginación, repetición de header de tabla, footer en cada página.
   - Paciente sin curaciones ni citas → verificar estados vacíos.
   - Curación con observación de 2+ líneas → verificar wrap dentro de celda.
   - Paciente activo vs dado de alta → verificar badges con color correcto.
   - RUT corto (`1.234-5`) y largo (`19.876.543-K`) → verificar que no rompa la grilla.

2. **Sin tests unitarios automatizados nuevos** — el costo/beneficio no lo justifica para un servicio de presentación. Si se rompe algo, se nota visualmente al instante. Las regresiones funcionales (paciente desaparece, curación duplicada) están cubiertas por los tests existentes del controller/service de pacientes.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Constantes institucionales cambian (dirección, dependencia) | Bajo — un commit de 1 línea | Centralizar en `pdf-constants.ts` |
| `pdfkit` mide mal el ancho de texto en español con tildes | Medio — texto cortado o desbordado | Verificación visual con casos reales que tengan tildes en nombres |
| Helvetica no soporta caracteres especiales | Bajo — Helvetica soporta latin-1 completo | N/A |
| Cambio de A4 a Letter rompe layouts en producción | Bajo — solo afecta este PDF | Verificación visual antes de mergear |
| El logo eventualmente cambia el diseño del header | Bajo — el slot está reservado en `drawHeader` | Cuando llegue el logo, reemplazar texto por imagen sin tocar otras secciones |

## Pendientes para iteraciones futuras (fuera de alcance)

- Logo oficial del CESFAM en alta resolución (pedir a Cynthia/dirección).
- Espacio para firma del profesional tratante con datos del usuario logueado.
- Campos clínicos: alergias, comorbilidades, profesional tratante.
- Folio correlativo global con tabla en BD para trazabilidad de auditoría.
- Si el CESFAM lo solicita, exportar también versión HTML para visualización web sin descargar.
