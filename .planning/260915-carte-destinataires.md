# Qui reçoit quoi — carte des destinataires

**15/09/2026 — deuxième tour. Trois arbitrages rendus, deux questions ouvertes.**
À figer en **§9.6**, dans *Les sorties documentaires* (pointeur confirmé).

---

# Partie 1 — Le balayage des accroches qui mélangent les deux unités

Motif : tout fichier de `apps/web/src` contenant à la fois « conventionn » et
« sur site » / « sur place ». **14 fichiers** sortent. Onze sont des **moteurs**
(`composer`, `pricing`, `quotes`, `builder`, `creneaux`, `financement/types`) ou
des **écrans internes** (`/app/campagnes`, `funding-synthesis`,
`proposal-pricing-form`) : ils portent des VALEURS, pas une accroche client.

**Trois rendent une phrase à un destinataire.** Les voici toutes les trois.

| # | Pièce | Ce qu'elle dit | Verdict |
|---|---|---|---|
| 1 | **Programme composé** `composed-programme.ts` | « Durée : 48 h conventionnées (24 h sur site, co-animation 2 formateurs) » + chaque demi-journée titrée « 4 h sur site (8 h conventionnées) » | ✅ **APPLIQUÉ** — tranché par toi |
| 2 | **Rapport d'audit** `audit-template.ts:667‑675` | Trois tuiles en page financement : « Volume proposé / 6 demi-journées / 24 h sur site », « Heures conventionnées / 48 h / *La valeur portée sur la convention, l'émargement et le dossier financeur* » | ✅ **GARDÉE** — tranché : page d'argent, là où le dirigeant VEUT comprendre le compte |
| 3 | **Devis** `quotes.ts:84‑86` | Libellé de ligne : « … — 6 demi-journées de 4 h sur site, 3 participants, 48 h conventionnées par participant » | ✅ **GARDÉE** — tranché : pièce CONTRACTUELLE |

### Pourquoi je propose de garder les deux

Ton critère était : *« il rencontre les heures dans la PROPOSITION, expliquées,
là où on parle d'argent. »* Les deux y répondent :

- l'**audit** ne les montre que dans sa **page financement**, la dernière, et la
  tuile **nomme la valeur et ses surfaces** — c'est la phrase la plus explicite
  du dépôt sur la ligne rouge §8.1 ;
- le **devis** est la pièce d'argent par excellence : la ligne dit ce qui est
  facturé et sur quelle base. Une quantité sans son unité y serait pire
  qu'ailleurs.

**Le doute sur le devis est LEVÉ** (Laurent, 15/09) : il est **contractuel**,
donc il garde les heures conventionnées. Le raisonnement qui portait le doute
est celui qui le tranche — il naît après acceptation (D-4) et sert d'assiette à
la facture, et **une pièce qui fonde une facture porte l'unité qui fonde le
remboursement**. Ne pas y toucher.

### Ce que le balayage a aussi montré — un précédent qui te donne raison

`creneaux.ts` distingue **déjà** les deux lectures, et les nomme :

```ts
decrireDureeProduitParticipant()  // « 24 h sur site »          → /rdv/[token], PUBLIC
decrireDureeProduit()             // « … · 48 h conventionnées » → /app/campagnes, INTERNE
```

Le motif existait donc déjà, appliqué une fois, sans être écrit nulle part.
C'est exactement la carte qui manquait : **la règle était dans une paire de
fonctions au lieu d'être dans la spec.**

---

# Partie 2 — La carte

## Le principe, en tête de section

> **Le vocabulaire permis sur une pièce est décidé par son DESTINATAIRE, pas par
> son contenu.**

Deux erreurs de suite, cette semaine, sont venues de la croyance qu'un document
« sérieux » va au financeur. Le devis n'y va pas. Le programme composé non plus.

## Deux règles, deux colonnes — et surtout pas une seule

**L'auditeur Qualiopi n'est PAS un destinataire** (tranché, 15/09). Il ne reçoit
rien : il **consulte** ce qui a été produit. En faire une colonne de
destinataires mélangerait deux règles qui ne se ressemblent que de loin :

| | Ce que ça décide |
|---|---|
| **Destinataire** | à qui la pièce est REMISE — donc quel vocabulaire y est permis |
| **Opposable en contrôle** | ce qui doit TENIR si un auditeur l'ouvre — donc quelles mentions y sont obligatoires |

Une pièce peut être opposable sans être remise à personne (l'émargement archivé),
et remise sans être opposable (le rapport d'audit commercial). **Les mêler
produirait exactement l'erreur qu'on répare** : appliquer à une pièce client des
contraintes d'indicateur.

## La carte

`DIR` dirigeant · `PART` participant · `FIN` financeur · `INT` interne.
**⚖** = opposable en contrôle Qualiopi.

| Document | Destinataires | ⚖ | Ce que le code sait | Confiance |
|---|---|:-:|---|---|
| **Rapport d'audit** (`DIAGNOSTIC_AUDIT`) | DIR | | Spec §9.2 : remis en R2, ≥ 15 pages, valorisé 3 000 €. Aucun envoi financeur | ✅ |
| **Proposition** (`PROPOSITION`) | DIR | | Spec §9.1. Porte la phrase des cinq surfaces | ✅ |
| **Programme composé** | DIR | ⚖ | Pièce client — tranché 15/09. Aucune heure affichée | ✅ |
| **Devis** (`DEV-NNNN`) | DIR | ⚖ | **Contractuel** — tranché 15/09. Ne part PAS au financeur | ✅ |
| **Convention** (`CONVENTION`) | DIR · FIN | ⚖ | Signée ; porte `durationHours` ; pièce du dossier financeur | ✅ |
| **Convocation** (`CONVOCATION`) | PART | | Nommée par son objet | ✅ |
| **Émargement** (`EMARGEMENT`) | PART *(signe)* · FIN | ⚖ | Signé par demi-journée ; pièce de dossier | ✅ |
| **Attestation d'assiduité** (`ASSIDUITE`) | FIN | ⚖ | `agefice-attendance-generator.ts` ; exigée par l'AGEFICE | ✅ |
| **Attestation de fin** (`ATTESTATION_FIN`) | PART · **FIN ?** | ⚖ | ⚠ *ouverte* | ⚠ |
| **Certificat de réalisation** (`CERTIFICAT_REALISATION`) | PART | ⚖ | « remis à chaque participant à l'issue » | ✅ |
| **Dossier AGEFICE** (`AGEFICE`) | FIN | ⚖ | 92 champs du formulaire officiel | ✅ |
| **Dossier OPCO EP** (`PRE_ACCORD_OPCO`, `VALIDATION_OPCO`) | FIN | ⚖ | Workflow `OpcoSubmission` | ✅ |

## Les deux questions qui restent — pour Laurent

### 1. Le PARTICIPANT reçoit-il le programme composé ?

L'information préalable du stagiaire est un attendu Qualiopi. Aujourd'hui la
carte ne lui donne que la convocation.

**Ce que la réponse change concrètement** : « **dans vos locaux** » ne marche
que si le lecteur est le dirigeant. Si le participant le reçoit aussi, la phrase
devient « dans les locaux de l'agence » — et la pièce a deux lecteurs, donc le
vocabulaire se cale sur le moins informé des deux.

### 2. L'attestation de fin va-t-elle au FINANCEUR, ou au seul stagiaire ?

Le code ne tranche pas, et sa frontière avec le **certificat de réalisation**
est floue : deux `DocType` distincts, deux gabarits, et aucun commentaire ne dit
ce qui les sépare. Si l'un va au financeur et l'autre au stagiaire, c'est
précisément le genre de fait métier qui doit être écrit ici plutôt que deviné —
§4 sexdecies.
