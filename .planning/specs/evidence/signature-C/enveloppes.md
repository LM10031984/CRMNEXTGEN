<!-- GÉNÉRÉ par apps/web/scripts/proof-signature-lot-c.ts — ne pas éditer à la main. -->
<!-- Une preuve recopiée ne prouve que la recopie. -->

# Enveloppes — ce que chaque gabarit compose

| Fichier | Gabarit | Branché ? | Destinataire | Objet | Pièces jointes |
|---|---|---|---|---|---|
| `signature-demande-client-responsable.html` | 1. Demande de signature — bénéficiaire (responsable de l’organisation) | ✅ lot C.2c | `responsable@agence-fictive.fr` | Signature demandée — Convention — AGENCE MARTIN & FILS (2 participants) | **aucune** |
| `signature-demande-client-stagiaire.html` | 1 bis. Demande de signature — bénéficiaire (stagiaire, il signe pour lui-même) | ✅ lot C.2c | `stagiaire@exemple-fictif.fr` | Signature demandée — Dossier AGEFICE — Marie EXEMPLE | **aucune** |
| `signature-demande-of.html` | 2. « À votre tour de signer » — organisme (cas signatoryOrder = BEFORE) | ✅ lot C.2c | `signataire@of-fictif.fr` | À votre tour de signer — Convention — AGENCE MARTIN & FILS (2 participants) | **aucune** |
| `signature-relance-j3.html` | 3. Relance J+3 | ⬜ **non — lot C.3** | `responsable@agence-fictive.fr` | Rappel — Convention — AGENCE MARTIN & FILS (2 participants) attend votre signature | **aucune** |
| `signature-relance-j7.html` | 4. Relance J+7 (dernier rappel) | ⬜ **non — lot C.3** | `responsable@agence-fictive.fr` | Dernier rappel — Convention — AGENCE MARTIN & FILS (2 participants) attend votre signature | **aucune** |
| `signature-exemplaire-signe.html` | 5. « Voici votre exemplaire signé » | ⬜ **non — lot C.3** | `responsable@agence-fictive.fr` | Votre exemplaire signé — Convention — AGENCE MARTIN & FILS (2 participants) | convention-agence-martin.pdf<br>convention-agence-martin.audit-trail.pdf |

## La phrase qui nomme le destinataire

C’est elle qui porte la règle du vocabulaire (spec §3 ter). Aucune n’emploie le mot que cette règle interdit — le script refuse d’écrire si l’une le fait.

| Fichier | Phrase exacte |
|---|---|
| `signature-demande-client-responsable.html` | Vous recevez ce message en qualité de responsable de l'organisation. |
| `signature-demande-client-stagiaire.html` | Vous recevez ce message en qualité de stagiaire. |
| `signature-demande-of.html` | Vous recevez ce message en qualité de signataire de l'organisme de formation. |
| `signature-relance-j3.html` | Vous recevez ce message en qualité de responsable de l'organisation. |
| `signature-relance-j7.html` | Vous recevez ce message en qualité de responsable de l'organisation. |
| `signature-exemplaire-signe.html` | Vous recevez ce message en qualité de responsable de l'organisation. |
