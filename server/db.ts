import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
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
`);

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
