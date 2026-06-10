# Phase 13: Veille Qualiopi intégrée — Research

**Researched:** 2026-05-25
**Domain:** Veille réglementaire / RSS aggregator / Ollama classification / PDF audit / BullMQ cron
**Confidence:** HIGH (patterns existants clone-strict — Phase 7/8/9/9.1/11) · MEDIUM (sources RSS proposées, à valider en exec) · MEDIUM (prompt classification — pattern Ollama validé Phase 4)

> ⚠️ Aucune CONTEXT.md n'existe pour Phase 13 (pas de `/gsd:discuss-phase 13` lancé). Cette recherche s'appuie sur le **REQUIREMENTS.md** + le **add-phase descriptor** + le **xlsx fourni** comme source de vérité. Le planner DEVRA marquer comme "Open Question" tous les choix UX subjectifs (cf. §9).

## 1. Executive Summary

Phase 13 = clone-strict des patterns Phase 11 (worker BullMQ cron + page liste + export PDF Gotenberg + AuditLog namespaced) + couche RSS/Ollama nouvelle. Aucun pattern à inventer : tout existe déjà dans le codebase.

**4 chantiers techniques, 4 plans probables :**
1. **Foundation** : migration Prisma `RegulatoryWatch` + enums + script d'import xlsx one-shot (clone `import-smartof.ts`).
2. **Server actions + UI page** : CRUD + 4 onglets `/app/veille` + inbox suggestions (clone matrice Phase 9.1 + page historique Phase 8).
3. **Worker BullMQ cron hebdo** : RSS fetcher + Ollama classifier + insert `status=draft` (clone `invoice-reminder-worker` Phase 11).
4. **Export PDF audit** : 4 PDFs (1 par thème) via Gotenberg + footer paged (clone `legal-docs-generator` BUG-15).

**Primary recommendation:** Démarrer par Plan 1 (foundation + import xlsx historique) pour avoir des données réelles en BDD avant tout dev UI. Le worker (Plan 3) est optionnel pour MVP — l'utilisateur peut commencer en saisie 100% manuelle.

## 2. Existing Patterns Inventory

Cette phase ne nécessite **aucun nouveau pattern**. Tous les briques sont déjà éprouvées en production :

### 2.1 BullMQ cron pattern (clone Plan 11-06)

**Fichiers de référence :**
- `apps/web/src/lib/invoice-reminders/queue.ts` (singleton Queue + `getQueueRedis()` partagé)
- `apps/web/src/lib/invoice-reminders/worker.ts` (`startInvoiceReminderWorker` + `scheduleDailyReminders` avec `repeat: { pattern, tz }` + `jobId` fixe pour idempotence)
- `apps/web/scripts/invoice-reminder-worker.ts` (entry-point tsx, mode dégradé si Redis indispo)
- `apps/web/package.json` : script `worker:reminders` (dotenv-cli + tsx)

**Cron pattern figé :**
```ts
// dans schedule*() — appelé au boot du process worker
await queue.add(
  'daily-reminders',
  { triggered_by: 'cron' as const },
  {
    repeat: { pattern: '0 8 * * *', tz: 'Europe/Paris' },
    jobId: 'daily-reminders-cron', // idempotence BullMQ
  },
);
```

**Pour Phase 13 → cron hebdo lundi 8h Paris :**
```ts
repeat: { pattern: '0 8 * * 1', tz: 'Europe/Paris' },
jobId: 'weekly-veille-cron',
```

**⚠️ Pitfall #1 (mémoire `feedback_worker_no_react_imports.md`) :** Le worker NE DOIT PAS importer une server action qui utilise `requireRole`/`validateRequest` (sinon crash `react does not provide an export named 'cache'`). Pattern obligatoire :
- `lib/veille/core.ts` (logique pure : fetchRss, classify, persist) — pas de React, pas de requireRole.
- `server/actions/veille.ts` (wrapper auth) — appelé uniquement depuis UI.
- Worker n'importe QUE `lib/veille/core.ts`.

### 2.2 Ollama integration (clone Phase 4 closure)

**Fichiers de référence :**
- `apps/web/src/lib/ai-ollama.ts` (`callOllama({ jsonOutput: true, timeoutMs })`)
- `apps/web/src/lib/closure/qualiopi-prompts.ts` (pattern : `PROMPT_VERSION` + `SYSTEM_PROMPT_*` const)
- `apps/web/src/lib/closure/ollama-generators.ts` (Zod schema pour valider l'output JSON)

**Pattern figé :**
1. Const `PROMPT_VERSION_VEILLE = 'veille-v1-2026-05-25'` (tracé dans `AIGenerationJob.promptVersion`)
2. `SYSTEM_PROMPT_VEILLE_CLASSIFY` (cf. §6)
3. Appel : `callOllama({ model: 'mistral-small:24b', systemPrompt, prompt, jsonOutput: true, temperature: 0.1, timeoutMs: 60_000 })`
4. Validation Zod du JSON parsé → fallback `null` si dérape → status `draft` créé sans `theme` deviné (utilisateur classifie manuellement).
5. Persistance `AIGenerationJob` (provider='ollama', model, promptVersion, status='ok'|'error', latencyMs).

**Modèle figé :** `mistral-small:24b` — meilleur compromis JSON-compliance + vitesse (cf. comment `ollama-generators.ts` ligne 40). NE PAS utiliser `qwen3:30b-a3b` qui a un comportement instable avec `format: json` (thinking caché → réponse vide).

### 2.3 Gotenberg PDF (clone BUG-15 legal-docs)

**Fichiers de référence :**
- `apps/web/src/lib/pdf-render.ts` (`renderHtmlToPdf(html, { footerHtml })` ou `renderHtmlToPdfWeasy(html)`)
- `apps/web/src/lib/of-pdf-footer.ts` (`renderOfStandardFooterHtml()` — footer 36pt downscalé Chromium → 11pt visuel)
- `apps/web/src/lib/of-paged-footer.ts` (footer CSS Paged Media pour WeasyPrint)
- `apps/web/src/lib/legal-docs-template.ts` (template HTML markdown → tableau PDF — meilleur exemple pour Phase 13)

**Recommandation :** Pour 4 PDFs audit veille, utiliser **WeasyPrint** (pas Gotenberg) car :
- Footer répété natif via CSS Paged Media (sans hack 36pt).
- Mémoire `feedback_footer_pdf_qualiof.md` valide ce choix pour multi-pages.
- Le template `legal-docs-template.ts` est le clone-target idéal (header logo + titre + body markdown + footer paged).

### 2.4 xlsx import pattern (clone import-smartof.ts)

**Fichier de référence :** `packages/db/scripts/import-smartof.ts`

**Pattern figé (Pitfall mémoire `feedback_xlsx_buffer_read.md`) :**
```ts
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
const sheet = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json<SmartRow>(sheet, { defval: null, raw: false });
```

**NE JAMAIS utiliser `XLSX.readFile()`** (crash CDN-tarball).

**Lancement script :** `pnpm --filter @qualiof/db exec tsx scripts/import-veille.ts`

### 2.5 AuditLog convention (clone Phase 11 invoice-audit)

**Pattern figé "one helper per entity" (5ème instance après Phase 7/8/9/9.1/11) :**
- Créer `apps/web/src/lib/regulatoryWatch-audit.ts`
- Pattern clone-strict de `invoice-audit.ts` (51 lignes)
- Conventions Phase 13 :
  - `regulatoryWatch.created` — création manuelle (ADMIN/MANAGER)
  - `regulatoryWatch.updated` — édition d'un champ
  - `regulatoryWatch.exploitation_updated` — édition inline du champ Exploitation (déclencheur principal "dateLastReviewed=now()")
  - `regulatoryWatch.deleted` — soft-delete (passage à `status='archived'`)
  - `regulatoryWatch.suggestion_approved` — validation d'une suggestion auto → `status='active'`
  - `regulatoryWatch.suggestion_rejected` — rejet → `status='archived'`
  - `regulatoryWatch.imported` — import xlsx (actorUserId=user.id, batch=true)
  - `regulatoryWatch.auto_inserted` — INSERT par worker (actorUserId=null, system)
  - `regulatoryWatch.exported` — export PDF audit (entity='RegulatoryWatch', entityId='BULK', diff={ theme, count })

### 2.6 RBAC pattern (clone Phase 8 + Phase 9.1)

**Fichier de référence :** `apps/web/src/lib/rbac.ts` (`requireRole(['ADMIN', 'MANAGER'])`)

**Pattern figé Phase 13 (cf. add-phase descriptor §6) :**
- **CRUD veille** (create/update/delete/approve/reject) : `requireRole(['ADMIN', 'MANAGER'])`
- **Consultation veille** (GET /app/veille) : `validateRequest` simple (tous les rôles voient — LECTEUR/COMPTABLE/FORMATEUR/COMMERCIAL inclus).
- **Export PDF** : `requireRole(['ADMIN', 'MANAGER'])` (action sensible, traçabilité).
- **Note :** la matrice D-02 (Phase 8) ne contient pas encore d'entrée `regulatoryWatch.*`. Le planner devra l'ajouter à `packages/shared/src/constants/permissions.ts` pour cohérence.

### 2.7 Sidebar nav-config (clone Phase 2 + Phase 9)

**Fichier :** `apps/web/src/components/layout/nav-config.ts`

**Pattern figé :**
```ts
// Dans la section 'Suivi' (entre "Vue de charge" et la section Configuration)
{
  label: 'Veille Qualiopi',
  href: '/app/veille',
  icon: BookMarked, // ou Newspaper, Telescope — lucide-react
  // Pas d'allowedRoles → visible pour TOUS (LECTEUR consulte aussi)
},
```

### 2.8 Page Server Component (clone Phase 8 historique + Phase 9.1 product-tabs)

**Fichiers de référence :**
- `apps/web/src/app/app/parametres/historique/page.tsx` — pattern URL state filters + pagination + table.
- `apps/web/src/components/produits/product-tabs.tsx` — pattern URL state `?tab=…` pour 4 onglets.

### 2.9 Inline edit pattern (clone Phase 5 BudgetAgefice year-picker)

**Fichier :** `apps/web/src/components/learners/budget-agefice.tsx` — chips année + URL state `?ageficeYear=NNNN`.

**Pour édition inline du champ `exploitation` :** pattern alternatif (TextArea + bouton "Enregistrer" + useTransition + sonner toast) — clone-strict de `LegalDocsForm` (Plan BUG-15) en version compacte par ligne du tableau.

### 2.10 "X jours depuis" KPI (à créer — pattern minimal)

**Pas de composant réutilisable existant.** Helper pur à créer :
```ts
// lib/days-since.ts (~10 lignes)
export function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}
```
Rendu dans `<DaysSinceBadge days={n} threshold={90} />` :
- < 30j → vert (`bg-emerald-100 text-emerald-800`)
- 30-90j → ambre (`bg-amber-100 text-amber-800`)
- ≥ 90j → rouge (`bg-red-100 text-red-800`) + icône AlertTriangle

## 3. Prisma Schema Proposal

### 3.1 Model `RegulatoryWatch`

À placer après `Notification` (ligne ~1102 schema.prisma) ou dans une nouvelle section "Veille Qualiopi" en fin de fichier.

```prisma
/// Phase 13 — Veille Qualiopi (VEILLE-01).
/// Couvre le critère 6 Qualiopi : indicateurs 23/24/25/26.
/// Source : import xlsx one-shot + saisie manuelle + suggestions auto via worker RSS+Ollama.
model RegulatoryWatch {
  id                String                @id @default(uuid())
  tenantId          String
  tenant            Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // Thème = indicateur Qualiopi 23/24/25/26 (4 valeurs).
  theme             RegulatoryWatchTheme
  title             String                // titre court de la source
  url               String?               // lien (peut être absent — salon, document local)
  source            String?               // type de source : "Newsletter", "Flux RSS", "Site institutionnel", "Salon"
  modeSuivi         String?               // "Newsletter", "Google Alerts", "Abonnement", "Consultation régulière"
  typeSource        String?               // "Site web institutionnel", "Magazine en ligne", "Blog spécialisé", "Site associatif"…
  responsable       String?               // "Laurent", "Julien", "Jean Guy", "Direction"
  frequency         String?               // "Régulière", "Mensuelle", "Hebdomadaire", "Annuelle", "Ponctuelle", "Trimestrielle"
  exploitation      String?               @db.Text // ce qu'on a fait de l'info (champ Qualiopi clé)
  // Tracking :
  dateAdded         DateTime              @default(now())
  dateLastReviewed  DateTime?             // = mise à jour du champ exploitation (déclenche réinit alerte "X jours")
  // Workflow :
  status            RegulatoryWatchStatus @default(ACTIVE)
  suggestedBy       RegulatoryWatchSource @default(USER)
  // Pour les suggestions auto worker : permet de retrouver la source RSS d'origine.
  rssSourceUrl      String?
  rawSnippet        String?               @db.Text // résumé extrait du flux RSS, brut, avant exploitation rédigée
  createdAt         DateTime              @default(now())
  updatedAt         DateTime              @updatedAt

  @@index([tenantId, theme, status])
  @@index([tenantId, status, suggestedBy]) // requête inbox suggestions
  @@index([tenantId, dateLastReviewed])    // calcul KPI "X jours depuis"
}

enum RegulatoryWatchTheme {
  INDIC_23 // Veille évolutions secteur formation pro
  INDIC_24 // Veille secteur d'activité (immobilier pour Start Academy)
  INDIC_25 // Veille innovations pédagogiques et technologiques
  INDIC_26 // Veille handicap + DREETS régionale
}

enum RegulatoryWatchStatus {
  DRAFT      // suggestion auto worker non encore validée
  ACTIVE     // visible dans l'onglet, comptée pour audit
  ARCHIVED   // soft-delete (gardée pour historique audit)
}

enum RegulatoryWatchSource {
  USER       // saisie manuelle UI
  IMPORT     // import xlsx one-shot
  AUTO       // worker RSS + Ollama
}
```

### 3.2 Migration

**Commande mémoire `feedback_prisma_db_push_sandbox.md` :** En sandbox, utiliser :
```bash
pnpm --filter @qualiof/db exec prisma db push --skip-generate
pnpm --filter @qualiof/db exec prisma generate
```
**En CI/prod :** `prisma migrate dev --name phase13_regulatory_watch` puis `prisma migrate deploy` (mémoire `feedback_prisma_migrate_deploy.md` — sinon column missing au runtime).

### 3.3 Relation inverse Tenant (1 ligne à ajouter)

Dans `model Tenant` (vers ligne 60), ajouter :
```prisma
  regulatoryWatches Notification[]  →  AJOUTER : regulatoryWatches RegulatoryWatch[]
```

### 3.4 Note sur le mapping xlsx → enum

Le xlsx contient les noms FR pour la fréquence ("Régulière", "Mensuelle"…). On les stocke en **string libre** (champ `frequency: String?`) — PAS d'enum. Raison : le xlsx contient déjà des typos ("Réguliere" sans accent) et le pattern source xlsx est non-contraint. Enum prématuré = perte d'info. L'UI pourra proposer un autocomplete plus tard.

## 4. RSS Sources Proposal

> **Confidence MEDIUM** — sources extraites du xlsx existant + complément reconnu du domaine. À valider par l'utilisateur lors d'`/gsd:discuss-phase 13`.

### 4.1 Sources extraites du xlsx (sources déjà suivies par Start Academy)

| Thème | Source | URL | Verification |
|-------|--------|-----|--------------|
| INDIC_23 | Ministère du Travail | https://travail-emploi.gouv.fr/actualites/ | `curl -I https://travail-emploi.gouv.fr/feed/rss` |
| INDIC_23 | Centre Inffo | https://www.centre-inffo.fr/ | RSS officiel à vérifier |
| INDIC_23 | Défi Métiers | https://www.defi-metiers.fr/ | RSS à scraper si absent |
| INDIC_23 | Formalerte | https://www.formalerte.com/ | newsletter — pas de RSS confirmé |
| INDIC_23 | Digi-Certif | https://www.digi-certif.com/ | RSS Wordpress probable `/feed/` |
| INDIC_23 | Culture RH | https://culture-rh.com/ | RSS Wordpress `/feed/` |
| INDIC_24 | Immobilier 2.0 | https://immo2.pro/ | Spécialisé secteur — RSS probable |
| INDIC_24 | actu-juridique.fr | https://actu-juridique.fr/ | RSS probable `/feed/` |
| INDIC_24 | Service Public actualités | https://www.service-public.gouv.fr/particuliers/actualites | Flux Atom officiel |
| INDIC_25 | Digiformag | https://www.digiformag.com/ | RSS probable |
| INDIC_25 | Innovation Pédagogique | https://www.innovation-pedagogique.fr/ | RSS probable Wordpress |
| INDIC_25 | Lefebvre Dalloz formation | https://formation.lefebvre-dalloz.fr/ | Éditeur RH — RSS à vérifier |
| INDIC_26 | Agefiph actualités handicap | https://www.agefiph.fr/actualites-handicap | RSS officiel attendu |
| INDIC_26 | DREETS PACA | https://paca.dreets.gouv.fr/ | Flux institutionnel local |
| INDIC_26 | RHF PACA | https://www.rhf-paca.fr/ | Plateforme régionale — RSS à vérifier |

### 4.2 Méthode de vérification (script à exécuter en plan 3)

```ts
// scripts/probe-rss-sources.ts
import { fetch } from 'undici';
const SOURCES = [
  { name: 'Agefiph', url: 'https://www.agefiph.fr/feed', theme: 'INDIC_26' },
  // ...
];
for (const s of SOURCES) {
  const r = await fetch(s.url, { method: 'HEAD' });
  const ct = r.headers.get('content-type') ?? '';
  const isFeed = /xml|rss|atom/i.test(ct);
  console.log(`${s.name}: ${r.status} ${ct} ${isFeed ? '✓' : '✗'}`);
}
```

**Fallback HEAD si pas RSS officiel :** `https://feedburner.google.com/api/feed?` indispo depuis 2018 — utiliser bibliothèque `rss-parser` (~30k DL/sem npm, MIT) qui tolère HTML pages avec `<link rel="alternate" type="application/rss+xml">`.

### 4.3 Configuration runtime

Stocker la liste des sources actives dans un **fichier seed JSON** (`packages/db/scripts/seed-rss-sources.json`) plutôt qu'en BDD pour V1 — l'utilisateur édite via PR (pas besoin d'UI admin). Si demande forte, créer un model `RssSource` plus tard.

Format :
```json
[
  { "name": "Agefiph", "url": "https://www.agefiph.fr/feed", "theme": "INDIC_26", "active": true },
  { "name": "Service Public Particuliers", "url": "https://www.service-public.gouv.fr/particuliers/services-en-ligne-vos-droits/abonnement", "theme": "INDIC_24", "active": true }
]
```

### 4.4 Library choice — `rss-parser`

**Recommandation :** `rss-parser@3.x` (~MIT, 30k DL/sem npm, maintained 2025).
**Alternative :** `feedparser-promised` (plus bas niveau, plus de configuration). Moins ergonomique.

**Pourquoi pas fetch + DOMParser :** Les flux RSS ont une variabilité de format folle (RSS 2.0, Atom, RDF). `rss-parser` normalise en `{ title, link, pubDate, contentSnippet }`.

**Installation :**
```bash
pnpm --filter @qualiof/web add rss-parser
```

## 5. xlsx Import Analysis

### 5.1 Structure du fichier

**Fichier :** `/Users/laurentmarx/Documents/CRM Next gen/C6.i23-24-25tableau veille.xlsx`
**Backup :** `C6.i23-24-25tableau veille.backup-2026-05-23.xlsx`

**5 feuilles :**
1. `"23-Veille Formation pro"` — INDIC_23 — 30 lignes (header row 2, data row 3+)
2. `"26 - Veille Handicap"` — INDIC_26 — 12 lignes (header row 0, data row 1+) ⚠️ structure différente
3. `"26-Veille DREETS PACA"` — INDIC_26 — 14 lignes (header row 0)
4. `"24- secteur dactivité"` — INDIC_24 — 31 lignes (header row 2)
5. `"25- Innovations péda et techno"` — INDIC_25 — 28 lignes (header row 2)

**Total estimé en BDD après import :** ~80-95 entrées (vs. ~84 annoncées dans REQUIREMENTS).

### 5.2 Header layouts détectés

**Feuilles 1/4/5 (INDIC_23/24/25) — col 0 vide, header row 2 :**
```
[null, "Titre de la source", "Lien", "Mode de suivi/ Alertes possibles", "Type de source", "Information suivi par", "Fréquence", "Exploitations"]
```
(8 colonnes, parfois 9 avec `"date de la mise en place"` en plus pour la feuille 25)

**Feuilles 2/3 (INDIC_26) — header row 0 :**
```
["Titre de la source", "Lien", "Mode de suivi/ Alertes possibles", "Type de source", "Information suivi par", "Fréquence", "Exploitations", "date de la mise en place", "Exploitation"]
```
(9 colonnes — note : 2 colonnes "Exploitation" différentes : col 6 = description info, col 8 = ce qu'on a fait. Le mapping doit fusionner ou choisir.)

### 5.3 Mapping xlsx → Prisma

| Colonne xlsx | Champ Prisma | Note |
|--------------|--------------|------|
| Titre de la source | `title` | required, trim |
| Lien | `url` | nullable |
| Mode de suivi | `modeSuivi` | nullable |
| Type de source | `typeSource` | nullable |
| Information suivi par | `responsable` | nullable, normalize "LAURENT"→"Laurent" |
| Fréquence | `frequency` | nullable, normalize trailing space |
| Exploitations / Exploitation col 6 | `rawSnippet` | description de la source (fond) |
| Exploitation col 8 (feuilles 26) | `exploitation` | ce qu'on a fait |
| date de la mise en place | `dateLastReviewed` | parser multi-format (cf §5.4) |
| (feuille) → theme | `theme` | hardcode par feuille (INDIC_23/24/25/26) |
| — | `tenantId` | tenant unique de l'instance Start Academy |
| — | `status` | `'ACTIVE'` (import = considéré validé) |
| — | `suggestedBy` | `'IMPORT'` |

**Pour les feuilles 1/4/5** où il n'y a qu'une colonne "Exploitations" : mapper sur `exploitation` directement, laisser `rawSnippet` à NULL.

### 5.4 Parser de date

Le xlsx contient 3 formats mélangés :
- `"12-Mar-26"` (format Excel court anglais)
- `"15/03/2024"` (format FR)
- `"Jun-23"` (mois-année seulement)
- `null` ou `""`

Helper requis :
```ts
function parseFlexibleDate(v: string | null): Date | null {
  if (!v || !v.trim()) return null;
  const s = v.trim();
  // Format DD/MM/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2]-1, +m[1]);
  // Format DD-Mmm-YY
  const monthMap: Record<string, number> = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], monthMap[m[2]] ?? 0, +m[1]);
  // Format Mmm-YY (sans jour)
  m = s.match(/^([A-Za-z]{3})-(\d{2,4})$/);
  if (m) return new Date(+m[2] < 100 ? 2000 + +m[2] : +m[2], monthMap[m[1]] ?? 0, 1);
  return null;
}
```

### 5.5 Idempotence (Pitfall clone `import-smartof.ts`)

Le script doit pouvoir être relancé sans créer de doublons. Convention :
- Clé naturelle : `(tenantId, theme, title, url ?? '')` → check `findFirst` avant create.
- Si déjà présent : UPDATE des champs autres (cas d'enrichissement du xlsx au fil du temps).
- Tracer via `ExternalIdentity` (source='veille-xlsx-2026-05-23', externalId=hash sha8 du tuple) — clone du pattern SmartOF.

### 5.6 Script à créer

`packages/db/scripts/import-veille.ts` (clone-strict de `import-smartof.ts` ~250 lignes). Le path xlsx est resolved relatif à la racine workspace :
```ts
const VEILLE_XLSX = path.join(ROOT, 'C6.i23-24-25tableau veille.xlsx');
```

**Commande :** `pnpm --filter @qualiof/db exec tsx scripts/import-veille.ts`

## 6. Ollama Classification Prompt

### 6.1 Pattern figé

```ts
// apps/web/src/lib/veille/prompts.ts
export const PROMPT_VERSION_VEILLE = 'veille-classify-v1-2026-05-25';

export const SYSTEM_PROMPT_VEILLE_CLASSIFY = `Tu es un expert en veille réglementaire pour les organismes de formation Qualiopi.
Tu reçois un titre + résumé d'article extrait d'un flux RSS. Tu dois :
1. Classer l'article dans UN SEUL des 4 thèmes Qualiopi (critère 6) :
   - INDIC_23 : évolutions du secteur de la formation professionnelle (réglementation, RNQ, Qualiopi, OPCO, dispositifs)
   - INDIC_24 : évolutions du secteur d'activité de l'organisme (pour Start Academy = immobilier, transactions, agents commerciaux, fiscalité immo)
   - INDIC_25 : innovations pédagogiques et technologiques (digital learning, IA pédagogique, gamification, adaptive learning)
   - INDIC_26 : handicap et accessibilité en formation (Agefiph, RQTH, RHF, DREETS région PACA, troubles dys)
2. Proposer un BROUILLON D'EXPLOITATION de 1 à 2 phrases : "qu'est-ce que cette info change pour notre organisme de formation, quelle action concrète ?" Ton professionnel, factuel, concret.

RÈGLES :
- Si l'article ne correspond à AUCUN des 4 thèmes Qualiopi, retourner theme="OTHER" et confidence < 50.
- Confidence 0-100 : combien tu es sûr de ton classement.
- Pas de markdown, pas d'émoji.
- L'exploitation doit être actionnable, pas descriptive ("Décision : ..." ou "Action : ..." ou "Mise à jour de ...").

Réponds UNIQUEMENT en JSON, sans texte avant/après :
{
  "theme": "INDIC_23" | "INDIC_24" | "INDIC_25" | "INDIC_26" | "OTHER",
  "confidence": <int 0-100>,
  "exploitation_draft": "<string 1-2 phrases>"
}`;

export function buildVeilleClassifyUserPrompt(item: { title: string; snippet: string; source: string }): string {
  return `Source: ${item.source}
Titre: ${item.title}

Résumé (extrait RSS) :
${item.snippet || '(résumé indisponible)'}`;
}
```

### 6.2 Few-shot (optionnel pour V1)

`mistral-small:24b` performe bien sans few-shot sur des tâches simples. Si la précision dérive (mesurable via `AIGenerationJob` + revue manuelle), ajouter 4 exemples (1 par thème) dans le system prompt.

### 6.3 Zod schema de validation

```ts
const VeilleClassifyOutputSchema = z.object({
  theme: z.enum(['INDIC_23', 'INDIC_24', 'INDIC_25', 'INDIC_26', 'OTHER']),
  confidence: z.number().int().min(0).max(100),
  exploitation_draft: z.string().min(10).max(500),
});
```

### 6.4 Guard-rails (Pitfalls)

1. **JSON malformé** : `callOllama` tente déjà un fallback regex `{[\s\S]*}` si parse plante (cf. `ai-ollama.ts:67-79`). Si toujours null → INSERT en `draft` avec `theme=null` + `exploitation=null`, l'utilisateur classifie manuellement.
2. **Confidence < 60** : INSERT mais flag visuel UI "Classification incertaine — à vérifier".
3. **theme === 'OTHER'** : NE PAS INSERT (l'article n'est pas pertinent pour Qualiopi). Log `AIGenerationJob.status='skipped_other'`.
4. **Timeout 60s** : `mistral-small:24b` doit répondre en <10s pour un prompt court. Si timeout → retry 1× puis abandon (log error).
5. **Dédup par URL** : avant INSERT auto, `findFirst({ tenantId, url })` — si déjà présent (même URL importée ou suggérée auparavant), skip.

## 7. PDF Audit Template Sketch

### 7.1 Structure HTML (1 PDF par thème)

Clone-strict de `legal-docs-template.ts` (BUG-15) avec ajustement table-based body.

```ts
// apps/web/src/lib/veille-audit-template.ts
export interface VeilleAuditData {
  theme: 'INDIC_23' | 'INDIC_24' | 'INDIC_25' | 'INDIC_26';
  themeLabel: string; // "Indicateur 23 — Veille formation professionnelle"
  watches: Array<{
    title: string;
    url: string | null;
    source: string | null;
    responsable: string | null;
    frequency: string | null;
    exploitation: string | null;
    dateLastReviewed: Date | null;
    dateAdded: Date;
  }>;
  generatedAt: Date;
  tenantName: string;
}

export function renderVeilleAuditHtml(data: VeilleAuditData, of: OfConfig, tenantId?: string): string {
  // @page A4 + WeasyPrint paged footer (renderOfPagedFooter)
  // Header : logo + tenant name + titre du thème + date d'export
  // Body : table 5 cols (Source / Lien / Responsable / Fréquence / Date dernière revue / Exploitation)
  //  Soit ~80 lignes max sur 4-8 pages selon thème.
  // Footer paged (CSS Paged Media) — répété sur chaque page.
}
```

### 7.2 Choix moteur PDF : WeasyPrint > Gotenberg

**Pourquoi WeasyPrint pour les 4 PDFs veille :**
- Mémoire `feedback_footer_pdf_qualiof.md` : footer Gotenberg illisible sans hack 36pt.
- Tables longues (80 lignes) nécessitent CSS `page-break-inside: avoid` natif → WeasyPrint supporte mieux.
- `renderOfPagedFooter()` déjà éprouvé sur les docs Qualiopi closure et legal-docs.

### 7.3 Route + accès UI

**Server action :** `generateVeilleAuditForTheme(theme: RegulatoryWatchTheme): Promise<{ ok: true; documentId: string } | { ok: false; error }>`
**Bouton UI** : 4 boutons "Export PDF" en haut de chaque onglet de `/app/veille`. RBAC `requireRole(['ADMIN', 'MANAGER'])`.

**Persistance PDF :** Optionnel — pour audit Qualiopi, l'utilisateur télécharge à la demande. Stocker dans MinIO `DOCS_BUCKET` (clé `veille-audit/{tenantId}/{theme}-{YYYY-MM-DD}.pdf`) + tracer dans `Document` ? **Recommandation :** Pas de persistance V1, génération à la volée + AuditLog `regulatoryWatch.exported`. Plus simple, moins de stockage.

## 8. Page /app/veille IA

### 8.1 Layout général

**Route :** `apps/web/src/app/app/veille/page.tsx` (Server Component).

```
+-----------------------------------------------------------+
|  Veille Qualiopi              [+ Ajouter une source]      |
|  Critère 6 — indicateurs 23/24/25/26                       |
+-----------------------------------------------------------+
|  [Onglet 23] [Onglet 24] [Onglet 25] [Onglet 26]  [Inbox 3]|
+-----------------------------------------------------------+
|  Onglet 23 — Veille formation pro                         |
|  [Filtres : Source / Responsable / Fréquence]             |
|  [Export PDF audit]   ⏱ 12 jours depuis dernière revue   |
|                                                            |
|  | Titre | Lien | Mode | Resp | Fréq | Exploitation | ⋮ |
|  |...                                                     |
+-----------------------------------------------------------+
```

### 8.2 URL state (pattern Phase 9.1 product-tabs)

`?tab=indic_23|indic_24|indic_25|indic_26|inbox` (default = `indic_23`).

```tsx
// app/app/veille/page.tsx
export default async function VeillePage({
  searchParams,
}: { searchParams: Promise<{ tab?: string; q?: string; responsable?: string }> }) {
  const { user } = await validateRequest();
  if (!user) return null;
  const sp = await searchParams;
  const tab = (sp.tab ?? 'indic_23') as Tab;

  if (tab === 'inbox') {
    return <VeilleInbox tenantId={user.tenantId} />;
  }
  const theme = tabToTheme(tab); // INDIC_23 etc.
  const [watches, daysSinceReview] = await Promise.all([
    prisma.regulatoryWatch.findMany({
      where: { tenantId: user.tenantId, theme, status: { in: ['ACTIVE', 'DRAFT'] } },
      orderBy: { dateLastReviewed: 'desc' },
    }),
    getDaysSinceLastReview(user.tenantId, theme),
  ]);
  return <VeilleTab theme={theme} watches={watches} daysSinceReview={daysSinceReview} canEdit={hasRole(user, ['ADMIN', 'MANAGER'])} />;
}
```

### 8.3 Tableau

- **5-6 colonnes visibles** : Titre · Source · Resp · Fréquence · Exploitation (inline edit) · Actions ⋮
- **Filtres URL state** : `?q=...&responsable=Laurent&freq=Mensuelle`
- **Tri** : par défaut `dateLastReviewed DESC` (les plus à jour en haut), option toggle "plus anciens en haut" pour audit.
- **Ligne DRAFT (suggestion auto)** : background `bg-amber-50` + badge "Suggestion auto" + boutons "Valider" / "Rejeter" (au lieu de l'édition inline).

### 8.4 Inline edit Exploitation

Pattern : `<ExploitationCell value={w.exploitation} onSave={updateExploitation(w.id, ...)} />` :
- Mode read-only par défaut (truncate 100 chars + "Voir plus" expand).
- Click "Éditer" → Textarea + Enregistrer (useTransition + toast sonner).
- À l'enregistrement : `updateRegulatoryWatchExploitation` server action met aussi `dateLastReviewed = now()` et trace AuditLog `regulatoryWatch.exploitation_updated`.

### 8.5 Inbox

**Onglet "Inbox X"** où X = count de `status='DRAFT' AND suggestedBy='AUTO'`. Liste avec :
- Pour chaque suggestion : titre + URL + thème proposé + confidence + exploitation_draft + 2 boutons "Valider" (passe à `status='ACTIVE'`) / "Rejeter" (passe à `status='ARCHIVED'`).
- Validation déclenche AuditLog `regulatoryWatch.suggestion_approved`.

### 8.6 Composants à créer (estimation)

| Composant | Type | Lignes |
|-----------|------|--------|
| `app/app/veille/page.tsx` | Server | ~80 |
| `components/veille/veille-tabs.tsx` | Client | ~50 (tabs URL state) |
| `components/veille/veille-table.tsx` | Server | ~80 |
| `components/veille/exploitation-cell.tsx` | Client (inline edit) | ~70 |
| `components/veille/veille-row-actions.tsx` | Client (kebab menu) | ~60 |
| `components/veille/add-veille-dialog.tsx` | Client (Radix Dialog + RHF) | ~120 |
| `components/veille/veille-inbox.tsx` | Server + Client | ~100 |
| `components/veille/days-since-badge.tsx` | Server (pure) | ~20 |
| `components/veille/export-pdf-button.tsx` | Client | ~40 |
| `lib/veille/days-since.ts` | Pure helper | ~10 |

**Total estimé UI :** ~630 LOC.

## 9. Open Questions

> Le planner DOIT trancher ou poser ces questions à l'utilisateur via `/gsd:discuss-phase 13` avant `/gsd:plan-phase 13`. Aucune CONTEXT.md n'existe encore.

1. **Sources RSS à activer en V1 :** Le xlsx liste ~30 sources. Combien activer dans le seed initial ? Recommandation : 12 sources (3 par thème, validées par probe HEAD).
2. **Worker en V1 ou V2 :** Faut-il livrer le worker BullMQ cron hebdo dès V1, ou commencer en saisie 100% manuelle + import xlsx, et ajouter le worker dans un Plan séparé ? Si on parallélise mal, on bloque la V1 sur la qualité des prompts Ollama.
3. **Modèle Ollama figé :** `mistral-small:24b` confirmé OK pour classification, ou tester `qwen3:30b-a3b` (mémoire ai-ollama indique instable JSON mais peut-être différent pour ce cas court) ?
4. **Persistance PDF audit :** Génération à la volée (recommandé) ou stocker en MinIO comme `Document` ?
5. **RBAC LECTEUR :** Le spec dit "LECTEUR pour consultation" — confirmé que LECTEUR doit voir l'onglet inbox (suggestions auto) en read-only, ou strictement masqué pour lui ?
6. **Édition inline simple ou rich-text :** L'exploitation Qualiopi est-elle un simple textarea, ou un éditeur markdown light ? Recommandation : textarea simple (V1) — l'audit Qualiopi accepte du texte brut.
7. **Confidence threshold auto-accept :** Doit-on auto-accepter (status='ACTIVE' direct) les suggestions auto avec `confidence >= 90` ? Recommandation : NON, toutes les suggestions passent par l'inbox (valeur d'audit = traçabilité humaine).
8. **Mapping enum vs string libre :** Confirmer que `frequency` et `typeSource` restent en string libre (cf. §3.4), pas d'enum prématurée.
9. **Internationalization noms sources :** "Information suivi par" du xlsx contient des prénoms ("Laurent", "Julien", "Jean Guy"). Mapper sur `User` (FK) ? Recommandation : NON, garder string libre (le xlsx vient d'avant l'introduction RBAC Phase 8, et certains noms ne correspondent pas à des users — ex. "Direction").
10. **Multi-source par ligne :** Le xlsx a parfois la même URL pour 2 thèmes (DREETS dans 26 ET 24). Faut-il dédupliquer ou autoriser duplication thématique ? Recommandation : autoriser duplication (1 ligne = 1 entrée thématique, pas 1 source unique).

## 10. Validation Architecture

> Section requise (workflow.nyquist_validation = true dans config.json).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 (apps/web + packages/shared) |
| Config file | `apps/web/vitest.config.ts` (env: node) |
| Quick run command | `pnpm --filter @qualiof/web test -- src/lib/veille src/server/actions/__tests__/veille` |
| Full suite command | `pnpm --filter @qualiof/web test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Status |
|--------|----------|-----------|-------------------|-------------|
| VEILLE-01 | Migration Prisma RegulatoryWatch applique sans casser autres tables | smoke / migration | `pnpm --filter @qualiof/db exec prisma migrate diff --from-empty --to-schema-datamodel packages/db/prisma/schema.prisma` | ❌ Wave 0 |
| VEILLE-01 | Import xlsx idempotent : 2 runs successifs = même count | unit | `pnpm --filter @qualiof/db test -- import-veille.idempotence.test.ts` | ❌ Wave 0 |
| VEILLE-01 | Parser flexibleDate gère 3 formats (DD/MM/YYYY, DD-Mmm-YY, Mmm-YY) | unit pure | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/parse-flexible-date.test.ts` | ❌ Wave 0 |
| VEILLE-01 | Import xlsx mappe 5 sheets vers les 4 thèmes correctement | integration | `pnpm --filter @qualiof/db test -- import-veille.mapping.test.ts` | ❌ Wave 0 |
| VEILLE-02 | Page /app/veille rend les 4 onglets + onglet inbox | smoke RSC | `pnpm --filter @qualiof/web test -- src/app/app/veille/__tests__/page.smoke.test.ts` | ❌ Wave 0 |
| VEILLE-02 | updateRegulatoryWatchExploitation met `dateLastReviewed = now()` | unit | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.update-exploitation.test.ts` | ❌ Wave 0 |
| VEILLE-02 | RBAC : non-ADMIN/MANAGER → ForbiddenError sur create/update/delete/approve/reject | unit | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.rbac.test.ts` | ❌ Wave 0 |
| VEILLE-02 | LECTEUR voit l'onglet inbox en read-only (pas de boutons Valider/Rejeter) | smoke (helper hasRole) | `pnpm --filter @qualiof/web test -- src/components/veille/__tests__/veille-inbox.rbac.test.ts` | ❌ Wave 0 |
| VEILLE-02 | daysSince helper retourne `null` si date null + colore selon threshold | unit pure | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/days-since.test.ts` | ❌ Wave 0 |
| VEILLE-02 | Inline edit Exploitation déclenche AuditLog `regulatoryWatch.exploitation_updated` | integration (mock prisma) | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.audit.test.ts` | ❌ Wave 0 |
| VEILLE-03 | Export PDF audit produit un PDF non vide (> 5 KB) avec N lignes attendues | integration (Gotenberg mock or real) | `pnpm --filter @qualiof/web test -- src/lib/__tests__/veille-audit-template.test.ts` | ❌ Wave 0 |
| VEILLE-03 | Footer paged WeasyPrint contient tenant name + SIRET + NDA | unit string | `pnpm --filter @qualiof/web test -- src/lib/__tests__/veille-audit-template.html.test.ts` | ❌ Wave 0 |
| VEILLE-03 | Export PDF trace AuditLog `regulatoryWatch.exported` avec count | integration | `pnpm --filter @qualiof/web test -- src/server/actions/__tests__/veille.export.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Worker cron registered avec pattern `'0 8 * * 1'` + tz Europe/Paris + jobId fixe | unit (mock BullMQ) | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/worker.cron.test.ts` | ❌ Wave 0 |
| VEILLE-04 | RSS fetcher tolère feed invalide → log + continue | unit (mock fetch) | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/fetch-rss.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Classify retourne `null` + log AIGenerationJob si JSON Ollama invalide | unit (mock callOllama) | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/classify.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Dédup par URL : 2ème ingestion même item = skip silent | unit | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/dedup-by-url.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Item classé `OTHER` n'est PAS inséré en BDD (AIGenerationJob.status='skipped_other') | unit | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/classify.test.ts` | ❌ Wave 0 |
| VEILLE-04 | Insertion auto trace AuditLog `regulatoryWatch.auto_inserted` actorUserId=null | unit | `pnpm --filter @qualiof/web test -- src/lib/veille/__tests__/persist.audit.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @qualiof/web test -- src/lib/veille src/server/actions/__tests__/veille` (~3s, run par chaque wave)
- **Per wave merge:** `pnpm test` (full monorepo, ~30s)
- **Phase gate:** Full suite green + 1 dry-run worker manual (`tsx scripts/test-veille-worker.ts`) + 1 dry-run import xlsx + génération réelle des 4 PDFs vérifiée visuellement avant `/gsd:verify-work`

### Wave 0 Gaps (tests stubs à créer en foundation plan)

- [ ] `apps/web/src/lib/veille/__tests__/parse-flexible-date.test.ts` — couvre VEILLE-01 (3 formats date)
- [ ] `apps/web/src/lib/veille/__tests__/days-since.test.ts` — couvre VEILLE-02 (KPI badge)
- [ ] `apps/web/src/lib/veille/__tests__/fetch-rss.test.ts` — couvre VEILLE-04 (RSS fault-tolerant)
- [ ] `apps/web/src/lib/veille/__tests__/classify.test.ts` — couvre VEILLE-04 (Ollama JSON guard-rail + OTHER skip)
- [ ] `apps/web/src/lib/veille/__tests__/dedup-by-url.test.ts` — couvre VEILLE-04 (dédup)
- [ ] `apps/web/src/lib/veille/__tests__/persist.audit.test.ts` — couvre VEILLE-04 (AuditLog auto_inserted)
- [ ] `apps/web/src/lib/veille/__tests__/worker.cron.test.ts` — couvre VEILLE-04 (cron registration)
- [ ] `apps/web/src/lib/__tests__/veille-audit-template.test.ts` — couvre VEILLE-03 (PDF non vide)
- [ ] `apps/web/src/lib/__tests__/veille-audit-template.html.test.ts` — couvre VEILLE-03 (footer string)
- [ ] `apps/web/src/server/actions/__tests__/veille.update-exploitation.test.ts` — couvre VEILLE-02 (dateLastReviewed)
- [ ] `apps/web/src/server/actions/__tests__/veille.rbac.test.ts` — couvre VEILLE-02 (RBAC ForbiddenError)
- [ ] `apps/web/src/server/actions/__tests__/veille.audit.test.ts` — couvre VEILLE-02 (AuditLog exploitation_updated)
- [ ] `apps/web/src/server/actions/__tests__/veille.export.test.ts` — couvre VEILLE-03 (AuditLog exported)
- [ ] `apps/web/src/app/app/veille/__tests__/page.smoke.test.ts` — couvre VEILLE-02 (page boote sans crash)
- [ ] `apps/web/src/components/veille/__tests__/veille-inbox.rbac.test.ts` — couvre VEILLE-02 (LECTEUR read-only)
- [ ] `packages/db/scripts/__tests__/import-veille.idempotence.test.ts` — couvre VEILLE-01 (rerun safe)
- [ ] `packages/db/scripts/__tests__/import-veille.mapping.test.ts` — couvre VEILLE-01 (5 sheets → 4 themes)

## 11. Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Postgres 16 | RegulatoryWatch model | ✓ | 16 (Docker) | — |
| Redis 7 | BullMQ queue (cron worker) | ✓ | 7 (Docker) | Mode dégradé du worker (cf. invoice-reminder-worker.ts:39-46) si Redis indispo : log warning + setInterval keepalive |
| Ollama local | Classification mistral-small:24b | ✓ | (utilisateur Mac M-series natif) | timeout 60s + retry 1× puis abandon, INSERT status='draft' theme=null |
| Gotenberg | Export PDF audit (fallback) | ✓ | 8 (Docker) | WeasyPrint préféré |
| WeasyPrint | Export PDF audit (recommandé) | ✓ | 60.2 (Docker) | Gotenberg fallback |
| MinIO | Persistance PDF audit (si décidé) | ✓ | (Docker) | Génération à la volée recommandée → pas besoin |
| `rss-parser` npm | Worker RSS fetcher | ✗ | — | À installer : `pnpm --filter @qualiof/web add rss-parser` |
| `xlsx` npm | Script import-veille.ts | ✓ | 0.20.3 (déjà dans packages/db ou apps/web) | — |
| Fichier `C6.i23-24-25tableau veille.xlsx` | Import one-shot | ✓ | présent dans `/Users/laurentmarx/Documents/CRM Next gen/` | Backup `.backup-2026-05-23.xlsx` disponible |

**Missing dependencies with fallback:**
- `rss-parser` (à installer via pnpm en wave 0 du plan worker)

## 12. Project Constraints (from CLAUDE.md)

- **Tech stack figé** : Next.js 14 + Prisma + BullMQ + Ollama. ✓ Cohérent avec Phase 13.
- **Runtime Mac M-series local** : Ollama natif Metal. ✓
- **Multi-tenant** : toute server action DOIT scope par tenantId. Le model `RegulatoryWatch` a `tenantId` FK obligatoire + tous les indexes incluent tenantId.
- **PDF rendering** : Gotenberg sans footer natif (illisible), footer dans body. Recommandation = WeasyPrint (CSS Paged Media natif). ✓
- **Worker BullMQ** : jamais d'imports de server actions utilisant `requireRole`/`validateRequest` (cf. mémoire `feedback_worker_no_react_imports.md`). Pattern obligatoire `lib/veille/core.ts` séparé.
- **Routes** : FR kebab-case. `/app/veille` est conforme (mot court, pas d'ambiguïté).
- **GSD workflow** : Phase 13 a été ajoutée via `/gsd:add-phase 13` (cf. STATE/REQUIREMENTS). Prochaine étape `/gsd:discuss-phase 13` recommandée (cf. §9 Open Questions) avant `/gsd:plan-phase 13`.
- **CGV/RI éditables** : Tenant.cgvMarkdown / reglementInterieurMarkdown existent (BUG-15). Pas d'impact direct sur Phase 13 mais montre que le pattern "textarea markdown → PDF Gotenberg" est éprouvé.

## 13. Risks & Pitfalls

| Risk | Severity | Mitigation |
|------|----------|------------|
| Sources RSS instables (sites changent de structure, 404) | MEDIUM | Worker tolérant : log + skip + continuer. AlertingChannel si > 50% des sources échouent (V2). |
| Ollama JSON malformé (`format: 'json'` ne garantit pas Zod-compliant) | HIGH | Zod schema strict + fallback regex `{[\s\S]*}` (déjà dans `ai-ollama.ts`) + dernière chance INSERT en `draft` `theme=null`. |
| Cascade emails non, mais cascade INSERT auto possible si dédup bug | MEDIUM | Dédup par `(tenantId, url)` `findFirst` AVANT classify (économise aussi le call Ollama). |
| xlsx import non-idempotent → doublons à chaque relance | HIGH | Clé naturelle `(tenantId, theme, title, url)` + check `findFirst` avant create (clone-strict import-smartof.ts). |
| Worker démarre sans Redis → crash dev:full | LOW | Pattern dégradé `setInterval(() => {}, 60_000)` clone-strict de `invoice-reminder-worker.ts:39-46`. |
| Migration Prisma sans `prisma migrate deploy` en prod | HIGH | Documenter dans Plan 1 explicitement. Mémoire `feedback_prisma_migrate_deploy.md` confirme la gravité. |
| Confidence Ollama < 60 sur de nombreux articles → inbox explose | MEDIUM | UI inbox triée par confidence DESC pour traiter d'abord les sûrs. Option "Marquer tous les < 50 comme rejetés" si besoin. |
| LECTEUR voit suggestions DRAFT et croit que ce sont des sources validées | LOW | UI : badge orange "Suggestion auto à valider" visible. Plus prudent : masquer les DRAFT du tableau principal pour LECTEUR, ne voir que l'inbox en read-only. |

## 14. Sources

### Primary (HIGH confidence — code lu)
- `apps/web/src/lib/closure/queue.ts` + `apps/web/scripts/closure-worker.ts` (BullMQ pattern)
- `apps/web/src/lib/invoice-reminders/queue.ts` + `worker.ts` + `scripts/invoice-reminder-worker.ts` (cron BullMQ pattern Plan 11-06)
- `apps/web/src/lib/ai-ollama.ts` + `apps/web/src/lib/closure/qualiopi-prompts.ts` + `ollama-generators.ts` (Ollama pattern)
- `apps/web/src/lib/pdf-render.ts` + `of-pdf-footer.ts` + `legal-docs-template.ts` (PDF Gotenberg/WeasyPrint pattern)
- `apps/web/src/lib/rbac.ts` + `audit-log.ts` + `invoice-audit.ts` + `document-audit.ts` (RBAC + AuditLog 5 instances)
- `apps/web/src/server/actions/leads.ts` + `qualiopi-matrix.ts` (server actions pattern Phase 9/9.1)
- `apps/web/src/app/app/parametres/historique/page.tsx` (page Server Component + URL state pattern Phase 8)
- `apps/web/src/components/layout/nav-config.ts` (sidebar + filterNavForRole Phase 8)
- `packages/db/scripts/import-smartof.ts` (xlsx import pattern, idempotence, ExternalIdentity)
- `packages/db/prisma/schema.prisma` (Tenant, AuditLog, Notification, AIGenerationJob models)
- Fichier xlsx `C6.i23-24-25tableau veille.xlsx` (lu via node XLSX, 5 feuilles inspectées)
- `.planning/STATE.md` + `.planning/REQUIREMENTS.md` + `.planning/ROADMAP.md`

### Secondary (MEDIUM confidence — pattern observé multi-fois)
- Pattern "one helper per entity" AuditLog (5 instances : Tenant, User, Lead, Document, Invoice — Phase 13 = 6ème)
- Pattern Zod schema + fallback regex pour Ollama JSON output (closure-generators)

### Tertiary (LOW confidence — à vérifier en plan exécution)
- Disponibilité des flux RSS proposés (§4.1) — script de probe à exécuter
- Performance `mistral-small:24b` sur classification courte (testé sur génération QCM longue, pas sur classification short-input) — bench à faire

## 15. Metadata

**Confidence breakdown:**
- Standard stack (BullMQ, Ollama, Gotenberg/WeasyPrint, xlsx) : HIGH — patterns existants éprouvés.
- Prisma schema (RegulatoryWatch + 3 enums) : HIGH — clone-strict Phase 9 Notification.
- AuditLog conventions : HIGH — pattern figé Phase 7/8/9/9.1/11.
- RSS sources proposed : MEDIUM — extraites du xlsx, mais URLs RSS effectives à valider runtime.
- Ollama prompt classification : MEDIUM — pattern Ollama validé, classification short-input non-benchmarked.
- xlsx structure mapping : HIGH — 5 feuilles inspectées en runtime.
- Validation Architecture : HIGH — 18 tests Wave 0 mappés sur les 4 requirements.

**Research date:** 2026-05-25
**Valid until:** 2026-06-24 (30 jours — stack figé, peu de drift attendu)
