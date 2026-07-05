import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(path.join(dbDir, 'saas.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT,
    url TEXT,
    status TEXT,
    lastSync TEXT,
    pageCount INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    siteId TEXT,
    title TEXT,
    url TEXT UNIQUE,
    status TEXT,
    lastAnalyzed TEXT,
    topic TEXT,
    searchIntent TEXT,
    schemaType TEXT,
    jsonLd TEXT
  );

  CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    type TEXT,
    wikipediaUrl TEXT,
    mentions INTEGER DEFAULT 1
  );

  -- ============================================================
  -- Multi-agent content distribution (MVP-1)
  -- Tabelle nuove, indipendenti da sites/pages/entities.
  -- ============================================================

  -- Contenuto master: input della pipeline di distribuzione.
  CREATE TABLE IF NOT EXISTS master_contents (
    id TEXT PRIMARY KEY,
    title TEXT,
    sourceUrl TEXT,
    rawContent TEXT,
    theme TEXT,
    intent TEXT,
    keywords TEXT,        -- JSON string[]
    entities TEXT,        -- JSON {name,type}[]
    audience TEXT,
    cta TEXT,
    linkTarget TEXT,      -- profilo LinkedIn target
    siteUrl TEXT,         -- sito principale
    format TEXT,
    status TEXT,          -- analyzing | ready | failed
    createdAt TEXT
  );

  -- Configurazione piattaforme e metodo di pubblicazione (no browser).
  CREATE TABLE IF NOT EXISTS platforms (
    id TEXT PRIMARY KEY,
    name TEXT,
    publishMethod TEXT,   -- api | scheduler | semi_automatic | manual_guided
    maxLength INTEGER,
    hashtagLimit INTEGER,
    linkPolicy TEXT,      -- inline | first_comment | bio_only | none
    toneHint TEXT,
    enabled INTEGER DEFAULT 1
  );

  -- Variante nativa per singola piattaforma (bozza pubblicabile).
  CREATE TABLE IF NOT EXISTS platform_variants (
    id TEXT PRIMARY KEY,
    masterId TEXT,
    platform TEXT,
    angle TEXT,
    title TEXT,
    body TEXT,
    mediaSuggestion TEXT,
    link TEXT,
    anchorText TEXT,
    utm TEXT,             -- JSON {source,medium,campaign,content,term,url}
    hashtags TEXT,        -- JSON string[]
    category TEXT,
    tags TEXT,            -- JSON string[]
    cta TEXT,
    opNotes TEXT,
    publishMethod TEXT,
    riskScore INTEGER DEFAULT 0,
    riskFlags TEXT,       -- JSON string[]
    status TEXT,          -- draft | pending_approval | scheduled | published | failed | skipped | archived
    scheduledAt TEXT,
    createdAt TEXT
  );

  -- Tracking delle pubblicazioni reali (manuale in MVP-1).
  CREATE TABLE IF NOT EXISTS publications (
    id TEXT PRIMARY KEY,
    variantId TEXT,
    platform TEXT,
    publishedUrl TEXT,
    publishedAt TEXT,
    author TEXT,
    utm TEXT,             -- JSON
    method TEXT,
    engagement TEXT,      -- JSON {likes,comments,shares,...}
    clicks INTEGER DEFAULT 0,
    referral INTEGER DEFAULT 0,
    screenshotPath TEXT,
    notes TEXT,
    status TEXT
  );

  -- Log di ogni azione del sistema.
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    entityType TEXT,
    entityId TEXT,
    action TEXT,
    actor TEXT,
    details TEXT,         -- JSON
    createdAt TEXT
  );

  -- ============================================================
  -- Integrazioni di pubblicazione (MVP-2)
  -- Solo API ufficiali e scheduler autorizzati: nessun browser.
  -- ============================================================
  CREATE TABLE IF NOT EXISTS integrations (
    platform TEXT PRIMARY KEY,  -- id piattaforma (platforms.id)
    connector TEXT,             -- devto | wordpress | github | webhook
    config TEXT,                -- JSON credenziali/parametri
    enabled INTEGER DEFAULT 0,
    lastTestedAt TEXT,
    lastTestOk INTEGER,
    updatedAt TEXT
  );
`);

// Migrazione MVP-2: colonne retry sul le varianti (idempotente su DB esistenti).
{
  const cols = db.prepare('PRAGMA table_info(platform_variants)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'attempts')) {
    db.exec('ALTER TABLE platform_variants ADD COLUMN attempts INTEGER DEFAULT 0');
  }
  if (!cols.some((c) => c.name === 'lastError')) {
    db.exec('ALTER TABLE platform_variants ADD COLUMN lastError TEXT');
  }
}

// Seed mock data if empty
const sitesCount = db.prepare('SELECT COUNT(*) as c FROM sites').get() as { c: number };
if (sitesCount.c === 0) {
  const insertSite = db.prepare('INSERT INTO sites (id, name, url, status, lastSync, pageCount) VALUES (?, ?, ?, ?, ?, ?)');
  insertSite.run('site-1', 'Tech Blog Pro', 'https://techblogpro.com', 'connected', new Date().toISOString(), 145);
  insertSite.run('site-2', 'E-commerce Gadgets', 'https://gadgetstore.io', 'syncing', new Date().toISOString(), 890);

  const insertPage = db.prepare('INSERT INTO pages (id, siteId, title, url, status, lastAnalyzed, topic, searchIntent, schemaType, jsonLd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertPage.run(
    'page-1', 
    'site-1', 
    'The Ultimate Guide to React 19', 
    '/ultimate-guide-react-19', 
    'auto-published', 
    new Date().toISOString(), 
    'React.js', 
    'Informational', 
    'Article', 
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "The Ultimate Guide to React 19",
      "about": [
        { "@type": "Thing", "name": "React.js", "sameAs": "https://en.wikipedia.org/wiki/React_(software)" }
      ]
    })
  );
  insertPage.run(
    'page-2', 
    'site-1', 
    'Best Mechanical Keyboards 2026', 
    '/best-mechanical-keyboards', 
    'draft', 
    new Date().toISOString(), 
    'Mechanical Keyboards', 
    'Commercial', 
    'ItemPage', 
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemPage",
      "name": "Best Mechanical Keyboards 2026",
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Keychron Q1 Pro" }
        ]
      }
    })
  );

  const insertEntity = db.prepare('INSERT INTO entities (id, name, type, wikipediaUrl, mentions) VALUES (?, ?, ?, ?, ?)');
  insertEntity.run('ent-1', 'React.js', 'Software', 'https://en.wikipedia.org/wiki/React_(software)', 45);
  insertEntity.run('ent-2', 'Sony', 'Corporation', 'https://en.wikipedia.org/wiki/Sony', 12);
  insertEntity.run('ent-3', 'Mechanical Keyboard', 'Hardware', 'https://en.wikipedia.org/wiki/Computer_keyboard', 28);
}

// Seed configurazione piattaforme (idempotente, indipendente dal seed mock sopra).
const platformsCount = db.prepare('SELECT COUNT(*) as c FROM platforms').get() as { c: number };
if (platformsCount.c === 0) {
  const insertPlatform = db.prepare(
    'INSERT INTO platforms (id, name, publishMethod, maxLength, hashtagLimit, linkPolicy, toneHint, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  );
  // publishMethod: api | scheduler | semi_automatic | manual_guided
  // linkPolicy:    inline | first_comment | bio_only | none
  const seed: Array<[string, string, string, number, number, string, string]> = [
    ['linkedin_personal', 'LinkedIn (profilo personale)', 'semi_automatic', 3000, 5, 'first_comment', 'professionale, prima persona, insight'],
    ['linkedin_company',  'LinkedIn (pagina aziendale)',  'scheduler',      3000, 5, 'inline',        'istituzionale, valore, brand'],
    ['wordpress',         'WordPress (sito proprio)',     'api',            0,    0, 'inline',        'approfondito, SEO, editoriale'],
    ['youtube',           'YouTube',                      'api',            5000, 15,'inline',        'descrizione video, timestamp, hook'],
    ['instagram',         'Instagram Business',           'scheduler',      2200, 15,'bio_only',      'visivo, breve, storytelling'],
    ['facebook',          'Facebook Page',                'scheduler',      2000, 5, 'inline',        'conversazionale, community'],
    ['github',            'GitHub',                       'api',            0,    0, 'inline',        'tecnico, README/repo, conciso'],
    ['devto',             'Dev.to',                       'api',            0,    4, 'inline',        'tutorial, developer, pratico'],
    ['hashnode',          'Hashnode',                     'semi_automatic', 0,    5, 'inline',        'developer, canonical-aware'],
    ['medium',            'Medium',                       'semi_automatic', 0,    5, 'inline',        'narrativo, long-form, canonical'],
    ['substack',          'Substack',                     'semi_automatic', 0,    0, 'inline',        'newsletter, personale, email'],
    ['reddit',            'Reddit',                       'manual_guided',  40000,0, 'none',          'nativo, non promozionale, community'],
    ['quora',             'Quora',                        'manual_guided',  0,    0, 'none',          'risposta utile, esperto, Q&A'],
    ['hackernews',        'Hacker News',                  'manual_guided',  0,    0, 'none',          'sobrio, tecnico, no marketing'],
    ['slideshare',        'SlideShare / PDF sharing',     'semi_automatic', 0,    0, 'inline',        'slide, sintetico, visual'],
  ];
  for (const [id, name, method, maxLen, hashtags, linkPolicy, tone] of seed) {
    insertPlatform.run(id, name, method, maxLen, hashtags, linkPolicy, tone);
  }
}
