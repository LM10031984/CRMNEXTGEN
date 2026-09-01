# Phase 22: Bascule prod + conformité RGPD - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-06
**Phase:** 22-bascule-prod-conformit-rgpd
**Areas discussed:** Fenêtre de bascule & données, Sortie du staging & sorties externes, Équipe & gate go/no-go, RGPD & registre des traitements, Bug env Vercel (PROD-0674, remonté par Laurent en séance)

---

## Fenêtre de bascule & données

| Option | Description | Selected |
|--------|-------------|----------|
| Audit d'écart puis cloud = seule vérité | Vérif qu'aucune donnée locale post-dump 03/07, cloud = unique source, pas de re-dump | ✓ |
| Re-dump local → cloud | Écraserait le travail cloud depuis le 5 juillet | |
| Je ne sais plus ce qu'il y a en local | Même chose + rapport détaillé table par table | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dès que la phase est prête | Pas de contrainte calendrier | ✓ |
| Fenêtre précise à caler | Contrainte à préciser | |
| Week-end / heures creuses | Minimiser l'impact | |

| Option | Description | Selected |
|--------|-------------|----------|
| Retour au mode staging gardé | Re-flag staging + dry-run (~5 min) | ✓ |
| Retour complet au Mac local | Lourd, local obsolète | |

| Option | Description | Selected |
|--------|-------------|----------|
| Purge fin de Phase 22, après gate validé | pg_dump archive + snapshot MinIO puis purge Docker local | ✓ |
| Hors Phase 22 — plus tard | Local en « musée » quelques semaines | |
| Pas de purge, archiver seulement | Conteneurs arrêtés, volumes gardés | |

---

## Sortie du staging & sorties externes

| Option | Description | Selected |
|--------|-------------|----------|
| Emails réels après pack témoin validé | Séquence flag → gate → activation | ✓ (avec exigence ajoutée) |
| Dès la bascule | Risque d'envois pendant vérification | |
| Plus tard, décision manuelle | Prod en dry-run quelques jours | |

**User's choice:** « Après pack témoin mais dans tous les cas j'ai l'option à cocher pour les inviter on est d'accord ? » + message insistant : « attention je veux avoir l'option à cocher pour prévenir les apprenants je veux pas qu'ils reçoivent plein de mails ok ? »
**Notes:** Vérification code faite en séance : aucun envoi automatique vers apprenants (convocations = boutons manuels, email closure → admin, crons relances non branchés) SAUF relances factures worker (règle payeur : auto-entrepreneur = son propre payeur). Décision renforcée : rapport des envois en attente + validation Laurent avant MAIL_DRY_RUN=false, jamais d'envoi de masse sans action explicite (D-06).

| Option | Description | Selected |
|--------|-------------|----------|
| Porter le token Google sur le cloud | Env var chiffrée Vercel + fallback fichier | ✓ |
| Hybride temporaire : le Mac garde le calendar | Contredit l'objectif v6 | |
| Sync déplacée sur le worker Railway | Plus lourd (file de jobs) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bug PROD-0674 : corrige maintenant | Fix config immédiat + sanity check env au runbook | ✓ |
| Intègre-le à la Phase 22 | Auto-fill resterait cassé d'ici là | |

---

## Équipe & gate go/no-go

| Option | Description | Selected |
|--------|-------------|----------|
| Petite équipe de départ, liste à préciser | Liste fournie à un checkpoint du plan | ✓ |
| Juste moi pour l'instant | Ajusterait le critère roadmap | |
| Toute l'équipe d'un coup | Plus de support J1 | |

| Option | Description | Selected |
|--------|-------------|----------|
| SES-0094, le témoin habituel | Critères connus, comparable | ✓ |
| Session E2E jetable | Zéro impact mais pas de vraies données | |
| Les deux | Ceinture et bretelles | |

| Option | Description | Selected |
|--------|-------------|----------|
| Alertes coûts : seuils standards, email à Laurent | ~1,5× coût attendu par service | ✓ |
| Fixer les seuils soi-même | Présentation des options par plateforme | |

| Option | Description | Selected |
|--------|-------------|----------|
| Backups Supabase natifs + vérif région EU | pg_dump hors vendor reste backlog | ✓ |
| Ajouter un pg_dump indépendant maintenant | Élargit la phase | |

---

## RGPD & registre des traitements

| Option | Description | Selected |
|--------|-------------|----------|
| Liste complète réelle (~7 sous-traitants) | 5 cloud + Google + SMTP, Upstash sorti | ✓ |
| Les 6 du roadmap tels quels | Upstash périmé, Google/SMTP manquants | |
| Minimum : 5 PII sensibles | Google/SMTP au backlog | |

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown repo + export imprimable | Versionné + PDF auditeur | ✓ |
| Document Word/Drive classique | Hors versionning | |

| Option | Description | Selected |
|--------|-------------|----------|
| Claude rédige tout, Laurent valide | Incertitudes juridiques signalées | ✓ |
| Laurent fournit des éléments | Documents existants à intégrer | |

| Option | Description | Selected |
|--------|-------------|----------|
| Audit logs + corrections ciblées | IDs à la place du PII brut | ✓ |
| Garde-fou centralisé en plus | Chantier plus large | |

---

## Bug env Vercel (remonté en séance)

Laurent a signalé : « Produit PROD-0674 créé. Auto-fill IA a échoué : Erreur Ollama : Cannot convert argument to a ByteString because the character at index 119 has a value of 8592 ».
Diagnostic en séance : char 8592 = `←` ; le `.env` racine contient des commentaires inline collés aux valeurs (`# ← À REMPLIR`, etc.) — dotenv les strippe en local, mais les variables Vercel posées par API en 21-04 les ont probablement embarqués → header `Authorization` invalide. Worker Railway propre (vars manuelles). → D-18 : fix immédiat hors phase + sanity check env au runbook + label « Erreur Ollama » périmé à corriger.

## Claude's Discretion

Structure du runbook, mécanique des alertes coûts par plateforme, emplacement/gabarit du registre RGPD, implémentation du portage token Google, script d'audit d'écart et de sanity check env, liste des console.* à corriger.

## Deferred Ideas

pg_dump cron hors vendor · logger centralisé anti-PII · branchement futur des crons relances (avec opt-in) · domaine custom éventuel · staging persistant.
