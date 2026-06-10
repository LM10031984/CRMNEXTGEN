---
phase: quick/260525-jpq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx
  - apps/web/src/app/app/sessions/[id]/page.tsx
autonomous: true
requirements:
  - BUG-I (sidebar Documents partagés incohérente avec matrice — grille obs)
  - BUG-J (CTA sidebar non-inline — redirige vers /closure batch global)

must_haves:
  truths:
    - "Sur SES-0093, la card 'Grille observation' de la sidebar 'Documents session' affiche le même état que la cellule Grille_obs dans la matrice (vert/généré si au moins un PedagogicalAsset kind=GRILLE_OBS existe pour la session)"
    - "Cliquer sur 'Générer la grille d'observation' depuis la sidebar lance immédiatement la génération inline (server action generateGrilleObsSessionForSession) — pas de redirection vers /closure"
    - "Cliquer sur 'Générer le déroulé' depuis la sidebar lance generateDerouleForProduct(productId) inline"
    - "Cliquer sur 'Générer la checklist' depuis la sidebar lance generateChecklistForSession(sessionId) inline"
    - "Un toast sonner success/error confirme le résultat, puis router.refresh() rafraîchit la page"
    - "Le bouton est désactivé pendant la génération (useTransition) avec un libellé 'Génération…'"
    - "La grille d'observation n'affiche plus le bloc 'Document post-formation' bloquant — elle est générable comme les 2 autres docs"
  artifacts:
    - path: "apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx"
      provides: "Client Component avec 3 cards docs session + boutons inline qui appellent server actions via useTransition"
      contains: "'use client'"
    - path: "apps/web/src/app/app/sessions/[id]/page.tsx"
      provides: "Page session passe grilleObsAssetCount + productId à SessionOnlyDocsBlock"
      contains: "grilleObsAssetCount"
  key_links:
    - from: "apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx"
      to: "apps/web/src/server/actions/generate-grille-obs-session.ts"
      via: "import { generateGrilleObsSessionForSession } + useTransition handler"
      pattern: "generateGrilleObsSessionForSession\\("
    - from: "apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx"
      to: "apps/web/src/server/actions/deroule-product-generator.ts"
      via: "import { generateDerouleForProduct }"
      pattern: "generateDerouleForProduct\\("
    - from: "apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx"
      to: "apps/web/src/server/actions/generate-checklist-formation.ts"
      via: "import { generateChecklistForSession }"
      pattern: "generateChecklistForSession\\("
    - from: "apps/web/src/app/app/sessions/[id]/page.tsx"
      to: "SessionOnlyDocsBlock"
      via: "props grilleObsAssetCount + productId"
      pattern: "grilleObsAssetCount=\\{"
---

<objective>
Fix bugs I et J sur la fiche session SES-0093 :
- I : la sidebar "Documents session" pour la Grille d'observation est incohérente avec la matrice Qualiopi (matrice = vert, sidebar = rouge "Non générée") parce que la sidebar ne lit que `Document.GRILLE_OBS_SESSION` alors que la matrice lit aussi `PedagogicalAsset.kind=GRILLE_OBS` par participant.
- J : les CTAs "Générer le …" pointent tous vers `/app/sessions/[id]/closure` (page batch global) au lieu d'appeler directement la server action correspondante. La grille obs est en plus bloquée par `postFormation=true` qui n'affiche aucun bouton.

Purpose: Donner à Laurent un feedback visuel cohérent (sidebar = matrice) et un parcours 1-clic pour générer les 3 docs session sans quitter la fiche.
Output: 2 fichiers modifiés, 2 commits atomiques, validation manuelle sur SES-0093.
</objective>

<context>
@.planning/STATE.md
@./CLAUDE.md
@apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx
@apps/web/src/server/actions/generate-grille-obs-session.ts
@apps/web/src/server/actions/deroule-product-generator.ts
@apps/web/src/server/actions/generate-checklist-formation.ts
@apps/web/src/lib/derive-cell-state.ts

<interfaces>
Server actions disponibles (toutes vérifiées sur disque) :

```typescript
// apps/web/src/server/actions/generate-grille-obs-session.ts
export async function generateGrilleObsSessionForSession(
  sessionId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string; usedStub?: boolean }>;

// apps/web/src/server/actions/deroule-product-generator.ts
export async function generateDerouleForProduct(
  productId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string; usedStub?: boolean }>;

// apps/web/src/server/actions/generate-checklist-formation.ts
export async function generateChecklistForSession(
  sessionId: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; documentId?: string; pdfUrl?: string; error?: string }>;
```

Toutes les 3 :
- font `revalidatePath(\`/app/sessions/\${sessionId}\`)` en interne
- sont find-or-create (opts.force=true pour régénérer)
- retournent le pattern discriminé `{ ok, ... }` du projet

Données déjà chargées dans `apps/web/src/app/app/sessions/[id]/page.tsx` :
- `sessionDocsMap: Map<string, { id: string }>` (ligne 226) — contient GRILLE_OBS_SESSION et CHECKLIST_FORMATION
- `derouleProductDocId: string | undefined` (ligne 139) — produit déroulé
- `session.productId: string | null` (utilisé ligne 376)
- `session.participants` (déjà chargé) — fournit la liste des participantIds pour compter les PedagogicalAsset
- `pedAssetsRaw` (ligne 215-217) — déjà loadé, contient `{ id, participantId, kind }` pour TOUTES les sessions' assets → on peut juste compter ceux avec `kind === 'GRILLE_OBS'` côté JS sans nouvelle query Prisma

Convention server action returns `{ ok, error?, ... }` — pattern projet (CLAUDE.md §Patterns to keep).
Convention toast : `sonner` (`import { toast } from 'sonner'`).
Convention transitions : `useTransition` (pas `useState(loading)`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Transformer SessionOnlyDocsBlock en Client Component avec génération inline</name>
  <files>apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx</files>
  <behavior>
    - Pour la grille obs : si `grilleObsAssetCount > 0` OU `grilleObsPdfRef` défini → état GENERATED (cohérent avec matrice)
    - Click sur "Générer le déroulé" → appel `generateDerouleForProduct(productId)`, toast.success/error, router.refresh()
    - Click sur "Générer la grille d'observation" → appel `generateGrilleObsSessionForSession(sessionId)`, idem
    - Click sur "Générer la checklist" → appel `generateChecklistForSession(sessionId)`, idem
    - Bouton désactivé + texte "Génération…" pendant `isPending` (useTransition)
    - Plus de bloc `postFormation` bloquant pour la grille obs — le bouton "Générer" est toujours dispo (Laurent veut générer avant la formation)
    - Si on tente de générer le déroulé sans `productId`, afficher toast.error("Produit lié manquant") et ne pas appeler la server action
  </behavior>
  <action>
    Réécrire complètement le fichier `apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx` :

    1. Ajouter `'use client'` en première ligne.
    2. Imports additionnels :
       ```typescript
       import { useTransition } from 'react';
       import { useRouter } from 'next/navigation';
       import { toast } from 'sonner';
       import { generateGrilleObsSessionForSession } from '@/server/actions/generate-grille-obs-session';
       import { generateDerouleForProduct } from '@/server/actions/deroule-product-generator';
       import { generateChecklistForSession } from '@/server/actions/generate-checklist-formation';
       ```
    3. Étendre `SessionOnlyDocsBlockProps` :
       ```typescript
       export interface SessionOnlyDocsBlockProps {
         sessionId: string;
         productId: string | null;
         deroulePdfRef?: PdfRef;
         grilleObsPdfRef?: PdfRef;
         checklistPdfRef?: PdfRef;
         grilleObsAssetCount: number; // proxy de présence côté matrice
         canWrite: boolean;
       }
       ```
    4. À l'intérieur du composant, créer `const [isPending, startTransition] = useTransition();` et `const router = useRouter();`.
    5. Définir un handler générique :
       ```typescript
       function runGenerate(label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
         startTransition(async () => {
           try {
             const res = await action();
             if (res.ok) {
               toast.success(`${label} généré`);
               router.refresh();
             } else {
               toast.error(res.error ?? `Erreur génération ${label}`);
             }
           } catch (e: any) {
             toast.error(e?.message ?? `Erreur génération ${label}`);
           }
         });
       }
       ```
    6. Calcul `hasPdf` par card :
       ```typescript
       const hasPdfByKey = {
         DEROULE: !!deroulePdfRef,
         GRILLE_OBS: !!grilleObsPdfRef || grilleObsAssetCount > 0, // fix Bug I
         CHECKLIST: !!checklistPdfRef,
       };
       ```
    7. Pour la pastille `DocStatusBadge` : conserver `state={hasPdf ? 'GENERATED' : 'MISSING'}` mais alimenté par `hasPdfByKey[card.key]`.
    8. Pour la zone "Voir le PDF" (cas `hasPdf=true`) : conserver le `<a>` vers `/api/documents/${pdf.id}` UNIQUEMENT si `pdf` (le `PdfRef`) existe — pour grille obs avec seulement des assets par participant (pas de doc session), masquer le lien "Voir le PDF" mais garder la pastille verte + bouton "Régénérer".
    9. Remplacer le `<Link href="/closure">` par un `<button>` qui appelle `runGenerate` :
       ```tsx
       <button
         type="button"
         disabled={isPending || (card.key === 'DEROULE' && !productId)}
         onClick={() => {
           if (card.key === 'DEROULE') {
             if (!productId) { toast.error('Produit lié manquant'); return; }
             runGenerate(card.shortLabel, () => generateDerouleForProduct(productId));
           } else if (card.key === 'GRILLE_OBS') {
             runGenerate(card.shortLabel, () => generateGrilleObsSessionForSession(sessionId));
           } else {
             runGenerate(card.shortLabel, () => generateChecklistForSession(sessionId));
           }
         }}
         className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-wait"
       >
         <Sparkles className="h-4 w-4" aria-hidden="true" />
         {isPending ? 'Génération…' : `Générer ${card.article} ${card.shortLabel}`}
       </button>
       ```
    10. SUPPRIMER complètement le bloc `card.postFormation ? (...)` — la grille obs doit suivre le même flux que les 2 autres. Retirer aussi le champ `postFormation` de la constante `CARDS`.
    11. Le bouton "Re-générer" (cas hasPdf=true) : remplacer le `<Link>` par un `<button>` qui appelle la même server action (les 3 sont find-or-create idempotentes ; pour forcer la régénération on passe `{ force: true }`).
        ```tsx
        runGenerate(card.shortLabel, () => generateGrilleObsSessionForSession(sessionId, { force: true }));
        ```
    12. Retirer `import Link` et `import type { Route }` (plus utilisés). Garder les imports lucide (Sparkles, RefreshCw, FileText).

    WHY postFormation supprimé : Laurent explicite (problem_context) — il veut pouvoir générer avant la formation aussi. Le contenu IA reste valable même sans présences confirmées (le générateur a un stub fallback).

    WHY useTransition + router.refresh() : la server action `revalidatePath` invalide le cache RSC ; `router.refresh()` re-fetch les données serveur pour mettre à jour la pastille sans full reload.

    WHY `grilleObsAssetCount > 0` comme proxy : cohérence visuelle avec la matrice qui lit `PedagogicalAsset` (ligne 70-71 de `derive-cell-state.ts`). On ne refactor pas `deriveCellState` (hors scope) — on aligne juste la sidebar.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -E "session-only-docs-block|error TS" | head -20</automated>
  </verify>
  <done>
    - Fichier commence par `'use client'`
    - Imports `useTransition`, `useRouter`, `toast`, 3 server actions présents
    - Props étendues avec `grilleObsAssetCount: number` et `productId: string | null`
    - Aucun `<Link href="/closure">` restant dans le fichier
    - Bloc `card.postFormation` supprimé (vérifier `grep -c "postFormation" file` retourne 0)
    - `tsc --noEmit` ne produit aucune erreur sur ce fichier
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Page session calcule grilleObsAssetCount et passe les nouvelles props</name>
  <files>apps/web/src/app/app/sessions/[id]/page.tsx</files>
  <behavior>
    - La page calcule `grilleObsAssetCount` = nombre d'éléments dans `pedAssetsRaw` ayant `kind === 'GRILLE_OBS'` (les `pedAssetsRaw` sont déjà filtrés par sessionId/tenantId)
    - `<SessionOnlyDocsBlock>` reçoit `grilleObsAssetCount={...}` et `productId={session.productId}`
    - Aucune nouvelle query Prisma — on réutilise `pedAssetsRaw` déjà chargé ligne 215-218
  </behavior>
  <action>
    Modifier `apps/web/src/app/app/sessions/[id]/page.tsx` :

    1. Juste après la construction des maps (vers ligne 250, après `pedAssetsByPid`), ajouter :
       ```typescript
       // Bug I — proxy de présence aligné sur deriveCellState (ligne 70-71 de derive-cell-state.ts).
       // La matrice considère la grille obs comme générée dès qu'un PedagogicalAsset existe par participant.
       const grilleObsAssetCount = pedAssetsRaw.filter((a) => a.kind === 'GRILLE_OBS').length;
       ```

    2. Modifier le JSX de `<SessionOnlyDocsBlock>` (ligne 573) pour passer les 2 nouvelles props :
       ```tsx
       <SessionOnlyDocsBlock
         sessionId={session.id}
         productId={session.productId}
         deroulePdfRef={derouleProductDocId ? { id: derouleProductDocId } : undefined}
         grilleObsPdfRef={sessionDocsMap.get('GRILLE_OBS_SESSION')}
         checklistPdfRef={sessionDocsMap.get('CHECKLIST_FORMATION')}
         grilleObsAssetCount={grilleObsAssetCount}
         canWrite={['ADMIN', 'MANAGER'].includes(user.role)}
       />
       ```

    WHY pas de query séparée : `pedAssetsRaw` est déjà chargé ligne 215-218 pour la matrice (`prisma.pedagogicalAsset.findMany({ where: { tenantId, sessionId } })`). Filtrer en mémoire évite un round-trip DB redondant.
  </action>
  <verify>
    <automated>cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web exec tsc --noEmit 2>&1 | grep -E "page.tsx|error TS" | head -20</automated>
  </verify>
  <done>
    - `grilleObsAssetCount` calculé dans la page
    - `<SessionOnlyDocsBlock>` reçoit `productId` et `grilleObsAssetCount`
    - `tsc --noEmit` clean sur ce fichier
  </done>
</task>

</tasks>

<verification>
Validation manuelle Laurent (SES-0093) après `pnpm dev:full` :
1. Ouvrir `/app/sessions/<SES-0093-id>` → sidebar "Documents session" : la card "Grille observation" affiche pastille verte (au moins un participant a sa grille générée via le menu matrice).
2. Sur une autre session sans grille → pastille rouge, bouton "Générer la grille d'observation" visible (plus de "Document post-formation").
3. Click sur "Générer la grille d'observation" → toast "Grille observation généré", bouton passe en "Génération…" pendant l'attente, page refresh, pastille verte.
4. Idem pour Déroulé et Checklist.
5. Pas de redirection vers `/closure` à aucun moment.

Auto :
- `tsc --noEmit` clean global (pnpm --filter @qualiof/web exec tsc --noEmit)
- `grep -c "/closure" apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx` retourne 0
- `grep -c "postFormation" apps/web/src/components/sessions/qualiopi-matrix/session-only-docs-block.tsx` retourne 0
</verification>

<success_criteria>
- Bugs I et J fixés : sidebar cohérente avec matrice ET CTAs inline
- 2 commits atomiques séparés (1 par task)
- Aucune régression Tailwind / Radix patterns existants
- Pattern projet respecté : `useTransition`, `sonner` toast, `{ ok, error }` returns
- Aucune nouvelle query Prisma (réutilise `pedAssetsRaw` déjà chargé)
- Aucun comment "what" — seuls les `WHY postFormation supprimé`, `WHY pas de query séparée` justifient les choix non-obvious
</success_criteria>

<output>
After completion, create `.planning/quick/260525-jpq-fix-bugs-i-j-fiche-session-sidebar-docum/260525-jpq-SUMMARY.md` résumant :
- Les 2 fichiers modifiés (avec lignes clés)
- Les 2 commits (hashs)
- Confirmation `tsc --noEmit` clean
- Note pour Laurent : "Reload SES-0093 dans le navigateur après `pnpm dev:full`"
</output>
