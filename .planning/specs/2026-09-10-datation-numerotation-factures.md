# Spec — Datation et numérotation des factures : rétablir la chronologie

> **Date** : 2026-09-10 · **Auteur** : Laurent + Claude (session Cowork)
> **Statut** : SPEC À ARBITRER — une question à l'expert-comptable (Lagean) avant d'implémenter le volet « historique ».
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

## 5. État des lieux — à produire avant de décider de l'historique

Parc au 10/09/2026 : **31 factures** (30 factures pour 28 427,43 € + 1 avoir à −336,00 €), toutes émises avant ce correctif. Le nombre exact de ruptures chronologiques n'est pas encore mesuré : lancer `audit-invoice-chronology.ts` sur la prod et joindre le rapport à la question posée à l'expert-comptable.

## 6. La question pour Lagean (à poser telle quelle)

> « Nos factures de formation ont été datées de la fin de la prestation et non du jour de leur établissement, ce qui rend notre numérotation non chronologique sur l'exercice en cours (X ruptures sur 31 pièces, rapport joint). Nous corrigeons la règle pour l'avenir : date d'émission réelle, période de formation mentionnée sur la ligne. Pour le passé : faut-il régulariser (et par quel procédé — note explicative annexée au journal des ventes, avoir + refacturation, autre ?), ou la mention au dossier suffit-elle, étant entendu qu'aucun montant n'est en cause et que la TVA n'est pas concernée (exonération art. 261-4-4°a) ? »

**Rien ne se réécrit avant leur réponse.** Une facture émise ne se modifie pas (code de commerce) : la correction du passé, si elle est jugée nécessaire, passe par un procédé qu'ils désigneront, jamais par un `UPDATE`.

## 7. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| **A — Mesurer** | `scripts/audit-invoice-chronology.ts` (lecture seule) + rapport joint au mail Lagean. Aucun changement de comportement. | rien |
| **B — Corriger pour l'avenir** | `resolveInvoiceIssueDate` renvoie `now` ; la période de formation passe dans `InvoiceLine.label` (et dans le bloc session du gabarit) ; test d'invariante chronologique ; alerte douce UI ; commentaire d'en-tête de `invoice-dates.ts` réécrit (la décision du 13/08 est révisée, pas oubliée — dire pourquoi). | Lot A + lot 1 mergé (les lignes existent) |
| **C — Historique** | Selon la réponse de Lagean uniquement. | Réponse écrite de Lagean |

Gates habituelles (`/quick`, `/livraison`). Le lot B touche le gabarit de facture : regarder un PDF produit, pas seulement les tests.

## 8. Décision ouverte

**D-1 (Lagean)** : régularisation de l'historique — procédé et nécessité. Tant qu'elle n'est pas tranchée, le lot C n'existe pas.
