import { useEffect, useState } from 'react';
import { Check, X, Copy, AlertTriangle, Clock, Package } from 'lucide-react';
import { PlatformVariant, VariantStatus } from '../types';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-500/10',
  pending_approval: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  scheduled: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  failed: 'bg-red-50 text-red-700 ring-red-600/20',
  skipped: 'bg-slate-100 text-slate-400 ring-slate-500/10',
  archived: 'bg-slate-100 text-slate-400 ring-slate-500/10',
};

const METHOD_LABEL: Record<string, string> = {
  api: 'API ufficiale',
  scheduler: 'Scheduler autorizzato',
  semi_automatic: 'Semi-automatico + approvazione',
  manual_guided: 'Manuale guidato',
};

const FILTERS: Array<VariantStatus | 'all'> = ['all', 'pending_approval', 'draft', 'scheduled', 'published', 'skipped'];

export function Drafts() {
  const [variants, setVariants] = useState<PlatformVariant[]>([]);
  const [filter, setFilter] = useState<VariantStatus | 'all'>('all');
  const [selected, setSelected] = useState<PlatformVariant | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    const q = filter === 'all' ? '' : `?status=${filter}`;
    fetch(`/api/variants${q}`).then((r) => r.json()).then(setVariants).catch(console.error);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const act = async (id: string, action: 'approve' | 'reject' | 'publish-manual') => {
    const body = action === 'publish-manual' ? { author: 'operator' } : {};
    await fetch(`/api/variants/${id}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    load();
    setSelected(null);
  };

  const copyPackage = (v: PlatformVariant) => {
    const pkg = [
      `PIATTAFORMA: ${v.platform}  (${METHOD_LABEL[v.publishMethod]})`,
      `TITOLO: ${v.title}`,
      '',
      v.body,
      '',
      v.hashtags?.length ? `HASHTAG: ${v.hashtags.map((h) => (h.startsWith('#') ? h : '#' + h)).join(' ')}` : '',
      v.cta ? `CTA: ${v.cta}` : '',
      v.link ? `LINK (con UTM): ${v.link}` : '',
      v.mediaSuggestion ? `MEDIA: ${v.mediaSuggestion}` : '',
      `NOTE OPERATIVE: ${v.opNotes}`,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(pkg);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bozze & Approvazioni</h1>
        <p className="mt-2 text-sm text-slate-600">
          Rivedi le varianti generate, approva quelle rischiose e copia il pacchetto per la pubblicazione (API, scheduler o manuale). Nessuna pubblicazione automatica dal browser.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border ${filter === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {f === 'all' ? 'Tutte' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-slate-900">Piattaforma / Angolo</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Metodo</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Rischio</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Slot</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Stato</th>
              <th className="relative py-3.5 pl-3 pr-6"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {variants.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">Nessuna variante per questo filtro.</td></tr>
            ) : variants.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td className="py-4 pl-6 pr-3 text-sm">
                  <button onClick={() => setSelected(v)} className="font-medium text-indigo-600 hover:text-indigo-800">{v.platform}</button>
                  <div className="text-xs text-slate-500 mt-1 max-w-xs truncate">{v.angle}</div>
                </td>
                <td className="px-3 py-4 text-sm text-slate-600">{METHOD_LABEL[v.publishMethod]}</td>
                <td className="px-3 py-4 text-sm">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${v.riskScore >= 40 ? 'text-red-600' : v.riskScore > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {v.riskScore >= 40 && <AlertTriangle className="h-3 w-3" />}{v.riskScore}
                  </span>
                </td>
                <td className="px-3 py-4 text-xs text-slate-500">{v.scheduledAt ? new Date(v.scheduledAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-4 text-sm">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[v.status]}`}>{v.status.replace('_', ' ')}</span>
                </td>
                <td className="py-4 pl-3 pr-6 text-right text-sm">
                  <div className="flex justify-end gap-2">
                    <button title="Copia pacchetto" onClick={() => copyPackage(v)} className="p-1.5 text-slate-500 hover:text-indigo-600"><Copy className="h-4 w-4" /></button>
                    {(v.status === 'pending_approval' || v.status === 'draft') && (
                      <button title="Approva" onClick={() => act(v.id, 'approve')} className="p-1.5 text-emerald-600 hover:text-emerald-800"><Check className="h-4 w-4" /></button>
                    )}
                    {v.status !== 'published' && v.status !== 'skipped' && (
                      <button title="Rifiuta" onClick={() => act(v.id, 'reject')} className="p-1.5 text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Package className="h-5 w-5 text-indigo-600" /> {selected.platform}</h2>
                <p className="text-sm text-slate-500">{METHOD_LABEL[selected.publishMethod]}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              <Field label="Angolo semantico" value={selected.angle} />
              <Field label="Titolo" value={selected.title} />
              <div>
                <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Testo nativo</div>
                <pre className="text-sm text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap">{selected.body}</pre>
              </div>
              {selected.hashtags?.length > 0 && <Field label="Hashtag" value={selected.hashtags.join(' ')} />}
              <Field label="CTA" value={selected.cta} />
              {selected.link && <Field label="Link (con UTM)" value={selected.link} />}
              <Field label="Media suggerito" value={selected.mediaSuggestion} />
              <Field label="Note operative" value={selected.opNotes} />
              {selected.riskFlags?.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-400 mb-1">Segnali di rischio ({selected.riskScore})</div>
                  <ul className="list-disc list-inside text-sm text-red-600">{selected.riskFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 px-6 py-4 flex justify-between gap-3 bg-white rounded-b-2xl">
              <button onClick={() => copyPackage(selected)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
                <Copy className="h-4 w-4" /> {copied ? 'Copiato!' : 'Copia pacchetto'}
              </button>
              <div className="flex gap-2">
                {(selected.status === 'pending_approval' || selected.status === 'draft') && (
                  <button onClick={() => act(selected.id, 'approve')} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"><Check className="h-4 w-4" /> Approva</button>
                )}
                {selected.status !== 'published' && (
                  <button onClick={() => act(selected.id, 'publish-manual')} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"><Clock className="h-4 w-4" /> Segna pubblicato</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-400 mb-1">{label}</div>
      <div className="text-sm text-slate-800 break-words">{value || '—'}</div>
    </div>
  );
}
