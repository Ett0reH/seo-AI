import { getServiceAccountToken } from './googleAuth';
import type { Publisher, PublishResult, VariantRow } from '../types';

// Google Search Console — URL Inspection API (MVP-3).
// Verifica lo stato di indicizzazione SOLO per URL della property verificata
// dell'utente (limite dell'API): il sito del master, non dev.to/GitHub/etc.
// Config (integrations, platform='search_console'):
//   serviceAccountJson — JSON del service account (aggiunto come utente della property)
//   property           — 'sc-domain:miosito.it' oppure 'https://miosito.it/'

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

// Un URL appartiene alla property? Gestisce sia 'sc-domain:' sia URL-prefix.
export function urlInProperty(url: string, property: string): boolean {
  if (!url || !property) return false;
  if (property.startsWith('sc-domain:')) {
    const domain = property.slice('sc-domain:'.length).toLowerCase();
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      return host === domain || host.endsWith('.' + domain);
    } catch {
      return false;
    }
  }
  return url.startsWith(property);
}

// Ispeziona un URL. Restituisce null se l'URL è fuori dalla property
// (non verificabile via GSC, non è un errore).
export async function inspectUrl(
  config: Record<string, string>,
  url: string
): Promise<{ indexed: boolean; verdict: string; coverageState: string } | null> {
  const property = config.property || '';
  if (!urlInProperty(url, property)) return null;

  const token = await getServiceAccountToken(config.serviceAccountJson || '', SCOPE);
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`URL Inspection fallita (${res.status}): ${json.error?.message || 'errore sconosciuto'}`);
  }
  const result = json.inspectionResult?.indexStatusResult || {};
  const verdict = String(result.verdict || 'NEUTRAL');
  return {
    indexed: verdict === 'PASS',
    verdict,
    coverageState: String(result.coverageState || ''),
  };
}

// Connettore di sola configurazione: non pubblica mai (vincolo no-browser invariato).
export const gscConnector: Publisher = {
  async publish(_variant: VariantRow, _config: Record<string, string>): Promise<PublishResult> {
    return { ok: false, error: 'Connettore di sola configurazione (Search Console): non pubblica contenuti.' };
  },

  // Test: token valido + property presente tra i siti del service account.
  async test(config: Record<string, string>): Promise<PublishResult> {
    if (!config.serviceAccountJson) return { ok: false, error: 'serviceAccountJson mancante.' };
    if (!config.property) return { ok: false, error: 'property mancante (es. sc-domain:miosito.it).' };
    const token = await getServiceAccountToken(config.serviceAccountJson, SCOPE);
    const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Elenco property fallito (${res.status}): ${json.error?.message || 'errore'}` };
    }
    const sites: any[] = json.siteEntry || [];
    const found = sites.some((s) => s.siteUrl === config.property);
    if (!found) {
      return {
        ok: false,
        error: `Property "${config.property}" non trovata: aggiungi il service account come utente della property in Search Console.`,
      };
    }
    return { ok: true };
  },
};
