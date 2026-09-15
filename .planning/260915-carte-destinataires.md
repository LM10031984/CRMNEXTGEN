# Qui reçoit quoi — carte des destinataires

**15/09/2026 — PROPOSITION. Rien n'est figé dans la spec.**
C'est Laurent qui sait ; le code ne fait que montrer ce qu'il croit aujourd'hui.

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
| 2 | **Rapport d'audit** `audit-template.ts:667‑675` | Trois tuiles en page financement : « Volume proposé / 6 demi-journées / 24 h sur site », « Heures conventionnées / 48 h / *La valeur portée sur la convention, l'émargement et le dossier financeur* » | ⏸ **À TRANCHER — je propose de GARDER** |
| 3 | **Devis** `quotes.ts:84‑86` | Libellé de ligne : « … — 6 demi-journées de 4 h sur site, 3 participants, 48 h conventionnées par participant » | ⏸ **À TRANCHER — je propose de GARDER** |

### Pourquoi je propose de garder les deux

Ton critère était : *« il rencontre les heures dans la PROPOSITION, expliquées,
là où on parle d'argent. »* Les deux y répondent :

- l'**audit** ne les montre que dans sa **page financement**, la dernière, et la
  tuile **nomme la valeur et ses surfaces** — c'est la phrase la plus explicite
  du dépôt sur la ligne rouge §8.1 ;
- le **devis** est la pièce d'argent par excellence : la ligne dit ce qui est
  facturé et sur quelle base. Une quantité sans son unité y serait pire
  qu'ailleurs.

**Et un doute honnête sur le devis** : il n'est pas la proposition. Il naît
*après* acceptation (D-4) et sert d'assiette à la facture — pièce plutôt
contractuelle que commerciale. Si tu le classes « client » au même titre que le
programme, sa ligne doit maigrir ; si tu le classes « contractuel », elle reste.
**C'est le seul des trois où ta carte change la réponse**, et c'est pour ça
qu'elle manquait.

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

# Partie 2 — La carte, à valider

**Légende des destinataires** : `DIR` dirigeant · `PART` participant ·
`FIN` financeur · `AUD` auditeur Qualiopi · `INT` interne.

La colonne **« ce que le code sait »** dit sur quoi je m'appuie. La colonne
**confiance** dit si j'ai une preuve ou une déduction — **ne valide pas les
lignes ⚠ sans les lire.**

| Document | Destinataires proposés | Ce que le code sait | Confiance |
|---|---|---|---|
| **Rapport d'audit** (`DIAGNOSTIC_AUDIT`) | **DIR** | Spec §9.2 : « remis en R2, ≥ 15 pages, valorisé 3 000 € ». Aucun envoi financeur dans le code | ✅ preuve |
| **Proposition** (`PROPOSITION`) | **DIR** | Spec §9.1. Lien public sans PII, adressé au dirigeant. Porte la phrase des 5 surfaces | ✅ preuve |
| **Programme composé** | **DIR** (+ **PART** ?) | Tranché par toi aujourd'hui. ⚠ *Le participant le reçoit-il aussi, en information préalable ?* | ⚠ à dire |
| **Devis** (`DEV-NNNN`) | **DIR** | D-4 : généré à l'acceptation, sert d'assiette à la facture | ⚠ **et FIN ?** |
| **Convention** (`CONVENTION`) | **DIR** + **FIN** + **AUD** | Signée ; porte `durationHours` ; pièce du dossier financeur | ✅ preuve |
| **Convocation** (`CONVOCATION`) | **PART** | Nommée par son objet | ✅ preuve |
| **Émargement** (`EMARGEMENT`) | **PART** (signe) → **FIN** + **AUD** | Signé par demi-journée ; pièce de dossier | ✅ preuve |
| **Attestation d'assiduité** (`ASSIDUITE`) | **FIN** | `agefice-attendance-generator.ts` ; demandée par l'AGEFICE | ✅ preuve |
| **Attestation de fin** (`ATTESTATION_FIN`) | **PART** + **FIN** | ⚠ *Les deux, ou seulement le participant ?* | ⚠ à dire |
| **Certificat de réalisation** (`CERTIFICAT_REALISATION`) | **PART** | Remis « à chaque participant à l'issue » (gabarit programme) | ✅ preuve |
| **Dossier AGEFICE** (`AGEFICE`) | **FIN** | 92 champs du formulaire officiel | ✅ preuve |
| **Dossier OPCO EP** (`PRE_ACCORD_OPCO`, `VALIDATION_OPCO`) | **FIN** | Workflow `OpcoSubmission` | ✅ preuve |

### Les quatre questions qui restent, et elles sont pour toi

1. **Le participant reçoit-il le programme composé ?** L'information préalable
   du stagiaire est un attendu Qualiopi. Si oui, la pièce a **deux** lecteurs et
   « dans vos locaux » devient « dans les locaux de l'agence ».
2. **Le devis part-il au financeur ?** Tu viens de dire que non — je le note,
   mais c'est la ligne qui décide du sort de `quotes.ts` (Partie 1, #3).
3. **L'attestation de fin va-t-elle au financeur, ou seulement au stagiaire ?**
   Le code ne tranche pas ; la distinction avec le certificat est floue.
4. **L'auditeur Qualiopi est-il un destinataire, ou un lecteur d'archive ?**
   Il ne *reçoit* rien : il **consulte** ce qui est déjà produit. S'il est une
   colonne à part, elle ne dit pas « à qui on envoie » mais « ce qui doit tenir
   en contrôle » — deux règles différentes, et il vaut mieux ne pas les mêler.

### Où la figer, une fois validée

**Pas en §8** — le budget n'a rien à voir, et `§8.3` est déjà « La main sur le
prix » (j'ai d'abord écrit ce mauvais pointeur dans deux commentaires, corrigé).

→ **§9.6 « La carte des destinataires »**, en fin de §9 *Les sorties
documentaires*, avec un renvoi depuis §9.0. Pas de renumérotation : d'autres
documents pointent déjà §9.1 et §9.2.

Et une phrase à mettre en tête, parce que c'est la leçon de la semaine :

> **Le vocabulaire permis sur une pièce est décidé par son DESTINATAIRE, pas par
> son contenu.** Deux erreurs de suite sont venues de la croyance qu'un document
> « sérieux » va au financeur.
