---
phase: quick-260813-efh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/assets/tampon-paye.png
  - apps/web/src/lib/closure/shared-template.ts
  - apps/web/src/lib/invoice-template.ts
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/app/api/documents-by-invoice/[id]/acquittee/route.ts
  - apps/web/src/components/invoices/download-acquitted-button.tsx
  - apps/web/src/app/app/factures/[id]/page.tsx
  - apps/web/src/lib/__tests__/invoice-template.acquitted.test.ts
autonomous: true
requirements:
  - OPCO-AGEFICE-PIECE-ACQUITTEE
must_haves:
  truths:
    - "L'édition acquittée porte le MÊME numéro que la facture d'origine — jamais un nouveau numéro (pas de double CA)"
    - "L'édition acquittée affiche le tampon PAYÉ, le tampon Start Academy et la signature de Laurent Marx sans retouche manuelle"
    - "L'édition acquittée affiche « Fait à {lieu de la formation}, le {date de FIN de formation} » — pas le siège, pas la date du jour"
    - "L'édition acquittée n'affiche NI IBAN/BIC, NI date d'échéance, NI paragraphe pénalités de recouvrement"
    - "L'édition apprenant (mode normal) est strictement inchangée — gabarit officiel 12/08 préservé, mode AVOIR intact"
    - "Sur une facture non soldée, la génération exige une date de paiement explicite (paidAtOverride), sinon elle est refusée"
    - "Le téléchargement fonctionne en local (MinIO) comme en cloud (Supabase) — pas d'URL signée qui casse en local"
  artifacts:
    - path: "apps/web/src/lib/invoice-template.ts"
      provides: "Mode acquitté du gabarit facture (duplicata OPCO/AGEFICE)"
      contains: "acquitted"
    - path: "apps/web/src/server/actions/invoices.ts"
      provides: "Server action de génération du duplicata acquitté, scopée tenantId"
      contains: "generateAcquittedInvoicePdf"
    - path: "apps/web/src/components/invoices/download-acquitted-button.tsx"
      provides: "Bouton fiche facture + dialog de confirmation si non soldée"
      contains: "generateAcquittedInvoicePdf"
    - path: "apps/web/src/app/api/documents-by-invoice/[id]/acquittee/route.ts"
      provides: "Stream du PDF acquitté via clé déterministe (pas d'IDOR, pas de signed URL)"
      contains: "acquittee"
  key_links:
    - from: "apps/web/src/lib/invoice-template.ts"
      to: "apps/web/src/lib/closure/shared-template.ts"
      via: "import { loadPaidStampDataUrl, loadStampDataUrl, loadSignatureDataUrl }"
      pattern: "loadPaidStampDataUrl"
    - from: "apps/web/src/server/actions/invoices.ts"
      to: "apps/web/src/lib/invoice-template.ts"
      via: "renderInvoiceHtml({ ..., acquitted })"
      pattern: "acquitted:"
---

<objective>
Supprimer le travail manuel de Laurent sur chaque dossier OPCO/AGEFICE : aujourd'hui il ouvre la facture, colle à la main la mention « payé », le « Fait à … le … », son tampon et sa signature, puis ré-enregistre le fichier.

Purpose: produire en 1 clic la **pièce acquittée** que l'AGEFICE/l'OPCO exige au remboursement, sans jamais créer une seconde facture (double CA interdit en compta). Une facture, deux éditions du même PDF, même numéro.

Output: bouton « Version acquittée (OPCO/AGEFICE) » sur la fiche facture qui ouvre un duplicata tamponné PAYÉ, signé, daté du lieu et de la fin de formation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<decisions>
Décisions verrouillées avec Laurent (13/08) — ne pas re-débattre :

- **D-1 — Duplicata, pas 2ᵉ facture.** Même numéro. Émettre deux factures pour une même prestation doublerait le CA et se verrait en compta comme à l'audit.
- **D-2 — Déclenchement à la demande.** Bouton sur la fiche facture, pas de génération automatique (sinon une pièce « payé » existerait avant même l'encaissement).
- **D-3 — Garde-fou souple.** Si la facture n'est pas au statut PAID, on n'interdit pas : on avertit et on exige la saisie de la date de paiement réelle.
- **D-4 — « Fait à … le … » = lieu de la formation + date de FIN de formation** (choix explicite de Laurent, c'est ce qu'il écrit à la main), et non le siège social ni la date du jour.
- **D-5 — Tampon PAYÉ = l'image fournie par Laurent** (`Tampon Payé.jpeg`, rouge, case cochée), pas une mention typographique. JPEG à fond blanc opaque → posé en `mix-blend-mode: multiply` pour ne pas imprimer de pavé blanc par-dessus le tableau.
- **D-6 — Pas de migration Prisma en v1.** La clé de stockage est déterministe (`factures/{number}-acquittee.pdf`), donc la route de téléchargement la recalcule depuis la facture : aucune colonne à ajouter, aucun paramètre client à faire confiance (pas d'IDOR).
- **D-7 — Pas de row `Document`.** Le duplicata ne doit pas apparaître une 2ᵉ fois dans `resolveDocs` / la matrice Qualiopi.
</decisions>

<tasks>

## Task 1 — Asset + helper tampon PAYÉ

files:
  - apps/web/src/assets/tampon-paye.png
  - apps/web/src/lib/closure/shared-template.ts

action:
  - Asset `tampon-paye.png` (540×265, converti du JPEG fourni par Laurent) déposé dans `src/assets/` — déjà en place.
  - Ajouter `loadPaidStampDataUrl(tenantId?)` suivant exactement le pattern de `loadStampDataUrl` : `loadAssetDataUrl(['tampon-paye.png'], tenantId)`, donc surchargeable par tenant via `public/of-assets/{tenantId}/tampon-paye.png`.
  - Documenter en JSDoc le fond blanc opaque et l'obligation du `mix-blend-mode: multiply` côté template.

verify: `rg -n "loadPaidStampDataUrl" apps/web/src/lib/closure/shared-template.ts`
done: le helper existe et résout l'asset bundled.

## Task 2 — Mode acquitté du gabarit facture

files:
  - apps/web/src/lib/invoice-template.ts
  - apps/web/src/lib/__tests__/invoice-template.acquitted.test.ts

action:
  - Étendre `InvoiceData` avec `acquitted?: { paidAt: Date; lieu: string | null; date: Date }`.
  - Quand `acquitted` est présent :
    - bandeau « DUPLICATA — FACTURE ACQUITTÉE » sous le `FACTURE N° {number}` (numéro inchangé) ;
    - ligne « Payé le {paidAt} par {paymentMethod} » ;
    - masquer l'encadré « Coordonnées bancaires », la ligne « Date d'échéance » et le bloc pénalités ;
    - totaux : `Total dû` devient `Réglé` = montant TTC, plus une ligne `Reste dû` = 0,00 € ;
    - tampon PAYÉ posé près des totaux, légère rotation, `mix-blend-mode: multiply` ;
    - bloc bas : « Fait à {lieu}, le {date} » + tampon Start Academy + signature Laurent superposés (`page-break-inside: avoid`).
  - **Non-régression stricte** : sans `acquitted`, le HTML produit doit être identique à aujourd'hui (gabarit 12/08 + mode AVOIR).
  - Tests Vitest dédiés : présence DUPLICATA/ACQUITTÉE, « Fait à », lieu, date de fin, même numéro ; absence IBAN / « Date d'échéance » / pénalités ; et un test de non-régression du mode normal.

verify: `pnpm --filter @qualiof/web test -- invoice-template`
done: nouveaux tests verts ET `invoice-template.credit-note.test.ts` toujours vert.

## Task 3 — Server action + route de téléchargement

files:
  - apps/web/src/server/actions/invoices.ts
  - apps/web/src/app/api/documents-by-invoice/[id]/acquittee/route.ts

action:
  - `generateAcquittedInvoicePdf({ invoiceId, paidAtOverride? })` en **delta** dans `invoices.ts` (ne jamais réécrire le fichier entier — collision de snapshot connue du 12/08) :
    - `requireRole(['ADMIN','MANAGER','COMPTABLE'])`, lookup `findFirst({ where: { id, tenantId } })` ;
    - refus si `CANCELLED`/`DRAFT`/`CREDIT_NOTE` ; si statut ≠ `PAID` et pas de `paidAtOverride` → `{ ok:false, error }` explicite « facture non soldée » ;
    - recharge participant/session pour `composeLieu(session.location)` et `session.endDate` ; gère le cas facture groupée (`sessionId` + `participantIds`) ;
    - reconstruit le même `InvoiceData` que la facture d'origine + `acquitted` ;
    - `renderHtmlToPdf(..., { footerHtml: renderInvoiceFooterHtml(...) })` — footer HTML, jamais footer natif Gotenberg ;
    - upload clé déterministe `factures/{number}-acquittee.pdf` ; **pas** de row `Document` ; `logInvoiceEvent` pour la traçabilité ;
    - retourne `{ ok: true }`.
  - Route `GET /api/documents-by-invoice/[id]/acquittee` calquée sur la route existante : auth, lookup scopé tenantId, recalcule la clé depuis `invoice.number`, `downloadFile` + stream, `Content-Disposition: inline; filename="{number}-acquittee.pdf"`, 404 si absente.

verify: `pnpm --filter @qualiof/web exec tsc --noEmit`
done: type-check propre, action et route en place.

## Task 4 — Bouton fiche facture

files:
  - apps/web/src/components/invoices/download-acquitted-button.tsx
  - apps/web/src/app/app/factures/[id]/page.tsx

action:
  - Composant client calqué sur `send-reminder-button.tsx` (Radix Dialog, `sonner`, `useTransition`).
  - Facture soldée → clic direct : action puis `window.open('/api/documents-by-invoice/{id}/acquittee')`.
  - Facture non soldée → dialog d'avertissement + champ date de paiement réelle obligatoire avant génération (D-3).
  - Masqué sur AVOIR / DRAFT / CANCELLED.
  - Monté dans la section actions de la fiche facture, à côté de la relance et de l'avoir.

verify: `pnpm --filter @qualiof/web exec tsc --noEmit && pnpm --filter @qualiof/web lint`
done: bouton présent sur la fiche, type-check et lint propres.

</tasks>

<pitfalls>
- `createSignedDownloadUrl` **lève une exception en MinIO local** → interdit ici ; passer par la route API qui stream le buffer (pattern déjà retenu par le projet).
- `invoices.ts` a été réécrit par un audit le 12/08 → travailler en **delta ciblé**, jamais en réécriture complète.
- Branche courante `cloud-migration`, Phase 22 en cours → ne toucher à aucun fichier de la Phase 22.
- Toute server action doit rester scopée `tenantId`.
- Le footer PDF vit dans le body HTML, jamais en footer natif Gotenberg.
</pitfalls>
