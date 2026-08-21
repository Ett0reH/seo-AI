# Sistema multi-agente per la distribuzione di contenuti SEO/LLM

> Architettura, design e roadmap del modulo di distribuzione multi-piattaforma
> costruito **sopra** la SaaS esistente (`seo-AI`). Genera varianti native e non
> duplicate a partire da un contenuto master e le porta fino a **bozza pronta**,
> con approvazione umana, scheduling naturale e tracking.

## Vincolo assoluto

**Nessun browser automation, browser publisher, estensione Chrome o agente che
controlla il browser.** La pubblicazione avviene esclusivamente tramite:

1. **API ufficiali** delle piattaforme.
2. **Scheduler autorizzati** (Buffer, Hootsuite, Metricool, Publer, Zapier, Make, n8n).
3. **Semi-automatico** con human approval.
4. **Manuale guidato**.

Il `Publishing Router` è implementato come pura logica di configurazione e non può
in alcun modo instradare verso un browser: qualsiasi metodo non riconosciuto viene
degradato a `manual_guided`.

---

## 1. Architettura completa

Sistema a livelli. I dati fluiscono da sinistra a destra; ogni transizione di stato è
loggata in `audit_log`.

```
                ┌──────────────────────────────────────────────────────────────┐
                │                    CONTENUTO MASTER (input)                    │
                └──────────────────────────────┬───────────────────────────────┘
                                               │  POST /api/master
                                               ▼
   ┌─────────────────────────────  PIPELINE AGENTI (orchestrator)  ─────────────────────────────┐
   │  Content Master ─► Semantic Splitter ─► Platform Adapter ─► Compliance&Risk ─► Publishing   │
   │                                                                              Router ─► Draft │
   │                                                                              Package ─► Sched│
   └───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                               ▼
                              ┌───────────────────────────────────┐
                              │  STORE  (SQLite: master_contents,  │
                              │  platforms, platform_variants,     │
                              │  publications, audit_log)          │
                              └───────────────┬───────────────────┘
                                              ▼
             ┌──────────────  HUMAN APPROVAL / DRAFTS QUEUE (UI React)  ──────────────┐
             │  draft ─► pending_approval ─► scheduled ─► published / skipped / …     │
             └──────────────┬─────────────────────────────────────────┬──────────────┘
                            ▼                                          ▼
      ┌───────────────────────────────┐              ┌──────────────────────────────────┐
      │  PUBLISHING (no browser):      │              │  TRACKING (manuale in MVP-1):    │
      │  API | scheduler | semi-auto | │─────────────►│  URL, UTM, engagement, click,    │
      │  manuale guidato               │              │  referral, screenshot, note      │
      └───────────────────────────────┘              └───────────────┬──────────────────┘
                                                                      ▼
                              ┌───────────────────────────────────────────────────┐
                              │  SEO/LLM VISIBILITY (MVP-3)  ─►  REPORT AGENT       │
                              └───────────────────────────────────────────────────┘
```

Il modulo **riusa** l'infrastruttura esistente: Express (`server.ts`),
better-sqlite3 (`server/db.ts`), il client Gemini di `server/ai.ts` e la dashboard
React (`src/`). Le tabelle `sites/pages/entities` e il webhook WordPress restano
invariati.

---

## 2. Agenti e responsabilità

| Agente | File | Responsabilità | MVP |
|---|---|---|---|
| **Content Master** | `server/agents/contentMaster.ts` | Estrae tema, intent, keyword, entità, pubblico, CTA, formato dal master. | 1 |
| **Semantic Splitter** | `server/agents/semanticSplitter.ts` | Genera un **angolo semantico distinto** per ogni piattaforma (no duplicazione). | 1 |
| **Platform Adapter** | `server/agents/platformAdapter.ts` | Adatta tono, lunghezza, hashtag, titolo, CTA, struttura, tipo di link. | 1 |
| **Compliance & Risk** | `server/agents/complianceRisk.ts` | Valuta spam, duplicazione, over-linking, anchor ripetute, tono promozionale. Logica locale deterministica. | 1 |
| **Publishing Router** | `server/agents/publishingRouter.ts` | Assegna il metodo (API/scheduler/semi-auto/manuale). **Mai browser.** | 1 |
| **Draft Package** | `server/agents/draftPackage.ts` | Assembla il pacchetto pubblicabile + stato iniziale + note operative. | 1 |
| **Scheduler** | `server/agents/scheduler.ts` | Propone finestra naturale 24–72h evitando simultaneità. | 1 |
| **Tracking** | endpoint `/api/tracking` + `publications` | Registra piattaforma, URL, UTM, engagement, click, referral, screenshot, note. | 1 |
| **SEO/LLM Visibility** | `server/agents/seoVisibility.ts` | Presenza SERP e menzioni (Gemini + Google Search grounding), citazioni LLM "a memoria", entity matching, indicizzazione GSC. | 3 |
| **Report** | `server/agents/report.ts` | Report operativo: pubblicati/bozze/da approvare, errori, piattaforme efficaci, rischi, visibilità, raccomandazioni. | 1 |

**Orchestratore** (`server/orchestrator/pipeline.ts`): esegue la catena
`Master → Splitter → Adapter → Compliance → Router → DraftPackage → Scheduler`,
persiste le varianti e logga. Gira in background (ack immediato al client, stesso
pattern del webhook WordPress).

---

## 3. Schema dati

Tabelle nuove in `server/db.ts` (indipendenti da `sites/pages/entities`).

- **`master_contents`** — `id, title, sourceUrl, rawContent, theme, intent,
  keywords(JSON), entities(JSON), audience, cta, linkTarget, siteUrl, format,
  status, createdAt`.
- **`platforms`** — configurazione delle 15 piattaforme: `id, name, publishMethod,
  maxLength, hashtagLimit, linkPolicy, toneHint, enabled`.
- **`platform_variants`** — `id, masterId, platform, angle, title, body,
  mediaSuggestion, link, anchorText, utm(JSON), hashtags(JSON), category,
  tags(JSON), cta, opNotes, publishMethod, riskScore, riskFlags(JSON), status,
  scheduledAt, createdAt`.
- **`publications`** — `id, variantId, platform, publishedUrl, publishedAt, author,
  utm(JSON), method, engagement(JSON), clicks, referral, screenshotPath, notes,
  status`.
- **`audit_log`** — `id, entityType, entityId, action, actor, details(JSON),
  createdAt`.

**Stati della variante** (enum applicativo):
`draft | pending_approval | scheduled | published | failed | skipped | archived`.

---

## 4. Workflow end-to-end

1. L'operatore incolla il **contenuto master** (UI *Distribuzione* → `POST /api/master`).
2. La **pipeline** parte in background: analisi → angoli distinti → adattamento →
   valutazione rischio → metodo → pacchetto → slot proposto.
3. Le varianti nascono come **bozze**:
   - metodo `api`/`scheduler` a basso rischio → `draft`;
   - metodo `semi_automatic`/`manual_guided` **oppure** `riskScore ≥ 40` →
     `pending_approval` (richiede approvazione umana).
4. In **Bozze & Approvazioni** l'operatore rivede, approva (`→ scheduled`), rifiuta
   (`→ skipped`) o ripianifica lo slot.
5. La pubblicazione avviene **fuori dal browser del sistema**: via API/scheduler
   autorizzati oppure manualmente (l'operatore copia il *pacchetto* e pubblica).
6. L'esito viene registrato: `publish-manual` crea un record in `publications` e porta
   la variante a `published`.
7. Le **metriche** (click, referral, engagement) si aggiornano dal Tracking.
8. Il **Report** aggrega tutto; la visibilità SEO/LLM entra in MVP-3.

Regola d'oro: **è sempre possibile fermarsi allo stato “bozza pronta”** senza
pubblicare nulla.

---

## 5. Integrazioni API/scheduler consigliate

| Piattaforma | Metodo | Integrazione consigliata |
|---|---|---|
| DNArt / WordPress | API | Fonte canonica: REST API / canale HMAC già presente nel repo |
| LinkedIn profilo personale | semi-automatico + approvazione | Profilo autore: UGC/Posts API (accesso limitato) → altrimenti pacchetto manuale |
| LinkedIn pagina aziendale | scheduler | Entità organizzazione: LinkedIn Marketing API, oppure Publer/Metricool |
| Google Business Profile | semi-automatico | Aggiornamenti e servizi visibili in Search/Maps; pubblicazione manuale approvata |
| YouTube | scheduler | Video, descrizioni e transcript via YouTube Data API gestita dallo scheduler |
| Behance | semi-automatico | Portfolio, case study visuali e prove creative coerenti con l'entità DNArt |
| Dev.to | API | Forem API (`/api/articles`) per tutorial tecnici canonical-aware |
| Hashnode | semi-automatico | Blog tecnico canonical-aware; GraphQL API se configurata in futuro |
| Medium | semi-automatico | API deprecata → pacchetto manuale/canonical |
| Substack | semi-automatico | Nessuna API pubblica → pacchetto per l'editor/newsletter |
| SlideShare / PDF sharing | semi-automatico | Upload deck/PDF; generazione PDF interna |
| Zenodo | semi-automatico | Report, dataset e white paper con DOI persistente |
| Quora | **manuale guidato** | Risposte native, utili e non promozionali |
| Reddit | **manuale guidato** | Discussioni native, nessuna automazione e nessun link forcing |
| Hacker News | **manuale guidato** | Solo contenuti tecnici o launch realmente rilevanti |

Per lo scheduling esterno (MVP-2): un unico **adapter webhook** verso Make/n8n/Publer
che riceve il pacchetto della variante e restituisce l'esito, senza browser.

Stato di implementazione (MVP-2): connettori attivi in `server/publishers/` per
**Dev.to**, **WordPress REST** e **webhook firmato** (LinkedIn aziendale e
YouTube via scheduler autorizzato). Config e credenziali nella
tabella `integrations`, UI in *Integrazioni*.

---

## 6. Sistema di approvazione umana

- **Gate obbligatorio** per piattaforme rischiose: tutto ciò che è `semi_automatic`
  o `manual_guided`, più qualunque variante con `riskScore ≥ 40`, nasce in
  `pending_approval`.
- **Coda di approvazione** = UI *Bozze & Approvazioni* filtrabile per stato.
- **Transizioni** (ognuna loggata in `audit_log`):
  - `approve` → `scheduled`
  - `reject` → `skipped` (con motivazione)
  - `schedule` → aggiorna `scheduledAt`, `→ scheduled`
  - `publish-manual` → `published` + record in `publications`
- **Ruoli** (evolvibili in MVP-2): `operator` (crea/pubblica/traccia), `approver`
  (approva le rischiose). In MVP-1 l'`actor` è registrato come stringa.

---

## 7. Sistema di tracking UTM

Builder centralizzato in `server/lib/utm.ts`. Schema:

| Parametro | Valore |
|---|---|
| `utm_source` | id piattaforma (`linkedin_personal`, `devto`, …) |
| `utm_medium` | classe canale: `social` \| `blog` \| `portfolio` \| `community` \| `local` \| `document` \| `research` \| `referral` |
| `utm_campaign` | slug del titolo master (stabile) |
| `utm_content` | id univoco della variante |
| `utm_term` | keyword principale (slug), opzionale |

Regole anti-manipolazione:

- **Anchor variate** (`server/lib/anchors.ts`): pool che alterna riferimenti al
  tema, all'entità principale e ancore generiche → **mai la stessa ancora** su più
  piattaforme (verificato dalla Compliance).
- **Diversità del link target**: le varianti alternano tra **sito principale** e
  **profilo LinkedIn target** → niente *link wheel* artificiale.
- Piattaforme community (`linkPolicy = none`) → **nessun link** allegato.

---

## 8. Sistema di report

`GET /api/report` → oggetto `OperationalReport`:

- **totals**: master, varianti, pubblicazioni.
- **byStatus**: conteggio varianti per stato (bozze, da approvare, schedulate,
  pubblicate, …).
- **byPlatform**: varianti/pubblicate/click per piattaforma → *piattaforme più
  efficaci*.
- **highRisk**: varianti con `riskScore ≥ 40` e relativi flag.
- **recommendations**: prossime azioni suggerite (es. "N varianti da approvare",
  "rivedi duplicazione/anchor", "registra metriche nel Tracking").

---

## 9. Roadmap MVP in 3 fasi

**MVP-1 — Generazione + bozze + tracking manuale (questo rilascio).**
Pipeline completa Master→…→Scheduler; varianti come bozze; approvazione umana;
copia pacchetto; pubblicazione e tracking manuali; report base; audit log.
Nessuna pubblicazione automatica: ci si ferma a "bozza pronta".

**MVP-2 — Integrazione API/scheduler (implementato in questo repo).**
Publishing Router attivo con connettori reali in `server/publishers/`:

- **Dev.to** (Forem API, api-key), **WordPress** (REST API + application
  password) → pubblicazione diretta.
- **Webhook firmato HMAC-SHA256** verso scheduler autorizzati (Make / n8n /
  Publer) per LinkedIn aziendale e YouTube: il sistema invia il pacchetto, lo
  scheduler autorizzato pubblica allo slot.
- **Worker di pubblicazione** (`server/orchestrator/publishWorker.ts`): ogni
  minuto pubblica al massimo UNA variante con slot scaduto (mai due nello
  stesso minuto), solo se in stato `scheduled` (già approvata) con metodo
  `api`/`scheduler` e integrazione abilitata. Retry con backoff (15 min ×
  tentativi, max 3) poi stato `failed` con `lastError`.
- **Gestione credenziali** in tabella `integrations` (server-side, mai nel
  browser); la UI *Integrazioni* mostra i segreti mascherati e offre un test
  di connettività senza pubblicare. `POST /api/variants/:id/publish-now` per
  la pubblicazione immediata, con lo stesso gate di approvazione.
- Le piattaforme `semi_automatic`/`manual_guided` restano SENZA connettore:
  mai pubblicabili automaticamente.

**MVP-3 — SEO/LLM visibility + ottimizzazione (implementato in questo repo).**
`seoVisibility.ts` attivo, solo API ufficiali (mai browser/scraping):

- **Presenza SERP e menzioni brand**: Gemini + **Google Search grounding**
  (`tools: [{ googleSearch: {} }]`). Il tool non è combinabile con
  `responseSchema` sul modello in uso → i segnali si estraggono in modo
  deterministico da testo + `groundingMetadata` (`groundingChunks`,
  `webSearchQueries`, `groundingSupports`). Nota: `web.uri` è un redirect
  vertexaisearch, il dominio della fonte si legge da `title`/`domain`.
- **Visibilità LLM "a memoria"**: seconda chiamata NON grounded che chiede al
  modello cosa sa del brand SENZA cercare → `llmCited` + entity matching con
  le entità del master.
- **Indicizzazione**: Google Search Console **URL Inspection API** (service
  account, JWT RS256 fatto a mano in `lib/googleAuth.ts`, scope readonly).
  Limite strutturale: funziona SOLO su property di proprietà → verifica il
  sito del master, non gli URL su piattaforme terze (per quelli vale il
  segnale SERP grounded). **Bing Webmaster: rinviato.**
- **Score 0–100**: pubblicazione = SERP 55 + menzioni ≤25 + sito tra le fonti
  20; master = SERP 30 + menzioni ≤20 + citazione LLM 30 + entity match ≤20
  (`indexedGsc` è un badge separato, fuori dallo score).
- **Worker** (`server/orchestrator/visibilityWorker.ts`): ogni 10 minuti al
  massimo UN check (controllo costi), solo se la pseudo-integrazione
  `visibility` è abilitata, con cap giornaliero (`maxDailyChecks`, default 40)
  e intervallo per elemento (`intervalHours`, default 24). Check falliti
  persistiti con `status='failed'` e ritentati al prossimo intervallo.
- **Config come pseudo-integrazioni** nella tabella `integrations`
  (riuso di UI, masking segreti, test): riga `visibility` (connector `gemini`)
  e riga `search_console` (connector `gsc`), mappa separata
  `SETTINGS_CONNECTORS` → mai confuse con le piattaforme pubblicabili.
- **Feedback loop**: `POST /api/variants/:id/reoptimize` (o auto con
  `autoOptimize='true'`) rigenera UNA variante ottimizzata usando gli insight
  degli angoli migliori (click + score, solo SQL). Guardrail: solo varianti
  `published`, mai due volte la stessa (colonna lineage `optimizedFromId`),
  max 3 auto-ottimizzazioni per master, la nuova variante nasce
  `draft`/`pending_approval` via `initialStatus()` → **il gate di approvazione
  umana è preservato strutturalmente** (il publishWorker pesca solo
  `scheduled`). La risposta grounded (`answerText`) resta in DB per audit e
  non viene mostrata in UI (requisito ToS grounding).
- **UI**: pagina *Visibilità SEO/LLM* (KPI, tabella pubblicazioni con
  "Verifica ora"/"Rigenera ottimizzata", card master con badge LLM/GSC e
  entity chips); sezione visibilità e "angoli più performanti" nel Report.

---

## 10. Rischi (tecnici, legali, ToS, SEO)

- **SEO**: link wheel, over-linking, anchor ripetute, contenuti duplicati →
  **mitigati** da Splitter (angoli distinti), Compliance (similarità/anchor/link),
  diversità del target e scheduling naturale.
- **ToS piattaforme**: automazione vietata su Reddit/Quora/HN → **solo manuale
  guidato**, mai forzato. Rispetto dei rate limit e delle policy di ciascuna API.
- **Legali**: attribuzione autore, copyright dei media, GDPR sui dati di tracking
  (nessun dato personale oltre l'operatore).
- **Tecnici**: dipendenza dal modello Gemini (chiave a runtime); costi/latenza di
  15 chiamate LLM per master (mitigabile con caching/batch); credenziali OAuth da
  gestire in modo sicuro in MVP-2; SQLite adatto al single-node (valutare Postgres
  in scala).

---

## 11. Stack consigliato

Coerente con il repo esistente:

- **Runtime**: Node.js + TypeScript (ESM), eseguito con `tsx`.
- **Web/API**: Express.
- **DB**: better-sqlite3 (SQLite) → Postgres in scala.
- **AI**: `@google/genai` (Gemini `gemini-3-flash-preview`), output JSON strutturato.
- **Frontend**: React 19 + Vite + Tailwind 4 + react-router.
- **Scheduling esterno (MVP-2)**: Make / n8n / Publer via webhook.
- **Visibility (MVP-3)**: Gemini + Google Search grounding (SERP/menzioni),
  Gemini non-grounded (citazioni LLM), Google Search Console URL Inspection
  (indicizzazione, service account) — **tutti via API, nessun browser**.
  Bing Webmaster API: rinviata.

---

## 12. Struttura cartelle

```
server/
  ai.ts                      # esistente — analisi JSON-LD WordPress (invariato)
  db.ts                      # + master_contents, platforms, platform_variants, publications,
                             #   audit_log, integrations, visibility_checks (MVP-3)
  types.ts                   # tipi condivisi degli agenti
  agents/
    geminiClient.ts          # client Gemini condiviso (+ generateGrounded MVP-3)
    contentMaster.ts
    semanticSplitter.ts
    platformAdapter.ts       # + insights di performance (MVP-3)
    complianceRisk.ts
    publishingRouter.ts
    draftPackage.ts
    scheduler.ts
    report.ts                # + sezione visibility e topAngles (MVP-3)
    seoVisibility.ts         # MVP-3: checkPublication/checkMaster/score/insights
  orchestrator/
    pipeline.ts              # runDistributionPipeline()
    publishWorker.ts         # MVP-2: pubblicazione reale allo slot (1/min max)
    visibilityWorker.ts      # MVP-3: 1 check/10min + reoptimizeVariant (feedback loop)
  publishers/                # MVP-2: connettori (solo API/scheduler autorizzati)
    devto.ts  wordpress.ts  webhook.ts  index.ts
    github.ts                # legacy/dormiente: non assegnato a piattaforme attive
  lib/
    utm.ts  anchors.ts  scheduling.ts  audit.ts
    integrations.ts          # lettura riga integrations (condivisa)
    googleAuth.ts            # MVP-3: JWT RS256 service account (node:crypto)
    gsc.ts                   # MVP-3: URL Inspection + connettore search_console
src/
  pages/  MasterContent.tsx  Drafts.tsx  Tracking.tsx  Reports.tsx  Integrations.tsx
          Visibility.tsx     # MVP-3
docs/
  architettura-distribuzione-multi-agente.md
```

---

## 13. Pseudocodice dei flussi principali

**Pipeline**
```
function runDistributionPipeline(masterId):
    master = loadMaster(masterId)
    analysis = ContentMaster.analyze(master.rawContent)      # tema, intent, keyword, entità, CTA
    saveAnalysis(masterId, analysis); status = 'ready'
    platforms = loadEnabledPlatforms()
    angles = SemanticSplitter.split(master, platforms)        # 1 angolo distinto per piattaforma
    for each platform:                                        # in parallelo
        adapted[p] = PlatformAdapter.adapt(master, platform, angles[p])
        anchor[p]  = pickAnchor(index, theme, entity)         # variata
        base[p]    = alternate(siteUrl, linkTarget)           # niente link wheel
        utm[p]     = buildUtm(base[p], platform, campaign, variantId, keyword)
    risks = Compliance.assess(all adapted bodies + anchors + links)   # similarità/over-linking/…
    slots = Scheduler.propose(count)                          # 24–72h, min gap, no same-minute
    for each platform:
        method = Router.resolve(platform)                     # mai browser; community → manuale
        status = initialStatus(method, risks[p].score)        # pending_approval se rischiosa
        draft  = DraftPackage.build(...)
    persist(drafts); audit('pipeline_completed')
```

**Router (config-only, no browser)**
```
function resolvePublishMethod(platform):
    if platform in {reddit, quora, hackernews}: return 'manual_guided'
    if platform.method in {api, scheduler, semi_automatic, manual_guided}: return platform.method
    return 'manual_guided'          # fallback sicuro: nessun browser
```

**Scheduler (finestra naturale)**
```
function propose(count):
    step = window(72h) / count
    for i in 0..count: slot[i] = start + step*i + jitter(±0.4*step)
    sort(slots); enforce(minGap = 90min)     # mai due post nello stesso minuto
    return slots
```

**Approvazione**
```
POST /variants/:id/approve  → setStatus(scheduled); audit('approved')
POST /variants/:id/reject   → setStatus(skipped);   audit('rejected')
POST /variants/:id/publish-manual → createPublication(); setStatus(published)
```

---

## 14. User stories operative

1. *Come editor, incollo un contenuto master e ottengo automaticamente una variante
   nativa per ogni piattaforma, così da non riscrivere tutto a mano.*
2. *Come editor, voglio che le varianti siano diverse tra loro, così da non rischiare
   penalizzazioni per contenuti duplicati.*
3. *Come approvatore, voglio revisionare e approvare le varianti rischiose (LinkedIn
   personale, community) prima che vengano schedulate.*
4. *Come editor, voglio copiare il "pacchetto" (titolo, testo, hashtag, link+UTM,
   note) per pubblicare manualmente dove non c'è API.*
5. *Come editor, voglio che le pubblicazioni siano distribuite su 24–72h e mai nello
   stesso minuto, così da sembrare naturali.*
6. *Come analista, registro click/engagement/referral delle varianti pubblicate e
   vedo quali piattaforme rendono di più.*
7. *Come responsabile, leggo un report con bozze, da approvare, errori, rischi e
   prossime azioni.*
8. *Come editor, posso sempre fermarmi allo stato "bozza pronta" senza pubblicare
   nulla.*

---

## 15. Checklist di validazione pre-rilascio

- [ ] `npm run lint` (`tsc --noEmit`) verde.
- [ ] Il server avvia e crea le tabelle; `platforms` contiene le 15 righe con il
      metodo corretto.
- [ ] `POST /api/master` genera **una variante per piattaforma**, tutte con angolo e
      testo **diversi** (Compliance non segnala duplicazione tra varianti reali).
- [ ] Ogni variante ha UTM coerenti e **anchor diverse** tra piattaforme.
- [ ] Gli slot proposti coprono 24–72h con gap minimo e **nessuna coppia nello stesso
      minuto**.
- [ ] **Nessuna** variante ha metodo diverso da api/scheduler/semi_automatic/
      manual_guided; Reddit/Quora/HN sono `manual_guided`.
- [ ] LinkedIn personale e le semi-automatiche nascono in `pending_approval`.
- [ ] `approve` → `scheduled`; `publish-manual` → `published` + record in
      `publications`; `tracking` aggiorna le metriche.
- [ ] Ogni azione compare in `audit_log`.
- [ ] `GET /api/report` mostra conteggi per stato, piattaforme efficaci e
      raccomandazioni corrette.
- [ ] La UI permette il flusso completo Distribuzione → Bozze → Tracking → Report.
- [ ] **Nessun** codice esegue browser automation / publisher / estensioni.

Checklist MVP-3 (visibilità):

- [ ] `GET /api/integrations` include `visibility` e `search_console`;
      `serviceAccountJson` mascherato e preservato al re-save.
- [ ] Con integrazione visibilità OFF: worker no-op, check manuale → 409.
- [ ] Con ON: `POST /api/visibility/check/publication/:id` crea una riga `ok`
      con fonti/score; senza rete o chiave → riga `failed`, nessun crash,
      nessun retry immediato.
- [ ] Pubblicazioni scheduler senza URL mai selezionate dal worker; il backfill
      dell'URL dal Tracking le sblocca.
- [ ] Cap giornaliero rispettato (`maxDailyChecks`).
- [ ] `reoptimize` → nuova variante in bozza con `optimizedFromId` e UTM nuovi;
      seconda chiamata → 409; il publishWorker non la pubblica mai da sola.
- [ ] Con `autoOptimize='true'`: max 1 bozza per tick e 3 per master, actor
      `system` in audit.
- [ ] `GET /api/report` include la sezione `visibility` e gli angoli migliori.
- [ ] `answerText` non compare in nessuna risposta API né in UI (solo DB).

---

## 16. Registro operativo account e piattaforme DNArt

Aggiornato il **2026-08-20** per il progetto di costruzione dell'entità SEO/LLM
di DNArt.

**Identità operativa**

| Campo | Valore |
|---|---|
| Brand | DNArt |
| Referente | Stefano Giurin |
| Dominio canonico | `https://www.dnart.it/` |
| Email operativa | `stefano@dnart.it` |
| Telefono | `+39 351 9650299` |
| Handle preferito | `StefanoDNArt` |
| Handle lowercase | `stefanodnart` |
| Handle fallback | `DNArtStefano` |

Regole: account creati solo con dati reali e autorizzati; nessuna password
salvata in documentazione; nessun bypass di CAPTCHA, OTP, verifica email/SMS o
policy piattaforma; Reddit, Quora e Hacker News restano sempre manuali guidati.

### 16.1 Decisioni piattaforme

- **GitHub escluso** dalla lista attiva su richiesta: nel database locale la riga
  `github` resta solo legacy con `enabled = 0`.
- **Behance inserito** come sostituto, per mantenere 15 piattaforme attive e
  rafforzare portfolio, case study visuali e prove creative DNArt.
- Il connettore tecnico `server/publishers/github.ts` resta dormiente/legacy e
  non è assegnato a nessuna piattaforma attiva in `DEFAULT_CONNECTOR`.

### 16.2 Stato account verificato

| Piattaforma | Stato | URL | Note operative |
|---|---|---|---|
| Dev.to | Creato | `https://dev.to/stefanodnart` | Profilo pubblico presente come "Stefano Giurin", joined on 20 ago 2026, 0 post. Prima di usare API o pubblicare: login, verifica email e completamento bio/link. |
| Substack | Creato | `https://substack.com/@stefanodnart` | Profilo pubblico presente come `@stefanodnart`, bio già orientata ad AI, automazioni e B2B. Risultavano 2 abbonamenti: verificare se mantenerli. Nessun post pubblicato. |
| Hacker News | Creato | `https://news.ycombinator.com/user?id=StefanoDNArt` | Account presente con user `StefanoDNArt` e karma 1. Email interna vuota: aggiungere `stefano@dnart.it` per recupero password. |
| Medium | Esistente | `https://medium.com/@stefanogiurin` | Esiste già un profilo personale Stefano Giurin con articoli del 2019. `@StefanoDNArt` non esiste: meglio aggiornare il profilo esistente invece di creare duplicati. |
| Hashnode | Non completato | `https://hashnode.com/@stefanodnart` | La pagina pubblica risponde "User not found". Le settings rimandano al login: iscrizione non confermata. |

### 16.3 Piattaforme da completare o collegare

| Piattaforma | Stato | Prossima azione |
|---|---|---|
| Behance | Da creare | Creare asset portfolio DNArt con case study visuali e link a dnart.it. |
| Hashnode | Da completare | Rifare o completare registrazione con email corretta, poi verificare handle `stefanodnart`. |
| Medium | Da aggiornare | Aggiornare bio, link e descrizione del profilo `@stefanogiurin`. |
| Dev.to | Da completare | Completare profilo, website, bio e social links; API key solo dopo conferma esplicita. |
| Substack | Da rifinire | Decidere se usare solo profilo autore o creare una pubblicazione/newsletter DNArt. |
| Hacker News | Da rifinire | Inserire email di recupero nel profilo. |
| SlideShare / PDF sharing | Da creare/verificare | Usare per deck e PDF citabili. |
| Zenodo | Da creare/verificare | Usare solo per report, dataset o white paper realmente persistenti/citabili. |
| Quora | Da creare/verificare | Risposte native, utili, senza link forcing. |
| Reddit | Da creare/verificare | Prima ascolto community; pubblicazione solo manuale e contestuale. |
| Google Business Profile | Da collegare/verificare | Serve accesso/proprietà Google corretta per DNArt. |
| YouTube | Da collegare/verificare | Serve account/canale Google autorizzato. |
| LinkedIn personale | Esistente da verificare | Profilo noto: `https://it.linkedin.com/in/stefanogiurin`. |
| LinkedIn aziendale | Esistente da verificare | Confermare URL corretto della pagina DNArt: attenzione a risultati LinkedIn non legati a `dnart.it`. |
| WordPress DNArt | Esistente | Fonte canonica: `dnart.it`; usare pipeline interna già documentata per articoli. |

### 16.4 Modifiche progetto collegate

| File | Modifica |
|---|---|
| `.gitignore` | Aggiunto `data/` per non tracciare il DB locale SQLite. |
| `server/db.ts` | Seed piattaforme aggiornato: GitHub disabilitato, Behance aggiunto, vecchi canali rimossi/disabilitati. |
| `server/lib/utm.ts` | Medium UTM coerenti: `portfolio` per Behance, `local` per GBP, `document` per SlideShare, `research` per Zenodo. |
| `server/publishers/index.ts` | GitHub rimosso dai connettori di default; restano auto/scheduler solo Dev.to, WordPress, LinkedIn company via webhook e YouTube via webhook. |
| `docs/architettura-distribuzione-multi-agente.md` | Questa documentazione aggiornata con piattaforme, account e decisioni operative. |

Verifiche eseguite il 2026-08-20:

```bash
npm run lint
npm run build
```

Esito: entrambe passate. Verifica DB locale: `behance` attivo con `enabled = 1`,
`github` presente solo come riga disabilitata con `enabled = 0`, piattaforme
attive totali = 15.
