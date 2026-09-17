# Un rattachement se termine, un autre commence — proposition

**17/09/2026. Proposition seulement : rien n'est écrit.** À trancher par Laurent.
Constat d'appui : `260917-lien-juridique-releve.md` §1.

## Le modèle

**Pas de nouvelle colonne pour les dates.** `LegalLink.startDate` et `endDate`
existent (`schema.prisma:330-331`). En base, 0 fin et 4 débuts techniques.

- **Règle.** Un lien est *actif* à la date D si `startDate` est vide ou ≤ D, **et**
  `endDate` est vide ou ≥ D. Vide veut dire « depuis toujours » et « sans fin ». Les
  578 liens existants restent donc actifs à toute date : **aucun rétro-remplissage,
  aucun changement de comportement** tant que personne ne termine un lien.
- **Date de référence : le début de la session**, jamais aujourd'hui. Si un
  changement tombe **pendant** une session, on refuse et on le signale : ni l'ancien
  ni le nouveau rôle n'est vrai sur toute la durée.
- **Un seul module pur** : « le lien actif vers telle organisation à telle date ».
  Il remplace :
  - les **12** `legalLinks.find(organizationId === sponsorOrgId)` ;
  - le lien principal de `build-context.ts` et `worker.ts` : l'entreprise imprimée
    devient le lien **vers le payeur**, actif à la date, avec le principal en repli ;
  - `OU_AGEFICE` / `estEligibleAgefice`, `agefice-generator.ts:141-149`,
    `agefice-attendance-generator.ts:116-123`.
- **Changer de rôle, c'est une transaction** : `endDate` sur l'ancien lien, création
  du nouveau, `AuditLog` avant/après. L'ancien lien ne disparaît jamais.

## Ce que ça coûte

- Un module pur et ses tests. Une vingtaine de sites d'appel à rebrancher, dont les
  12 `find`.
- `OU_AGEFICE` est un filtre Prisma : il ne sait pas comparer une date de lien à la
  date de *la* session. Il faut filtrer en mémoire après chargement, ou en deux
  requêtes. Plusieurs compteurs et générateurs s'appuient dessus.
- `@@unique([personId, organizationId, role])` interdit **deux périodes du même rôle
  dans la même organisation** (agent → salariée → agent chez Century 21).
  `createLegalLink` repose sur cette clé (`legal-links.ts:56-63`). Pas bloquant pour
  Katia (rôles distincts), mais **une migration** le jour où l'aller-retour existe.
- L'éditeur de liens doit montrer les périodes, liens terminés compris.

## Ce que ça casse — l'ordre est imposé

1. **Le code avant la donnée.** Poser un second lien vers Century 21 avant que les
   lecteurs résolvent par date rend le rôle lu arbitraire (premier `find`).
2. **Les dates ne règlent pas le dossier AGEFICE de SES-0116.** Le lien EI de Katia
   n'a pas de fin, donc il reste actif en novembre, et `OU_AGEFICE` le trouvera
   encore. Décision métier à part : **un lien EI rend-il éligible une inscription
   payée par une société qui emploie l'apprenante à cette date ?** Aujourd'hui oui,
   pour 15 inscriptions et 6 demandes déjà générées.
3. **Une fin posée dans le passé réécrit ce qu'on régénère** pour les sessions
   antérieures. D'où le refus ci-dessous.
4. **Les synchros SmartOF** déduisent le rôle du statut libre et créent des liens
   sans dates. Elles continueraient d'écraser le rôle faute de savoir terminer un lien.

---

## L'édition manquante — `updateLegalLink`

- Modifie `function`, `startDate` et `endDate` seulement ; **jamais le rôle ni
  l'organisation**. Changer de rôle passe par « terminer + créer », dans une seule
  transaction avec `AuditLog`.
- Affordance dans `legal-link-editor.tsx` : « Terminer ce rattachement au… », puis
  « Nouveau rattachement dans la même organisation à partir du… », prérempli.
- Les liens terminés restent visibles, grisés, avec leurs dates.

## Ce qu'un changement de rôle doit refuser

- Toute date de début ou de fin qui **change le lien actif à la date d'une session**
  dont une pièce est engagée : convention ou contrat signé ou parti en signature
  (`status`, `signedPdfUrl`, `conventionSigned`), dossier financeur non brouillon, ou
  facture émise.
- Mêmes statuts que `verrou-financeur.ts:72-77`, **réutilisé, pas recopié**.
- Le message nomme la session et la pièce. Aucune levée par confirmation : on
  corrige la pièce d'abord.

## `deleteLegalLink` — ce qu'il doit refuser

- Refuser si le lien a **porté une inscription** : organisation payeuse d'une
  inscription de la personne, ou lien EI d'une inscription AGEFICE ou d'un profil
  AGEFICE avec attestation CFP.
- Dans ce cas, proposer « terminer ».
- Sinon supprimer, avec `AuditLog` (instantané complet du lien) **dans la même
  transaction**. Aujourd'hui : ni garde, ni journal (`legal-links.ts:93-108`).
