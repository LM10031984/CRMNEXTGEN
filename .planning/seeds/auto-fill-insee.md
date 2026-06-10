---
seed: auto-fill-organisations-insee
planted: 2026-05-14
trigger: après milestone v5 OU lors de l'attaque "amélioration CRM organisations"
priority: medium
context_origin: /gsd:discuss-phase 7 (Paramètres organisme éditables)
---

# Auto-fill organisations via API INSEE

## L'idée

Quand l'utilisateur saisit le SIRET d'une **organisation cliente** (enseigne immobilière, EI apprenant, employeur, payeur, etc.) :
1. Détection en live du SIRET tapé (14 chiffres)
2. Appel API INSEE (gratuit, sans clé depuis 2023 via api.insee.fr/api-sirene)
3. Auto-remplissage : raison sociale, adresse complète, code NAF, état actif/inactif
4. L'utilisateur valide en 2 secondes au lieu de 5 minutes de copier-coller

## Pourquoi c'est valuable

- Pattern dominant QualiOF : **agent commercial immobilier = EI + Enseigne** → 2 organisations à créer par apprenant, donc le gain temps est X2.
- Volume probable Start Academy : 50-200 organisations à saisir/an. Auto-fill = ~10h économisées/an.
- Qualité données : zéro typo SIRET, raisons sociales officielles INSEE.
- Détection RGPD : alerte si entreprise inactive ou supprimée.

## Pourquoi pas dans Phase 7

Phase 7 = Paramètres de **l'OF** (Start Academy) = **1 SIRET saisi 1 fois**. L'API INSEE n'apporte rien sur ce cas.

Le vrai cas d'usage = saisie **organisations clientes** (model `Organization`), à travailler après Phase 7.

## Périmètre suggéré pour la future phase

- Server action `lookupSiretInsee(siret: string)` côté `apps/web/src/server/actions/insee.ts`
- Composant React `<SiretAutoFillInput onResolved={(data) => ...} />` réutilisable
- Branchements UI :
  - Form création/édition `Organization`
  - Wizard pré-inscription (le candidat tape son SIRET enseigne)
  - Quick-add organisation depuis fiche apprenant
- Cache local 30 jours pour les SIRET déjà résolus
- Fallback gracieux si INSEE down (continuer en saisie manuelle, prévenir admin)

## Trigger pour ressortir cette seed

Réactiver quand :
- Milestone v5 livré complet
- OU Laurent attaque une phase "Amélioration CRM organisations" / "Pré-inscriptions V2"
- OU plainte explicite de Laurent sur le temps de saisie d'organisations

## Refs

- API INSEE Sirene v3 : https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3.11&provider=insee
- Anciennement payant + clé API obligatoire, désormais gratuit et ouvert (depuis 2023).
