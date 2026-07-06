---
phase: quick-260618-eyc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/format-location.ts
  - apps/web/src/lib/__tests__/format-location.test.ts
  - apps/web/src/lib/closure/satisfaction-froid-eligibility.ts
  - apps/web/src/lib/closure/__tests__/satisfaction-froid-eligibility.test.ts
  - apps/web/src/lib/convention-template.ts
  - apps/web/src/lib/__tests__/convention-conventiondate.test.ts
  - apps/web/src/server/actions/convention-generator.ts
  - apps/web/scripts/_gen-temoin-cloud.ts
  - apps/web/src/lib/closure/grille-observation-template.ts
autonomous: true
requirements: [COR-1, COR-2, COR-3, COR-4, COR-5, COR-6]

must_haves:
  truths:
    - "La convention est datée J-15 jours ouvrés avant le début de session (jamais le jour de génération), cohérent avec rétractation 14j (Art.6) et solde la veille (Art.7)"
    - "La satisfaction à froid n'est PAS générée pour une session terminée depuis moins de 90 jours (SES-0087 fin 11/05/2026 → froid sauté aujourd'hui)"
    - "Le lieu affiché ne duplique jamais la ville (SES-0087 : plus de « Vitrolles — Nestenn — Vitrolles »)"
    - "Le lieu est capitalisé proprement (« place de provence » → « Place de Provence ») sans casser « CP ville »"
    - "Aucune puce orpheline « • » dans le programme rendu de la convention"
    - "Le titre interne de la grille est « Grille d'observation » (cohérent avec le nom de fichier), plus « Grille d'amélioration stagiaire »"
  artifacts:
    - path: "apps/web/src/lib/format-location.ts"
      provides: "Helper formatLocation partagé : forme unique propre, anti-duplication ville, titlecase léger"
      exports: ["formatLocation"]
    - path: "apps/web/src/lib/closure/satisfaction-froid-eligibility.ts"
      provides: "Helper isFroidEligible (≥90 jours calendaires entre sessionEndDate et now)"
      exports: ["isFroidEligible"]
    - path: "apps/web/src/lib/convention-template.ts"
      provides: "ConventionData.conventionDate utilisée pour le « Fait à ... le »"
      contains: "conventionDate"
    - path: "apps/web/src/lib/closure/grille-observation-template.ts"
      provides: "Titre interne harmonisé sur « Grille d'observation »"
      contains: "GRILLE D'OBSERVATION"
  key_links:
    - from: "apps/web/src/server/actions/convention-generator.ts"
      to: "ConventionData.conventionDate"
      via: "subtractBusinessDaysISO(sessionStartDate ISO, 15)"
      pattern: "subtractBusinessDaysISO"
    - from: "apps/web/scripts/_gen-temoin-cloud.ts"
      to: "ConventionData.conventionDate"
      via: "subtractBusinessDaysISO(sessionStartDate ISO, 15)"
      pattern: "subtractBusinessDaysISO"
    - from: "apps/web/scripts/_gen-temoin-cloud.ts"
      to: "isFroidEligible"
      via: "filtre SATISFACTION_FROID hors de PART_KINDS quand non éligible"
      pattern: "isFroidEligible"
    - from: "apps/web/scripts/_gen-temoin-cloud.ts"
      to: "formatLocation"
      via: "lieu = formatLocation(session.location)"
      pattern: "formatLocation"
    - from: "apps/web/src/lib/convention-template.ts"
      to: "marked.parse(programme normalisé nettoyé)"
      via: "cleanProgrammeBullets avant marked.parse (modèle normalizeMd)"
      pattern: "marked.parse"
---

<objective>
Corriger SIX défauts systémiques détectés sur le témoin SES-0087, AVANT la génération de masse des documents. Toutes ces corrections sont systémiques (elles affecteront chaque session générée), d'où la priorité.

Deux corrections GRAVES (conformité Qualiopi) :
- COR-1 : la convention est datée du jour de génération (`new Date()`), donc POSTÉRIEURE à la session — ce qui casse l'antériorité de l'indicateur 9, le délai de rétractation 14j (Art.6) et le « solde la veille » (Art.7). On dérive la date de convention à J-15 jours ouvrés avant le début de session (règle Laurent « signée ≥15j avant »).
- COR-2 : la satisfaction à froid (ind.31) doit être recueillie 3-6 mois après la formation. Le témoin la génère immédiatement. On ajoute une garde déterministe ≥90 jours.

Quatre corrections cosmétiques/medium : lieu propre sans duplication (COR-3), puces orphelines dans le programme de la convention (COR-4), nom de grille cohérent (COR-5), capitalisation du lieu (COR-6, géré au rendu dans formatLocation).

Purpose: garantir que le pack généré en masse soit conforme Qualiopi (date convention) et propre (lieu, puces, libellés) dès le premier lot.
Output: 2 helpers partagés testés (formatLocation, isFroidEligible), ConventionData.conventionDate câblé chez les 2 fournisseurs, nettoyage puces convention, titre grille harmonisé.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
<!-- Contrats déjà en place dans le codebase — l'exécuteur les utilise directement, pas d'exploration. -->

From apps/web/src/lib/business-days.ts :
```typescript
// Retire n jours ouvrés (sam/dim/fériés FR exclus). n<=0 → même date. Entrée/sortie ISO 'YYYY-MM-DD'.
export function subtractBusinessDaysISO(startIso: string, n: number): string;
export function isBusinessDayISO(iso: string): boolean;
```

From apps/web/src/lib/convention-template.ts (état actuel) :
```typescript
export interface ConventionData {
  beneficiaireRaisonSociale: string;
  // ... (champs existants)
  sessionStartDate: Date;
  sessionEndDate: Date;
  sessionLieu: string;
  // ... produit + tenantId?: string
}
// Ligne ~61 : const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', {...});
// Ligne ~183-184 (Article 3 programme) :
//   const programmeHtml = data.produitProgrammeMd
//     ? (marked.parse(data.produitProgrammeMd, { async: false }) as string)
//     : '<p>...</p>';
// Ligne ~305 (clôture) :
//   <p class="closing">Fait en double exemplaire, à <strong>${escapeHtml(of.addressVille)}</strong> le <strong>${fmtDate(new Date())}</strong>.</p>
```

From apps/web/src/lib/programme-template.ts (MODÈLE pour COR-4, déjà dans le repo) :
```typescript
// La normalisation markdown du programme retire déjà les puces orphelines :
const normalizeMd = (md: string): string =>
  md
    .replace(/(^|\n)(#{1,6})([^\s#])/g, '$1$2 $3')
    .replace(/^\s*\*+\s*$/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\n)[*-]\s*$/g, '$1');
// + cleanObjectifs retire les puces de tête : .replace(/^\s*[●•·‣*-]\s*/, '')
```

From apps/web/scripts/_gen-temoin-cloud.ts (état actuel) :
```typescript
// Ligne ~44-47 : liste des kinds par participant
const PART_KINDS = ['ANALYSE_BESOIN','POSITIONNEMENT','QCM','GRILLE_OBS',
  'ATTESTATION','CERTIFICAT','EMARGEMENT','SATISFACTION_CHAUD','SATISFACTION_FROID'] as const;
// Ligne ~75-77 : construction lieu (BUGUÉE — duplique la ville)
const lieu = session.location
  ? `${session.location.name}${(session.location.address as any)?.city ? ` — ${(session.location.address as any).city}` : ''}`
  : null;
// La boucle participant construit convData (ligne ~179) puis itère PART_KINDS (ligne ~198).
// session.startDate / session.endDate sont des Date Prisma.
```

From apps/web/src/lib/closure/grille-observation-template.ts :
```typescript
// Ligne ~86 (titre interne, à harmoniser) :
//   <h1 class="doc-title">GRILLE D'AMÉLIORATION STAGIAIRE</h1>
// Ligne ~128 (titre du wrapper, déjà « observation ») :
//   return wrapHtml({ title: `Grille d'observation — ${stagiaireFull}`, bodyHtml: body });
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helpers partagés testés — formatLocation (COR-3+COR-6) et isFroidEligible (COR-2)</name>
  <files>
    apps/web/src/lib/format-location.ts,
    apps/web/src/lib/__tests__/format-location.test.ts,
    apps/web/src/lib/closure/satisfaction-froid-eligibility.ts,
    apps/web/src/lib/closure/__tests__/satisfaction-froid-eligibility.test.ts
  </files>
  <behavior>
    formatLocation(location) — déterministe, anti-duplication + titlecase léger :
    - Test 1 (anti-duplication SES-0087) : name="Vitrolles — Nestenn", address={street:"Nestenn, place de provence", city:"Vitrolles", postalCode:"13127"} → forme propre qui contient "Vitrolles" UNE seule fois, ex "Nestenn, place de provence, 13127 Vitrolles" (titlecase appliqué) ; NE contient PAS "Vitrolles — Nestenn — Vitrolles".
    - Test 2 (titlecase COR-6) : "place de provence" → "Place De Provence" OU "Place de Provence" (titlecase léger), MAIS le code postal "13127" reste intact et "Vitrolles" reste capitalisé — pas de double-cap de "CP ville".
    - Test 3 (name déjà sans ville) : name="Agence Centre", address={street:"12 rue X", city:"Nice", postalCode:"06000"} → "Agence Centre — 12 Rue X, 06000 Nice" (name conservé car ne contient pas la ville).
    - Test 4 (address vide) : location avec name seul, address null → retourne le name nettoyé (titlecase léger), pas de " — undefined".
    - Test 5 (location null) : formatLocation(null) → null.

    isFroidEligible(sessionEndDate: Date, now: Date): boolean — ≥90 jours calendaires :
    - Test 6 (limite stricte) : endDate=2026-01-01, now=2026-03-31 (89 jours) → false ; now=2026-04-01 (90 jours) → true ; now=2026-04-02 (91 jours) → true.
    - Test 7 (SES-0087) : endDate=2026-05-11, now=2026-06-18 (~38 jours) → false (froid sauté aujourd'hui).
  </behavior>
  <action>
    Créer `apps/web/src/lib/format-location.ts` exportant `formatLocation(location)`.
    Signature souple : accepte `{ name?: string | null; address?: Record<string, unknown> | string | null } | null` (le `address` Prisma est un Json — typer en `Record<string, unknown> | string | null`).
    Logique (déterministe, AUCUN smart calc métier — cf. feedback Laurent) :
    1. address structurée → `{street}, {postalCode} {city}` (parts filtrées sur truthy, jointes proprement). Forme préférée.
    2. name : ne le préfixer (`name — adresse`) QUE si `name` ne contient PAS déjà la ville (comparaison insensible casse+accents : normaliser via toLowerCase().normalize('NFD') retrait diacritiques, vérifier `name.includes(city)`). Si name contient la ville → ne PAS re-concaténer name (anti-duplication SES-0087).
    3. titlecase léger COR-6 : appliquer un titlecase mot-à-mot sur la partie `street` (« place de provence » → capitalise chaque mot) MAIS laisser le code postal numérique et la ville (déjà capitalisée en base) intacts. Implémenter une petite fonction `titlecase(s)` qui capitalise l'initiale de chaque mot alphabétique (regex `\b\p{L}` ou split espace), sans toucher aux tokens purement numériques.
    4. address en string → titlecase léger + retour.
    5. location null / pas de name ni address → null.
    NE PAS dupliquer la ville ; viser réutilisable par convention/programme/checklist (helper pur, pas d'IO).

    Créer `apps/web/src/lib/closure/satisfaction-froid-eligibility.ts` exportant `isFroidEligible(sessionEndDate: Date, now: Date): boolean` : `true` ssi (now - sessionEndDate) ≥ 90 jours calendaires. Calcul déterministe en jours entiers : `Math.floor((now.getTime() - sessionEndDate.getTime()) / 86400000) >= 90`. Commentaire en tête : ind.31 satisfaction à froid 3-6 mois.

    Écrire les deux fichiers de tests Vitest (RED d'abord) couvrant les 7 cas ci-dessus. Tests déterministes (dates en dur, pas de Date.now()).
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test src/lib/__tests__/format-location.test.ts src/lib/closure/__tests__/satisfaction-froid-eligibility.test.ts</automated>
  </verify>
  <done>Les 2 helpers existent et exportent formatLocation / isFroidEligible ; les 7 cas passent (anti-duplication SES-0087, titlecase, limite 90j stricte, SES-0087 froid=false).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: conventionDate dans ConventionData (COR-1) + nettoyage puces programme convention (COR-4) + titre grille (COR-5)</name>
  <files>
    apps/web/src/lib/convention-template.ts,
    apps/web/src/lib/__tests__/convention-conventiondate.test.ts,
    apps/web/src/lib/closure/grille-observation-template.ts
  </files>
  <behavior>
    COR-1 (test déterministe du calcul, côté business-days — la fonction de calcul est subtractBusinessDaysISO déjà testée ; ici on teste l'intégration du champ) :
    - Test 1 : pour sessionStartDate 2026-05-11 (lundi), subtractBusinessDaysISO('2026-05-11', 15) === '2026-04-16' (valeur attendue vérifiée). Ce test ancre la règle J-15 ouvrés utilisée par les 2 fournisseurs.
    - Test 2 (rendu convention) : renderConventionHtml avec conventionDate = new Date('2026-04-16T00:00:00Z') produit un HTML contenant "16/04/2026" dans la clôture « Fait à ... le », et NE contient PAS la date du jour (pas de new Date() au rendu).
    COR-4 (puces) :
    - Test 3 : un produitProgrammeMd contenant une ligne puce orpheline (ex "•" seul, ou "* " seul en fin de ligne, ou "● " de tête) → le HTML rendu ne contient AUCUNE puce vide « • » orpheline (réutiliser le pattern normalizeMd du programme-template).
  </behavior>
  <action>
    COR-1 — `apps/web/src/lib/convention-template.ts` :
    1. Ajouter `conventionDate: Date;` à l'interface `ConventionData` (après sessionEndDate, commentaire : « date de signature = J-15 jours ouvrés avant début session, calculée côté fournisseur — NE PAS hardcoder »).
    2. Remplacer ligne ~305 `${fmtDate(new Date())}` par `${fmtDate(data.conventionDate)}`. NE PLUS appeler `new Date()` dans le rendu.

    COR-4 — dans le même fichier, AVANT `marked.parse` (ligne ~183) : introduire une fonction locale `cleanProgrammeBullets(md: string): string` calquée sur `normalizeMd` de programme-template.ts (retirer puces orphelines : `.replace(/^\s*[●•·‣]+\s*$/gm, '')` pour lignes ne contenant qu'une puce, `.replace(/(^|\n)[*-]\s*$/g, '$1')` pour tirets/astérisques de fin de ligne vides, `.replace(/(^|\n)(#{1,6})([^\s#])/g, '$1$2 $3')` pour titres collés). Appliquer `cleanProgrammeBullets(data.produitProgrammeMd)` avant `marked.parse`. But : zéro puce orpheline « • » dans le rendu. NE PAS changer les styles CSS.

    COR-5 — `apps/web/src/lib/closure/grille-observation-template.ts` ligne ~86 : remplacer `<h1 class="doc-title">GRILLE D'AMÉLIORATION STAGIAIRE</h1>` par `<h1 class="doc-title">GRILLE D'OBSERVATION</h1>` (harmonise avec le nom de fichier KIND_FR « Grille d'observation » et le title du wrapper ligne ~128). NE PAS toucher le sous-titre « Suivi pédagogique individualisé » ni les sections « OBSERVATIONS ET AXES DE PROGRESSION » / « Axe d'amélioration » (ce sont des champs métier légitimes, pas le titre).

    Écrire `apps/web/src/lib/__tests__/convention-conventiondate.test.ts` couvrant les 3 cas (calcul J-15, rendu date convention, absence de puce orpheline). Importer un OfConfig minimal mocké pour renderConventionHtml (s'inspirer d'un test existant qui appelle un renderer si besoin ; sinon construire un objet `of` minimal avec les champs lus par le template : name, addressFull, siret, rnq, addressVille, resp{prenom,nom,titre}). Test 1 importe subtractBusinessDaysISO depuis business-days.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test src/lib/__tests__/convention-conventiondate.test.ts</automated>
  </verify>
  <done>ConventionData a un champ conventionDate utilisé pour « Fait à ... le » (plus de new Date() au rendu) ; le programme rendu n'a plus de puce orpheline ; le titre interne de la grille est « GRILLE D'OBSERVATION ». Les 3 tests passent.</done>
</task>

<task type="auto">
  <name>Task 3: Câbler les fournisseurs — convention-generator (server action) + _gen-temoin-cloud (lieu, conventionDate, gate froid)</name>
  <files>
    apps/web/src/server/actions/convention-generator.ts,
    apps/web/scripts/_gen-temoin-cloud.ts
  </files>
  <action>
    `apps/web/src/server/actions/convention-generator.ts` (COR-1) :
    1. Importer `subtractBusinessDaysISO` depuis `@/lib/business-days`.
    2. Avant la construction de `data: ConventionData`, calculer :
       `const startIso = participant.session.startDate.toISOString().slice(0, 10);`
       `const conventionIso = subtractBusinessDaysISO(startIso, 15);` (J-15 jours OUVRÉS — règle Laurent « signée ≥15j avant »).
       `const conventionDate = new Date(conventionIso + 'T00:00:00Z');`
    3. Ajouter `conventionDate,` dans l'objet `data`.
    Cohérence à vérifier (commentaire) : signée J-15 ouvrés → rétractation 14j (Art.6) finit ~J-1 → solde « la veille » (Art.7) cohérent. NE PAS hardcoder de date.
    NB : ce fichier construit déjà `lieu` proprement (gère street/postalCode/city + legalName) — NE PAS y toucher pour COR-3 (hors scope, c'est le script témoin qui était bugué). Le seul changement ici = conventionDate.

    `apps/web/scripts/_gen-temoin-cloud.ts` :
    1. (COR-3) Importer `formatLocation` depuis `../src/lib/format-location` et remplacer la construction `lieu` (ligne ~75-77) par `const lieu = formatLocation(session.location as any);`. Conserver le fallback `lieu ?? of.addressFull` là où il est déjà utilisé (convData.sessionLieu ligne ~185).
    2. (COR-1) Ajouter le calcul conventionDate AVANT la boucle participant (déterministe par session) :
       `const conventionIso = subtractBusinessDaysISO(session.startDate.toISOString().slice(0,10), 15);`
       `const conventionDate = new Date(conventionIso + 'T00:00:00Z');`
       (importer subtractBusinessDaysISO depuis `../src/lib/business-days`). Ajouter `conventionDate,` dans `convData` (ligne ~179-190). Logguer une fois `log('✓', \`Convention datée ${conventionIso} (J-15 ouvrés avant ${session.startDate.toISOString().slice(0,10)})\`)`.
    3. (COR-2) Importer `isFroidEligible` depuis `../src/lib/closure/satisfaction-froid-eligibility`. Calculer une fois `const froidEligible = isFroidEligible(session.endDate, new Date());`. Construire la liste de kinds effective par participant : si `!froidEligible`, filtrer `SATISFACTION_FROID` hors de `PART_KINDS` (ex `const kinds = froidEligible ? PART_KINDS : PART_KINDS.filter(k => k !== 'SATISFACTION_FROID');`) et itérer `kinds` au lieu de `PART_KINDS` dans la boucle (ligne ~198). Logguer une fois (avant la boucle participant) `if (!froidEligible) log('⚠', \`froid sauté : session terminée depuis < 90j (fin ${session.endDate.toISOString().slice(0,10)})\`);`. Quand non éligible, mettre à jour le compteur de fin si besoin (PART_KINDS.length sert au calcul `ko += PART_KINDS.length` ligne ~197 en cas de contexte null → utiliser `kinds.length`).
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -v -E "redirect-308.test.ts|sessions.ts:804" || echo "tsc OK (hors erreurs préexistantes connues)"</automated>
  </verify>
  <done>convention-generator passe conventionDate=J-15 ouvrés ; _gen-temoin-cloud utilise formatLocation pour le lieu, passe conventionDate, et saute SATISFACTION_FROID quand session terminée < 90j. tsc vert (hors 2 erreurs préexistantes WIP Laurent autorisées à être ignorées).</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test src/lib/__tests__/format-location.test.ts src/lib/closure/__tests__/satisfaction-froid-eligibility.test.ts src/lib/__tests__/convention-conventiondate.test.ts` → tout vert.
- `pnpm --filter @qualiof/web exec tsc --noEmit` → vert hors erreurs préexistantes connues (redirect-308.test.ts ×6 + sessions.ts:804 legalName, WIP Laurent — IGNORER).
- Test de puissance déterministe (au gate) : casser une assertion clé (ex remplacer `subtractBusinessDaysISO(start,15)` par `15`→`0` dans le test conventionDate, OU passer 89/90/91 jours dans le test froid, OU mettre name sans ville dans le test anti-duplication) → le test DOIT virer rouge → restaurer. Prouve que les tests gardent quelque chose de réel.
- Régénérer le témoin pour contrôle visuel : `SES=SES-0087 pnpm --filter @qualiof/web exec tsx scripts/_gen-temoin-cloud.ts` puis ouvrir `/tmp/qualiof-gen/...` — vérifier : (a) convention datée 16/04/2026, (b) pas de « Satisfaction à froid.pdf » généré, (c) lieu « Nestenn, place de provence, 13127 Vitrolles » sans duplication + capitalisé, (d) pas de puce orpheline pages 2-4 convention, (e) titre grille « GRILLE D'OBSERVATION ».
</verification>

<success_criteria>
- COR-1 : ConventionData.conventionDate existe et alimente « Fait à ... le » (J-15 ouvrés, plus de new Date() au rendu), câblé chez les 2 fournisseurs. SES-0087 → 16/04/2026.
- COR-2 : isFroidEligible appliqué dans le témoin ; froid sauté pour session < 90j.
- COR-3 : formatLocation supprime la duplication de ville (SES-0087 propre).
- COR-4 : zéro puce orpheline dans le programme rendu de la convention.
- COR-5 : titre grille « Grille d'observation » partout.
- COR-6 : capitalisation du lieu au rendu (formatLocation), CP+ville intacts.
- Commits atomiques sur cloud-migration (1 par tâche), tsc vert hors erreurs préexistantes.
</success_criteria>

<output>
After completion, create `.planning/quick/260618-eyc-corrections-audit-t-moin-date-convention/260618-eyc-SUMMARY.md`
</output>
