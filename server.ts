import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import { db } from './server/db';
import { analyzeContent } from './server/ai';

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
        const aiResult = await analyzeContent(postTitle, postContent);
        
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
