# Quick 260813-efh — Édition acquittée des factures (OPCO/AGEFICE)

**Date :** 2026-08-13
**Branche :** cloud-migration
**Commits :** `e0b0bbe`, `09db015`, `43b6772`, `fe8455a`

## Le besoin

Laurent montait chaque dossier de remboursement OPCO/AGEFICE à la main :
ouvrir la facture, coller la mention « payé », écrire le « Fait à … le … »,
apposer son tampon et sa signature, ré-enregistrer le fichier. À chaque dossier.

## Ce qui a été livré

Un bouton **« Version acquittée (OPCO/AGEFICE) »** sur la fiche facture qui
produit le duplicata tamponné, signé et daté, prêt à joindre au dossier.

**Ce n'est pas une seconde facture.** Même numéro, même montant, aucune
écriture comptable créée : émettre deux factures pour une même prestation
doublerait le CA et se verrait aussi bien en compta qu'à l'audit. Une facture,
deux éditions du même PDF.

| | Édition apprenant | Édition acquittée |
|---|---|---|
| En-tête | `FACTURE N° …` | idem + `DUPLICATA — FACTURE ACQUITTÉE` + `Payé le … par …` |
| Échéance / IBAN / pénalités | affichés | retirés (sans objet) |
| Totaux | `Total dû` | `Réglé` + `Reste dû 0,00 €` |
| Visuels | — | tampon PAYÉ, cachet OF, signature Laurent |
| Bas de page | — | `Fait à {lieu de formation}, le {date de fin de formation}` |

## Décisions appliquées

- **D-1** Duplicata au même numéro, jamais une 2ᵉ facture.
- **D-2** Génération à la demande (bouton), pas automatique : une pièce « payé »
  ne doit pas exister avant l'encaissement.
- **D-3** Facture non soldée → on avertit sans bloquer, mais la date de
  règlement réelle devient obligatoire (Laurent encaisse parfois hors de l'app).
- **D-4** « Fait à … le … » = lieu de formation + date de **fin de formation**
  (et non le siège social ni la date du jour) — c'est ce que Laurent écrivait.
- **D-5** Tampon PAYÉ = l'image fournie par Laurent, posée en
  `mix-blend-mode: multiply` (le scan a un fond blanc opaque).
- **D-6** Clé de stockage déterministe → aucune migration Prisma, aucune clé
  transmise par le client.
- **D-7** Pas de row `Document` : le duplicata dédoublerait la facture dans
  `resolveDocs` et dans la matrice Qualiopi.

## Fichiers

| Fichier | Rôle |
|---|---|
| `apps/web/src/assets/tampon-paye.png` | Tampon fourni par Laurent (converti du JPEG) |
| `apps/web/src/lib/closure/shared-template.ts` | `loadPaidStampDataUrl()` |
| `apps/web/src/lib/invoice-template.ts` | Mode `acquitted` du gabarit |
| `apps/web/src/lib/invoice-storage.ts` | Clé déterministe (module neutre) |
| `apps/web/src/server/actions/invoices.ts` | `generateAcquittedInvoicePdf()` |
| `apps/web/src/app/api/documents-by-invoice/[id]/acquittee/route.ts` | Stream du PDF |
| `apps/web/src/components/invoices/download-acquitted-button.tsx` | Bouton + dialog |
| `apps/web/src/app/app/factures/[id]/page.tsx` | Montage du bouton |
| `apps/web/src/lib/__tests__/invoice-template.acquitted.test.ts` | 11 tests |
| `apps/web/scripts/_preview-facture-acquittee.ts` | Rejouer les 2 éditions en PDF |

## Vérification

- **Tests** : 16/16 sur le gabarit facture (11 nouveaux + les 5 AVOIR de la
  Phase 11) ; 306 tests verts sur `src/lib/__tests__/`.
- **Type-check** : `tsc --noEmit` propre. **Lint** : propre.
- **PDF témoin réel** (Gotenberg local) : les deux éditions rendues et
  relues à l'œil. L'édition apprenant est visuellement inchangée.
- **Défaut trouvé et corrigé au témoin** : posé en absolu, le tampon PAYÉ
  recouvrait la mention « TVA non applicable en vertu de l'article 261-4-4°
  du CGI ». Une mention légale obligatoire ne peut pas être masquée → tampon
  remis dans le flux (commit `fe8455a`).

## Pièges rencontrés

- Un commentaire CSS contenant des backticks fermait le template literal JS
  du bloc `STYLES` → erreur esbuild.
- `acquittedInvoiceKey` est synchrone : un fichier `'use server'` ne peut
  exporter que des fonctions async → extraite dans `lib/invoice-storage.ts`.
- `createSignedDownloadUrl` **throw** avec MinIO (local) : elle n'est
  implémentée que pour Supabase → téléchargement par route API qui streame le
  buffer, ce qui marche en local comme en cloud.

## Reste à faire

- **Non testé de bout en bout dans l'app** (clic réel sur une vraie facture) :
  la génération a été validée au niveau du rendu PDF, pas du parcours UI.
- `pdf-render.watermark.test.ts` échoue **avant** ce chantier (variables d'env
  manquantes au chargement de `pdf-render.ts`) — non lié, non corrigé ici.
- La facture groupée par sponsor est gérée dans l'action mais n'a pas été
  rendue en témoin (seul le cas mono-participant l'a été).
