# 22-GONOGO-SES-0094 — Pack témoin post-bascule (gate go/no-go, D-10 / CUT-02)

**Date :** 2026-08-03 (UTC)
**Contexte :** app en `NEXT_PUBLIC_APP_ENV=production` sur https://qualiof.vercel.app depuis le 2026-07-30 (runbook §2, evidence §9.2), `MAIL_DRY_RUN=true` sur Vercel ET Railway. Pack régénéré via le **worker Railway** (file Postgres `ClosureJob`, `FOR UPDATE SKIP LOCKED`) — **Mac hors boucle**, run strictement séquentiel (file vide avant enqueue).

## Batch de référence

**Batch `08fd14dc-49fa-4180-b697-4ae3c48895a1`** — créé 2026-08-03T06:48:50Z, **COMPLETED 21/21 en 93 s** (7 kinds × 3 participants), consommé par `closure-worker-pg` (Railway, boot 2026-08-03T06:37:30 post-correction env OF_*).

> Un premier batch de bascule (`4af3d823`, 2026-07-31, COMPLETED 21/21 en 97 s, 0 stub)
> avait révélé une **pollution des 22 vars OF_* Railway** (guillemets littéraux embarqués
> au re-pose du 2026-07-06 → footers `"START ACADEMY"`, coordonnées de contact `"" ""`).
> Remédiation avant le batch définitif : 12 OF_* re-posées en valeurs dotenv-parsées
> propres, 10 OF_* vides (`""`) supprimées (cascade `pick()` de `of-config.ts`
> restaurée — contact retombe sur le responsable). Détail en « Déviations » ci-dessous.

## Critère 1 — 0 stub (sortie Prisma brute)

```
batch=08fd14dc-49fa-4180-b697-4ae3c48895a1 status=COMPLETED done=21/21 createdAt=2026-08-03T06:48:50.707Z
jobs total=21 | jobs usedStub=true: 0/21 | pdfKey présents: 21/21
  DONE  ATTESTATION / CERTIFICAT / QCM / GRILLE_OBS / POSITIONNEMENT / SATISFACTION_CHAUD / EMARGEMENT
  × PIERRE KRETCHMANN, CHARLOTTE PANCRACIO, YANNICK RUSSO — jobStub=false sur les 21
```

**✅ 0 stub : 21/21 jobs `usedStub=false`** (champ porté par `ClosureJob`, schema.prisma:1505 — `Document`/`PedagogicalAsset` ne portent que `pdfUrl`). Note : `ClosureBatch.doneDocs` propre ici (batchs neufs, pas de re-run — l'anomalie cosmétique de double comptage Phase 20 ne s'applique pas ; jugement rendu sur les `ClosureJob` réels comme demandé).

## Critère 2 — Footer 22 vars OF_* (contrôle visuel, 2 PDF)

| PDF | Moteur | Footer observé |
| --- | --- | --- |
| `ATTESTATION` P. Kretchmann | WeasyPrint (worker Railway) | `Start Academy – Siège social : 12 avenue des camélias, 06800 Cagnes sur Mer - SIRET : 95131909400011 – NDA 93 06 10481 06 / Coordonnées de contact : Laurent MARX - formation@start-academy.fr - 0631056390` — signataire corps : `Laurent MARX, PDG` |
| `EMARGEMENT` C. Pancracio | WeasyPrint (worker Railway) | `START ACADEMY – Siège social : 618 Bd Jean Maurel Inférieur, 06140 Vence - SIRET : 95131909400011 – NDA 93 06 10481 06 / Coordonnées de contact : Laurent MARX - formation@start-academy.fr - 0631056390` |

**✅ Footer renseigné, zéro guillemet parasite, zéro champ vide** (IBAN/BIC vides à la source `.env` = état établi des packs validés Phases 20/21, pas une régression).
**⚠ Observation (non bloquante, décision Laurent)** : l'ATTESTATION affiche l'adresse **BDD tenant** (« 12 avenue des camélias, Cagnes sur Mer » + « Fait à Cagnes sur Mer ») car `pick()` de `of-config.ts` fait BDD-d'abord, tandis que l'ÉMARGEMENT affiche l'adresse **env** (« Vence », siège Qualiopi). Écart de données pré-existant (Paramètres organisme non mis à jour) — correction = 1 édition UI dans Paramètres, pas un bug de bascule.

## Critère 3 — Aucun 404 (curl de CHAQUE signed URL)

```
=== 2026-08-03T06:51:35Z — curl signed URLs batch 08fd14dc : 21/21 en 200 + %PDF- | 404: 0 | échecs: 0
```

**✅ 21/21 documents : HTTP 200 + magic bytes `%PDF-` — 0×404.** (Signed URLs Supabase 1 h générées par `createSignedDownloadUrl`, bucket `qualiof-docs`.)

## Critère 4 — PDF sans filigrane STAGING (D-08)

| Chemin | Preuve | Verdict |
| --- | --- | --- |
| **Worker Railway** (WeasyPrint) | Rendu PNG de `ATTESTATION` + `EMARGEMENT` du batch : fond blanc, aucun motif STAGING | ✅ (attendu — le worker n'a jamais porté le flag) |
| **Vercel SYNCHRONE** (Gotenberg via proxy Caddy — le chemin qui portait le filigrane en staging 21-06) | Devis témoin jetable `DEV-E2E-2206` → `GET /api/quotes/{id}/pdf` sur https://qualiof.vercel.app (cookie session e2e) : **HTTP 200, 51 405 octets, 1,7 s, `%PDF-`**, rendu PNG **sans aucun filigrane**, footer in-body présent. Teardown : devis supprimé, `count(DEV-E2E-2206)=0`. Horodatage : 2026-08-03T09:32:53Z | ✅ **le flip `NEXT_PUBLIC_APP_ENV=production` a levé le filigrane, zéro code (D-08 prouvé)** |

## Critère 5 — Qualité Qualiopi (échantillonnage)

| Contrôle | Résultat |
| --- | --- |
| **Positionnement varié (v11)** | 3 PDF extraits en texte : md5 distincts (`d572…`, `364b…`, `99b4…`), narratifs personnalisés par stagiaire (objectifs/attentes/prérequis distincts — extraits diffés en annexe de session) | ✅ |
| **Satisfaction non uniforme** | 3 md5 distincts (`3c76…`, `0be7…`, `cf34…`), commentaires libres différents par stagiaire | ✅ |
| **QCM cohérent** | Questions **identiques** entre stagiaires (règle 1 QCM/session), scoring **individuel** : 92 % (Kretchmann) vs 85 % (Russo) — dans la plage 75-95 % | ✅ |
| **Émargement** | 9h-13h / 14h-18h figés ; jours : 15→19 puis 22→24 juin (14=dimanche, 20-21=week-end **exclus**) — règles métier non-négociables respectées | ✅ |

## Contrôle ajouté (Laurent, 2026-07-30) — analyse des besoins par stagiaire

**Constat : l'ANALYSE_BESOIN n'est PAS dans le pack régénéré — c'est BY DESIGN, et les documents existent par ailleurs :**

- `CLOSURE_DOC_KINDS` (types.ts:26) exclut volontairement `ANALYSE_BESOIN` du pack closure depuis la logique **Avant/Après** (doc-comment types.ts:23 : « `dispatchGenerateDoc({ docType: 'ANALYSE_BESOIN' })` — même modèle que `ASSIDUITE_AGEFICE` (générable, hors pack) ») — un doc « avant formation » n'est pas régénéré par le pack de clôture.
- **Présence vérifiée en base (Prisma)** pour les 3 stagiaires SES-0094 :
  ```
  YANNICK RUSSO:      PedagogicalAsset ANALYSE_BESOIN=1 (dernier 2026-06-04, pdf=oui)
  CHARLOTTE PANCRACIO: PedagogicalAsset ANALYSE_BESOIN=1 (dernier 2026-06-04, pdf=oui)
  PIERRE KRETCHMANN:  PedagogicalAsset ANALYSE_BESOIN=1 (dernier 2026-06-04, pdf=oui)
  ```
- Le fond (datation de l'analyse vs convention `signedAt`) reste traité par le todo
  `.planning/todos/pending/2026-07-30-analyse-besoins-datation-convention-signedat.md` — hors périmètre de ce gate.

**✅ Critère d'explication satisfait — non bloquant.**

## Comparaison aux témoins précédents + coût

| Run | Résultat | Durée | Stubs |
| --- | --- | --- | --- |
| Phase 20/21 (témoins) | 16/16 | ~89 s / ~3 min | 0 |
| 22-06 batch 1 (`4af3d823`, 2026-07-31) | 21/21 | 97 s | 0 |
| **22-06 batch 2 (`08fd14dc`, définitif)** | **21/21** | **93 s** | **0** |

**Coût OpenRouter** : ~9 appels LLM Haiku par run (grille/positionnement/satisfaction ×3 ; QCM réutilisé de session, attestation/certificat/émargement = templates sans LLM) × 2 runs ≈ **quelques centimes** — cohérent avec les témoins précédents. Usage cumulé de la clé au 2026-08-03 : 38,93 USD (depuis la Phase 16).

## Déviations pendant le gate (consignées aussi au SUMMARY 22-06)

1. **[Rule 1 — Bug env] 22 OF_* Railway polluées par des guillemets littéraux** (re-pose du 2026-07-06, classe PROD-0674 variante guillemets — la regex sanity `[^\x20-\x7E]|#| +$` ne flagge pas `"`, ASCII imprimable). Effets : footers `"START ACADEMY"`, SIRET `"95131909400011"`, contacts `"" ""` (la chaîne `""` truthy court-circuitait la cascade contact→responsable). Fix : 12 OF_* re-posées propres + 10 vides supprimées, redeploy worker, pack re-régénéré (batch 2) — footer jugé sur l'état corrigé. ⚠ Reco : ajouter la détection guillemet de tête/queue à `sanity-check-env.ts` (dette légère).
2. **Vercel non affecté** : le scan §9.1 avait `OF_ADDRESS_STREET` é à l'index 22 (= sans guillemet de tête) — les OF_* Vercel sont propres.

## Verdict proposé

Les 6 critères du runbook §3 sont **verts** (0 stub 21/21, footer OF_* propre, docs conformes, 0×404, `%PDF-` 21/21, sans filigrane worker ET Vercel synchrone), le contrôle analyse des besoins est expliqué et prouvé en base, le run est comparable aux témoins des Phases 20/21.

**Proposition : GO** (décision finale : Laurent — checkpoint Task 4 du plan 22-06 ; en cas de NO-GO → rollback §8 immédiat).

## Verdict

**GO — validé par Laurent le 2026-08-03** (checkpoint Task 4 du plan 22-06). Aucun rollback déclenché — la production reste live (emails toujours en dry-run). La Wave 3 s'ouvre : 22-07 (flip emails réels, avec arbitrage de l'envoi en attente relevé au 30/07) et 22-08 (invitations équipe, alertes).

---
*Phase 22 — Plan 22-06, Tasks 3-4 (CUT-02) — verdict consigné le 2026-08-03*
