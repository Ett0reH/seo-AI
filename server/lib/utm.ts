import type { Utm, PublishMethod } from '../types';

// Mappa il metodo di pubblicazione a un utm_medium coerente.
function mediumFor(platformId: string): string {
  const social = ['linkedin_personal', 'linkedin_company', 'youtube'];
  const blog = ['wordpress', 'medium', 'hashnode', 'devto', 'substack'];
  const community = ['reddit', 'quora', 'hackernews'];
  if (platformId === 'google_business_profile') return 'local';
  if (platformId === 'behance') return 'portfolio';
  if (platformId === 'slideshare') return 'document';
  if (platformId === 'zenodo') return 'research';
  if (social.includes(platformId)) return 'social';
  if (blog.includes(platformId)) return 'blog';
  if (community.includes(platformId)) return 'community';
  return 'referral';
}

// Slug stabile per la campagna a partire dal titolo del master.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')            // separa gli accenti dalle lettere base
    .replace(/[^a-z0-9]+/g, '-') // rimuove accenti e non-alfanumerici
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

// Costruisce un URL con UTM coerenti per una variante.
// utm_source = piattaforma, utm_medium = classe canale, utm_campaign = slug master,
// utm_content = id variante (unico), utm_term = keyword principale opzionale.
export function buildUtm(params: {
  baseUrl: string;
  platformId: string;
  campaignSlug: string;
  variantId: string;
  term?: string;
}): Utm {
  const { baseUrl, platformId, campaignSlug, variantId, term } = params;
  const utm: Utm = {
    source: platformId,
    medium: mediumFor(platformId),
    campaign: campaignSlug,
    content: variantId,
    term,
    url: '',
  };
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    utm.url = baseUrl; // link non valido: restituiamo il grezzo, la Compliance lo segnalerà
    return utm;
  }
  url.searchParams.set('utm_source', utm.source);
  url.searchParams.set('utm_medium', utm.medium);
  url.searchParams.set('utm_campaign', utm.campaign);
  url.searchParams.set('utm_content', utm.content);
  if (term) url.searchParams.set('utm_term', slugify(term));
  utm.url = url.toString();
  return utm;
}
