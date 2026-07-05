import { useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { MasterContent as MasterType } from '../types';

export function MasterContent() {
  const [title, setTitle] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [masters, setMasters] = useState<MasterType[]>([]);

  const loadMasters = () => {
    fetch('/api/master').then((r) => r.json()).then(setMasters).catch(console.error);
  };

  useEffect(() => {
    loadMasters();
    const t = setInterval(loadMasters, 5000); // aggiorna lo stato pipeline
    return () => clearInterval(t);
  }, []);

  const submit = async () => {
    if (!title || !rawContent) return;
    setSubmitting(true);
    try {
      await fetch('/api/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, rawContent, sourceUrl, siteUrl, linkTarget }),
      });
      setTitle(''); setRawContent(''); setSourceUrl('');
      loadMasters();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Distribuzione multi-agente</h1>
        <p className="mt-2 text-sm text-slate-600">
          Incolla un contenuto master: gli agenti genereranno varianti native e non duplicate per ogni piattaforma, come bozze da approvare.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Titolo *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Es. Come strutturare i contenuti per la visibilità negli LLM" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contenuto master *</label>
          <textarea value={rawContent} onChange={(e) => setRawContent(e.target.value)} rows={8}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            placeholder="Incolla qui il contenuto sorgente completo..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL sorgente</label>
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://sito.it/articolo" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sito principale</label>
            <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://sito.it" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Profilo LinkedIn target</label>
            <input value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://linkedin.com/in/..." />
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={submit} disabled={submitting || !title || !rawContent}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Genera varianti
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-slate-900">Master</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Tema / Intent</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Stato</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Creato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {masters.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-500">Nessun contenuto master ancora.</td></tr>
            ) : masters.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="py-4 pl-6 pr-3 text-sm font-medium text-slate-900">{m.title}</td>
                <td className="px-3 py-4 text-sm text-slate-600">{m.theme || '—'}<div className="text-xs text-slate-400">{m.intent || ''}</div></td>
                <td className="px-3 py-4 text-sm">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    m.status === 'ready' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                    : m.status === 'failed' ? 'bg-red-50 text-red-700 ring-red-600/20'
                    : 'bg-amber-50 text-amber-700 ring-amber-600/20'}`}>
                    {m.status === 'ready' ? <CheckCircle2 className="h-3 w-3" /> : m.status === 'failed' ? <AlertCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                    {m.status}
                  </span>
                </td>
                <td className="px-3 py-4 text-sm text-slate-500">{new Date(m.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
