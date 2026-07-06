# Fiche DPA — Vercel

| Champ | Valeur |
|---|---|
| **Fournisseur** | Vercel, Inc. |
| **Rôle** | Sous-traitant (art. 28 RGPD) — hébergement applicatif |
| **Service utilisé** | Hébergement de l'application Next.js QualiOF (projet `qualiof`, plan Pro) : rendu des pages, server actions, API routes |
| **Données transmises** | Runtime applicatif : **cookies de session** (authentification Lucia), données du **formulaire public de préinscription** (identité candidat — les pièces CNI/RIB partent en direct-to-storage vers Supabase, elles ne transitent PAS par Vercel), payloads des requêtes des utilisateurs internes |
| **Localisation** | Fonctions serverless en **`cdg1` (Paris, France)** — configuré `vercel.json` `"regions": ["cdg1"]` + Project Settings. ⚠ **Le réseau edge Vercel est GLOBAL** : les réponses HTTP transitent par le point de présence (POP) le plus proche du visiteur, potentiellement hors UE — le traitement/stockage applicatif reste en cdg1. |
| **Document DPA public** | https://vercel.com/legal/dpa (vérifiée 200 le 2026-07-06) — DPA incorporé aux conditions du service. |
| **Garanties de transfert hors UE** | DPA public Vercel (clauses de transfert incluses). Le point edge global est documenté ci-dessus en transparence. |
| **Date de vérification** | 2026-07-06 (URL re-vérifiée HTTP 200) |

## Mesures techniques côté QualiOF

- Cookies de session httpOnly, `secure` en production, `sameSite=lax` ; invalidation en base au logout.
- Variables d'environnement sensibles chiffrées (sensitive) sur le projet Vercel.
- WAF : rate-limiting sur `/preinscription` (30 req/60 s par IP).
- `MAIL_DRY_RUN=true` et filigrane STAGING tant que la bascule prod n'est pas validée.

## Points ouverts / limites

- ⚠ Transit edge global (POP hors UE possibles pour la couche réseau) — inhérent au CDN Vercel ; à noter dans le registre, pas de mitigation applicative simple. ⚠ À VALIDER PAR LE RESPONSABLE DE TRAITEMENT (acceptation).
