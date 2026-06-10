# Phase 13: Veille Qualiopi intégrée — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning
**Source:** Inline scope-decision questions (4 décisions critiques) + RESEARCH.md §9 recommandations

<domain>
## Phase Boundary

Couvrir le critère 6 Qualiopi (indicateurs 23/24/25/26) via une **veille intégrée dans QualiOF**, 100% locale (RSS + Ollama, 0 coût API), avec exploitation tracée et export PDF audit.

Inclus :
- Modèle Prisma `RegulatoryWatch` + 3 enums (`RegulatoryWatchTheme`, `RegulatoryWatchStatus`, `RegulatoryWatchSource`) + indexes
- Import one-shot xlsx `C6.i23-24-25tableau veille.xlsx` (~50 + 34 entrées, 5 feuilles, 2 layouts)
- Page `/app/veille` : 4 onglets par thème + onglet inbox, tableau filtrable, ajout/édition manuelle, édition inline Exploitation, KPI "X jours depuis dernière mise à jour"
- Export PDF audit (1 PDF par thème, WeasyPrint préféré, Gotenberg fallback) **stocké en MinIO comme `Document`** (snapshot tracé)
- Worker BullMQ cron hebdo (RSS aggregator + Ollama mistral-small:24b classification → INSERT status='draft' suggestedBy='AUTO')
- RBAC : ADMIN+MANAGER CRUD complet, LECTEUR consultation entries `ACTIVE` seulement (**inbox masquée**)
- AuditLog convention `regulatoryWatch.[verb]` (1ère instanciation — verbes : `created`, `updated`, `exploitation_updated`, `approved`, `rejected`, `archived`, `auto_inserted`, `exported`)

Hors scope (V2 future) :
- UI refonte design (réutilise patterns Phase 9.1 product-tabs + Phase 8 historique)
- Internationalisation au-delà du français
- Auto-accept des suggestions (toutes passent par inbox — traçabilité humaine = valeur d'audit)

</domain>

<decisions>
## Implementation Decisions

### Scope (utilisateur, 2026-05-25)
- **D-01 — Worker en V1 :** Le worker BullMQ RSS+Ollama est livré DANS cette phase, pas reporté. Plan doit couvrir les 6 critères de succès du roadmap.
- **D-02 — Export PDF audit stocké en MinIO comme `Document` :** Chaque export crée une ligne `Document` (catégorie `veille_audit_pdf` ou équivalent), uploadée en MinIO, traçable dans `AuditLog regulatoryWatch.exported`. Pas de génération volatile.
- **D-03 — LECTEUR n'a PAS accès à l'inbox :** L'onglet inbox (suggestions auto) est strictement masqué côté LECTEUR. Il ne voit que les entrées `status='ACTIVE'` des 4 onglets thématiques.
- **D-04 — Continuer sans UI-SPEC.md :** Réutilise patterns Phase 9.1 product-tabs (4 onglets URL state) + Phase 8 historique (tableau + RBAC) + Phase 5 BudgetAgefice (inline edit textarea). Composants à créer listés dans RESEARCH.md §8.6.

### Recommandations RESEARCH.md §9 (tranchées par défaut)
- **D-05 — 12 sources RSS seed initial :** 3 sources par thème (23/24/25/26), validées par probe HEAD avant insert (cf. RESEARCH.md §4.1-4.2). Liste exhaustive dans research.
- **D-06 — Modèle Ollama figé : `mistral-small:24b` :** Confirmé OK pour classification courte (titre + summary RSS → theme + draft exploitation). Pas de test `qwen3:30b-a3b` en V1.
- **D-07 — Exploitation = textarea simple :** Pas de rich-text / markdown editor en V1. L'audit Qualiopi accepte du texte brut.
- **D-08 — NO auto-accept même si confidence ≥ 90 :** Toutes les suggestions auto sont insérées en `status='DRAFT'` `suggestedBy='AUTO'` et passent par l'inbox. La validation humaine est la valeur Qualiopi.
- **D-09 — `frequency` et `typeSource` en string libre :** Pas d'enum prématurée. Migration future possible si pattern stabilise.
- **D-10 — `responsable` en string libre (pas FK User) :** Le xlsx contient des noms hors RBAC (« Direction », noms historiques). Garder string libre pour l'import et l'édition.
- **D-11 — Autoriser duplication thématique :** Si la même URL apparaît dans 2 thèmes du xlsx (ex. DREETS dans 26 ET 24), on insère 2 lignes (1 par thème). Dedup côté worker = par `(url, theme)` PAS par url seule.

### AuditLog convention (1ère instanciation `regulatoryWatch.*`)
Verbes :
- `regulatoryWatch.created` — création manuelle (UI ou import xlsx)
- `regulatoryWatch.updated` — édition champs hors exploitation
- `regulatoryWatch.exploitation_updated` — inline edit exploitation (avec diff before/after)
- `regulatoryWatch.approved` — passage `DRAFT` (suggestedBy=AUTO) → `ACTIVE`
- `regulatoryWatch.rejected` — rejet inbox (passe `ARCHIVED` avec `rejectionReason`)
- `regulatoryWatch.archived` — archivage manuel
- `regulatoryWatch.auto_inserted` — insertion worker (actorUserId=null)
- `regulatoryWatch.exported` — export PDF audit (avec `theme` et `count`)

### Claude's Discretion
- Naming exact des composants UI (`VeilleTabsClient`, `VeilleTable`, `VeilleInbox`, `VeilleEditInlineCell`, etc.) à choisir par planner
- Choix exact des breakpoints responsive (réutiliser conventions Phase 3)
- Détails d'erreur worker (timeout/retry policy) — respecter pattern `closure-worker.ts`
- Choix exact des labels FR pour les boutons et messages utilisateur
- Internal SQL/Prisma indexes additionnels si besoin perf

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` — VEILLE-01..04 (4 requirements obligatoires)
- `.planning/ROADMAP.md` — Phase 13 section avec 6 success criteria

### Research foundation
- `.planning/phases/13-veille-qualiopi-integree/13-RESEARCH.md` — Source de vérité technique (764 lignes, patterns identifiés, prompts figés, mapping xlsx, schéma Prisma, sources RSS)

### Code patterns à cloner
- `apps/web/src/lib/closure/queue.ts` + `apps/web/src/lib/closure/worker.ts` — BullMQ cron pattern (Phase 11 invoice-reminder + Phase 4 closure)
- `apps/web/src/lib/closure/ollama-generators.ts` + `apps/web/src/lib/closure/qualiopi-prompts.ts` — Ollama integration pattern (mistral-small:24b)
- `apps/web/src/lib/pdf-render.ts` + `apps/web/src/lib/of-paged-footer.ts` — WeasyPrint/Gotenberg PDF pattern, footer body fix
- `packages/db/scripts/import-smartof.ts` — xlsx import idempotent pattern (`fs.readFileSync` + `XLSX.read(buf, {type:'buffer'})`)
- `apps/web/src/lib/rbac.ts` — `requireRole` pattern (ADMIN+MANAGER+LECTEUR)
- `apps/web/src/server/actions/audit.ts` (ou équivalent) — AuditLog instanciation convention (`parameters.*`, `documents.*`, `invoices.*`)
- `apps/web/src/components/nav-config.ts` — sidebar route filtering par rôle (Phase 2)
- `apps/web/src/app/app/parametres/page.tsx` ou `apps/web/src/app/app/historique/page.tsx` — Server Component layout pattern
- `apps/web/src/app/app/product/[id]/` — Phase 9.1 product-tabs URL state pattern (4 onglets thématiques)

### Worker safety
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_worker_no_react_imports.md` — workers NE DOIVENT PAS importer server actions auth (React `cache` crash). Pattern : `lib/veille/core.ts` + `actions/veille.ts` wrapper.

### Prisma migration
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_prisma_migrate_deploy.md` — toute migration Prisma exige `prisma migrate deploy` post-`generate` sinon "column X does not exist" runtime
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_prisma_db_push_sandbox.md` — en sandbox utiliser `prisma db push --skip-generate` + `prisma generate` séparé

### Data source
- `/Users/laurentmarx/Documents/CRM Next gen/C6.i23-24-25tableau veille.xlsx` (5 feuilles, ~95 lignes, 2 layouts différents)
- Backup : `/Users/laurentmarx/Documents/CRM Next gen/C6.i23-24-25tableau veille.backup-2026-05-23.xlsx`

### Workflow conventions
- `./CLAUDE.md` — Tech stack, routes FR kebab-case, multi-tenant, GSD workflow

</canonical_refs>

<specifics>
## Specific Ideas

- Schéma Prisma `RegulatoryWatch` proposé en RESEARCH §3.1 (à recopier verbatim sauf si planner détecte conflit)
- 3 indexes : `[tenantId, theme, status]`, `[tenantId, status, suggestedBy]` (inbox), `[tenantId, theme, dateLastReviewed]` (KPI)
- 12 sources RSS proposées en RESEARCH §4.1 (planner peut affiner après probe HEAD)
- Prompt Ollama complet en RESEARCH §6.1 + Zod schema §6.3 + 5 guard-rails §6.4
- Mapping xlsx → Prisma champ par champ en RESEARCH §5.3
- Parser date multi-format (DD/MM/YYYY, DD-Mmm-YY, Mmm-YY) en RESEARCH §5.4
- Pattern PDF audit HTML en RESEARCH §7.1 (header tenant + table sources/dates/exploitations + footer paged)
- Layout page IA décrit en RESEARCH §8 (tabs URL-state, table, inline edit, inbox)
- 18 tests Wave 0 listés en RESEARCH §10 (tous mappés sur VEILLE-01..04)

</specifics>

<deferred>
## Deferred Ideas

- Auto-accept des suggestions à confidence élevée (D-08 : NO en V1, traçabilité humaine = valeur audit)
- Rich-text editor pour exploitation (D-07 : textarea simple en V1)
- Enums `frequency` / `typeSource` (D-09 : string libre en V1, observer pour migration future)
- FK `responsable` → User (D-10 : string libre, certains noms hors RBAC)
- Mode multi-tenant cross-tenant pour veille mutualisée (hors scope projet QualiOF mono-tenant Start Academy)
- Notifications email/Discord sur nouvelle suggestion auto (V2 — l'inbox suffit en V1)
- Dashboard KPI veille agrégé (compteur entries actives, derniers exports) — peut être ajouté en bookkeeping ou phase ultérieure

</deferred>

---

*Phase: 13-veille-qualiopi-integree*
*Context gathered: 2026-05-25 via inline scope-decision questions (4 critical) + RESEARCH.md §9 recommandations*
