import { useState, useEffect } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { getWoundEvolution } from '../services/api';
import type { WoundEvolutionPoint } from '../types';
import { TrendingDown, Loader2 } from 'lucide-react';

interface Props {
  patientId: number;
}

const colorLabels: Record<string, string> = {
  red: 'Rojo',
  yellow: 'Amarillo',
  black: 'Negro',
  pink: 'Rosado',
  mixed: 'Mixto',
};

const stageLabels: Record<string, string> = {
  inflammatory: 'Inflamatoria',
  proliferative: 'Proliferativa',
  maturation: 'Maduración',
  chronic: 'Crónica',
};

export default function WoundEvolutionChart({ patientId }: Props) {
  const [data, setData] = useState<WoundEvolutionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWoundEvolution(patientId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-semibold text-slate-800">Evolución de Herida</h3>
        </div>
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  // Filter points that have woundArea data
  const chartData = data
    .filter((d) => d.woundArea !== null)
    .map((d) => ({
      date: new Date(d.date + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }),
      rawDate: d.date,
      area: Number(d.woundArea),
      color: d.woundColor ? colorLabels[d.woundColor] || d.woundColor : null,
      stage: d.healingStage ? stageLabels[d.healingStage] || d.healingStage : null,
    }));

  if (chartData.length < 2) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-semibold text-slate-800">Evolución de Herida</h3>
        </div>
        <p className="text-sm text-slate-400 text-center py-8">
          Se necesitan al menos 2 notas de evolución con medidas para generar el gráfico.
        </p>
      </div>
    );
  }

  // Calculate trend
  const firstArea = chartData[0].area;
  const lastArea = chartData[chartData.length - 1].area;
  const percentChange = ((lastArea - firstArea) / firstArea * 100).toFixed(1);
  const isImproving = lastArea < firstArea;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium text-slate-800">{label}</p>
        <p className="text-blue-600">Área: {point.area} cm²</p>
        {point.color && <p className="text-slate-600">Color: {point.color}</p>}
        {point.stage && <p className="text-slate-600">Etapa: {point.stage}</p>}
      </div>
    );
  };

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-semibold text-slate-800">Evolución de Herida</h3>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          isImproving ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}>
          {isImproving ? '\u2193' : '\u2191'} {Math.abs(Number(percentChange))}% {isImproving ? 'reducción' : 'aumento'}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" unit=" cm²" />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="area" stroke="#3b82f6" strokeWidth={2} fill="url(#areaGradient)" dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} name="Área (cm²)" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex justify-between text-xs text-slate-400 mt-2 px-2">
        <span>Primera medición: {chartData[0].area} cm²</span>
        <span>Última medición: {lastArea} cm²</span>
      </div>
    </div>
  );
}
