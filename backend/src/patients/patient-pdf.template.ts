import type {
  Content,
  ContentColumns,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

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

const COLOR = {
  ink: '#101820',
  muted: '#5b6877',
  subtle: '#8a96a4',
  accent: '#143a6b',
  rule: '#d6dde6',
  ruleSoft: '#eef1f6',
};

const BADGE_DISCHARGE = {
  text: '#0a5f33',
  fill: '#e7f4ec',
  border: '#bfe0cc',
};

const BADGE_ACTIVE = {
  text: '#7a4a00',
  fill: '#fdf3e2',
  border: '#f0d9a8',
};

const PAGE_WIDTH = 612;
const SIDE_MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;

const pad2 = (n: number): string => String(n).padStart(2, '0');

const buildHeader =
  (data: FichaData) =>
  (): Content => ({
    stack: [
      {
        canvas: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            w: PAGE_WIDTH,
            h: 5,
            color: COLOR.accent,
          },
        ],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              {
                text: 'MINISTERIO DE SALUD · GOBIERNO DE CHILE',
                fontSize: 7,
                color: COLOR.subtle,
                characterSpacing: 1.4,
              },
              {
                text: 'CESFAM Pompeya',
                fontSize: 13,
                bold: true,
                color: COLOR.accent,
                margin: [0, 3, 0, 0],
              },
              {
                text: 'Servicio de Salud Viña del Mar–Quillota–Petorca',
                fontSize: 8.5,
                color: COLOR.muted,
                margin: [0, 1, 0, 0],
              },
              {
                text: 'Frodden 1721, Quilpué · Región de Valparaíso',
                fontSize: 8,
                color: COLOR.subtle,
                margin: [0, 1, 0, 0],
              },
            ],
          },
          {
            width: 160,
            stack: [
              {
                text: 'FOLIO',
                fontSize: 7,
                color: COLOR.subtle,
                alignment: 'right',
                characterSpacing: 1.3,
              },
              {
                text: data.folio,
                fontSize: 12,
                bold: true,
                color: COLOR.accent,
                alignment: 'right',
                margin: [0, 2, 0, 0],
              },
              {
                text: 'EMITIDO',
                fontSize: 7,
                color: COLOR.subtle,
                alignment: 'right',
                characterSpacing: 1.3,
                margin: [0, 8, 0, 0],
              },
              {
                text: data.generado,
                fontSize: 9,
                color: COLOR.ink,
                alignment: 'right',
                margin: [0, 2, 0, 0],
              },
            ],
          },
        ],
        margin: [SIDE_MARGIN, 14, SIDE_MARGIN, 10],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: SIDE_MARGIN,
            y1: 0,
            x2: PAGE_WIDTH - SIDE_MARGIN,
            y2: 0,
            lineWidth: 0.5,
            lineColor: COLOR.rule,
          },
        ],
      },
    ],
  });

const buildFooter =
  (data: FichaData) =>
  (currentPage: number, pageCount: number): Content => ({
    stack: [
      {
        canvas: [
          {
            type: 'line',
            x1: SIDE_MARGIN,
            y1: 0,
            x2: PAGE_WIDTH - SIDE_MARGIN,
            y2: 0,
            lineWidth: 0.5,
            lineColor: COLOR.rule,
          },
        ],
      },
      {
        columns: [
          {
            text: 'CESFAM Pompeya · Servicio de Salud Viña del Mar–Quillota–Petorca',
            fontSize: 7.5,
            color: COLOR.subtle,
          },
          {
            text: `Folio ${data.folio}`,
            fontSize: 7.5,
            color: COLOR.subtle,
            alignment: 'center',
          },
          {
            text: `Página ${currentPage} de ${pageCount}`,
            fontSize: 7.5,
            color: COLOR.subtle,
            alignment: 'right',
          },
        ],
        margin: [SIDE_MARGIN, 10, SIDE_MARGIN, 0],
      },
    ],
  });

const titleBlock = (data: FichaData): Content => {
  const isDischarged = data.estado === 'DADO DE ALTA';
  const badge = isDischarged ? BADGE_DISCHARGE : BADGE_ACTIVE;
  return {
    columns: [
      {
        width: '*',
        stack: [
          {
            text: 'FICHA CLÍNICA',
            fontSize: 8,
            bold: true,
            color: COLOR.accent,
            characterSpacing: 1.6,
            margin: [0, 0, 0, 6],
          },
          {
            text: data.nombre,
            fontSize: 22,
            bold: true,
            color: COLOR.ink,
            lineHeight: 1.05,
          },
          {
            text: `RUT ${data.rut} · ${data.edad} · ${data.genero}`,
            fontSize: 9.5,
            color: COLOR.muted,
            margin: [0, 5, 0, 0],
          },
        ],
      },
      {
        width: 'auto',
        margin: [0, 6, 0, 0],
        table: {
          body: [
            [
              {
                text: data.estado,
                fontSize: 8,
                bold: true,
                color: badge.text,
                characterSpacing: 1.2,
                margin: [10, 4, 10, 4],
                border: [true, true, true, true],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => badge.border,
          vLineColor: () => badge.border,
          fillColor: () => badge.fill,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 0, 0, 16],
  };
};

const infoCell = (label: string, value: string): Content => ({
  stack: [
    {
      text: label,
      fontSize: 7,
      color: COLOR.subtle,
      characterSpacing: 1.4,
      margin: [0, 0, 0, 3],
    },
    {
      text: value,
      fontSize: 9.5,
      color: COLOR.ink,
    },
  ],
});

const infoStrip = (data: FichaData): Content => ({
  stack: [
    {
      columns: [
        infoCell('FECHA DE NACIMIENTO', data.nacimiento),
        infoCell('EDAD', data.edad),
        infoCell('TELÉFONO', data.telefono),
        infoCell('DIRECCIÓN', data.direccion),
      ],
      columnGap: 16,
      margin: [0, 0, 0, 12],
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: CONTENT_WIDTH,
          y2: 0,
          lineWidth: 0.5,
          lineColor: COLOR.rule,
        },
      ],
    },
  ],
  margin: [0, 0, 0, 0],
});

const sectionTitle = (
  n: string,
  name: string,
  count: number | null,
): Content => ({
  stack: [
    {
      columns: [
        {
          text: n,
          width: 26,
          fontSize: 8,
          bold: true,
          color: COLOR.accent,
          characterSpacing: 0.8,
        },
        {
          text: name,
          width: '*',
          fontSize: 11,
          bold: true,
          color: COLOR.ink,
        },
        {
          text: count != null ? `${pad2(count)} REGISTROS` : '',
          width: 'auto',
          fontSize: 8,
          color: COLOR.subtle,
          characterSpacing: 1.4,
          alignment: 'right',
        },
      ],
      margin: [0, 0, 0, 5],
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: CONTENT_WIDTH,
          y2: 0,
          lineWidth: 1,
          lineColor: COLOR.accent,
        },
      ],
    },
  ],
  margin: [0, 18, 0, 8],
});

const emptyState = (text: string): Content => ({
  text,
  fontSize: 9,
  color: COLOR.subtle,
  italics: true,
  alignment: 'center',
  margin: [0, 8, 0, 0],
});

const curacionesSection = (data: FichaData): Content => {
  const items: Content[] = [
    sectionTitle('01', 'Curaciones', data.curaciones.length),
  ];
  if (data.curaciones.length === 0) {
    items.push(emptyState('Sin curaciones registradas.'));
    return { stack: items };
  }
  const headerRow: Content[] = [
    {
      text: 'N°',
      fontSize: 7,
      bold: true,
      color: COLOR.subtle,
      characterSpacing: 1.3,
    },
    {
      text: 'FECHA',
      fontSize: 7,
      bold: true,
      color: COLOR.subtle,
      characterSpacing: 1.3,
    },
    {
      text: 'TIPO DE CURACIÓN',
      fontSize: 7,
      bold: true,
      color: COLOR.subtle,
      characterSpacing: 1.3,
    },
    {
      text: 'CANT.',
      fontSize: 7,
      bold: true,
      color: COLOR.subtle,
      characterSpacing: 1.3,
      alignment: 'right',
    },
    {
      text: 'OBSERVACIONES',
      fontSize: 7,
      bold: true,
      color: COLOR.subtle,
      characterSpacing: 1.3,
    },
  ];
  const bodyRows: Content[][] = data.curaciones.map((c, i) => [
    { text: pad2(i + 1), fontSize: 7.5, color: COLOR.subtle },
    { text: c.fecha, fontSize: 8, color: COLOR.ink },
    { text: c.tipo, fontSize: 8, color: COLOR.ink },
    { text: String(c.cantidad), fontSize: 8, color: COLOR.ink, alignment: 'right' },
    { text: c.obs || '—', fontSize: 8, color: COLOR.muted },
  ]);
  items.push({
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [22, 64, 110, 38, '*'],
      body: [headerRow, ...bodyRows],
    },
    layout: {
      hLineWidth: (i: number) => {
        if (i === 0) return 0;
        if (i === 1) return 0.5;
        return 0.4;
      },
      hLineColor: (i: number) => (i === 1 ? COLOR.rule : COLOR.ruleSoft),
      vLineWidth: () => 0,
      paddingTop: (i: number) => (i === 0 ? 0 : 6),
      paddingBottom: (i: number) => (i === 0 ? 7 : 6),
      paddingLeft: () => 0,
      paddingRight: () => 8,
    },
  });
  return { stack: items };
};

const citaItem = (c: FichaCita, idx: number): Content => ({
  columns: [
    { text: pad2(idx + 1), width: 22, fontSize: 7, color: COLOR.subtle },
    { text: c.fecha, width: '*', fontSize: 8, color: COLOR.ink },
    {
      text: `${c.hora} hrs`,
      width: 'auto',
      fontSize: 8,
      bold: true,
      color: COLOR.accent,
      alignment: 'right',
    },
  ],
  margin: [0, 5, 0, 5],
});

const citasSection = (data: FichaData): Content => {
  const items: Content[] = [
    sectionTitle('02', 'Citas registradas', data.citas.length),
  ];
  if (data.citas.length === 0) {
    items.push(emptyState('Sin citas registradas.'));
    return { stack: items };
  }
  const half = Math.ceil(data.citas.length / 2);
  const left = data.citas.slice(0, half);
  const right = data.citas.slice(half);
  const buildColumn = (
    chunk: FichaCita[],
    offset: number,
  ): { stack: Content[] } => ({
    stack: chunk.map((c, i) => ({
      stack: [
        citaItem(c, offset + i),
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: (CONTENT_WIDTH - 24) / 2,
              y2: 0,
              lineWidth: 0.4,
              lineColor: COLOR.ruleSoft,
            },
          ],
        },
      ],
    })),
  });
  items.push({
    columns: [buildColumn(left, 0), buildColumn(right, half)],
    columnGap: 24,
  } as ContentColumns);
  return { stack: items };
};

const historialSection = (data: FichaData): Content | null => {
  if (data.historial.length === 0) return null;
  const items: Content[] = [sectionTitle('03', 'Historial de estado', null)];
  data.historial.forEach((h) => {
    items.push({
      stack: [
        {
          columns: [
            { text: h.fecha, width: 80, fontSize: 8, color: COLOR.muted },
            { text: h.evento, width: '*', fontSize: 8.5, color: COLOR.ink },
            {
              text: `por ${h.por}`,
              width: 'auto',
              fontSize: 7.5,
              color: COLOR.subtle,
              alignment: 'right',
            },
          ],
          margin: [0, 5, 0, 5],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: CONTENT_WIDTH,
              y2: 0,
              lineWidth: 0.4,
              lineColor: COLOR.ruleSoft,
            },
          ],
        },
      ],
    });
  });
  return { stack: items };
};

export const buildFichaDocDef = (data: FichaData): TDocumentDefinitions => {
  const content: Content[] = [
    titleBlock(data),
    infoStrip(data),
    curacionesSection(data),
    citasSection(data),
  ];
  const historial = historialSection(data);
  if (historial) content.push(historial);

  return {
    pageSize: 'LETTER',
    pageMargins: [SIDE_MARGIN, 95, SIDE_MARGIN, 50],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 9,
      color: COLOR.ink,
      lineHeight: 1.35,
    },
    header: buildHeader(data),
    footer: buildFooter(data),
    content,
    info: {
      title: `Ficha Clínica · ${data.nombre}`,
      author: 'CESFAM Pompeya',
      subject: 'Ficha Clínica',
    },
  };
};
