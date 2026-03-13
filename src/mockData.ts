import { Site, AnalyzedPage, Entity } from './types';

export const mockSites: Site[] = [
  {
    id: 'site-1',
    name: 'Tech Blog Pro',
    url: 'https://techblogpro.com',
    status: 'connected',
    lastSync: '2026-03-11T10:30:00Z',
    pageCount: 145,
  },
  {
    id: 'site-2',
    name: 'E-commerce Gadgets',
    url: 'https://gadgetstore.io',
    status: 'syncing',
    lastSync: '2026-03-11T16:00:00Z',
    pageCount: 890,
  },
];

export const mockPages: AnalyzedPage[] = [
  {
    id: 'page-1',
    siteId: 'site-1',
    title: 'The Ultimate Guide to React 19',
    url: '/ultimate-guide-react-19',
    status: 'auto-published',
    lastAnalyzed: '2026-03-10T14:20:00Z',
    topic: 'React.js',
    searchIntent: 'Informational',
    entityCount: 12,
    schemaType: 'Article',
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": "The Ultimate Guide to React 19",
      "about": [
        { "@type": "Thing", "name": "React.js", "sameAs": "https://en.wikipedia.org/wiki/React_(software)" }
      ]
    }, null, 2),
  },
  {
    id: 'page-2',
    siteId: 'site-1',
    title: 'Best Mechanical Keyboards 2026',
    url: '/best-mechanical-keyboards',
    status: 'draft',
    lastAnalyzed: '2026-03-11T09:15:00Z',
    topic: 'Mechanical Keyboards',
    searchIntent: 'Commercial',
    entityCount: 8,
    schemaType: 'ItemPage',
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemPage",
      "name": "Best Mechanical Keyboards 2026",
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Keychron Q1 Pro" }
        ]
      }
    }, null, 2),
  },
  {
    id: 'page-3',
    siteId: 'site-2',
    title: 'Buy Sony WH-1000XM6 Headphones',
    url: '/product/sony-wh-1000xm6',
    status: 'manual-override',
    lastAnalyzed: '2026-03-09T11:00:00Z',
    topic: 'Noise Cancelling Headphones',
    searchIntent: 'Transactional',
    entityCount: 5,
    schemaType: 'Product',
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Sony WH-1000XM6",
      "brand": { "@type": "Brand", "name": "Sony" },
      "offers": { "@type": "Offer", "price": "349.99", "priceCurrency": "USD" }
    }, null, 2),
  },
];

export const mockEntities: Entity[] = [
  { id: 'ent-1', name: 'React.js', type: 'Software', wikipediaUrl: 'https://en.wikipedia.org/wiki/React_(software)', mentions: 45 },
  { id: 'ent-2', name: 'Sony', type: 'Corporation', wikipediaUrl: 'https://en.wikipedia.org/wiki/Sony', mentions: 12 },
  { id: 'ent-3', name: 'Mechanical Keyboard', type: 'Hardware', wikipediaUrl: 'https://en.wikipedia.org/wiki/Computer_keyboard', mentions: 28 },
];
