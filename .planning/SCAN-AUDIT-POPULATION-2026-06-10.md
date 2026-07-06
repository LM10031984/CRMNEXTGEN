# Scan systémique de la population audit — 2026-06-10

> **Pour la conversation avec Kaïna (BCI) le 16/06/2026**, prép audit BCI 03/07/2026.
> Source : scan read-only direct BDD Docker Start Academy le 10/06/2026.
> Méthode : agrégation des Documents + PedagogicalAssets par session terminée.

## Population auditeur potentielle

- Tenant Start Academy — **88 sessions** au total
- **75 sessions** avec ≥ 1 apprenant
- **70 sessions terminées** (endDate < 10/06/2026)
- **285 apprenants** sur ces 70 sessions
- Échantillon auditeur typique : 10 à 20 sessions

## Profil de complétude (sessions terminées uniquement)

| Profil | Sessions | Apprenants | Indicateur(s) Qualiopi impacté(s) |
|---|---:|---:|---|
| 0 PedagogicalAsset (analyse besoin / QCM / grille obs / positionnement / satisfaction asset) | **60 / 70** (85 %) | **237** | 4 🔴 / 8 / 11 🔴 / 30 |
| Aucun Document du tout (pack closure jamais lancé) | **54 / 70** (77 %) | **185** | 5 🔴 / 9 / 11 🔴 |
| 0 CERTIFICAT_REALISATION | **60 / 70** (85 %) | **209** | 11 🔴 |
| CONFIRMED sans aucun doc (apprenant inscrit confirmé, dossier vide) | 3 sessions | 17 | workflow incomplet |
| PRE_ENROLLED avec docs (workflow inversé : docs émis sur pré-inscrits) | 8 sessions | 29 | cohérence data |
| **Profil exact SES-0086** (0 asset + ≥1 cert + CONFIRMED sans docs + PRE_ENROLLED avec docs) | **1** | 29 | tous cumulés |
| **≥ 1 trou Qualiopi quelconque** | **61 / 70** (**87 %**) | — | global |

## Chiffre clé à porter

**Sur 70 sessions terminées, 61 portent au moins une non-conformité Qualiopi structurelle.**

## Lecture rapide

- Le problème n'est pas SES-0086, c'est le profil dominant de la population historique.
- Cause racine plausible : QualiOF (paliers 2.2 → 4) déployé progressivement entre 04/2026 et 06/2026, les sessions antérieures n'ont pas bénéficié des chaînes de génération automatique (pack closure 1-clic).
- Conséquence : la machinerie T1-T7 du plan complet n'a pas seulement vocation préventive, elle est aussi la condition pour que les **nouvelles** sessions soient propres dès le départ.

## Options à discuter avec Kaïna le 16/06

### Option 1 — Remédier la population complète avant 03/07
- Charge : chaque session = générer analyse besoin × N apprenants + QCM + grille + cert + conv + convocation + assiduité × N + signatures
- Estimation : plusieurs semaines à temps plein
- **Non réaliste** à J-24 de l'audit, alors que T12 (handicap, 7 jours) n'est pas encore commencé.

### Option 2 — Porter comme NC connue + plan d'action documenté
- Posture audit : « Sessions historiques pré-déploiement QualiOF (avant date X), portant des NC structurelles connues. Plan d'action : périmètre Qualiopi appliqué uniquement aux sessions postérieures à X. Migration progressive des historiques planifiée. »
- Charge : une à deux pages de plan d'action, traçabilité.
- **Posture courante en audit**, mieux acceptée qu'un dossier reconstitué en urgence.

### Option 3 — Sélection d'un sous-ensemble échantillon « modèle »
- Choix de 5 à 10 sessions emblématiques (récentes, profils types : présentiel intra/inter, AGEFICE, etc.)
- Remédiation complète sur ce sous-ensemble — T1 → T7 appliqués
- Reste de la population : porté en NC connue (option 2)
- **Compromis viable** si Kaïna en accepte le principe.

## Données détaillées — sessions au profil exact SES-0086

```
SES-0086 | 2026-04-15 | 29 app. (15 CONFIRMED + 14 PRE_ENROLLED) | docs=24 (cert=12, conv=12)
         "TRACFIN" — re-link IA→Tracfin + prix + superseded faits le 09/06/2026
```

## Sessions « les plus à risque » (à confirmer avec Kaïna comme échantillon prioritaire)

À remplir lors de la session du 16/06 — critères de sélection à discuter (récentes, profils représentatifs, financements OPCO/AGEFICE qui appellent contrôle).

---

*Données générées par `/tmp/scan-systemic-incomplete.ts` le 10/06/2026, read-only sur tenant Start Academy. Reproductible à l'identique tant que la BDD n'est pas modifiée.*
