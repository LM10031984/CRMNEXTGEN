---
phase: 260525-agz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/actions/programme-generator.ts
  - apps/web/src/server/actions/convention-generator.ts
  - apps/web/src/components/produits/price-missing-banner.tsx
  - apps/web/src/app/app/produits/[id]/page.tsx
  - apps/web/src/app/app/produits/page.tsx
  - apps/web/scripts/diag-prog-price.ts
autonomous: false
requirements:
  - QUICK-260525-agz
must_haves:
  truths:
    - "Sur la fiche d'un produit avec priceHT=0, un banner rouge s'affiche en tête avec un bouton qui ouvre directement la modale d'édition du produit."
    - "Tenter de générer un programme PDF pour un produit avec priceHT=0 renvoie une erreur claire (toast) au lieu d'écrire un PDF cached à 0€."
    - "Tenter de générer une convention pour une inscription dont le produit a priceHT=0 renvoie une erreur claire au lieu de générer un PDF à 0€."
    - "Quand le priceHT du produit est mis à jour APRES une 1ère génération, le PDF programme est régénéré au prochain appel non-forcé (cache invalidé)."
    - "Dans la liste /app/produits, les cards des produits sans prix affichent un badge 'Prix manquant' visible."
    - "Le script jetable apps/web/scripts/diag-prog-price.ts n'existe plus dans le repo."
  artifacts:
    - path: "apps/web/src/components/produits/price-missing-banner.tsx"
      provides: "Banner client qui s'affiche si priceHT=0 et ouvre la modale d'édition"
      min_lines: 30
    - path: "apps/web/src/server/actions/programme-generator.ts"
      provides: "Guard priceHT>0 + cache invalidation par updatedAt"
      contains: "product.priceHT"
    - path: "apps/web/src/server/actions/convention-generator.ts"
      provides: "Guard priceHT>0 avant génération"
      contains: "priceHT"
    - path: "apps/web/src/app/app/produits/[id]/page.tsx"
      provides: "Banner inséré au-dessus du PageHeader si priceHT=0"
      contains: "PriceMissingBanner"
    - path: "apps/web/src/app/app/produits/page.tsx"
      provides: "Badge 'Prix manquant' sur les cards sans prix"
      contains: "Prix manquant"
  key_links:
    - from: "apps/web/src/app/app/produits/[id]/page.tsx"
      to: "apps/web/src/components/produits/price-missing-banner.tsx"
      via: "import + render conditionnel si Number(product.priceHT) === 0"
      pattern: "PriceMissingBanner"
    - from: "apps/web/src/server/actions/programme-generator.ts"
      to: "product.priceHT + Document.createdAt"
      via: "guard priceHT>0 + comparaison product.updatedAt > existing.createdAt"
      pattern: "priceHT.*<=.*0|updatedAt.*>.*createdAt"
    - from: "apps/web/src/server/actions/convention-generator.ts"
      to: "product.priceHT"
      via: "guard early-return si priceHT=0"
      pattern: "priceHT.*<=.*0"
---

<objective>
Fixer les deux bugs combinés autour du produit à priceHT=0 :
- 25 produits importés SmartOF ont priceHT=0 (API SmartOF n'expose pas le prix)
- Le cache PDF programme à 0€ reste retourné même après mise à jour du prix

Conformément à la décision Laurent : "il manque le prix → alerte + édition rapide".

Purpose : éviter de générer/livrer des conventions et programmes Qualiopi à 0€ HT, qui sont juridiquement invalides et bloquent les paiements OPCO/AGEFICE.

Output :
- Banner d'alerte rouge + CTA modal sur la fiche produit (utilise EditProductButton existant)
- Badge "Prix manquant" sur la liste produits
- Guards dans les 2 générateurs (programme + convention) qui bloquent si priceHT=0
- Invalidation cache programme : si product.updatedAt > document.createdAt, on régénère
- Suppression du script jetable de diagnostic
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/server/actions/programme-generator.ts
@apps/web/src/server/actions/convention-generator.ts
@apps/web/src/app/app/produits/[id]/page.tsx
@apps/web/src/app/app/produits/page.tsx
@apps/web/src/components/forms/edit-product-button.tsx

<interfaces>
<!-- Contrats existants que l'exécutant doit réutiliser tels quels -->

EditProductButton (apps/web/src/components/forms/edit-product-button.tsx) :
```typescript
export function EditProductButton({
  productId,
  current: {
    title: string;
    theme?: string | null;
    durationHours: number;
    priceHT: number;
    // ...autres champs optionnels
  },
}): JSX.Element
```
Note : ce composant englobe son propre bouton trigger "Éditer le produit" + le modal Radix Dialog. On NE doit PAS dupliquer la modale ; on doit faire en sorte que le clic sur le CTA du banner active le même flux.

Server action returns :
```typescript
// Convention pattern projet (Conventions.md)
return { ok: true, documentId, pdfUrl }
// ou
return { ok: false, error: 'message FR' }
```

Prisma TrainingProduct.priceHT : `Decimal @default(0)` → utiliser `Number(product.priceHT)` pour comparer.

Document model utile :
- entityType: 'product' | 'participant'
- entityId: string
- createdAt: DateTime
- type: 'PROGRAMME' | 'CONVENTION' | ...
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1 : Guard priceHT=0 + invalidation cache dans les 2 générateurs + suppression script jetable</name>
  <files>
    apps/web/src/server/actions/programme-generator.ts,
    apps/web/src/server/actions/convention-generator.ts,
    apps/web/scripts/diag-prog-price.ts
  </files>
  <behavior>
    - generateProgrammeForProduct(productId, opts) : si product.priceHT <= 0, return { ok: false, error: 'Prix HT manquant sur le produit. Renseignez-le sur la fiche produit avant de générer le programme.' } AVANT toute génération
    - generateProgrammeForProduct : dans la branche !opts.force, si un Document existant est trouvé MAIS product.updatedAt > existing.createdAt, on IGNORE le cache et on régénère (le cas critique : prix renseigné après 1ère génération à 0€)
    - generateProgrammeForParticipant : hérite implicitement du guard car délègue à generateProgrammeForProduct → pas de modification
    - generateConventionForParticipant : si participant.session.product.priceHT <= 0 OU Number(participant.priceHT) <= 0, return { ok: false, error: 'Prix HT manquant. Renseignez le prix sur la fiche produit (et/ou sur l'inscription) avant de générer la convention.' }
    - Test manuel : sur un produit à 0€, appeler generateProgrammeForProduct via UI doit échouer ; après update du prix, le rappel doit régénérer (pas reservir le PDF cached)
  </behavior>
  <action>
    1. Dans `apps/web/src/server/actions/programme-generator.ts` (fonction `generateProgrammeForProduct` ligne 172) :
       - APRÈS le `if (!product) return ...` (ligne 182), ajouter :
         ```ts
         if (Number(product.priceHT) <= 0) {
           return {
             ok: false,
             error: "Prix HT manquant sur le produit. Renseignez-le sur la fiche produit avant de générer le programme.",
           };
         }
         ```
       - Modifier le bloc `if (!opts.force)` (lignes 188-201) : sélectionner aussi `createdAt` dans la query Document et invalider le cache si `product.updatedAt > existing.createdAt`. Code cible :
         ```ts
         if (!opts.force) {
           const existing = await prisma.document.findFirst({
             where: {
               tenantId: user.tenantId,
               type: 'PROGRAMME',
               entityType: 'product',
               entityId: productId,
             },
             select: { id: true, pdfUrl: true, createdAt: true },
             orderBy: { createdAt: 'desc' },
           });
           // Invalidation cache : si le produit a été modifié APRÈS la dernière
           // génération (ex : priceHT renseigné après coup), on régénère.
           if (existing && product.updatedAt <= existing.createdAt) {
             return { ok: true, documentId: existing.id, pdfUrl: existing.pdfUrl };
           }
         }
         ```
         Note importante : si `existing` existe mais `product.updatedAt > existing.createdAt`, on tombe dans la suite du code (génération nouvelle). C'est exactement le fix du bug.

    2. Dans `apps/web/src/server/actions/convention-generator.ts` (fonction `generateConventionForParticipant`) :
       - APRÈS le check `if (!participant.session.product) return ...` (ligne 55), ajouter :
         ```ts
         if (Number(participant.session.product.priceHT) <= 0) {
           return {
             ok: false,
             error: "Prix HT manquant sur le produit de formation. Renseignez-le sur la fiche produit avant de générer la convention.",
           };
         }
         if (Number(participant.priceHT) <= 0) {
           return {
             ok: false,
             error: "Prix HT manquant sur cette inscription. Renseignez-le avant de générer la convention.",
           };
         }
         ```

    3. Supprimer le script jetable `apps/web/scripts/diag-prog-price.ts` (instruction : `git rm apps/web/scripts/diag-prog-price.ts` ; ou suppression simple si non versionné).

    Ne PAS ajouter de logs verbeux, ne PAS toucher au _legacy_generateProgrammeForParticipant (déjà désactivé). Respecter la convention `{ ok, error }` du projet (Conventions.md).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" &amp;&amp; pnpm -F @qualiof/web exec tsc --noEmit 2>&amp;1 | tail -30</automated>
  </verify>
  <done>
    - tsc --noEmit passe sans erreur sur apps/web
    - grep "priceHT.*<=.*0" sur programme-generator.ts retourne au moins 1 match
    - grep "priceHT.*<=.*0" sur convention-generator.ts retourne au moins 2 matches (product + participant)
    - grep "updatedAt" sur programme-generator.ts retourne au moins 1 match
    - Le fichier apps/web/scripts/diag-prog-price.ts n'existe plus
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2 : Banner "Prix manquant" fiche produit + badge liste produits</name>
  <files>
    apps/web/src/components/produits/price-missing-banner.tsx,
    apps/web/src/app/app/produits/[id]/page.tsx,
    apps/web/src/app/app/produits/page.tsx
  </files>
  <behavior>
    - Sur /app/produits/[id] : si Number(product.priceHT) === 0, un banner rouge (bg-red-50 + border-red-300 + text-red-800) s'affiche entre le Breadcrumb et le PageHeader, contenant : icône AlertTriangle, titre "Prix HT manquant", phrase "Ce produit n'a pas de prix renseigné. La génération de programmes et conventions Qualiopi est bloquée tant que le prix HT par stagiaire n'est pas défini." + bouton "Définir le prix" qui ouvre la même modale que EditProductButton.
    - Sur /app/produits : sur chaque card dont priceHT === 0, un badge rouge "Prix manquant" remplace l'absence d'affichage prix (actuellement aucune indication n'est faite, ce qui rend les 25 produits sans prix invisibles).
  </behavior>
  <action>
    1. Créer `apps/web/src/components/produits/price-missing-banner.tsx` (Client Component) :
       ```tsx
       'use client';

       import { AlertTriangle } from 'lucide-react';
       import { EditProductButton } from '@/components/forms/edit-product-button';

       /**
        * Banner d'alerte affiché sur la fiche produit quand priceHT === 0.
        * Le bouton "Définir le prix" réutilise EditProductButton (modal Radix
        * existante) → pas de duplication de logique d'édition.
        *
        * Cas d'usage : 25/30 produits importés SmartOF arrivent à priceHT=0
        * car l'API SmartOF n'expose pas le prix. Sans ce banner, l'opérateur
        * ne s'en rend compte qu'en voyant un PDF programme/convention à 0€.
        */
       export function PriceMissingBanner({
         productId,
         current,
       }: {
         productId: string;
         current: React.ComponentProps<typeof EditProductButton>['current'];
       }) {
         return (
           <div
             role="alert"
             className="rounded-2xl border border-red-300 bg-red-50 p-4 flex items-start gap-3"
           >
             <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
             <div className="flex-1 min-w-0">
               <p className="text-sm font-semibold text-red-900">Prix HT manquant</p>
               <p className="text-sm text-red-800 mt-1">
                 Ce produit n'a pas de prix renseigné. La génération de
                 programmes et conventions Qualiopi est bloquée tant que le
                 prix HT par stagiaire n'est pas défini.
               </p>
             </div>
             <div className="flex-shrink-0">
               <EditProductButton productId={productId} current={current} />
             </div>
           </div>
         );
       }
       ```
       Note : on passe la même prop `current` que l'EditProductButton du header. Le label par défaut du EditProductButton est "Éditer le produit" — c'est OK ici (le banner explique déjà le contexte). Si le besoin émerge plus tard d'un label custom "Définir le prix", on étendra `buttonLabel` plus tard ; ne pas sur-engineer.

    2. Modifier `apps/web/src/app/app/produits/[id]/page.tsx` :
       - Importer le composant : `import { PriceMissingBanner } from '@/components/produits/price-missing-banner';`
       - Insérer le banner entre le `<Breadcrumb ... />` (ligne 126-131) et le bloc `<div className="flex items-center justify-between gap-3">` (ligne 133), conditionné par `Number(product.priceHT) === 0`. Réutiliser exactement le même objet `current={{ ... }}` que le EditProductButton existant (lignes 163-177) pour rester cohérent. Note : extraire éventuellement le `current` dans une const locale au-dessus du return pour éviter la duplication littérale, mais ne pas réorganiser le reste du fichier.

    3. Modifier `apps/web/src/app/app/produits/page.tsx` :
       - Dans la card (lignes 95-107), remplacer la ligne actuelle :
         ```tsx
         {Number(p.priceHT) > 0 && (
           <span className="ml-auto font-medium text-foreground">
             {Number(p.priceHT).toFixed(0)} € HT
           </span>
         )}
         ```
         par :
         ```tsx
         {Number(p.priceHT) > 0 ? (
           <span className="ml-auto font-medium text-foreground">
             {Number(p.priceHT).toFixed(0)} € HT
           </span>
         ) : (
           <Badge variant="muted" className="ml-auto border border-red-300 bg-red-50 text-red-700">
             Prix manquant
           </Badge>
         )}
         ```
         (Si la variante `destructive` ou `warning` existe déjà dans Badge, l'utiliser de préférence à la place du `className` custom. Vérifier d'abord avec un grep `cva` dans `apps/web/src/components/ui/badge.tsx`. Sinon, garder le className custom.)

    Respecter le pattern projet : Server Component pour les pages app/, Client Component uniquement pour le banner (parce qu'il englobe EditProductButton qui est 'use client').
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" &amp;&amp; pnpm -F @qualiof/web exec tsc --noEmit 2>&amp;1 | tail -20</automated>
  </verify>
  <done>
    - tsc --noEmit passe sans erreur
    - Le fichier apps/web/src/components/produits/price-missing-banner.tsx existe et exporte PriceMissingBanner
    - grep "PriceMissingBanner" sur apps/web/src/app/app/produits/[id]/page.tsx retourne au moins 2 matches (import + usage)
    - grep "Prix manquant" sur apps/web/src/app/app/produits/page.tsx retourne au moins 1 match
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3 : Validation manuelle E2E par Laurent</name>
  <what-built>
    - Banner rouge "Prix HT manquant" sur la fiche produit quand priceHT=0, avec CTA qui ouvre la modale d'édition
    - Badge "Prix manquant" sur les cards de la liste /app/produits pour les 25 produits sans prix
    - Guard côté serveur : génération programme/convention bloquée si priceHT=0 (toast erreur en FR)
    - Invalidation cache PDF programme : après mise à jour du prix, la prochaine génération produit un nouveau PDF (plus de PDF stale à 0€)
    - Script jetable diag-prog-price.ts supprimé
  </what-built>
  <how-to-verify>
    1. Démarrer la stack : `pnpm dev:full`
    2. Ouvrir http://localhost:3000/app/produits → vérifier que les ~25 produits sans prix affichent un badge "Prix manquant" rouge
    3. Cliquer sur un de ces produits → la fiche doit afficher un banner rouge en tête, AVANT le titre du produit
    4. Sur la même fiche, dans l'onglet "Programme", tenter de générer le PDF → toast erreur FR "Prix HT manquant…" (le PDF NE doit PAS être produit)
    5. Cliquer "Éditer le produit" depuis le banner → la modale s'ouvre, renseigner le prix (ex : 1500€), sauvegarder
    6. Le banner disparaît, le badge "1500 € HT" apparaît dans le PageHeader
    7. Retenter la génération programme → un NOUVEAU PDF est produit (le hash a changé, le prix s'affiche bien dans le footer/header du programme). Vérifier dans la liste des documents Qualiopi que c'est le nouveau (createdAt récent), pas l'ancien cached à 0€.
    8. Sur une fiche session avec un participant inscrit sur un produit encore à 0€ (créer le cas si besoin), tenter "Générer la convention" → toast erreur FR. Après renseignement du prix, retenter → convention générée avec le bon montant.
    9. Confirmer que le fichier apps/web/scripts/diag-prog-price.ts n'existe plus : `ls apps/web/scripts/diag-prog-price.ts` doit retourner "No such file".
  </how-to-verify>
  <resume-signal>Répondre "approved" ou décrire les écarts observés (capture d'écran si possible).</resume-signal>
</task>

</tasks>

<verification>
- `pnpm -F @qualiof/web exec tsc --noEmit` passe (Tasks 1 + 2)
- `pnpm -F @qualiof/web test` reste vert (aucun test custom ajouté ici car correctifs ciblés sans nouvelle logique métier non triviale ; les tests existants doivent continuer à passer)
- Sanity grep :
  - `grep -rn "priceHT.*<=.*0" apps/web/src/server/actions/` → ≥3 matches (1 programme + 2 convention)
  - `grep -n "updatedAt" apps/web/src/server/actions/programme-generator.ts` → ≥1 match
  - `test ! -f apps/web/scripts/diag-prog-price.ts` → vrai
- Validation E2E par Laurent (Task 3)
</verification>

<success_criteria>
- Les 25 produits SmartOF sans prix sont VISIBLES dans la liste et leur fiche affiche un banner d'alerte non-dismissible
- Aucune génération programme ou convention ne peut produire un PDF à 0€ HT (guard serveur strict)
- Le cache PDF programme est correctement invalidé après update du produit (plus de PDF stale)
- L'opérateur peut corriger le prix en ≤2 clics depuis la fiche produit (banner → modale → save)
- Le script de diagnostic jetable est supprimé du repo
</success_criteria>

<output>
After completion, create `.planning/quick/260525-agz-fix-programme-produit-0-banner-alerte-di/260525-agz-01-SUMMARY.md` synthétisant :
- Fichiers modifiés + lignes touchées
- Confirmation que les 25 produits SmartOF restent à corriger manuellement (action utilisateur, hors scope code) — ou stratégie pour bulk-update si Laurent le demande au moment de la validation
- TODO résiduel éventuel (ex : si Laurent demande après validation un label custom "Définir le prix" sur le bouton du banner, ou un bulk-edit prix depuis la liste produits)
</output>
