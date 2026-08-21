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
    connector TEXT,             -- devto | wordpress | webhook | connector legacy opzionali
    config TEXT,                -- JSON credenziali/parametri
    enabled INTEGER DEFAULT 0,
    lastTestedAt TEXT,
    lastTestOk INTEGER,
    updatedAt TEXT
  );

  -- ============================================================
  -- Visibilità SEO/LLM (MVP-3)
  -- Check periodici su pubblicazioni e master: presenza SERP (Gemini +
  -- Google Search grounding), menzioni brand, citazioni LLM, entity
  -- matching, indicizzazione GSC. Solo API ufficiali, nessun browser.
  -- ============================================================
  CREATE TABLE IF NOT EXISTS visibility_checks (
    id TEXT PRIMARY KEY,
    scope TEXT,               -- publication | master
    refId TEXT,               -- publications.id | master_contents.id
    platform TEXT,            -- solo scope publication
    url TEXT,                 -- URL verificato ('' se non applicabile)
    serpPresence INTEGER,     -- 1|0|NULL: fonte propria tra i risultati grounded
    brandMentions INTEGER DEFAULT 0,
    llmCited INTEGER,         -- 1|0|NULL: brand citato dall'LLM a memoria (solo master)
    indexedGsc INTEGER,       -- 1|0|NULL: verdetto URL Inspection (solo master con GSC)
    entityMatches TEXT,       -- JSON {matched:string[], missing:string[]}
    topSources TEXT,          -- JSON [{domain,title,matched}] max 8
    queries TEXT,             -- JSON string[]: query eseguite dal grounding
    answerText TEXT,          -- risposta grounded troncata (solo audit, mai in UI)
    score INTEGER DEFAULT 0,  -- 0-100
    status TEXT,              -- ok | failed
    notes TEXT,
    checkedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_visibility_ref ON visibility_checks (scope, refId, checkedAt);
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
  // MVP-3: lineage delle varianti rigenerate dal feedback loop (mai due volte la stessa).
  if (!cols.some((c) => c.name === 'optimizedFromId')) {
    db.exec('ALTER TABLE platform_variants ADD COLUMN optimizedFromId TEXT');
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

// Seed configurazione piattaforme (idempotente): mantiene esattamente il set
// entity SEO scelto, aggiornando configurazione e disabilitando i canali rimossi.
{
  const insertPlatform = db.prepare(
    `INSERT INTO platforms (id, name, publishMethod, maxLength, hashtagLimit, linkPolicy, toneHint, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       publishMethod=excluded.publishMethod,
       maxLength=excluded.maxLength,
       hashtagLimit=excluded.hashtagLimit,
       linkPolicy=excluded.linkPolicy,
       toneHint=excluded.toneHint`
  );
  // publishMethod: api | scheduler | semi_automatic | manual_guided
  // linkPolicy:    inline | first_comment | bio_only | none
  const seed: Array<[string, string, string, number, number, string, string]> = [
    ['wordpress',               'DNArt / WordPress (sito proprio)', 'api',            0,     0, 'inline',        'fonte canonica, approfondito, E-E-A-T, schema-aware'],
    ['linkedin_personal',       'LinkedIn (profilo Stefano)',       'semi_automatic', 3000,  5, 'first_comment', 'autorevolezza personale, esperienza diretta, prima persona'],
    ['linkedin_company',        'LinkedIn (pagina DNArt)',          'scheduler',      3000,  5, 'inline',        'istituzionale, servizi, casi, posizionamento del brand'],
    ['google_business_profile', 'Google Business Profile',          'semi_automatic', 1500,  0, 'inline',        'entità locale, aggiornamenti, servizi, prove di attività reale'],
    ['youtube',                 'YouTube',                          'scheduler',      5000, 15, 'inline',        'video, transcript, tutorial, proof of expertise'],
    ['behance',                 'Behance',                          'semi_automatic', 0,     5, 'inline',        'portfolio, case study visuali, prove creative e asset di brand'],
    ['devto',                   'Dev.to',                           'api',            0,     4, 'inline',        'tutorial tecnico, developer audience, canonical-aware'],
    ['hashnode',                'Hashnode',                         'semi_automatic', 0,     5, 'inline',        'blog tecnico, canonical-aware, spiegazioni operative'],
    ['medium',                  'Medium',                           'semi_automatic', 0,     5, 'inline',        'long-form divulgativo, sintesi strategica, canonical-aware'],
    ['substack',                'Substack',                         'semi_automatic', 0,     0, 'inline',        "newsletter, opinione d'autore, continuità editoriale"],
    ['slideshare',              'SlideShare / PDF sharing',         'semi_automatic', 0,     0, 'inline',        'deck, PDF, sintesi visuale, asset riutilizzabili'],
    ['zenodo',                  'Zenodo',                           'semi_automatic', 0,     0, 'inline',        'report, dataset, DOI, citabilità e persistenza'],
    ['quora',                   'Quora',                            'manual_guided',  0,     0, 'none',          'risposta utile, esperto, Q&A, niente promozione diretta'],
    ['reddit',                  'Reddit',                           'manual_guided',  40000, 0, 'none',          'community, discussione nativa, niente link promozionali'],
    ['hackernews',              'Hacker News',                      'manual_guided',  0,     0, 'none',          'sobrio, tecnico, launch/commenti solo se rilevanti'],
  ];
  for (const [id, name, method, maxLen, hashtags, linkPolicy, tone] of seed) {
    insertPlatform.run(id, name, method, maxLen, hashtags, linkPolicy, tone);
  }
  db.prepare("UPDATE platforms SET enabled = 0 WHERE id IN ('instagram', 'facebook', 'bluesky', 'mastodon', 'github')").run();
}
