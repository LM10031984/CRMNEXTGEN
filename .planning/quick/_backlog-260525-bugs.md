# Backlog bugs — point Laurent 2026-05-25

Issu de la revue complète parcours session/produit/docs.

## Ordre validé Laurent

| # | Chantier | Bugs | Effort | État |
|---|---|---|---|---|
| 1 | Affichage cassé fiche session | G (IMAGIMO Drive message), I (grille obs incohérence sidebar/matrice), J (sidebar Docs partagés non cliquables) | ~1h | I+J done (quick 260525-jpq c8cf4b6), G en attente screenshot Laurent |
| 2 | Horaires formation pause midi | A (8h = 9-13 + 14-18, pas 9h30-17h30) | ~30 min | DONE (quick 260525-pzl 3fc594c) — helper centralisé formation-horaires.ts, pause 13h-14h (1h), 692/692 tests verts |
| 3 | Création inline wizard session | C (apprenant), D (formateur) | ~1h | À faire |
| 4 | Auto-génération à la création session | E (convocations), F (programme), H (suppression bouton "Préparer") + analyse besoin par participant | ~1h | DONE (quick 260525-kl5 261bf93) — étendu aux 6 docs : programme/déroulé/checklist + convention/convocation/analyse besoin × N |
| 5 | AGEFICE qualité doc | K (détecter champs manquants vs inventer ex: dernier diplôme) | ~1h | DONE (quick 260525-pb5 46cf38e) — dropdowns Diplôme + Expérience pro alignés PDF AGEFICE, audit complet 60 champs sauvegardé |
| 6 | Programmes multi-jours détaillés | B (refonte prompt + few-shot, comparer Drive `Start Academy/Formations et programmes/`) | ~1-2h | À faire |

## Détails par bug

### G — Message "IMAGIMO Drive" SES-0093 (à investiguer)
Texte affiché : "session listée dans tableau récap IMAGIMO Drive, mais formateur non assigné en base de données"
- Pas trouvé dans grep apps/web/src (ni "IMAGIMO" ni "tableau récap" ni "listée dans")
- BDD SES-0093 : aucune note avec ce texte
- Hypothèse : tooltip/hint conditionnel ou message d'un blocker spécifique non encore identifié
- **Action** : screenshot ciblé Laurent

### I — Grille observation incohérence
- Sidebar "Documents partagés" affiche "non générée"
- Matrice Qualiopi en bas affiche le doc présent
- 2 sources de vérité à unifier

### J — Sidebar Documents partagés non cliquable
- Laurent veut pouvoir cliquer sur un doc "non généré" dans sidebar pour le générer
- Actuellement seul le bouton "Préparer la formation" en haut le fait

### A — Pause midi
- Prompt IA actuel : ne compte pas la pause
- Règle : 8h formation = 9h-13h + 14h-18h (1h pause midi obligatoire)
- Fichier prompt probable : `apps/web/src/lib/closure/qualiopi-prompts.ts` (déroulé) ou `apps/web/src/lib/programme-template.ts`

### C / D — Création inline
- Wizard session : ne permet que de choisir apprenant/formateur existant
- Ajouter quick-create inline (similaire au quick-create-product déjà présent)

### E / F / H — Auto-génération
- Aujourd'hui : bouton "Préparer la formation" obligatoire pour générer convocations + programme + déroulé + checklist + convention
- Cible : à la création session, déclencher automatiquement les docs qui ne dépendent que de la session (programme, déroulé, checklist, convocation). Convention reste par-participant.

### K — AGEFICE champs manquants
- Doc AGEFICE invente des valeurs (ex: "dernier diplôme obtenu") si champ vide en BDD
- Cible : vérifier `learnerPerson.fields...` avant génération + message clair listant les champs manquants

### B — Programmes multi-jours
- Pas assez détaillés vs DOCX du Drive (`Start Academy/Formations et programmes/`, 40 sous-dossiers)
- Référence mémoire : `reference_programmes_drive.md`
- Refonte prompt + few-shot examples
