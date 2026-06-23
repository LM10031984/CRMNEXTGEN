# Quick Task 260623-ei7 — Summary

**Completed:** 2026-06-23
**Status:** Done (tsc vert) — en attente validation visuelle test 1 session.

## Ce qui a changé

| Fichier | Changement |
|---------|-----------|
| `apps/web/src/lib/closure/certificat-template.ts` | + import `loadStampDataUrl` ; + chargement `stampDataUrl` ; bloc signature passé à un conteneur `.sig-stamp` (tampon en fond décalé z-index 1 / signature au premier plan z-index 2) ; CSS local `.sig-stamp/.sig/.stamp`. |
| `apps/web/src/lib/closure/shared-template.ts` | + `page-break-inside: avoid; break-inside: avoid;` sur `.signature-block`. |

## Vérification
- `tsc --noEmit -p apps/web/tsconfig.json` → 0 erreur.
- Validation visuelle déléguée au test de régénération sur 1 session (étape suivante).

## Décision capturée
- Tampon **en superposition** sur la signature (choix Laurent 2026-06-23), pas côte-à-côte.

## Assets utilisés (fallbacks bundled, `public/of-assets/` vide)
- Signature dirigeant : `src/assets/signature-laurent.png`
- Cachet OF : `src/assets/tampon-start-academy.png`

## Suite (hors cette tâche)
1. Test régénération **certificats seuls** sur 1 session → validation Laurent.
2. Génération de masse + remplacement DB/MinIO/Drive (étape destructive, go explicite requis).
