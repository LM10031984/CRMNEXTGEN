# Phase 12: Modules stub Inscriptions et Modèles — Context

**Gathered:** 2026-05-25
**Status:** Ready for planning
**Source:** /gsd:discuss-phase 12 — 2 décisions de scope tranchées par utilisateur (Laurent)

<domain>
## Phase Boundary

Trancher le périmètre des 2 modules placeholder restants dans la sidebar QualiOF et livrer la décision. Success criterion roadmap : **zéro placeholder dans la sidebar** après cette phase.

Inclus :
- **MOD-01** — Renommer `/app/preinscriptions` → `/app/inscriptions` (route + sidebar label + redirect 308)
- **MOD-02** — Page `/app/templates` = liste read-only des 10 templates Qualiopi + AGEFICE + 4 emails MJML (avec aperçu rendu, source path, pas d'édition UI)

Hors scope :
- Éditeur templates BDD-first (refactor lourd reporté, non justifié vs templates code-driven actuels)
- Nouvelles fonctionnalités d'inscription (le formulaire public `/preinscription/[token]` reste tel quel)
- Vue agrégée funnel commercial par produit (idée intéressante mais hors scope phase 12)

</domain>

<decisions>
## Implementation Decisions

### MOD-01 — Renommer pré-inscriptions en inscriptions

- **D-01 — Renommage `/app/preinscriptions` → `/app/inscriptions`** : La page admin actuelle `/app/preinscriptions` devient `/app/inscriptions`. L'entrée sidebar "Pré-inscriptions" devient "Inscriptions" (icône Inbox conservée). Le stub actuel `apps/web/src/app/app/inscriptions/page.tsx` (Placeholder 20 LOC) est remplacé par le contenu actuel de `/app/preinscriptions/page.tsx`.

- **D-02 — Redirect 308 reverse** : `/app/preinscriptions` (et variantes `/app/preinscriptions/:path*`) → `/app/inscriptions` (308). Convention CLAUDE.md route : toujours ajouter redirect 308 pour les variantes naturelles, cf. audit 2026-05-12 BUG-03.

- **D-03 — Formulaire public PRÉSERVÉ** : `/preinscription/[token]` (route publique tokenisée, hors `/app/`) reste **inchangé**. Le rename ne concerne QUE la page admin. Le formulaire public garde son URL pour ne pas casser les liens partagés aux apprenants.

- **D-04 — Préserver l'entrée sidebar avec ses contraintes RBAC** : La nouvelle entrée "Inscriptions" garde `allowedRoles: ['ADMIN', 'MANAGER', 'COMMERCIAL']` (héritée de l'ancien "Pré-inscriptions"). L'ancienne entrée "Inscriptions" générique (sans filtre RBAC) du stub est supprimée.

- **D-05 — 36 références code à migrer** : Grep `preinscriptions` retourne 36 matches dans `apps/web/src/`. Toutes les URLs hardcodées (`href="/app/preinscriptions"`, `redirect('/app/preinscriptions')`, etc.) doivent être mises à jour vers `/app/inscriptions`. Server actions et lib helpers nommés `preinscription*` peuvent garder leur nom interne (seules les URLs publiques changent).

### MOD-02 — Liste read-only des templates

- **D-06 — Page `/app/templates` = liste read-only des templates existants** : Pas d'éditeur, pas de versioning, pas de BDD. Catalogue informatif.

- **D-07 — Catégories à lister** :
  1. **10 templates Qualiopi** (Plans 2.2 + Phase 9.1) : convention, programme, convocation, émargement, attestation, certificat, déroulé, QCM, grille observation, analyse besoin, satisfaction-chaud, satisfaction-froid, positionnement, checklist-formation (code-driven dans `lib/closure/*-template.ts`)
  2. **AGEFICE form fill** (Phase 4) : 92 champs PDF mappés via `lib/agefice-form-fill.ts` + `lib/agefice-template.ts` + attestation assiduité HTML (BUG-15)
  3. **4 templates email MJML** (Palier 4 preinscription reminders) : convocation, relance, fin de formation, notification

- **D-08 — Pour chaque template, afficher** :
  - Nom
  - Catégorie (Qualiopi / AGEFICE / Email)
  - Source code path (cliquable vers GitHub si lien dispo, sinon affichage texte)
  - Variables disponibles (extraites des `${var}` ou `{{var}}` dans le template)
  - Bouton "Aperçu" qui génère un PDF/HTML de démo avec des données fictives (si réalisable simplement, sinon skip en V1)

- **D-09 — RBAC `/app/templates`** : Visible pour ADMIN, MANAGER, LECTEUR (lecture/audit). FORMATEUR/COMMERCIAL/COMPTABLE exclus (pas utile pour leur métier).

- **D-10 — Pas de nouvelles tables BDD** : Tout est statique, dérivé du code existant. Une lib `lib/templates-catalog.ts` peut centraliser le mapping (label, path, vars, category) pour 1 source de vérité.

- **D-11 — Aperçu optionnel** : Si le rendering d'aperçu est trop lourd à brancher (Gotenberg pour chaque template), le V1 peut se limiter à montrer une capture d'écran statique ou juste lister sans preview. Décision finale au planner.

### Claude's Discretion

- Choix exact des icônes lucide-react par catégorie de template
- Layout exact de la page templates (tableau, cartes, liste — au planner de proposer)
- Format exact du source path affiché (relatif vs absolu)
- Mode de rendu de l'aperçu si retenu (PDF embedded vs HTML preview vs screenshot)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements
- `.planning/REQUIREMENTS.md` — MOD-01, MOD-02 (2 requirements)
- `.planning/ROADMAP.md` — Phase 12 section avec 3 success criteria

### Routes & redirects convention
- `./CLAUDE.md` (section "Routes (convention naming)") — FR kebab-case, redirect 308 obligatoire pour variantes naturelles, audit 2026-05-12 BUG-03
- `apps/web/next.config.mjs` — fichier où ajouter les redirects 308

### Code patterns à scanner et migrer
- `apps/web/src/app/app/preinscriptions/page.tsx` + `[id]/page.tsx` — code à déplacer vers `/app/inscriptions/`
- `apps/web/src/app/app/inscriptions/page.tsx` — stub à remplacer
- `apps/web/src/components/layout/nav-config.ts` — entrée sidebar à modifier (renommer + supprimer doublon)
- 36 références grep `preinscriptions` dans `apps/web/src/` (hrefs, redirects, imports relatifs)

### Templates inventory (MOD-02)
- `apps/web/src/lib/closure/*-template.ts` — 10+ templates Qualiopi code-driven
- `apps/web/src/lib/closure/qualiopi-prompts.ts` — 5 prompts Ollama (QCM, AnalyseBesoin, Grille, Compétences, Déroulé)
- `apps/web/src/lib/agefice-template.ts` + `apps/web/src/lib/agefice-form-fill.ts` — AGEFICE 92 champs PDF
- `apps/web/src/lib/preinscription-reminder-template.ts` — email reminders
- `apps/web/src/lib/mailer.ts` + tout fichier MJML — emails

### Préservations strictes
- `apps/web/src/app/preinscription/[token]/` — formulaire public, **NE PAS toucher** (URL externe partagée aux apprenants)
- Server actions `lib/preinscription-*.ts` — peuvent garder leur nom interne, seules les URLs publiques changent (D-05)

### Workflow conventions
- `.planning/STATE.md` — convention "renommage de route" à documenter si 1ère application
- `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/feedback_qualiof_port_3010.md` — dev tourne sur localhost:3010, pas 3000

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<Placeholder>` component (`apps/web/src/components/ui/placeholder.tsx`) — utilisé actuellement par les 2 stubs, ne sera plus consommé par /app/inscriptions ni /app/templates après cette phase, possible orphelin à vérifier
- Pattern Server Component listing tableau de Phase 8 historique ou Phase 9.1 product-tabs — réutilisable pour la page templates
- Sidebar nav-config + `allowedRoles` filtering — pattern Phase 2 + Phase 8 RBAC

### Established Patterns
- Route renaming : pas encore fait dans ce projet, c'est une 1ère. CLAUDE.md mentionne le redirect 308 mais pas le pattern complet. Documenter dans STATE.md la convention "move + redirect + grep update".
- Templates catalogue : pas encore centralisé. Cette phase peut créer `lib/templates-catalog.ts` qui devient la source unique pour `/app/templates` + futurs usages (export liste, audit Qualiopi blanc Phase 10).

### Integration Points
- `apps/web/next.config.mjs` redirects array
- `apps/web/src/components/layout/nav-config.ts` sidebar items
- 36 hrefs/redirects/imports dans `apps/web/src/`
- Lecture des templates code pour catalogue (read-only, pas d'exec)

</code_context>

<specifics>
## Specific Ideas

- D-05 grep workflow : `grep -rn "preinscriptions" apps/web/src/` doit être exécuté en pre-task pour lister exhaustivement les références à migrer. Test : `pnpm --filter @qualiof/web build` doit passer après le rename.
- D-08 : afficher Variables dispo = bonus utile pour l'auditeur Qualiopi qui veut comprendre ce que QualiOF génère exactement. Phase 10 (Audit Qualiopi blanc) pourra réutiliser ce catalogue.
- D-11 : si aperçu retenu, réutiliser le pattern de rendu PDF Phase 4 (WeasyPrint ou Gotenberg via `lib/pdf-render.ts`). Sinon, capture d'écran statique stockée dans `apps/web/public/templates-previews/`.

</specifics>

<deferred>
## Deferred Ideas

- **Vue agrégée funnel par produit** (proposé en option MOD-01) : pourrait devenir une phase future "Vue commerciale pilotage" si Laurent veut un dashboard inscriptions/conversions/factures par produit. Pas urgent.
- **Éditeur templates BDD-first** (proposé en option MOD-02) : refactor lourd ~3-5 jours, peu de valeur immédiate vs templates code-driven actuels. À reconsidérer si Start Academy veut customiser les templates par tenant (mais le projet est mono-tenant). Pas avant v6.
- **Versioning des templates** : nécessite BDD, lié à l'éditeur. Same — pas avant v6.
- **Export catalog en CSV/PDF pour auditeur Qualiopi** : peut être ajouté en Phase 10 (Audit Qualiopi blanc) si pertinent.

</deferred>

---

*Phase: 12-modules-stub-inscriptions-et-modeles*
*Context gathered: 2026-05-25 via /gsd:discuss-phase 12*
