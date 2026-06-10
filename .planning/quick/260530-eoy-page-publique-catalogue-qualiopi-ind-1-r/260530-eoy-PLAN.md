---
phase: quick/260530-eoy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/catalogue-constants.ts
  - apps/web/src/app/catalogue/page.tsx
autonomous: true
requirements:
  - IND-1   # 11 items obligatoires publiés par formation active (RNQ V9)
  - IND-2   # piste — la page sera l'emplacement futur pour indicateurs chiffrés

must_haves:
  truths:
    - "Un visiteur anonyme accédant à http://localhost:3000/catalogue voit la liste de toutes les formations actives."
    - "Pour chaque formation, les 11 items Ind 1 RNQ V9 sont visibles (prérequis, objectifs, durée, modalités, délais d'accès, tarifs, contacts, méthodes mobilisées, modalités d'évaluation, accessibilité PSH, conditions d'accès)."
    - "Le nom OF, SIRET, NDA et référent handicap sont affichés (header)."
    - "La page n'exige aucune authentification (pas de redirect vers /login)."
    - "La page est indexable (pas de meta noindex)."
    - "Le CTA 'Demander un devis' ouvre un mailto pré-rempli avec le code produit."
  artifacts:
    - path: "apps/web/src/lib/catalogue-constants.ts"
      provides: "Textes standards Ind 1 (DELAI_ACCES, ACCESSIBILITE_PSH, MENTION_TVA)."
      exports: ["DELAI_ACCES", "ACCESSIBILITE_PSH", "MENTION_TVA"]
    - path: "apps/web/src/app/catalogue/page.tsx"
      provides: "Server Component publique listant les formations actives avec les 11 items Ind 1."
      contains: "export default async function CataloguePage"
      min_lines: 120
  key_links:
    - from: "apps/web/src/app/catalogue/page.tsx"
      to: "prisma.tenant + prisma.trainingProduct"
      via: "findFirst + findMany"
      pattern: "prisma\\.(tenant|trainingProduct)\\.find"
    - from: "apps/web/src/app/catalogue/page.tsx"
      to: "loadOfConfig"
      via: "import @/lib/of-config"
      pattern: "loadOfConfig\\("
    - from: "apps/web/src/app/catalogue/page.tsx"
      to: "catalogue-constants"
      via: "import @/lib/catalogue-constants"
      pattern: "DELAI_ACCES|ACCESSIBILITE_PSH|MENTION_TVA"
---

<objective>
Créer la page publique `/catalogue` dans QualiOF qui expose pour chaque formation active les 11 items obligatoires Ind 1 RNQ V9 (prérequis, objectifs, durée, modalités, délais d'accès, tarifs, contacts, méthodes mobilisées, modalités d'évaluation, accessibilité PSH, conditions d'accès).

Purpose : Résoudre le **Top 1 risque** identifié dans l'audit blanc RNQ V9 (cf. `.planning/audit/AUDIT-BLANC-RNQ-V9.md` Ind 1 — "NC majeure probable" si non corrigé). La page sera incluse par iframe sur start-academy.fr (ou mirror statique) avant le 20 juin 2026 pour combler les 7 items obligatoires actuellement manquants. Audit officiel : 03/07/2026.

Output :
- `apps/web/src/lib/catalogue-constants.ts` — textes standards Ind 1 (délais, accessibilité PSH, TVA)
- `apps/web/src/app/catalogue/page.tsx` — Server Component SSR, route publique non authentifiée
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/audit/AUDIT-BLANC-RNQ-V9.md
@apps/web/src/lib/of-config.ts
@apps/web/src/app/preinscription/[token]/page.tsx
@apps/web/src/app/layout.tsx

<!-- Contraintes & invariants codebase -->
- Route publique = pas d'appel à `validateRequest()`, pas de redirect login. Pattern de référence : `apps/web/src/app/preinscription/[token]/page.tsx`.
- Root layout (`apps/web/src/app/layout.tsx`) fournit déjà `<html lang="fr"><body>` + Tailwind globals + Toaster. **Aucun `layout.tsx` à créer** dans `catalogue/` — la page hérite du root layout, qui n'inclut PAS le shell auth (le shell auth est dans `/app/layout.tsx` uniquement).
- Server Component (default Next 14 App Router). Pas de `'use client'`.
- Forcer SSR à chaque requête : `export const dynamic = 'force-dynamic'` (pas de cache, données fraîches BDD).
- Multi-tenant : le repo est mono-tenant en pratique (cf. ARCHITECTURE.md). Utiliser `prisma.tenant.findFirst()` (le schéma `Tenant` n'a PAS de champ `slug`, ignorer la suggestion `where: { slug: 'start-academy' }` du brief).
- Utiliser `loadOfConfig(tenant.id)` (existe déjà — async, lit BDD + fallback ENV) pour récupérer nom, SIRET, NDA, contacts, référent handicap.
- TrainingProduct fields disponibles (cf schema.prisma) : `prerequisites`, `objectives` (Json string[]), `durationHours`, `modality`, `pedagogicalMethods`, `evaluationMethods`, `accessibility`, `accessConditions`, `priceHT` (Decimal), `vatRate`, `targetAudience`, `code`, `title`, `isActive`, `theme`. Filtrer `isActive: true` et `tenantId`.
- TrainingModule inclus via `include: { modules: { orderBy: { order: 'asc' } } }` — le champ d'ordonnancement est `order` (Int), PAS `displayOrder` (le brief s'est trompé).
- Aucune migration BDD nécessaire (tout existe déjà).
- Tailwind palette : utiliser `slate-*`, `gray-*`, `primary-*` neutres (pas de couleurs criardes). Cf preinscription/[token]/page.tsx pour le style "page publique" cohérent.
- Money : `priceHT` est `Decimal` Prisma — convertir via `Number(priceHT)` ou `.toNumber()` avant `Intl.NumberFormat`. Si `priceHT <= 0` → afficher "Tarif sur demande".
- Date : afficher la "dernière mise à jour" comme `new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })`.
- `lucide-react` déjà disponible (`Sparkles`, `ShieldCheck`, `Clock`, `Mail`, etc.) si besoin d'icônes sobres.

<interfaces>
<!-- Contracts utilisés par la page — extrait du codebase pour éviter exploration -->

From apps/web/src/lib/of-config.ts:
```typescript
export interface OfConfig {
  name: string;
  siret: string;
  rnq: string;             // NDA (= numDA en BDD)
  addressFull: string;
  phone: string;
  email: string;
  handicapReferent: string;
  // ...autres champs non utilisés ici
}
export async function loadOfConfig(tenantId: string): Promise<OfConfig>;
```

From packages/db/prisma/schema.prisma (TrainingProduct + TrainingModule, champs pertinents) :
```
TrainingProduct {
  id, tenantId, code, title, durationHours, modality (Modality enum),
  prerequisites: String?, targetAudience: String?,
  objectives: Json,                  // string[] attendu
  pedagogicalMethods: String?, evaluationMethods: String?,
  accessibility: String?, accessConditions: String?,
  priceHT: Decimal, vatRate: Decimal, theme: String?,
  isActive: Boolean,
  modules: TrainingModule[]
}
TrainingModule {
  id, productId, order: Int, title: String, contentMd: String,
  durationMin: Int
}
enum Modality { PRESENTIEL | DISTANCIEL | MIXTE | ELEARNING }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1 : Constantes Ind 1 + page publique /catalogue (Server Component)</name>
  <files>
    apps/web/src/lib/catalogue-constants.ts
    apps/web/src/app/catalogue/page.tsx
  </files>
  <action>
**A. Créer `apps/web/src/lib/catalogue-constants.ts`** (fichier neuf, ~15 lignes) :

```ts
/**
 * Textes standards Start Academy pour la page publique /catalogue (Ind 1 RNQ V9).
 * Centralisés ici pour pouvoir être édités sans toucher au render.
 */

export const DELAI_ACCES =
  "À partir de 11 jours ouvrés après contractualisation (délai légal de rétractation et préparation pédagogique).";

export const ACCESSIBILITE_PSH =
  "Formation accessible aux personnes en situation de handicap. Référent handicap : Julien Lafitte — julien@start-academy.fr — Adaptations sur demande (matériel, rythme, supports). Réseau partenaires : Agefiph, Cap emploi 06, MDPH 06.";

export const MENTION_TVA = "TVA non applicable, art. 261-4-4° du CGI.";
```

**B. Créer `apps/web/src/app/catalogue/page.tsx`** (fichier neuf, Server Component, ~180-220 lignes) :

Structure obligatoire :

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@qualiof/db';
import { loadOfConfig } from '@/lib/of-config';
import {
  DELAI_ACCES,
  ACCESSIBILITE_PSH,
  MENTION_TVA,
} from '@/lib/catalogue-constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Catalogue formations Start Academy — IA pour conseillers immobiliers',
  description:
    "Découvrez nos formations Qualiopi pour conseillers immobiliers : IA, prospection, négociation. Tarifs, durées, modalités. Référent handicap dédié.",
};

// PAS de robots.noindex — la page DOIT être indexable (Ind 1).

export default async function CataloguePage() {
  // 1. Charger tenant (mono-tenant → findFirst suffit)
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) notFound();

  // 2. Charger formations actives du tenant
  const products = await prisma.trainingProduct.findMany({
    where: { tenantId: tenant.id, isActive: true },
    include: { modules: { orderBy: { order: 'asc' } } },
    orderBy: { title: 'asc' },
  });

  // 3. Charger config OF (nom, SIRET, NDA, référent handicap, contacts)
  const of = await loadOfConfig(tenant.id);

  // 4. Render
  // ... voir contrat ci-dessous
}
```

**Contrat de rendu — sections obligatoires :**

1. `<header>` blanc, sticky-friendly, en haut de page :
   - Logo "S" carré (cf preinscription/[token]/page.tsx pattern) + `of.name`
   - Sous-titre : `Organisme de formation enregistré — NDA {of.rnq} — SIRET {of.siret}`
   - Ligne secondaire : `Référent handicap : {of.handicapReferent} • Mis à jour le {dateLong}`
     où `dateLong = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })`

2. `<main>` avec `max-w-6xl mx-auto px-6 py-10` :

   **Hero court** (1 div, ~2 lignes texte) :
   - H1 : `Catalogue des formations`
   - P : `Programmes Qualiopi conçus pour les conseillers et agents commerciaux immobilier. Tous nos programmes sont éligibles aux financements OPCO / AGEFICE / CPF.`

   **Grille formations** : `grid grid-cols-1 lg:grid-cols-2 gap-6`
   - 1 `<article className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">` par produit
   - Si `products.length === 0` → afficher fallback "Aucune formation active actuellement. Contactez-nous : {of.email}."

   **Pour chaque card produit, afficher les 11 items dans cet ordre** (utiliser `<dl>` sémantique ou paires `<h3>` + `<p>`) :
   1. **Titre + code** (h2) : `{title}` + badge `<span>{code}</span>`
   2. **Thème** (optionnel si présent) : `theme`
   3. **Objectifs pédagogiques** : itérer `objectives` (Json array → cast `as string[]`) en `<ul>`. Fallback "Objectifs détaillés disponibles sur demande." si vide/null.
   4. **Prérequis** : `prerequisites` ou "Aucun prérequis spécifique."
   5. **Public visé** (= conditions d'accès) : `targetAudience` ou `accessConditions` ou "Conseillers et agents commerciaux immobilier."
   6. **Durée** : `formatHours(durationHours)` → `"{h}h ({Math.ceil(h/8)} jour{s})"`. Ex : `16h (2 jours)`, `72h (9 jours)`. Si plusieurs modules, lister `<details><summary>Programme détaillé</summary>` puis `<ol>` des modules `{order}. {title} — {durationMin}min` (sobre, optionnel).
   7. **Modalités** : `formatModality(modality)` :
      ```
      PRESENTIEL → 'Présentiel — locaux Start Academy ou sur site client (Vence 06)'
      DISTANCIEL → 'Distanciel synchrone (visio)'
      MIXTE      → 'Mixte présentiel + distanciel'
      ELEARNING  → 'E-learning asynchrone'
      ```
   8. **Méthodes pédagogiques mobilisées** : `pedagogicalMethods` ou "Apports théoriques, mises en situation pratiques, études de cas, ateliers collectifs."
   9. **Modalités d'évaluation** : `evaluationMethods` ou "QCM en fin de formation, grille d'observation formateur en continu, satisfaction à chaud (J+0) et à froid (J+30)."
   10. **Délais d'accès** : `DELAI_ACCES` (constante)
   11. **Tarifs** : `formatPrice(priceHT)` :
       - Si `Number(priceHT) > 0` → `new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits: 0 }).format(Number(priceHT)) + ' HT — ' + MENTION_TVA`
       - Sinon → `"Tarif sur demande"`
   12. **Accessibilité PSH** : `ACCESSIBILITE_PSH` (constante). Override par `product.accessibility` si renseigné.

   **Footer card** : bouton CTA en pied de card :
   ```tsx
   <a
     href={`mailto:${of.email}?subject=${encodeURIComponent('Devis - ' + product.code + ' - ' + product.title)}`}
     className="inline-flex items-center justify-center rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90"
   >
     Demander un devis
   </a>
   ```

3. **Section "Contacts & infos pratiques"** (en dehors de la grille, sous les cards) :
   - Email : `of.email`
   - Téléphone : `of.phone`
   - Adresse : `of.addressFull`
   - Référent handicap (réaffirmé) + réseau partenaires (ACCESSIBILITE_PSH déjà couvre)

4. `<footer>` (en pied de page) :
   - `Start Academy — {of.name} — SIRET {of.siret} — NDA {of.rnq}`
   - `Certification Qualiopi N° CW202324-1795 — RNQ V9`
   - `MENTION_TVA`
   - Lien CGV (texte simple, pas de route à câbler ici) : "CGV disponibles sur demande"

**Helpers locaux à la page** (fonctions pures, en haut du fichier après les imports) :

```ts
function formatHours(h: number): string {
  const days = Math.max(1, Math.ceil(h / 8));
  return `${h}h (${days} jour${days > 1 ? 's' : ''})`;
}
function formatModality(m: 'PRESENTIEL' | 'DISTANCIEL' | 'MIXTE' | 'ELEARNING'): string {
  switch (m) {
    case 'PRESENTIEL': return 'Présentiel — locaux Start Academy ou sur site client (Vence 06)';
    case 'DISTANCIEL': return 'Distanciel synchrone (visio)';
    case 'MIXTE':      return 'Mixte présentiel + distanciel';
    case 'ELEARNING':  return 'E-learning asynchrone';
  }
}
function formatPrice(p: number): string {
  if (!p || p <= 0) return 'Tarif sur demande';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(p) + ' HT';
}
```

**À NE PAS FAIRE :**
- ❌ Ne pas créer `apps/web/src/app/catalogue/layout.tsx` (le root layout suffit, et créer un layout risque de casser l'héritage `<html><body>`).
- ❌ Ne pas appeler `validateRequest()` (route publique).
- ❌ Ne pas ajouter `metadata.robots = { index: false }` — la page DOIT être indexable (sinon Ind 1 KO).
- ❌ Ne pas utiliser `displayOrder` sur TrainingModule (le champ est `order`, pas `displayOrder`).
- ❌ Ne pas filtrer Tenant par `slug` (le modèle n'a pas de slug — utiliser `findFirst()`).
- ❌ Ne pas oublier `Number()` ou `.toNumber()` sur `priceHT` Decimal avant `Intl.NumberFormat`.
- ❌ Ne pas mettre de feature interactive (search, filtre) — c'est un catalogue d'audit, pas un site marchand.

**Cohérence visuelle** : s'inspirer du style de `apps/web/src/app/preinscription/[token]/page.tsx` (palette `slate-*`, `primary-*`, bg blanc, cartes `rounded-2xl shadow-sm border border-slate-200`). Sobre, lisible, alignable avec start-academy.fr.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm -F web exec tsc --noEmit 2>&1 | tail -30</automated>
    <!-- Doit retourner 0 erreur. Si erreur sur Decimal/objectives Json, ajuster les casts (Number(p), as string[]). -->
  </verify>
  <done>
- `apps/web/src/lib/catalogue-constants.ts` existe et exporte `DELAI_ACCES`, `ACCESSIBILITE_PSH`, `MENTION_TVA`.
- `apps/web/src/app/catalogue/page.tsx` existe, Server Component, `export const dynamic = 'force-dynamic'`, `export const metadata` avec title/description (PAS de noindex).
- La page charge `prisma.tenant.findFirst()` puis `prisma.trainingProduct.findMany({ where: { tenantId, isActive: true }, include: { modules: { orderBy: { order: 'asc' } } } })`.
- La page utilise `loadOfConfig(tenant.id)` pour récupérer `name/siret/rnq/email/phone/addressFull/handicapReferent`.
- Pour chaque card produit, les 11 items Ind 1 sont rendus dans l'ordre listé (objectifs, prérequis, public, durée, modalités, méthodes péda, modalités éval, délais d'accès, tarifs, accessibilité PSH + titre/code/thème).
- CTA mailto pré-rempli avec code + titre produit.
- `pnpm -F web exec tsc --noEmit` passe sans erreur sur les nouveaux fichiers.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2 : Smoke check live + commit</name>
  <files>
    <!-- Aucun fichier modifié — vérification runtime + commit -->
  </files>
  <action>
**A. Smoke check runtime** (sans toucher au code) :

1. Vérifier que `pnpm dev:full` tourne déjà (Laurent le lance d'habitude). Sinon ne PAS le démarrer — Laurent le fait lui-même.
2. Tester via curl que la route répond 200 sans cookie d'auth :
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -b "" http://localhost:3000/catalogue
   ```
   Attendu : `200`. Si `307`/`302` (redirect login) → bug, la route est dans `/app/*` au lieu de racine.

3. Vérifier qu'au moins 1 produit actif existe en BDD (sinon page vide) :
   ```bash
   cd "/Users/laurentmarx/Documents/CRM Next gen/files" && \
   pnpm -F @qualiof/db exec tsx -e "import { prisma } from './src/index.ts'; prisma.trainingProduct.count({ where: { isActive: true } }).then(n => { console.log('Actifs:', n); process.exit(0); });"
   ```
   Attendu : > 0. Si 0, signaler à Laurent (il y a 30 produits en BDD d'après l'audit, dont 25 avec priceHT=0 — ils s'afficheront en "Tarif sur demande", c'est OK pour l'audit).

4. `grep` rapide pour vérifier que les 11 items sont bien présents dans le rendu :
   ```bash
   curl -s http://localhost:3000/catalogue | grep -oE "Prérequis|Objectifs|Durée|Modalités|Délais d'accès|Tarif|Méthodes|évaluation|Accessibilité|Public visé|Référent handicap" | sort -u | wc -l
   ```
   Attendu : 8+ matches uniques (les libellés sont là — comptage approx car la casse et accents varient).

**B. Commit** (uniquement si A passe) :

```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files" && \
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "feat(web): page publique /catalogue Qualiopi Ind 1 (11 items obligatoires RNQ V9)" --files apps/web/src/lib/catalogue-constants.ts apps/web/src/app/catalogue/page.tsx
```

Si `gsd-tools` indispo, fallback `git add` + `git commit -m` classique.

**À NE PAS FAIRE :**
- ❌ Ne PAS lancer `pnpm dev:full` (Laurent le gère, et le lancer ici risque de bloquer le terminal).
- ❌ Ne PAS modifier la BDD pour "créer un produit de test" — si 0 produit actif, alerter, ne pas combler.
- ❌ Ne PAS ajouter de fichier de test E2E ici (out of scope quick).
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && curl -s -o /dev/null -w "%{http_code}" -b "" http://localhost:3000/catalogue 2>/dev/null || echo "dev:full pas lancé"</automated>
    <!-- Si dev:full pas lancé → noter "à valider par Laurent au prochain dev:full". -->
  </verify>
  <done>
- Si `dev:full` tourne : route `/catalogue` répond 200, page contient les 11 libellés Ind 1.
- Si `dev:full` ne tourne pas : signaler à Laurent "à valider visuellement au prochain `pnpm dev:full` en ouvrant http://localhost:3000/catalogue".
- Commit créé via gsd-tools avec message `feat(web): page publique /catalogue Qualiopi Ind 1 (11 items obligatoires RNQ V9)`.
- Laurent connaît l'URL à ouvrir pour validation finale.
  </done>
</task>

</tasks>

<verification>
**Vérifications globales du quick fix :**

1. `tsc --noEmit` clean sur `apps/web` (Task 1 verify).
2. Route `/catalogue` répond HTTP 200 sans authentification (Task 2 verify).
3. Visuellement (Laurent au prochain `dev:full`) :
   - Tous les produits actifs apparaissent
   - Pour chaque produit, les 11 items Ind 1 sont lisibles
   - Le bouton "Demander un devis" ouvre un mailto correctement formaté
   - L'aspect est sobre, alignable avec start-academy.fr
4. La page est indexable (pas de `<meta name="robots" content="noindex">` dans le HTML rendu) :
   ```bash
   curl -s http://localhost:3000/catalogue | grep -i 'noindex' || echo "OK indexable"
   ```
   Attendu : `OK indexable`.
</verification>

<success_criteria>
**Quick fix réussi quand :**
- [ ] Audit blanc RNQ V9 Top 1 risque adressé : les 7 items manquants Ind 1 sont publiés via `/catalogue`.
- [ ] Laurent peut donner l'URL `http://localhost:3000/catalogue` (ou production) à un auditeur Qualiopi et démontrer Ind 1 conforme.
- [ ] Aucune migration BDD, aucun appel auth, aucune feature interactive ajoutée.
- [ ] 1 commit propre `feat(web): page publique /catalogue Qualiopi Ind 1 (11 items obligatoires RNQ V9)`.
- [ ] Prochaine étape utilisateur : Laurent inclut la page sur start-academy.fr par iframe ou mirror statique avant le 20 juin 2026.
</success_criteria>

<output>
Après complétion, créer `.planning/quick/260530-eoy-page-publique-catalogue-qualiopi-ind-1-r/260530-eoy-SUMMARY.md` résumant :
- Fichiers créés
- Couverture des 11 items Ind 1
- Reste à faire côté Laurent (publication sur start-academy.fr, Ind 2 chiffres résultats — hors-scope ce quick)
</output>
