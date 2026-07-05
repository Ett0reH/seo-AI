import { useEffect, useState } from 'react';
import { BarChart3, AlertTriangle, Lightbulb } from 'lucide-react';
import { OperationalReport } from '../types';

export function Reports() {
  const [report, setReport] = useState<OperationalReport | null>(null);

  useEffect(() => {
    fetch('/api/report').then((r) => r.json()).then(setReport).catch(console.error);
  }, []);

  if (!report) return <div className="text-sm text-slate-500">Caricamento report...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><BarChart3 className="h-6 w-6 text-indigo-600" /> Report operativo</h1>
        <p className="mt-2 text-sm text-slate-600">Generato il {new Date(report.generatedAt).toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Contenuti master" value={report.totals.masters} />
        <Stat label="Varianti generate" value={report.totals.variants} />
        <Stat label="Pubblicazioni" value={report.totals.publications} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Varianti per stato</h2>
          <div className="space-y-2">
            {Object.entries(report.byStatus).map(([s, c]) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 capitalize">{s.replace('_', ' ')}</span>
                <span className="font-medium text-slate-900">{c}</span>
              </div>
            ))}
            {Object.keys(report.byStatus).length === 0 && <p className="text-sm text-slate-400">Nessun dato.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Piattaforme più efficaci</h2>
          <div className="space-y-2">
            {report.byPlatform.map((p) => (
              <div key={p.platform} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{p.platform}</span>
                <span className="text-xs text-slate-500">{p.published}/{p.variants} pubblicate · {p.clicks} click</span>
              </div>
            ))}
            {report.byPlatform.length === 0 && <p className="text-sm text-slate-400">Nessun dato.</p>}
          </div>
        </div>
      </div>

      {report.highRisk.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Varianti ad alto rischio</h2>
          <div className="space-y-2">
            {report.highRisk.map((r) => (
              <div key={r.id} className="text-sm text-red-700">
                <span className="font-medium">{r.platform}</span> (rischio {r.riskScore}): {r.riskFlags.join(', ')}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
        <h2 className="text-sm font-semibold text-indigo-800 mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Raccomandazioni e prossime azioni</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-indigo-700">
          {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}
