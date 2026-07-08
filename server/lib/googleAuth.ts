import crypto from 'crypto';

// Auth service-account Google (MVP-3, usata da Search Console).
// JWT bearer flow fatto a mano con node:crypto — zero dipendenze aggiuntive,
// stesso stile dell'HMAC dei webhook. Solo API ufficiali, nessun browser.

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

const tokenCache = new Map<string, CachedToken>();

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Ottiene un access token OAuth2 per un service account Google.
// serviceAccountJson: contenuto del file JSON scaricato dalla console GCP.
export async function getServiceAccountToken(serviceAccountJson: string, scope: string): Promise<string> {
  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('serviceAccountJson non è JSON valido: incolla il contenuto del file del service account.');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('serviceAccountJson incompleto: servono client_email e private_key.');
  }

  const cacheKey = `${sa.client_email}|${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token; // riusa finché mancano più di 60s alla scadenza
  }

  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${header}.${claims}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Token Google rifiutato: ${json.error_description || json.error || res.status}`);
  }

  const expiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt });
  return json.access_token;
}
