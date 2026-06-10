# Milestone v7 — RDV Plaud → proposition sur mesure (DRAFT HORS WORKFLOW GSD)

**Status :** Squelette de cadrage. PAS encore une milestone GSD active.

## Contexte

Cadrage initial validé par Laurent le 2026-05-19 dans une session Claude Code (cf. mémoire `~/.claude/projects/-Users-laurentmarx-Documents-CRM-Next-gen/memory/project_milestone_v7_rdv_proposition.md`).

Milestone v5 ("v1.0" en GSD interne — 13 phases, focus Audit UX/QA + Features métier) est **en cours d'exécution** (Phase 11 — factures cycle complet, plan 4/10 au 2026-05-19). Lancer `/gsd:new-milestone` standard écraserait STATE.md / PROJECT.md actuels et casserait le suivi v5 en cours.

**Solution retenue :** créer un squelette en doc parallèle sous `.planning/milestones/v7-rdv-plaud/` qui contient le draft des artefacts GSD (REQUIREMENTS + ROADMAP) **sans toucher** PROJECT.md / STATE.md / REQUIREMENTS.md / ROADMAP.md actuels.

## Contenu de ce dossier

| Fichier | Rôle |
|---|---|
| `README.md` | Ce fichier (explication du mode draft) |
| `REQUIREMENTS-DRAFT.md` | Liste des REQ-IDs scopés pour v7 (à transformer en `REQUIREMENTS.md` officiel lors de la bascule) |
| `ROADMAP-DRAFT.md` | 10 phases proposées (Phase 13 → 22) avec mapping REQ-IDs → phase + success criteria |

## Quand bascule-t-on en milestone GSD active ?

Quand milestone v5 sera **fully closed** :
- Phase 11 livrée (6 plans restants : 11-05, 11-06, 11-07, 11-08, 11-09, 11-10)
- Phase 12 livrée (Modules stub Inscriptions et Modèles)
- `/gsd:complete-milestone` lancé

Alors :
1. `/gsd:new-milestone "v7 RDV Plaud → proposition sur mesure"`
2. Lors de la phase "Gather Goals" du workflow new-milestone, **pointer vers ce dossier draft** comme input
3. Le workflow va générer le vrai `.planning/REQUIREMENTS.md` (incluant v7) + `.planning/ROADMAP.md` (Phase 13-22) + reset STATE.md sur Phase 13

Le draft ici peut être supprimé après bascule, ou archivé en historique.

## Choix de cadrage validés (à NE PAS re-questionner lors de la bascule)

- **Programme** : 100% custom généré from scratch dans un squelette JSON pré-validé Qualiopi (slots i02/i03/i05/i06/i20/i22)
- **Email** : draft validé humain (pas d'auto-envoi)
- **Option A salarié** : entreprise gère seule sa demande OPCO → on envoie juste le devis
- **Option B salarié** : pas de stockage des creds OPCO, transmission ponctuelle par l'entreprise à chaque dossier (juste un champ note textuel sur `OpcoSubmission`)
- **Volume cible** : 1-3 RDV/semaine (phase amorçage)
- **Pièces AE** : CNI + RIB + attestation CFP + dernier diplôme (déclaratif) + années d'expérience (déclaratif)
- **Pièces salarié** : adaptées à l'option A/B
- **Provider LLM** : Claude (Anthropic API) — câblage à faire dans milestone v6 prod cloud (en parallèle ou avant v7)
- **Timing** : draft maintenant, bascule en milestone active après v5 close

## Points de vigilance à porter dans le ROADMAP officiel lors de la bascule

1. **Squelette Qualiopi non négociable** — validation Zod stricte en sortie LLM, sinon risque d'audit cassé
2. **RGPD enregistrement vocal** — consentement client, durée conservation 3 ans, bucket privé + signed URL
3. **MeetingNote vs Lead/PreEnrollment** — Phase 13 (POC) doit cadrer : la proposition s'attache à `Lead`, puis bascule en `PreEnrollment` après validation
4. **API Plaud existence** — BLOQUANT Phase 13 (POC). Si pas d'API publique : fallback export manuel ou Zapier. Si rien : milestone repensée.
5. **Coût LLM** — ~0.5-2€/mois sur v7 (volume amorçage). Dans le cadre v6 prod cloud (Claude API), négligeable.

## Estimation

~14-19 jours focused sur les 10 phases (cf. ROADMAP-DRAFT.md détail par phase).
