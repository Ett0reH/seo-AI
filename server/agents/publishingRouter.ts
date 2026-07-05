import type { PlatformConfig, PublishMethod, VariantStatus } from '../types';

// Publishing Router Agent
// Decide, per ogni piattaforma, il metodo di pubblicazione basandosi SOLO sulla
// configurazione. Vincolo assoluto: nessun browser publisher. Qualsiasi metodo
// sconosciuto viene degradato a "manual_guided".
const ALLOWED_METHODS: PublishMethod[] = ['api', 'scheduler', 'semi_automatic', 'manual_guided'];

// Piattaforme community: mai forzare, sempre manuale guidato.
const COMMUNITY_PLATFORMS = new Set(['reddit', 'quora', 'hackernews']);

export function resolvePublishMethod(platform: PlatformConfig): PublishMethod {
  if (COMMUNITY_PLATFORMS.has(platform.id)) return 'manual_guided';
  if (ALLOWED_METHODS.includes(platform.publishMethod)) return platform.publishMethod;
  return 'manual_guided';
}

// Stato iniziale della variante in base al rischio del metodo.
// Piattaforme "rischiose" (approvazione umana) partono in pending_approval;
// le altre restano in draft finché non vengono approvate/schedulate.
const HUMAN_APPROVAL_METHODS = new Set<PublishMethod>(['semi_automatic', 'manual_guided']);

export function initialStatus(method: PublishMethod, riskScore: number): VariantStatus {
  if (HUMAN_APPROVAL_METHODS.has(method) || riskScore >= 40) return 'pending_approval';
  return 'draft';
}
