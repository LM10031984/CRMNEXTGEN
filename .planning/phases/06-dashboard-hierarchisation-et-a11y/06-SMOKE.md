# Phase 6 — Smoke build + test (post-merge des plans 06-01/02/03)

**Date :** 2026-05-13
**Agent :** Plan 06-04 (bookkeeping)

## Build

Commande prévue : `cd "/Users/laurentmarx/Documents/CRM Next gen/files" && rm -rf apps/web/.next && pnpm --filter @qualiof/web build`
Exit code : **N/A — bloqué par sandbox de l'agent**

Statut : Le sandbox Claude Code a refusé l'exécution de `pnpm --filter @qualiof/web build` lors de cette exécution du plan 06-04. Pas de log capturé pour ce run.

Preuve indirecte que le code de la Phase 6 est sain :

- Plan 06-01 SUMMARY : `pnpm --filter @qualiof/web build` exécuté → vert (43 routes générées). Commit `4d98926`.
- Plan 06-02 SUMMARY : `tsc --noEmit` sur `apps/web` → exit 0. Les erreurs prerender observées concernaient uniquement des pages sans rapport avec la Phase 6 (`/login`, `/app/sessions`, `/app/factures`, `/app/produits`, `/`) et étaient dues à la corruption `.next/` provoquée par les builds parallèles wave 1 (voir `deferred-items.md`).
- Plan 06-03 SUMMARY : `badge.tsx` inchangé (`git diff` vide), aucune modification de source.
- Phase 6 ne touche pas aux pages affectées par la corruption `.next/` parallèle.

Re-vérification recommandée manuellement :
```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
rm -rf apps/web/.next
pnpm --filter @qualiof/web build
```

## Test

Commande prévue : `cd "/Users/laurentmarx/Documents/CRM Next gen/files" && pnpm --filter @qualiof/web test`
Exit code : **N/A — bloqué par sandbox de l'agent**

Statut : Idem build. Sandbox refus.

Preuve indirecte : le test smoke `apps/web/src/app/app/sessions/[id]/__tests__/page.smoke.test.ts` (2 tests verts, ancré Phase 1 — BUG-01) reste valide car aucune des modifications Phase 6 ne touche `/app/sessions/[id]` (les modifs UX-12 dans `sessions/[id]/page.tsx` étaient déjà en place avant le plan 06-01, cf. 06-01-SUMMARY > "Sites UI déjà alignés à l'arrivée du plan").

Re-vérification recommandée manuellement :
```bash
cd "/Users/laurentmarx/Documents/CRM Next gen/files"
pnpm --filter @qualiof/web test
```

## Conclusion

Smoke build + test bloqués par sandbox au moment de l'exécution du plan 06-04. **L'échec n'est PAS causé par les modifications Phase 6** : il est dû à une restriction d'environnement de l'agent. Les preuves indirectes (tsc OK, build vert dans 06-01, NO-OPs sur 06-02 page.tsx et 06-03 badge.tsx) convergent vers un état sain.

Prochaine étape : `/gsd:plan-phase 7` (Paramètres organisme éditables). Si re-vérification souhaitée avant Phase 7, exécuter les 2 commandes ci-dessus manuellement.
