# Constats joints à la PR C (14/09/2026) — aucun correctif

## ④ Le garde d'empreinte a-t-il joué ? — **NON, et rien n'aurait arrêté l'envoi**

Question posée : le PDF lu par Laurent est antérieur au `pricingJson` actuel.
Le garde `sourceFingerprint` a-t-il joué, et **qu'est-ce qui aurait empêché
d'envoyer ce PDF au client** ?

### Le garde existe

`propositions.ts:620-626` — dans `buildWorkspace` :

```ts
if (compareSourceFingerprint(proposal.sourceFingerprint, currentFingerprint) === 'stale'
    && proposal.pdfKey) {
  blockers.push('Le PDF ne correspond plus aux données : régénérez-le avant de l'envoyer.');
}
```

### Il ne protège qu'UNE porte sur TROIS

| Chemin de sortie | Contrôle | Empreinte vérifiée ? |
|---|---|---|
| `sendProposalByEmail` (`:1588`) | `if (ws.blockers.length > 0) return` | **OUI** |
| `issueProposalPublicLink` (`:1104`) | `reviewedAt` **seulement** | **NON** |
| `GET /api/documents/[id]` | ni empreinte, ni proposition, ni blockers | **NON** |

### Et le message du seul chemin gardé invite au contournement

`sendProposalByEmail`, quand le lead n'a pas d'email :

> « …ou **remettez la proposition par votre propre canal**. »

Le seul chemin qui vérifie l'empreinte renvoie explicitement vers un chemin qui
ne la vérifie pas. Laurent télécharge le PDF depuis `/api/documents/[id]`, et
rien — ni statut, ni garde, ni avertissement — ne lui dit que ce fichier ne
correspond plus aux données.

### État réel de PROP-0001 en prod (lecture du 14/09/2026)

```
status=PRETE · relue=true · pdf=true · lien_public=false · sentAt=null
```

Elle est **relue, porteuse d'un PDF, et prête à partir**. Le PDF sur disque
décrit un chiffrage antérieur au `updatedAt` de 13:21.

### Verdict

**C'est un défaut de la même famille que les autres : un document périmé qui a
l'air valide.** Il prend son rang **après B**, comme demandé. Aucun correctif ici.

---

## ⑤ Recensement — quels tests vérifient un DOCUMENT, lesquels un objet

Motif employé, le 14/09/2026 :

- population : toute fonction `export function render*Html|Pdf` sous
  `apps/web/src/lib`, **hors 4 pieds de page** (`render*FooterHtml`) qui ne sont
  pas des documents autonomes ;
- couverture : le nom de la fonction apparaît dans un `*.test.ts(x)` quelconque
  de `apps/web/src`.

**Population : 26 documents.**

### VÉRIFIÉS sur le HTML rendu — 10

`renderAgeficeAttendanceHtml` · `renderAgeficeHtml` · `renderAuditHtml` ·
`renderConventionHtml` · `renderConvocationHtml` · `renderDerouleHtml` ·
`renderEmargementHtml` · `renderInvoiceHtml` · `renderPropositionHtml` ·
`renderVeilleAuditHtml`

### AUCUN test ne rend ce document — 16

| Document | Fichier | Destinataire |
|---|---|---|
| `renderQuoteHtml` | `lib/quote-template.ts` | **client + financeur** (pièce contractuelle) |
| `renderProgrammeHtml` | `lib/programme-template.ts` | **financeur** (Qualiopi) |
| `renderAttestationHtml` | `closure/attestation-template.ts` | **stagiaire + financeur** |
| `renderCertificatHtml` | `closure/certificat-template.ts` | **stagiaire + financeur** |
| `renderLegalDocHtml` | `lib/legal-docs-template.ts` | client |
| `renderAnalyseBesoinHtml` | `closure/analyse-besoin-template.ts` | Qualiopi |
| `renderQcmHtml` | `closure/qcm-template.ts` | Qualiopi |
| `renderPositionnementHtml` | `closure/positionnement-template.ts` | Qualiopi |
| `renderGrilleObsSessionHtml` | `closure/grille-obs-session-template.ts` | Qualiopi |
| `renderGrilleObservationHtml` | `closure/grille-observation-template.ts` | Qualiopi |
| `renderChecklistFormationHtml` | `closure/checklist-formation-template.ts` | interne |
| `renderSatisfactionChaudHtml` | `closure/satisfaction-chaud-template.ts` | Qualiopi |
| `renderSatisfactionFroidHtml` | `closure/satisfaction-froid-template.ts` | Qualiopi |
| `renderSatisfactionSessionHtml` | `closure/satisfaction-session-template.ts` | Qualiopi |
| `renderProductDerouleHtml` | `closure/deroule-template.ts` | Qualiopi |
| `renderReminderHtml` | `lib/preinscription-reminder-template.ts` | prospect |

### Verdict

**La liste est longue — 16 sur 26, soit 62 %.** Ce n'est pas un solde, c'est un
chantier à part.

Trois précisions qui pèsent sur sa priorité :

1. **Ces documents ne sont pas sans tests** — plusieurs ont des tests sur leurs
   fonctions de préparation de données. C'est exactement ce que §4 quinquies
   décrit : **un test sur l'objet ne prouve rien sur le document**.
2. **Le devis (`renderQuoteHtml`) est le plus exposé** : pièce contractuelle,
   chiffrée, remise au client ET au financeur, et aucun test ne le rend.
3. **Neuf des seize sont des documents du pack Qualiopi**, ceux-là mêmes que
   l'outil existe pour produire sans ressaisie.

**Proposition d'amorce, à arbitrer** : ne pas ouvrir les seize. Commencer par
`renderQuoteHtml` et `renderProgrammeHtml` — les deux qui portent des chiffres
et partent au financeur — et poser pour eux le contrôle minimal : le document
rendu contient les montants et les mentions qu'il annonce.
