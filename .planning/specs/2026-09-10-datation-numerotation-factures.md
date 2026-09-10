# Spec — Datation et numérotation des factures : rétablir la chronologie

> **Date** : 2026-09-10 · **Auteur** : Laurent + Claude (session Cowork)
> **Statut** : **ARBITRÉE le 10/09/2026.** Lot A livré et mesuré. Lot C **fermé** — pas de régularisation de l'historique, décision de Laurent sans consultation de l'expert-comptable (§8). **Reste le lot B à livrer.**
> **Pour** : Claude Code, dépôt QualiOF. À livrer avec ou juste avant le lot 2 de `/facture-electronique` (le Factur-X fige la date d'émission dans un XML transmis à une plateforme d'État : mieux vaut que la règle soit juste avant).
> **À relire avant** : `apps/web/src/lib/invoice-dates.ts` (la règle actuelle et son effet de bord, tous deux documentés dans le fichier), `lib/numbering.ts`, `.planning/specs/2026-09-02-facturation-electronique-pa.md`.

---

## 1. Le symptôme, tel que Laurent le décrit

« Quand je demande la facture, elle s'émet à la date de fin de formation avec un numéro, mais plus rien n'est cohérent : comme je passe les formations en payées et facturées à la main, ça décale les dates de facture et les numéros ne se suivent pas. »

Traduction : le **numéro** est attribué à l'instant du clic (séquence `max + 1`), la **date** est celle de la fin de session. Les deux horloges ne sont pas la même. Facturer en septembre trois sessions de juin produit `FAC-000021` daté du 12 juin juste après `FAC-000020` daté du 3 septembre.

## 2. La règle actuelle, et pourquoi elle a été choisie

`resolveInvoiceIssueDate(sessionEndDate, now)` → la fin de prestation, sauf si elle est dans le futur (auquel cas `now`). Décision de Laurent du 13/08/2026, motivée par : c'est ce qu'il inscrivait à la main, et ça évitait deux dates contradictoires sur la pièce acquittée (« Date » en haut, « Fait à … le … » en bas). `dueDate` est, lui, correctement compté depuis l'émission réelle — sinon une facture rattrapée naîtrait en retard et déclencherait le cron de relances.

**L'effet de bord était connu et assumé** : le commentaire du fichier le dit noir sur blanc (« facturer en août une session de juin produit une facture antérieure à la précédente, donc une numérotation qui n'est plus dans l'ordre chronologique »). Ce que la spec du 13/08 n'avait pas pesé, c'est le coût de conformité de cet effet de bord.

## 3. Ce que la règle doit être

Deux dates distinctes, qui ne doivent plus être confondues :

| Notion | Ce que c'est | Où elle vit |
|---|---|---|
| **Date d'émission** (`Invoice.issueDate`) | Le jour où la facture est créée et devient une pièce comptable. C'est elle qui commande la numérotation, le rattachement à l'exercice et le point de départ du délai de paiement. | En-tête de la facture, « Date » |
| **Période d'exécution de la prestation** | Les dates réelles de la formation. Ce que le financeur, la convention, l'attestation et l'émargement décrivent. | **Sur la ligne de facture** (« Formation « … » du 10 au 12 juin 2026 ») et dans le bloc session |

**Règle cible** : `issueDate = date de création réelle`. La période de formation devient une mention portée par `InvoiceLine.label` (le socle du lot 1 la rend enfin possible : avant, `Invoice` n'avait pas de lignes — c'est précisément pour ça que la date d'émission avait été détournée pour porter l'information de période).

Conséquence heureuse : la numérotation redevient chronologique par construction, sans qu'il faille l'y forcer. Et la contradiction « Date » / « Fait à … le … » qui motivait la règle de 13/08 disparaît aussi, puisque les deux valent alors le jour d'émission.

**Garde à conserver** : la facturation à l'inscription (wizard étape 5, session pas encore terminée) fonctionne déjà — `issueDate = aujourd'hui` — et la ligne portera alors la période prévisionnelle.

## 4. Le contrôle qui manque

Ajouter une invariante testée, dans le même esprit que `amountHT === Σ lines.totalHT` du lot 1 :

> Pour un tenant et un préfixe donnés, l'ordre des numéros suit l'ordre des `issueDate` : `number(n) > number(n-1)` ⟹ `issueDate(n) >= issueDate(n-1)`.

- Test unitaire sur la fonction de numérotation.
- Script d'inventaire `scripts/audit-invoice-chronology.ts` (lecture seule, comme `audit-pricing-overrides.ts`) : liste les ruptures existantes, avec numéro, date d'émission, date de création et écart en jours. **C'est lui qui produit l'état des lieux du §5** — la sandbox Cowork ne peut pas interroger Supabase, seul le poste de Laurent le peut.
- Alerte douce dans l'UI si une émission créerait une rupture (ne bloque pas, informe).

## 5. État des lieux — MESURÉ le 10/09/2026

Parc au 10/09/2026 : **31 pièces** (30 factures pour 28 427,43 € + 1 avoir à −336,00 €), toutes émises avant ce correctif.

`audit-invoice-chronology.ts` lancé sur la production le 10/09/2026 : **5 ruptures sur 31 pièces.**

| Numéro | Statut | Émission | Créée le | Précédent | Sa date | Recul |
|---|---|---|---|---|---|---|
| FAC-000021 | PAID | 23/04/2026 | 04/09/2026 | FAC-000020 | 12/08/2026 | 111 j |
| FAC-000024 | PAID | 23/04/2026 | 07/09/2026 | FAC-000023 | 10/06/2026 | 48 j |
| FAC-000025 | ISSUED | 14/04/2026 | 07/09/2026 | FAC-000024 | 23/04/2026 | 9 j |
| FAC-000027 | ISSUED | 10/04/2026 | 07/09/2026 | FAC-000026 | 14/04/2026 | 4 j |
| FAC-000030 | PAID | 26/02/2026 | 07/09/2026 | FAC-000029 | 10/04/2026 | 43 j |

Séquence `AVO-` : 0 rupture. 0 pièce sans date, 0 hors format, numérotation continue et sans trou.

**Cause unique** : les cinq pièces ont toutes été créées les **4 ou 7 septembre 2026**, et elles seules — le rattrapage de mise en service de l'outil sur des formations réalisées entre février et juin. Ce n'est pas un défaut diffus, c'est un événement daté.

Rapport brut conservé : `.planning/docs/comptabilite/audit-chronologie-2026-09-10.txt`.

## 6. ~~La question pour Lagean~~ — NON POSÉE, décision prise en interne

**La question n'a pas été posée.** Laurent a tranché le 10/09/2026 au vu du §5 : cause unique et
datée, aucun montant en cause, TVA non concernée (exonération art. 261-4-4°), même exercice,
numérotation continue. Rien à arbitrer par un tiers.

Ce qui remplace la question : une **note opposable**, écrite et classée, qu'on produit si
quelqu'un — expert-comptable, administration, auditeur Qualiopi — pose la question un jour.

> `.planning/docs/comptabilite/note-chronologie-factures-2026.md`
> (le constat, la cause, ce qui n'est pas en cause, la règle corrigée, et pourquoi le passé
> n'est pas réécrit) + `audit-chronologie-2026-09-10.txt` en pièce jointe.

**Rien ne se réécrit.** Une facture émise ne se modifie pas (code de commerce) : la seule
correction légale serait avoir + refacturation, soit dix pièces pour déplacer une date sans
enjeu financier. Le remède serait pire que le mal. Jamais d'`UPDATE`, dans aucun cas.

## 7. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| **A — Mesurer** | `scripts/audit-invoice-chronology.ts` (lecture seule) + rapport joint au mail Lagean. Aucun changement de comportement. | rien |
| **B — Corriger pour l'avenir** | `resolveInvoiceIssueDate` renvoie `now` ; la période de formation passe dans `InvoiceLine.label` (et dans le bloc session du gabarit) ; test d'invariante chronologique ; alerte douce UI ; commentaire d'en-tête de `invoice-dates.ts` réécrit (la décision du 13/08 est révisée, pas oubliée — dire pourquoi). | Lot A + lot 1 mergé (les lignes existent) |
| ~~**C — Historique**~~ | **FERMÉ le 10/09/2026 par Laurent, sans passer par l'expert-comptable — pas reporté, fermé.** Aucune réécriture des 5 pièces en rupture. Motif : rien à corriger au fond (montants exacts, TVA non concernée par l'exonération 261-4-4°, même exercice, numérotation continue, chaque date portée correspond à une prestation réellement exécutée). La régularisation coûterait 10 pièces comptables — 5 avoirs + 5 refacturations — pour déplacer une date sans enjeu financier. Trace : `.planning/docs/comptabilite/note-chronologie-factures-2026.md` + son inventaire joint. | — |

Gates habituelles (`/quick`, `/livraison`). Le lot B touche le gabarit de facture : regarder un PDF produit, pas seulement les tests.

## 8. Décisions

**~~D-1 (Lagean)~~ — TRANCHÉE le 10/09/2026 par Laurent, sans consultation de l'expert-comptable.**
Pas de régularisation de l'historique : le lot C est **fermé**, pas reporté. Le raisonnement
tient en une phrase — il n'y a rien à corriger au fond, et la seule voie légale de correction
(avoir + refacturation, le code de commerce interdisant de modifier une pièce émise) créerait
dix pièces pour déplacer une date sans enjeu de montant ni de TVA.

La trace opposable est écrite : `.planning/docs/comptabilite/note-chronologie-factures-2026.md`,
avec l'inventaire du 10/09/2026 en pièce jointe. C'est elle qu'on produit si la question est posée.

**Plus aucune décision ouverte sur cette spec.** Reste le lot B à livrer.
