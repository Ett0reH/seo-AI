import { useEffect, useState } from 'react';
import { Plug, Save, FlaskConical, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Integration } from '../types';

// Campi di configurazione per connettore (i segreti arrivano mascherati dal server).
const CONNECTOR_FIELDS: Record<string, Array<{ key: string; label: string; secret?: boolean; placeholder: string }>> = {
  devto: [
    { key: 'apiKey', label: 'API key Dev.to', secret: true, placeholder: 'dal profilo Dev.to → Settings → Extensions' },
  ],
  wordpress: [
    { key: 'baseUrl', label: 'URL sito WordPress', placeholder: 'https://miosito.it' },
    { key: 'username', label: 'Utente', placeholder: 'admin' },
    { key: 'appPassword', label: 'Application password', secret: true, placeholder: 'xxxx xxxx xxxx xxxx' },
    { key: 'postStatus', label: 'Stato post (publish/draft)', placeholder: 'publish' },
  ],
  github: [
    { key: 'token', label: 'Token (fine-grained PAT)', secret: true, placeholder: 'github_pat_...' },
    { key: 'owner', label: 'Owner', placeholder: 'mio-utente' },
    { key: 'repo', label: 'Repository', placeholder: 'blog' },
    { key: 'dir', label: 'Cartella (opzionale)', placeholder: 'content' },
    { key: 'branch', label: 'Branch (opzionale)', placeholder: 'main' },
  ],
  webhook: [
    { key: 'webhookUrl', label: 'URL webhook scheduler', placeholder: 'https://hook.make.com/... (Make/n8n/Publer)' },
    { key: 'secret', label: 'Segreto firma HMAC (opzionale)', secret: true, placeholder: 'condiviso con lo scheduler' },
  ],
};

const CONNECTOR_LABEL: Record<string, string> = {
  devto: 'API ufficiale Dev.to',
  wordpress: 'WordPress REST API',
  github: 'GitHub REST API',
  webhook: 'Webhook → scheduler autorizzato',
};

export function Integrations() {
  const [items, setItems] = useState<Integration[]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; error?: string }>>({});

  const load = () => {
    fetch('/api/integrations').then((r) => r.json()).then(setItems).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const fieldValue = (it: Integration, key: string) =>
    edits[it.platform]?.[key] ?? it.config[key] ?? '';

  const setField = (platform: string, key: string, value: string) =>
    setEdits((p) => ({ ...p, [platform]: { ...(p[platform] || {}), [key]: value } }));

  const save = async (it: Integration, enabled: boolean) => {
    setBusy(it.platform);
    try {
      const config: Record<string, string> = {};
      for (const f of CONNECTOR_FIELDS[it.connector]) config[f.key] = fieldValue(it, f.key);
      await fetch(`/api/integrations/${it.platform}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, config }),
      });
      setEdits((p) => ({ ...p, [it.platform]: {} }));
      load();
    } finally {
      setBusy(null);
    }
  };

  const test = async (it: Integration) => {
    setBusy(it.platform);
    try {
      const r = await fetch(`/api/integrations/${it.platform}/test`, { method: 'POST' });
      const json = await r.json();
      setTestResult((p) => ({ ...p, [it.platform]: json }));
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2"><Plug className="h-6 w-6 text-indigo-600" /> Integrazioni di pubblicazione</h1>
        <p className="mt-2 text-sm text-slate-600">
          Solo API ufficiali e scheduler autorizzati (Make, n8n, Publer). Nessuna automazione browser.
          Le piattaforme semi-automatiche e manuali restano al flusso di approvazione + pacchetto.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {items.map((it) => {
          const result = testResult[it.platform];
          return (
            <div key={it.platform} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{it.platformName}</h2>
                  <p className="text-xs text-slate-500">{CONNECTOR_LABEL[it.connector]}</p>
                </div>
                <div className="flex items-center gap-2">
                  {it.lastTestOk === true && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {it.lastTestOk === false && <XCircle className="h-4 w-4 text-red-500" />}
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${it.enabled ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-500 ring-slate-500/10'}`}>
                    {it.enabled ? 'Attiva' : 'Disattiva'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {CONNECTOR_FIELDS[it.connector].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    <input
                      type={f.secret ? 'password' : 'text'}
                      value={fieldValue(it, f.key)}
                      onChange={(e) => setField(it.platform, f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>

              {result && !result.ok && <p className="text-xs text-red-600">{result.error}</p>}
              {result?.ok && <p className="text-xs text-emerald-600">Test riuscito: credenziali valide.</p>}

              <div className="flex justify-end gap-2">
                <button onClick={() => test(it)} disabled={busy === it.platform}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                  {busy === it.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Testa
                </button>
                <button onClick={() => save(it, !it.enabled)} disabled={busy === it.platform}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-600 hover:bg-slate-500 rounded-lg disabled:opacity-50">
                  {it.enabled ? 'Disattiva' : 'Attiva'}
                </button>
                <button onClick={() => save(it, it.enabled)} disabled={busy === it.platform}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" /> Salva
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
