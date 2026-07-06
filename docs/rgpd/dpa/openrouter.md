# Fiche DPA — OpenRouter

| Champ | Valeur |
|---|---|
| **Fournisseur** | OpenRouter, Inc. (États-Unis) |
| **Rôle** | Sous-traitant (art. 28 RGPD) — passerelle d'inférence IA |
| **Service utilisé** | API OpenRouter (`AI_PROVIDER=openrouter`) : génération des documents closure (modèles Claude Haiku/Sonnet) + OCR vision des pièces de préinscription |
| **Données transmises** | Prompts closure : **noms des stagiaires**, contexte des sessions (produit, dates, formateur) ; OCR vision : **images CNI/RIB/CFP** uploadées au formulaire de préinscription (pilier #4) |
| **Localisation** | États-Unis (transfert hors UE) — l'inférence est routée vers les providers de modèles (Anthropic pour QualiOF, voir [anthropic.md](anthropic.md)) |
| **Document DPA public** | ⚠ **DPA mutuellement signé = tier ENTERPRISE UNIQUEMENT** — **non disponible en self-serve (statut actuel de Start Academy)**. Vérifié auprès du support OpenRouter, 2026-07. Référence support : https://openrouter.zendesk.com/hc/en-us/articles/47828437697051 · Politique de confidentialité : https://openrouter.ai/privacy (vérifiée 200 le 2026-07-06) |
| **Garanties de transfert hors UE** | Pas de clauses contractuelles types signées bilatéralement en self-serve. Garanties effectives (techniques) ci-dessous. |
| **Date de vérification** | 2026-07-06 (URLs re-vérifiées HTTP 200) |

## Garanties effectives (réelles, vérifiables)

- **Politique par défaut de non-rétention des prompts** : OpenRouter ne conserve pas le contenu des prompts/réponses par défaut — seules des **métadonnées** (tokens, modèle, latence) sont journalisées pour la facturation.
- **Réglages compte à vérifier et capturer** (action au moment de la bascule) :
  - **Logging OFF** dans les settings du compte (désactiver toute rétention optionnelle de prompts) ;
  - **Option ZDR (Zero Data Retention)** sur les endpoints : https://openrouter.ai/docs/guides/features/zdr (vérifiée 200 le 2026-07-06) — restreint le routage aux endpoints providers garantissant zéro rétention.
- Trust Portal OpenRouter consultable pour les certifications de sécurité.

## Réponse préparée pour un auditeur qui demanderait le DPA signé

> « Start Academy utilise OpenRouter en offre self-serve, pour laquelle le fournisseur ne propose pas de DPA mutuellement signé (réservé au tier enterprise — vérifié auprès du support, 2026-07). Les garanties effectives en place sont : politique contractuelle par défaut de non-rétention des prompts (métadonnées seules), réglage logging OFF sur le compte, et enforcement ZDR (Zero Data Retention) sur les endpoints d'inférence. Ces réglages sont capturés en preuve. Si un DPA signé devenait une exigence formelle, la migration vers le tier enterprise OpenRouter est la voie identifiée. »

## Points ouverts / limites

- ⚠ **Pas de DPA signé** (self-serve) — limite assumée, à valider par le responsable de traitement (gate D-13, cf. registre § Limites connues).
- ⚠ Réglages ZDR/logging OFF **à vérifier et capturer** (screenshot) avant la bascule prod — action à intégrer au runbook.
- Mitigation possible si exigence renforcée un jour : ZDR enforcement systématique ; tier enterprise (DPA signé).
