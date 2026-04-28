export interface FichaCuracion {
  fecha: string;
  tipo: string;
  cantidad: number;
  obs: string;
}

export interface FichaCita {
  fecha: string;
  hora: string;
}

export interface FichaHistorial {
  fecha: string;
  evento: string;
  por: string;
}

export interface FichaData {
  folio: string;
  generado: string;
  nombre: string;
  rut: string;
  nacimiento: string;
  edad: string;
  genero: string;
  telefono: string;
  direccion: string;
  estado: string;
  curaciones: FichaCuracion[];
  citas: FichaCita[];
  historial: FichaHistorial[];
}

const escape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pad2 = (n: number): string => String(n).padStart(2, '0');

const renderHeader = (data: FichaData): string => `
  <div class="topbar"></div>
  <header class="header">
    <div>
      <div class="brand-pre">Ministerio de Salud · Gobierno de Chile</div>
      <div class="brand-name">CESFAM Pompeya</div>
      <div class="brand-dependency">Servicio de Salud Viña del Mar–Quillota–Petorca</div>
      <div class="brand-address">Frodden 1721, Quilpué · Región de Valparaíso</div>
    </div>
    <div class="folio-block">
      <div class="folio-label">Folio</div>
      <div class="folio-value">${escape(data.folio)}</div>
      <div class="folio-label folio-label-em">Emitido</div>
      <div class="folio-emitido">${escape(data.generado)}</div>
    </div>
  </header>
`;

const renderTitleBlock = (data: FichaData): string => {
  const isDischarged = data.estado === 'DADO DE ALTA';
  const badgeClass = isDischarged ? 'badge-discharge' : 'badge-active';
  return `
    <div class="title-block">
      <div>
        <div class="title-pre">Ficha Clínica</div>
        <h1 class="patient-name">${escape(data.nombre)}</h1>
        <div class="patient-meta">
          RUT ${escape(data.rut)} · ${escape(data.edad)} · ${escape(data.genero)}
        </div>
      </div>
      <div class="status-badge ${badgeClass}">${escape(data.estado)}</div>
    </div>
  `;
};

const renderInfoStrip = (data: FichaData): string => `
  <div class="info-strip">
    <div>
      <div class="info-label">Fecha de nacimiento</div>
      <div class="info-value tabular">${escape(data.nacimiento)}</div>
    </div>
    <div>
      <div class="info-label">Edad</div>
      <div class="info-value">${escape(data.edad)}</div>
    </div>
    <div>
      <div class="info-label">Teléfono</div>
      <div class="info-value tabular">${escape(data.telefono)}</div>
    </div>
    <div>
      <div class="info-label">Dirección</div>
      <div class="info-value">${escape(data.direccion)}</div>
    </div>
  </div>
`;

const renderSectionTitle = (
  n: string,
  title: string,
  count: number | null,
): string => `
  <div class="section-title">
    <span class="section-num">${escape(n)}</span>
    <span class="section-name">${escape(title)}</span>
    <span class="section-count">${
      count != null ? `${pad2(count)} registros` : ''
    }</span>
  </div>
`;

const renderCuraciones = (data: FichaData): string => {
  if (data.curaciones.length === 0) {
    return `
      <section class="section">
        ${renderSectionTitle('01', 'Curaciones', 0)}
        <div class="section-body">
          <div class="empty-state">Sin curaciones registradas.</div>
        </div>
      </section>
    `;
  }
  const rows = data.curaciones
    .map(
      (c, i) => `
        <tr>
          <td class="col-num">${pad2(i + 1)}</td>
          <td class="col-fecha">${escape(c.fecha)}</td>
          <td class="col-tipo">${escape(c.tipo)}</td>
          <td class="col-cant">${c.cantidad}</td>
          <td class="col-obs">${escape(c.obs) || '—'}</td>
        </tr>
      `,
    )
    .join('');
  return `
    <section class="section">
      ${renderSectionTitle('01', 'Curaciones', data.curaciones.length)}
      <div class="section-body">
        <table class="curaciones-table">
          <thead>
            <tr>
              <th class="col-num">N°</th>
              <th class="col-fecha">Fecha</th>
              <th class="col-tipo">Tipo de curación</th>
              <th class="col-cant">Cant.</th>
              <th class="col-obs">Observaciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
};

const renderCitas = (data: FichaData): string => {
  if (data.citas.length === 0) {
    return `
      <section class="section">
        ${renderSectionTitle('02', 'Citas registradas', 0)}
        <div class="section-body">
          <div class="empty-state">Sin citas registradas.</div>
        </div>
      </section>
    `;
  }
  const items = data.citas
    .map(
      (c, i) => `
        <div class="cita-item">
          <span class="cita-num">${pad2(i + 1)}</span>
          <span class="cita-fecha">${escape(c.fecha)}</span>
          <span class="cita-hora">${escape(c.hora)} hrs</span>
        </div>
      `,
    )
    .join('');
  return `
    <section class="section">
      ${renderSectionTitle('02', 'Citas registradas', data.citas.length)}
      <div class="section-body citas-grid">${items}</div>
    </section>
  `;
};

const renderHistorial = (data: FichaData): string => {
  if (data.historial.length === 0) return '';
  const items = data.historial
    .map(
      (h) => `
        <div class="hist-item">
          <span class="hist-fecha tabular">${escape(h.fecha)}</span>
          <span class="hist-evento">${escape(h.evento)}</span>
          <span class="hist-por">por ${escape(h.por)}</span>
        </div>
      `,
    )
    .join('');
  return `
    <section class="section">
      ${renderSectionTitle('03', 'Historial de estado', null)}
      <div class="section-body">${items}</div>
    </section>
  `;
};

const renderFooter = (data: FichaData): string => `
  <footer class="footer">
    <span>CESFAM Pompeya · Servicio de Salud Viña del Mar–Quillota–Petorca</span>
    <span class="tabular">Folio ${escape(data.folio)}</span>
    <span class="page-counter"></span>
  </footer>
`;

const styles = `
  :root {
    --ink: #101820;
    --muted: #5b6877;
    --subtle: #8a96a4;
    --accent: #143a6b;
    --rule: #d6dde6;
    --rule-soft: #eef1f6;
    --sans: "Helvetica Neue", "Arial", "Liberation Sans", sans-serif;
  }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-sizing: border-box;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: var(--ink);
    font-family: var(--sans);
    font-size: 10.5px;
    line-height: 1.45;
  }
  @page {
    size: letter;
    margin: 0;
  }
  .page {
    width: 8.5in;
    min-height: 11in;
    background: #ffffff;
    color: var(--ink);
    font-family: var(--sans);
    font-size: 10.5px;
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .tabular { font-variant-numeric: tabular-nums; }

  .topbar {
    height: 5px;
    background: var(--accent);
  }

  .header {
    padding: 24px 60px 14px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid var(--rule);
  }
  .brand-pre {
    font-size: 8.5px;
    color: var(--subtle);
    text-transform: uppercase;
    letter-spacing: 0.2em;
  }
  .brand-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
    margin-top: 4px;
  }
  .brand-dependency {
    font-size: 9.5px;
    color: var(--muted);
    margin-top: 1px;
  }
  .brand-address {
    font-size: 9px;
    color: var(--subtle);
    margin-top: 1px;
  }
  .folio-block {
    text-align: right;
    border-left: 1px solid var(--rule);
    padding-left: 20px;
    min-width: 170px;
  }
  .folio-label {
    font-size: 8px;
    color: var(--subtle);
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }
  .folio-label-em {
    margin-top: 8px;
  }
  .folio-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    margin-top: 2px;
  }
  .folio-emitido {
    font-size: 10px;
    color: var(--ink);
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }

  .title-block {
    padding: 22px 60px 18px;
    border-bottom: 1px solid var(--rule);
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }
  .title-pre {
    font-size: 9px;
    color: var(--accent);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    margin-bottom: 8px;
  }
  .patient-name {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: -0.012em;
    line-height: 1.1;
  }
  .patient-meta {
    font-size: 11px;
    color: var(--muted);
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }
  .status-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 6px 12px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .badge-discharge {
    color: #0a5f33;
    background: #e7f4ec;
    border: 1px solid #bfe0cc;
  }
  .badge-active {
    color: #7a4a00;
    background: #fdf3e2;
    border: 1px solid #f0d9a8;
  }

  .info-strip {
    padding: 14px 60px;
    border-bottom: 1px solid var(--rule);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
  }
  .info-label {
    font-size: 7.5px;
    color: var(--subtle);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    margin-bottom: 3px;
  }
  .info-value {
    font-size: 11px;
    color: var(--ink);
    font-weight: 500;
  }

  .section {
    padding-top: 22px;
    margin-bottom: 4px;
  }
  .section-title {
    display: grid;
    grid-template-columns: 36px 1fr auto;
    align-items: baseline;
    padding: 0 60px 6px;
    border-bottom: 1.5px solid var(--accent);
    margin-bottom: 10px;
  }
  .section-num {
    font-size: 9px;
    color: var(--accent);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1em;
  }
  .section-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    letter-spacing: 0.005em;
  }
  .section-count {
    font-size: 9px;
    color: var(--subtle);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-variant-numeric: tabular-nums;
  }
  .section-body {
    padding: 0 60px;
  }
  .empty-state {
    font-size: 10px;
    color: var(--subtle);
    font-style: italic;
    text-align: center;
    padding: 12px 0;
  }

  .curaciones-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .curaciones-table th {
    text-align: left;
    font-size: 7.5px;
    font-weight: 700;
    color: var(--subtle);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    padding: 0 8px 7px 0;
    border-bottom: 1px solid var(--rule);
  }
  .curaciones-table th.col-cant { text-align: right; }
  .curaciones-table th.col-num { width: 28px; }
  .curaciones-table th.col-fecha { width: 92px; }
  .curaciones-table th.col-cant { width: 60px; }
  .curaciones-table tr {
    page-break-inside: avoid;
  }
  .curaciones-table tbody tr {
    border-bottom: 1px solid var(--rule-soft);
  }
  .curaciones-table td {
    padding: 8px 8px 8px 0;
    font-size: 10.5px;
    vertical-align: top;
  }
  .curaciones-table td.col-num {
    color: var(--subtle);
    font-size: 10px;
  }
  .curaciones-table td.col-tipo { font-weight: 500; }
  .curaciones-table td.col-cant { text-align: right; }
  .curaciones-table td.col-obs { color: var(--muted); }

  .citas-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0 32px;
  }
  .cita-item {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: baseline;
    padding: 7px 0;
    border-bottom: 1px solid var(--rule-soft);
    font-variant-numeric: tabular-nums;
    page-break-inside: avoid;
  }
  .cita-num {
    font-size: 9px;
    color: var(--subtle);
  }
  .cita-fecha { font-size: 10.5px; }
  .cita-hora {
    font-size: 10.5px;
    color: var(--accent);
    font-weight: 600;
  }

  .hist-item {
    display: grid;
    grid-template-columns: 92px 1fr auto;
    gap: 14px;
    align-items: baseline;
    padding: 7px 0;
    border-bottom: 1px solid var(--rule-soft);
    page-break-inside: avoid;
  }
  .hist-fecha {
    font-size: 10px;
    color: var(--muted);
  }
  .hist-evento { font-size: 11px; }
  .hist-por {
    font-size: 9.5px;
    color: var(--subtle);
  }

  .footer {
    margin-top: auto;
    padding: 14px 60px 22px;
    border-top: 1px solid var(--rule);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 8.5px;
    color: var(--subtle);
  }
`;

export const renderFichaHtml = (data: FichaData): string => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Ficha Clínica · ${escape(data.nombre)}</title>
<style>${styles}</style>
</head>
<body>
<div class="page">
  ${renderHeader(data)}
  ${renderTitleBlock(data)}
  ${renderInfoStrip(data)}
  ${renderCuraciones(data)}
  ${renderCitas(data)}
  ${renderHistorial(data)}
  ${renderFooter(data)}
</div>
</body>
</html>`;
