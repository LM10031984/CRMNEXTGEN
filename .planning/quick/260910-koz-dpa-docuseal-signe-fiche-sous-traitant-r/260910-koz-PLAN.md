# Quick 260910-koz — DPA DocuSeal signé : fiche, registre, gate du lot C levé

**Date :** 2026-09-10 · **Branche :** `feat/signature-docs-signes`

## Contexte

Le DPA DocuSeal est signé des deux parties le 10/09/2026 et déposé dans
`docs/rgpd/dpa/docuseal.pdf` (non suivi par git à ce stade). Il lève le gate qui
bloquait la mise en service du lot C (envoi réel de conventions en production).

## Contrôle du PDF — fait AVANT rédaction (la skill `signature` l'impose)

Le fichier a été ouvert et son texte extrait. Constats, tous vérifiés :

| Point | Constat |
|---|---|
| Raison sociale | **DocuSeal LLC**, 332 S Michigan Ave, Suite 121 #5896, Chicago, IL 60604, USA. Notifications `privacy@docuseal.com`. Lève le doute « Inc. / LLC » de la fiche. |
| Parties | Start academy, 12 Avenue des camélias, notifications `formation@start-academy.fr`. |
| Signataires | **Laurent MARX, CEO** / **Kriti Pinto, Co-Founder**, « Date Signed: Sept 10, 2026 » des deux côtés. |
| Sceau | PDF **scellé numériquement** : `/Type /Sig` ×1, `/ByteRange`, `/SubFilter /adbe.pkcs7`, `/AcroForm`. |
| Portée | ⭐ « **This Agreement applies to the Services provided through docuseal.eu** » — le contrat est lui-même cadré sur l'instance UE, ce n'est pas qu'un choix de configuration de notre côté. |
| Force obligatoire | Les blocs de signature sont « for reference purposes only » : le contrat lie **par l'acceptation des Terms of Service ou par son exécution**. Il lie donc bien. |
| SCC | Décision d'exécution (UE) **2021/914** du 4 juin 2021, **Module Two** (Start Academy responsable de traitement) — Module Three prévu au cas où Start Academy agirait pour ses propres clients. + UK Addendum + adaptations suisses, incorporés en Schedule 1. Annexes I, II, III = annexes des SCC. |
| Sous-traitants ultérieurs | Par renvoi : https://www.docuseal.com/privacy/gdpr#subprocessors, qui **constitue l'Annexe III** des SCC. Modifications notifiées au titre du §5.4 ; la page n'est pas l'unique canal de notification. |
| Section 11 | ⚠ **Pas un engagement de non-hébergement hors UE sec.** Hébergement en centres de données de l'Union, et pas de stockage/hébergement *intentionnel* hors EEE — **mais** trois réserves écrites : (a) sous-traitants listés hors EEE, (b) obligation légale, (c) **accès distant depuis hors EEE explicitement prévu** pour support, maintenance, sécurité, réponse à incident et continuité, limité au nécessaire, sous les contrôles de l'Annexe II, et qualifié de transfert couvert par la section 11. §11.3 : notification des réquisitions d'autorité publique, pas de divulgation volontaire, et déclaration qu'aucune demande formelle d'une agence de renseignement n'a été reçue à la date de dernière mise à jour. |

## Tâches

### Task 1 — Fiche sous-traitant + versement du PDF
**Fichiers :** `docs/rgpd/dpa/docuseal.md`, `docs/rgpd/dpa/docuseal.pdf` (à ajouter à git)

- Ligne « Fournisseur » : raison sociale confirmée, adresse, email de notification.
- Ligne « Document DPA public » → « **DPA** » : signé, daté, signataires, pièce au dépôt, sceau numérique, nuance sur la force obligatoire.
- Ligne « Localisation » : le contrat est cadré sur `docuseal.eu`.
- Ligne « Garanties de transfert hors UE » : SCC 2021/914 module 2, Schedule 1, annexes, sous-traitants par renvoi, **et les trois réserves de la section 11 écrites telles quelles**.
- Ligne « Date de vérification » : ajouter 2026-09-10 (DPA signé), sans effacer les précédentes.
- Points ouverts 1 et 2 : fermés, avec ce qui les ferme. Point 2 reste **partiellement** ouvert — le mécanisme est documenté, la liste effective des sous-traitants reste à capturer, c'est une liste mouvante.
- **Gate du lot C levé**, dit explicitement.

**Vérification :** la fiche ne contient plus « à confirmer sur le DPA » ni « DPA non encore récupéré » ; `git ls-files` liste le PDF.

### Task 2 — Registre des traitements
**Fichier :** `docs/rgpd/REGISTRE-TRAITEMENTS.md`

- Ligne de statut : le gate ⚠ du v1.6 est levé, avec renvoi à la pièce.
- Tableau « Localisation des données » (ligne DocuSeal) : « région exacte à confirmer sur le DPA » → ce que le DPA dit réellement.
- Tableau des sous-traitants (ligne 8) : renvoi à la pièce signée.

**Vérification :** plus aucune occurrence de « le DPA DocuSeal doit être accepté avant tout envoi ».

## Hors périmètre

Pas de modification de code, ni de la spec signature, ni des lots. Le lot C lui-même
est un chantier distinct — cette tâche ne fait qu'en lever le préalable.
