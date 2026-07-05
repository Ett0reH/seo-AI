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
| **SEO/LLM Visibility** | `server/agents/seoVisibility.ts` (stub) | Indicizzazione, citazioni brand, SERP, authority, entity matching. | 3 |
| **Report** | `server/agents/report.ts` | Report operativo: pubblicati/bozze/da approvare, errori, piattaforme efficaci, rischi, raccomandazioni. | 1 |

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
| LinkedIn profilo personale | semi-automatico + approvazione | UGC/Posts API (accesso limitato) → altrimenti pacchetto manuale |
| LinkedIn pagina aziendale | API / scheduler | LinkedIn Marketing API, oppure Publer/Metricool |
| WordPress | API | REST API / canale HMAC già presente nel repo |
| YouTube | API | YouTube Data API v3 (descrizioni, community post) |
| Instagram Business | API / scheduler | Instagram Graph API (via FB), oppure Buffer/Publer |
| Facebook Page | API / scheduler | Facebook Graph API, oppure scheduler |
| GitHub | API | REST API (README/repo/Gist/Discussions) |
| Dev.to | API | Forem API (`/api/articles`) |
| Hashnode | API / semi-auto | GraphQL API |
| Medium | semi-auto | API deprecata → semi-automatico / pacchetto manuale |
| Substack | semi-automatico | Nessuna API pubblica → pacchetto per l'editor |
| Reddit / Quora / Hacker News | **manuale guidato** | Nessuna automazione: pubblicazione nativa, mai forzata |
| SlideShare / PDF sharing | semi-auto / manuale | Upload manuale/scheduler; generazione PDF interna |

Per lo scheduling esterno (MVP-2): un unico **adapter webhook** verso Make/n8n/Publer
che riceve il pacchetto della variante e restituisce l'esito, senza browser.

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
| `utm_medium` | classe canale: `social` \| `blog` \| `community` \| `referral` |
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

**MVP-2 — Integrazione API/scheduler.**
Publishing Router attivo: adapter per WordPress/Dev.to/Hashnode/GitHub/YouTube via
API ufficiali; adapter webhook verso Make/n8n/Publer per social; scheduling reale
che rispetta gli slot; retry/`failed`; gestione credenziali (OAuth) fuori dal
browser.

**MVP-3 — SEO/LLM visibility + ottimizzazione.**
`seoVisibility.ts` attivo: indicizzazione (Search Console/Bing API), menzioni
brand/profilo, SERP, entity matching, segnali authority. Feedback loop: il Report
suggerisce e (opzionalmente) ottimizza automaticamente gli angoli più performanti.

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
- **Visibility (MVP-3)**: Google Search Console API, Bing Webmaster API, provider di
  mentions — **tutti via API, nessun browser**.

---

## 12. Struttura cartelle

```
server/
  ai.ts                      # esistente — analisi JSON-LD WordPress (invariato)
  db.ts                      # + master_contents, platforms, platform_variants, publications, audit_log
  types.ts                   # tipi condivisi degli agenti
  agents/
    geminiClient.ts          # client Gemini condiviso
    contentMaster.ts
    semanticSplitter.ts
    platformAdapter.ts
    complianceRisk.ts
    publishingRouter.ts
    draftPackage.ts
    scheduler.ts
    report.ts
    seoVisibility.ts         # stub MVP-3
  orchestrator/
    pipeline.ts              # runDistributionPipeline()
  lib/
    utm.ts  anchors.ts  scheduling.ts  audit.ts
src/
  pages/  MasterContent.tsx  Drafts.tsx  Tracking.tsx  Reports.tsx
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
