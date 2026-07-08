import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanSearch, RefreshCw, Sparkles, Loader2, Globe2, Bot } from 'lucide-react';
import { VisibilityOverview, VisibilityCheck } from '../types';

// Visibilità SEO/LLM (MVP-3): presenza SERP, menzioni brand, citazioni LLM,
// entity matching e indicizzazione GSC. Solo API ufficiali, nessun browser.
export function Visibility() {
  const [data, setData] = useState<VisibilityOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetch('/api/visibility').then((r) => r.json()).then(setData).catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const runCheck = async (scope: 'publication' | 'master', refId: string) => {
    setBusy(refId);
    setError(null);
    try {
      const res = await fetch(`/api/visibility/check/${scope}/${refId}`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || `Errore ${res.status}`);
      }
      load();
    } finally {
      setBusy(null);
    }
  };

  const reoptimize = async (variantId: string) => {
    setBusy(variantId);
    setError(null);
    try {
      const res = await fetch(`/api/variants/${variantId}/reoptimize`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Errore ${res.status}`);
      }
      load();
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="text-sm text-slate-500">Caricamento visibilità...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <ScanSearch className="h-6 w-6 text-indigo-600" /> Visibilità SEO/LLM
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Presenza nei risultati di ricerca, menzioni del brand e citazioni negli LLM per i contenuti distribuiti.
          Solo API ufficiali (Gemini + Google Search grounding, Search Console): nessun browser, nessuno scraping.
        </p>
      </div>

      {!data.enabled && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm text-indigo-800">
            L'integrazione <span className="font-semibold">Visibilità SEO/LLM</span> non è attiva.
            Configura brand e dominio in{' '}
            <Link to="/integrations" className="font-semibold underline">Integrazioni</Link>{' '}
            e attivala per abilitare i check automatici (max 1 ogni 10 minuti, con cap giornaliero).
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <Stat label="Pubblicazioni verificate" value={data.kpis.checkedPublications} />
        <Stat label="Presenti in SERP" value={data.kpis.serpPresent} />
        <Stat label="Score medio" value={data.kpis.avgScore} suffix="/100" />
        <Stat label="Master citati da LLM" value={data.kpis.llmCitedMasters} />
        <Stat label="Check oggi" value={data.kpis.checksToday} />
      </div>

      {/* Pubblicazioni */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-slate-900">Pubblicazioni</h2>
        </div>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-slate-900">Piattaforma</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Contenuto</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">SERP</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Menzioni</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Score</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900">Ultimo check</th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-slate-900">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.publications.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-500">Nessuna pubblicazione: pubblica una variante e tracciala per verificarne la visibilità.</td></tr>
            )}
            {data.publications.map((p) => {
              const noUrl = !p.publishedUrl;
              const check = p.check;
              const lowScore = check && check.status === 'ok' && check.score < 40;
              return (
                <tr key={p.publicationId} className={noUrl ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50'}>
                  <td className="py-3.5 pl-6 pr-3 text-sm font-medium">{p.platform}</td>
                  <td className="px-3 py-3.5 text-sm max-w-xs">
                    <div className="truncate" title={p.title}>{p.title || '—'}</div>
                    {noUrl && <div className="text-xs text-slate-400">Aggiungi l'URL pubblicato nel Tracking per abilitare la verifica.</div>}
                    {check?.notes && !noUrl && <div className="text-xs text-slate-400 truncate" title={check.notes}>{check.notes}</div>}
                  </td>
                  <td className="px-3 py-3.5"><SerpBadge check={check} /></td>
                  <td className="px-3 py-3.5 text-sm">{check ? check.brandMentions : '—'}</td>
                  <td className="px-3 py-3.5"><ScoreBadge check={check} /></td>
                  <td className="px-3 py-3.5 text-xs text-slate-500">
                    {check ? new Date(check.checkedAt).toLocaleString() : 'Mai verificata'}
                  </td>
                  <td className="px-3 py-3.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => runCheck('publication', p.publicationId)}
                      disabled={busy !== null || noUrl || !data.enabled}
                      title="Verifica ora"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === p.publicationId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Verifica ora
                    </button>
                    {lowScore && !p.optimized && (
                      <button
                        onClick={() => reoptimize(p.variantId)}
                        disabled={busy !== null}
                        title="Rigenera una variante ottimizzata (bozza da approvare)"
                        className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50"
                      >
                        {busy === p.variantId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Rigenera ottimizzata
                      </button>
                    )}
                    {p.optimized && (
                      <span className="ml-2 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20">
                        Ottimizzata
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Master */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-600" /> Visibilità dei contenuti master (SERP + LLM)
        </h2>
        {data.masters.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Nessun master con pubblicazioni: i check master partono dopo la prima pubblicazione.
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.masters.map((m) => {
            const check = m.check;
            return (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{m.title}</h3>
                    <p className="text-xs text-slate-500">{m.theme}</p>
                  </div>
                  <button
                    onClick={() => runCheck('master', m.id)}
                    disabled={busy !== null || !data.enabled}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 shrink-0"
                  >
                    {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Verifica ora
                  </button>
                </div>

                {!check && <p className="text-sm text-slate-400">Mai verificato.</p>}
                {check && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <SerpBadge check={check} />
                      <Pill on={check.llmCited === 1} off={check.llmCited === 0} labelOn="Citato da LLM" labelOff="Non citato da LLM" labelNull="LLM n/d" />
                      {check.indexedGsc !== null && (
                        <Pill on={check.indexedGsc === 1} off={check.indexedGsc === 0} labelOn="Indicizzato (GSC)" labelOff="Non indicizzato (GSC)" labelNull="" />
                      )}
                      <ScoreBadge check={check} />
                      <span className="text-xs text-slate-500">{check.brandMentions} menzioni brand</span>
                    </div>

                    {(check.entityMatches.matched.length > 0 || check.entityMatches.missing.length > 0) && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">Entity matching (l'LLM associa al brand):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {check.entityMatches.matched.map((e) => (
                            <span key={e} className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20">{e}</span>
                          ))}
                          {check.entityMatches.missing.map((e) => (
                            <span key={e} className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-slate-100 text-slate-500 ring-slate-500/10">{e}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {check.topSources.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">Fonti più autorevoli sul tema:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {check.topSources.map((s, i) => (
                            <span key={i} className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.matched ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' : 'bg-slate-50 text-slate-500 ring-slate-500/10'}`}>
                              {s.domain || s.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-400">
                      Ultimo check: {new Date(check.checkedAt).toLocaleString()}
                      {check.notes ? ` — ${check.notes}` : ''}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{value}{suffix || ''}</div>
    </div>
  );
}

function SerpBadge({ check }: { check: VisibilityCheck | null }) {
  if (!check) {
    return <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-slate-100 text-slate-400 ring-slate-500/10">n/d</span>;
  }
  if (check.status === 'failed') {
    return <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-600/20">Check fallito</span>;
  }
  return check.serpPresence === 1 ? (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20">In SERP</span>
  ) : (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-600/20">Non rilevata</span>
  );
}

function ScoreBadge({ check }: { check: VisibilityCheck | null }) {
  if (!check || check.status === 'failed') {
    return <span className="text-sm text-slate-400">—</span>;
  }
  const color =
    check.score >= 70 ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : check.score >= 40 ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
    : 'bg-amber-50 text-amber-700 ring-amber-600/20';
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${color}`}>{check.score}/100</span>;
}

function Pill({ on, off, labelOn, labelOff, labelNull }: { on: boolean; off: boolean; labelOn: string; labelOff: string; labelNull: string }) {
  if (on) {
    return <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20">{labelOn}</span>;
  }
  if (off) {
    return <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-amber-50 text-amber-700 ring-amber-600/20">{labelOff}</span>;
  }
  if (!labelNull) return null;
  return <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset bg-slate-100 text-slate-400 ring-slate-500/10">{labelNull}</span>;
}
