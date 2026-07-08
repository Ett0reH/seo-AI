import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import { db } from './server/db';
import { analyzeContent } from './server/ai';
import { runDistributionPipeline } from './server/orchestrator/pipeline';
import { startPublishWorker, executePublish } from './server/orchestrator/publishWorker';
import { startVisibilityWorker, runVisibilityCheck, reoptimizeVariant } from './server/orchestrator/visibilityWorker';
import { DEFAULT_CONNECTOR, SETTINGS_CONNECTORS, getIntegration, testIntegration, isAutoPublishable } from './server/publishers';
import { buildReport } from './server/agents/report';
import { getVisibilityConfig } from './server/agents/seoVisibility';
import { logAction } from './server/lib/audit';
import type { VariantStatus, VariantRow } from './server/types';

const SHARED_SECRET = process.env.SAAS_SHARED_SECRET || 'sk_live_1234567890abcdef';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to capture raw body for HMAC verification
  app.use(express.json({
    limit: '50mb',
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));

  // API Routes
  app.get('/api/sites', (req, res) => {
    const sites = db.prepare('SELECT * FROM sites').all();
    res.json(sites);
  });

  app.get('/api/pages', (req, res) => {
    const pages = db.prepare('SELECT * FROM pages ORDER BY lastAnalyzed DESC').all();
    res.json(pages);
  });

  app.get('/api/entities', (req, res) => {
    const entities = db.prepare('SELECT * FROM entities ORDER BY mentions DESC').all();
    res.json(entities);
  });

  app.get('/api/stats', (req, res) => {
    const sitesCount = db.prepare('SELECT COUNT(*) as c FROM sites').get() as { c: number };
    const pagesCount = db.prepare('SELECT COUNT(*) as c FROM pages').get() as { c: number };
    const entitiesCount = db.prepare('SELECT COUNT(*) as c FROM entities').get() as { c: number };
    res.json({ 
      sitesCount: sitesCount.c, 
      pagesCount: pagesCount.c, 
      entitiesCount: entitiesCount.c 
    });
  });

  // ============================================================
  // Multi-agent content distribution (MVP-1)
  // ============================================================

  const JSON_FIELDS = ['utm', 'hashtags', 'tags', 'riskFlags', 'keywords', 'entities', 'engagement'];
  const parseRow = (row: any) => {
    if (!row) return row;
    const out = { ...row };
    for (const f of JSON_FIELDS) {
      if (typeof out[f] === 'string') {
        try { out[f] = JSON.parse(out[f]); } catch { /* lascia grezzo */ }
      }
    }
    return out;
  };

  // Crea un contenuto master e avvia la pipeline di distribuzione in background.
  app.post('/api/master', (req, res) => {
    const { title, rawContent, sourceUrl, linkTarget, siteUrl } = req.body || {};
    if (!title || !rawContent) {
      return res.status(400).json({ error: 'title e rawContent sono obbligatori' });
    }
    const id = 'master-' + Date.now();
    db.prepare(
      `INSERT INTO master_contents (id, title, sourceUrl, rawContent, linkTarget, siteUrl, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'analyzing', ?)`
    ).run(id, title, sourceUrl || '', rawContent, linkTarget || '', siteUrl || '', new Date().toISOString());

    logAction('master', id, 'created', 'user', { title });

    // Ack immediato, pipeline in background (stesso pattern del webhook WP).
    res.json({ success: true, masterId: id, status: 'analyzing' });

    (async () => {
      try {
        await runDistributionPipeline(id);
        console.log(`[Pipeline] Master ${id} completato.`);
      } catch (e) {
        console.error('[Pipeline] Errore:', e);
        db.prepare("UPDATE master_contents SET status='failed' WHERE id=?").run(id);
        logAction('master', id, 'pipeline_failed', 'system', { error: String(e) });
      }
    })();
  });

  app.get('/api/master', (req, res) => {
    const rows = db.prepare('SELECT * FROM master_contents ORDER BY createdAt DESC').all();
    res.json(rows.map(parseRow));
  });

  app.get('/api/master/:id', (req, res) => {
    const master = db.prepare('SELECT * FROM master_contents WHERE id = ?').get(req.params.id);
    if (!master) return res.status(404).json({ error: 'Master non trovato' });
    const variants = db.prepare('SELECT * FROM platform_variants WHERE masterId = ? ORDER BY scheduledAt').all(req.params.id);
    res.json({ master: parseRow(master), variants: variants.map(parseRow) });
  });

  // Elenco varianti con filtri opzionali (status, platform, masterId).
  app.get('/api/variants', (req, res) => {
    const { status, platform, masterId } = req.query;
    const clauses: string[] = [];
    const args: any[] = [];
    if (status) { clauses.push('status = ?'); args.push(status); }
    if (platform) { clauses.push('platform = ?'); args.push(platform); }
    if (masterId) { clauses.push('masterId = ?'); args.push(masterId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM platform_variants ${where} ORDER BY scheduledAt`).all(...args);
    res.json(rows.map(parseRow));
  });

  app.get('/api/variants/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM platform_variants WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Variante non trovata' });
    res.json(parseRow(row));
  });

  // Transizione di stato generica con audit log.
  const setStatus = (id: string, status: VariantStatus, action: string, extra: Record<string, unknown> = {}) => {
    const row = db.prepare('SELECT status FROM platform_variants WHERE id = ?').get(id) as { status: string } | undefined;
    if (!row) return null;
    db.prepare('UPDATE platform_variants SET status = ? WHERE id = ?').run(status, id);
    logAction('variant', id, action, 'user', { from: row.status, to: status, ...extra });
    return db.prepare('SELECT * FROM platform_variants WHERE id = ?').get(id);
  };

  // Approvazione umana: la variante passa a "scheduled" (pronta per lo slot proposto).
  app.post('/api/variants/:id/approve', (req, res) => {
    const updated = setStatus(req.params.id, 'scheduled', 'approved');
    if (!updated) return res.status(404).json({ error: 'Variante non trovata' });
    res.json(parseRow(updated));
  });

  // Rifiuto: la variante viene saltata.
  app.post('/api/variants/:id/reject', (req, res) => {
    const updated = setStatus(req.params.id, 'skipped', 'rejected', { reason: req.body?.reason || '' });
    if (!updated) return res.status(404).json({ error: 'Variante non trovata' });
    res.json(parseRow(updated));
  });

  // Aggiorna lo slot programmato e mette in stato "scheduled".
  app.post('/api/variants/:id/schedule', (req, res) => {
    const { scheduledAt } = req.body || {};
    if (scheduledAt) {
      db.prepare('UPDATE platform_variants SET scheduledAt = ? WHERE id = ?').run(scheduledAt, req.params.id);
    }
    const updated = setStatus(req.params.id, 'scheduled', 'scheduled', { scheduledAt });
    if (!updated) return res.status(404).json({ error: 'Variante non trovata' });
    res.json(parseRow(updated));
  });

  // Pubblicazione MANUALE: l'operatore ha pubblicato e registra l'esito (URL, note, screenshot).
  app.post('/api/variants/:id/publish-manual', (req, res) => {
    const variant = db.prepare('SELECT * FROM platform_variants WHERE id = ?').get(req.params.id) as any;
    if (!variant) return res.status(404).json({ error: 'Variante non trovata' });
    const { publishedUrl, author, notes, screenshotPath } = req.body || {};

    const pubId = 'pub-' + Date.now();
    db.prepare(
      `INSERT INTO publications (id, variantId, platform, publishedUrl, publishedAt, author, utm, method, engagement, clicks, referral, screenshotPath, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?, ?, 'published')`
    ).run(
      pubId, variant.id, variant.platform, publishedUrl || '', new Date().toISOString(),
      author || 'operator', variant.utm, variant.publishMethod, screenshotPath || '', notes || ''
    );

    db.prepare("UPDATE platform_variants SET status = 'published' WHERE id = ?").run(variant.id);
    logAction('variant', variant.id, 'published_manual', 'user', { publishedUrl, publicationId: pubId });
    res.json({ success: true, publicationId: pubId });
  });

  // Aggiorna metriche/engagement di una pubblicazione tracciata manualmente.
  // publishedUrl opzionale (MVP-3): backfill dell'URL per le pubblicazioni via
  // scheduler (nascono senza URL) → abilita i check di visibilità.
  app.post('/api/tracking/:variantId', (req, res) => {
    const pub = db.prepare('SELECT * FROM publications WHERE variantId = ? ORDER BY publishedAt DESC LIMIT 1').get(req.params.variantId) as any;
    if (!pub) return res.status(404).json({ error: 'Nessuna pubblicazione trovata per questa variante' });
    const { engagement, clicks, referral, notes, publishedUrl } = req.body || {};
    db.prepare(
      `UPDATE publications SET engagement = ?, clicks = ?, referral = ?, notes = COALESCE(?, notes) WHERE id = ?`
    ).run(
      JSON.stringify(engagement || {}),
      Number(clicks) || 0,
      Number(referral) || 0,
      notes ?? null,
      pub.id
    );
    if (typeof publishedUrl === 'string' && publishedUrl.trim()) {
      db.prepare('UPDATE publications SET publishedUrl = ? WHERE id = ?').run(publishedUrl.trim(), pub.id);
    }
    logAction('publication', pub.id, 'tracking_updated', 'user', { clicks, referral });
    res.json({ success: true });
  });

  // ============================================================
  // Integrazioni di pubblicazione (MVP-2) — solo API/scheduler autorizzati.
  // ============================================================

  const SECRET_KEYS = ['apiKey', 'appPassword', 'token', 'secret', 'serviceAccountJson'];
  const maskSecret = (v: string) => (v.length > 4 ? '••••' + v.slice(-4) : '••••');
  const maskConfig = (config: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(config)) {
      out[k] = SECRET_KEYS.includes(k) && v ? maskSecret(v) : v;
    }
    return out;
  };

  // Piattaforme pubblicabili + pseudo-integrazioni di configurazione (MVP-3).
  const ALL_CONNECTORS: Record<string, string> = { ...DEFAULT_CONNECTOR, ...SETTINGS_CONNECTORS };
  const SETTINGS_LABEL: Record<string, string> = {
    visibility: 'Visibilità SEO/LLM (Gemini)',
    search_console: 'Google Search Console',
  };

  // Stato integrazioni per tutte le piattaforme pubblicabili automaticamente.
  app.get('/api/integrations', (req, res) => {
    const platforms = db.prepare('SELECT id, name, publishMethod FROM platforms').all() as any[];
    const rows = Object.keys(ALL_CONNECTORS).map((platformId) => {
      const platform = platforms.find((p) => p.id === platformId);
      const saved = getIntegration(platformId);
      return {
        platform: platformId,
        platformName: platform?.name || SETTINGS_LABEL[platformId] || platformId,
        publishMethod: platform?.publishMethod || '',
        connector: saved?.connector || ALL_CONNECTORS[platformId],
        enabled: Boolean(saved?.enabled),
        config: maskConfig(saved?.config || {}),
        lastTestedAt: saved?.lastTestedAt || null,
        lastTestOk: saved ? saved.lastTestOk === 1 : null,
      };
    });
    res.json(rows);
  });

  // Salva/aggiorna configurazione: i segreti mascherati non sovrascrivono quelli salvati.
  app.put('/api/integrations/:platform', (req, res) => {
    const platformId = req.params.platform;
    if (!(platformId in ALL_CONNECTORS)) {
      return res.status(400).json({ error: 'Piattaforma non pubblicabile automaticamente (solo API/scheduler autorizzati)' });
    }
    const { enabled, config } = req.body || {};
    const existing = getIntegration(platformId);
    const merged: Record<string, string> = { ...(existing?.config || {}) };
    for (const [k, v] of Object.entries((config || {}) as Record<string, string>)) {
      if (typeof v !== 'string') continue;
      if (SECRET_KEYS.includes(k) && v.startsWith('••••')) continue; // valore mascherato: mantieni
      merged[k] = v;
    }
    db.prepare(
      `INSERT INTO integrations (platform, connector, config, enabled, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(platform) DO UPDATE SET config=excluded.config, enabled=excluded.enabled, updatedAt=excluded.updatedAt`
    ).run(platformId, ALL_CONNECTORS[platformId], JSON.stringify(merged), enabled ? 1 : 0, new Date().toISOString());
    logAction('integration', platformId, 'integration_updated', 'user', { enabled: Boolean(enabled) });
    res.json({ success: true });
  });

  // Test connettività/credenziali senza pubblicare contenuti reali.
  app.post('/api/integrations/:platform/test', async (req, res) => {
    const platformId = req.params.platform;
    const result = await testIntegration(platformId);
    db.prepare('UPDATE integrations SET lastTestedAt = ?, lastTestOk = ? WHERE platform = ?')
      .run(new Date().toISOString(), result.ok ? 1 : 0, platformId);
    logAction('integration', platformId, 'integration_tested', 'user', { ok: result.ok, error: result.error });
    res.json(result);
  });

  // Pubblicazione IMMEDIATA via connettore. Gate invariato: solo varianti già
  // approvate (stato 'scheduled') e con metodo api/scheduler.
  app.post('/api/variants/:id/publish-now', async (req, res) => {
    const variant = db.prepare('SELECT * FROM platform_variants WHERE id = ?').get(req.params.id) as VariantRow | undefined;
    if (!variant) return res.status(404).json({ error: 'Variante non trovata' });
    if (variant.status !== 'scheduled') {
      return res.status(400).json({ error: 'Solo varianti approvate (stato "scheduled") possono essere pubblicate via API' });
    }
    if (!isAutoPublishable(variant.platform, variant.publishMethod)) {
      return res.status(400).json({ error: 'Piattaforma non pubblicabile automaticamente: usa il pacchetto manuale' });
    }
    const outcome = await executePublish(variant, 'user');
    if (!outcome.ok) return res.status(502).json({ error: outcome.error });
    res.json({ success: true, publicationId: outcome.publicationId });
  });

  // Report operativo aggregato.
  app.get('/api/report', (req, res) => {
    res.json(buildReport());
  });

  // ============================================================
  // Visibilità SEO/LLM (MVP-3) — solo API ufficiali, nessun browser.
  // ============================================================

  const VISIBILITY_JSON_FIELDS = ['entityMatches', 'topSources', 'queries'];
  // Ultimo check per un refId; answerText resta fuori dalla risposta (solo audit in DB).
  const latestCheck = (scope: 'publication' | 'master', refId: string) => {
    const row = db
      .prepare('SELECT * FROM visibility_checks WHERE scope = ? AND refId = ? ORDER BY checkedAt DESC LIMIT 1')
      .get(scope, refId) as any;
    if (!row) return null;
    const { answerText, ...rest } = row;
    for (const f of VISIBILITY_JSON_FIELDS) {
      if (typeof rest[f] === 'string') {
        try { rest[f] = JSON.parse(rest[f]); } catch { /* lascia grezzo */ }
      }
    }
    return rest;
  };

  // Panoramica: stato integrazione, KPI, pubblicazioni e master con l'ultimo check.
  app.get('/api/visibility', (req, res) => {
    const { enabled, cfg } = getVisibilityConfig();
    const gsc = getIntegration('search_console');

    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const checksToday = (db
      .prepare('SELECT COUNT(*) c FROM visibility_checks WHERE checkedAt >= ?')
      .get(midnight.toISOString()) as { c: number }).c;

    const pubRows = db
      .prepare(
        `SELECT p.id AS publicationId, p.variantId, p.platform, p.publishedUrl, p.clicks,
                v.title, v.angle,
                EXISTS(SELECT 1 FROM platform_variants o WHERE o.optimizedFromId = v.id) AS optimized
         FROM publications p
         LEFT JOIN platform_variants v ON v.id = p.variantId
         ORDER BY p.publishedAt DESC`
      )
      .all() as any[];
    const publications = pubRows.map((r) => ({
      ...r,
      optimized: Boolean(r.optimized),
      check: latestCheck('publication', r.publicationId),
    }));

    const masterRows = db
      .prepare(
        `SELECT m.id, m.title, m.theme FROM master_contents m
         WHERE m.status = 'ready'
           AND EXISTS (SELECT 1 FROM publications p JOIN platform_variants v ON v.id = p.variantId
                       WHERE v.masterId = m.id)
         ORDER BY m.createdAt DESC`
      )
      .all() as any[];
    const masters = masterRows.map((m) => ({ ...m, check: latestCheck('master', m.id) }));

    const checkedPubs = publications.filter((p) => p.check && p.check.status === 'ok');
    res.json({
      enabled,
      config: { brand: cfg.brand, siteDomain: cfg.siteDomain, profileUrl: cfg.profileUrl, intervalHours: cfg.intervalHours, autoOptimize: cfg.autoOptimize, maxDailyChecks: cfg.maxDailyChecks },
      gscEnabled: Boolean(gsc?.enabled),
      kpis: {
        checkedPublications: checkedPubs.length,
        serpPresent: checkedPubs.filter((p) => p.check.serpPresence === 1).length,
        avgScore: checkedPubs.length
          ? Math.round(checkedPubs.reduce((s, p) => s + (p.check.score || 0), 0) / checkedPubs.length)
          : 0,
        llmCitedMasters: masters.filter((m) => m.check && m.check.llmCited === 1).length,
        checksToday,
      },
      publications,
      masters,
    });
  });

  // Check manuale on-demand ("Verifica ora").
  app.post('/api/visibility/check/:scope/:refId', async (req, res) => {
    const scope = req.params.scope;
    if (scope !== 'publication' && scope !== 'master') {
      return res.status(400).json({ error: 'Scope non valido: usa publication o master' });
    }
    const { enabled } = getVisibilityConfig();
    if (!enabled) {
      return res.status(409).json({ error: 'Integrazione Visibilità non abilitata: attivala in Integrazioni' });
    }
    const table = scope === 'publication' ? 'publications' : 'master_contents';
    const exists = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(req.params.refId);
    if (!exists) return res.status(404).json({ error: 'Elemento non trovato' });

    const outcome = await runVisibilityCheck(scope, req.params.refId, 'user');
    if (!outcome.ok) return res.status(502).json({ error: outcome.error, checkId: outcome.checkId });
    res.json({ success: true, check: latestCheck(scope, req.params.refId) });
  });

  // Feedback loop manuale: rigenera una variante ottimizzata (bozza da approvare).
  app.post('/api/variants/:id/reoptimize', async (req, res) => {
    const variant = db.prepare('SELECT id, status FROM platform_variants WHERE id = ?').get(req.params.id) as any;
    if (!variant) return res.status(404).json({ error: 'Variante non trovata' });
    if (variant.status !== 'published') {
      return res.status(400).json({ error: 'Solo varianti pubblicate possono essere rigenerate dal feedback loop' });
    }
    const already = db.prepare('SELECT id FROM platform_variants WHERE optimizedFromId = ?').get(req.params.id);
    if (already) return res.status(409).json({ error: 'Variante già ottimizzata: la nuova bozza è in Bozze & Approvazioni' });

    const outcome = await reoptimizeVariant(req.params.id, 'user');
    if (!outcome.ok) return res.status(502).json({ error: outcome.error });
    res.json({ success: true, newVariantId: outcome.newVariantId });
  });

  // Configurazione piattaforme (per la UI).
  app.get('/api/platforms', (req, res) => {
    res.json(db.prepare('SELECT * FROM platforms ORDER BY name').all());
  });

  // Log azioni.
  app.get('/api/audit', (req, res) => {
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT 200').all();
    res.json(rows.map(parseRow));
  });

  // Download WordPress Plugin
  app.get('/api/download-plugin', (req, res) => {
    const pluginPath = path.join(process.cwd(), 'wordpress-plugin', 'saas-ai-seo.php');
    res.download(pluginPath, 'saas-ai-seo.php');
  });

  // Webhook endpoint for WordPress Plugin
  app.get(['/api/webhooks/wp', '/api/webhooks/wp/'], (req, res) => {
    res.status(405).json({ error: 'Method Not Allowed. Please ensure your SaaS URL in WordPress starts with https:// to avoid redirects that drop the POST payload.' });
  });

  app.post(['/api/webhooks/wp', '/api/webhooks/wp/'], async (req: any, res) => {
    const signature = req.headers['x-saas-signature'];
    const payload = req.rawBody || (req.body ? JSON.stringify(req.body) : '');

    // 1. Verify HMAC Signature
    if (signature) {
      try {
        const expectedSignature = crypto.createHmac('sha256', SHARED_SECRET).update(payload).digest('hex');
        if (signature !== expectedSignature) {
          console.warn('Invalid webhook signature detected.');
          return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
        }
      } catch (err) {
        console.error('Error verifying signature:', err);
        return res.status(500).json({ error: 'Internal server error during signature verification' });
      }
    } else {
      console.warn('Webhook received without signature. Proceeding for dev mode, but this should be blocked in production.');
    }

    const body = req.body || {};
    const { test, siteId, postId, postUrl, postTitle, postContent, wpRestUrl } = body;
    
    // Handle test payload
    if (test) {
      console.log(`[Webhook] Received test connection from ${siteId}`);
      return res.json({ success: true, message: 'Test connection successful' });
    }

    if (!siteId || !postUrl || !postTitle || !postContent || !postId || !wpRestUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 2. Acknowledge receipt immediately (Non-blocking for WP)
    res.json({ success: true, message: 'Webhook received, processing in background' });

    // 3. Process in background
    (async () => {
      try {
        console.log(`[Background Job] Analyzing content for ${postUrl}...`);
        const aiResult = await analyzeContent(postTitle, postContent, postUrl);
        
        // Upsert Site in SaaS DB
        const upsertSite = db.prepare(`
          INSERT INTO sites (id, name, url, status, lastSync, pageCount)
          VALUES (?, ?, ?, ?, ?, 0)
          ON CONFLICT(id) DO UPDATE SET
            lastSync = excluded.lastSync,
            status = 'connected'
        `);
        upsertSite.run(siteId, siteId, `https://${siteId}`, 'connected', new Date().toISOString());

        // Save/Update Page in SaaS DB
        const stmt = db.prepare(`
          INSERT INTO pages (id, siteId, title, url, status, lastAnalyzed, topic, searchIntent, schemaType, jsonLd)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(url) DO UPDATE SET
            title=excluded.title,
            status=excluded.status,
            lastAnalyzed=excluded.lastAnalyzed,
            topic=excluded.topic,
            searchIntent=excluded.searchIntent,
            schemaType=excluded.schemaType,
            jsonLd=excluded.jsonLd
        `);
        
        const pageId = 'page-' + Date.now();
        stmt.run(
          pageId, 
          siteId, 
          postTitle, 
          postUrl, 
          'auto-published', 
          new Date().toISOString(), 
          aiResult.topic, 
          aiResult.searchIntent, 
          aiResult.schemaType, 
          JSON.stringify(aiResult.jsonLd)
        );

        // Update site page count
        db.prepare('UPDATE sites SET pageCount = (SELECT COUNT(*) FROM pages WHERE siteId = ?) WHERE id = ?').run(siteId, siteId);

        // Upsert Entities in SaaS DB
        const insertEntity = db.prepare(`
          INSERT INTO entities (id, name, type, wikipediaUrl, mentions)
          VALUES (?, ?, ?, ?, 1)
          ON CONFLICT(name) DO UPDATE SET
            mentions = mentions + 1,
            wikipediaUrl = COALESCE(excluded.wikipediaUrl, wikipediaUrl)
        `);

        for (const entity of aiResult.entities || []) {
          insertEntity.run(
            'ent-' + Date.now() + Math.random().toString(36).substring(2, 7),
            entity.name,
            entity.type,
            entity.wikipediaUrl || null
          );
        }

        // 4. Send JSON-LD back to WordPress
        // Ensure URL doesn't have double slashes but keep the protocol slashes
        const cleanWpRestUrl = wpRestUrl.replace(/([^:]\/)\/+/g, "$1");
        console.log(`[Background Job] Sending JSON-LD back to WordPress: ${cleanWpRestUrl}`);
        
        // 1. Costruisci l'oggetto payload con postId e jsonLd INSIEME
        const payloadObject = {
          postId: postId,
          jsonLd: aiResult.jsonLd
        };
        
        // 2. Serializza in stringa JSON
        const payloadString = JSON.stringify(payloadObject);
        
        // 3. Calcola firma HMAC-SHA256 sulla stringa JSON ESATTA
        const callbackSignature = crypto
          .createHmac('sha256', SHARED_SECRET)
          .update(payloadString)
          .digest('hex');

        // 4. Wrappa in un campo form chiamato "payload"
        const formData = new URLSearchParams();
        formData.append('payload', payloadString);

        console.log(`[Background Job] Executing POST request to: ${cleanWpRestUrl}`);
        
        // 5. Invia come application/x-www-form-urlencoded
        const wpResponse = await fetch(cleanWpRestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-SaaS-Signature': callbackSignature
          },
          body: formData.toString(),
          redirect: 'manual' // Don't follow redirects automatically so we can see if WP is redirecting us
        });

        console.log('[Background Job] WP response status:', wpResponse.status);
        const responseBody = await wpResponse.text();
        console.log('[Background Job] WP response body:', responseBody);

        if (wpResponse.status >= 300 && wpResponse.status < 400) {
           console.error(`[Background Job] WordPress returned a redirect (${wpResponse.status}) to: ${wpResponse.headers.get('location')}. This usually breaks POST requests.`);
        }

        if (!wpResponse.ok) {
          console.error(`[Background Job] Failed to send data back to WP. Status: ${wpResponse.status}, Body: ${responseBody}`);
        } else {
          console.log(`[Background Job] Successfully updated WordPress post ${postId}`);
        }

      } catch (e) {
        console.error('[Background Job] Error:', e);
      }
    })();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Worker MVP-2: pubblica le varianti approvate allo slot, via API/scheduler autorizzati.
  startPublishWorker();

  // Worker MVP-3: check di visibilità SEO/LLM (attivo solo se l'integrazione è abilitata).
  startVisibilityWorker();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
