import { useEffect, useState } from 'react';
import { Save, Radar } from 'lucide-react';
import { PlatformVariant } from '../types';

interface Metrics { publishedUrl: string; clicks: string; referral: string; likes: string; comments: string; notes: string; }

export function Tracking() {
  const [variants, setVariants] = useState<PlatformVariant[]>([]);
  const [edit, setEdit] = useState<Record<string, Metrics>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = () => {
    fetch('/api/variants?status=published').then((r) => r.json()).then(setVariants).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const field = (id: string): Metrics => edit[id] || { publishedUrl: '', clicks: '', referral: '', likes: '', comments: '', notes: '' };
  const set = (id: string, patch: Partial<Metrics>) => setEdit((p) => ({ ...p, [id]: { ...field(id), ...patch } }));

  const save = async (id: string) => {
    const m = field(id);
    await fetch(`/api/tracking/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clicks: Number(m.clicks) || 0,
        referral: Number(m.referral) || 0,
        engagement: { likes: Number(m.likes) || 0, comments: Number(m.comments) || 0 },
        notes: m.notes,
      }),
    });
    setSavedId(id);
    setTimeout(() => setSavedId(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Radar className="h-6 w-6 text-indigo-600" /> Tracking pubblicazioni</h1>
        <p className="mt-2 text-sm text-slate-600">Registra manualmente metriche di engagement, click e referral per le varianti pubblicate.</p>
      </div>

      {variants.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Nessuna variante pubblicata. Segna una bozza come "pubblicata" dalla pagina Bozze & Approvazioni.
        </div>
      ) : (
        <div className="space-y-4">
          {variants.map((v) => {
            const m = field(v.id);
            return (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-slate-900">{v.platform}</span>
                    <span className="text-xs text-slate-400 ml-2">{v.title}</span>
                  </div>
                  <button onClick={() => save(v.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg">
                    <Save className="h-3.5 w-3.5" /> {savedId === v.id ? 'Salvato!' : 'Salva'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Num label="Click" value={m.clicks} onChange={(x) => set(v.id, { clicks: x })} />
                  <Num label="Referral" value={m.referral} onChange={(x) => set(v.id, { referral: x })} />
                  <Num label="Like" value={m.likes} onChange={(x) => set(v.id, { likes: x })} />
                  <Num label="Commenti" value={m.comments} onChange={(x) => set(v.id, { comments: x })} />
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Note</label>
                    <input value={m.notes} onChange={(e) => set(v.id, { notes: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
  );
}
