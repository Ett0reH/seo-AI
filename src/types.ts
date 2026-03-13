export interface Site {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'syncing' | 'error';
  lastSync: string;
  pageCount: number;
}

export interface AnalyzedPage {
  id: string;
  siteId: string;
  title: string;
  url: string;
  status: 'draft' | 'auto-published' | 'manual-override';
  lastAnalyzed: string;
  topic: string;
  searchIntent: 'Informational' | 'Navigational' | 'Transactional' | 'Commercial';
  entityCount: number;
  schemaType: string;
  jsonLd: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  wikipediaUrl?: string;
  mentions: number;
}
