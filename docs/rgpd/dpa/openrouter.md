# Fiche DPA — OpenRouter

| Champ | Valeur |
|---|---|
| **Fournisseur** | OpenRouter, Inc. (États-Unis) |
| **Rôle** | Sous-traitant (art. 28 RGPD) — passerelle d'inférence IA |
| **Service utilisé** | API OpenRouter (`AI_PROVIDER=openrouter`) : génération des documents closure (modèles Claude Haiku/Sonnet) + OCR vision des pièces de préinscription + programme personnalisé du stand + veille réglementaire + **pré-remplissage du diagnostic R1 depuis le compte rendu de rendez-vous** (Traitement 11, ajouté le 2026-09-11) |
| **Données transmises** | Prompts closure : **noms des stagiaires**, contexte des sessions (produit, dates, formateur) ; OCR vision : **images CNI/RIB/CFP** uploadées au formulaire de préinscription (pilier #4) ; **diagnostic R1 : le compte rendu VERBATIM d'un rendez-vous professionnel** — conversation intégrale portant des appréciations nominatives sur des collaborateurs qui ignorent le traitement (Traitement 11) |
| **Localisation** | États-Unis (transfert hors UE). ⚠ **Corrigé le 2026-09-11** : la phrase antérieure — « l'inférence est routée vers Anthropic » — **n'est pas établie**. Mesure du 2026-09-11 : le modèle utilisé (`anthropic/claude-sonnet-4.6`) est servi par **9 endpoints chez 5 opérateurs** (Amazon Bedrock ×3, Google ×3, Claude Platform on AWS, Azure/Microsoft, Anthropic ×1 — ce dernier étant le seul en état anormal au moment de la mesure). L'API n'annonce **aucune région** et notre code **n'épingle aucun opérateur**. Le destinataire réel d'un prompt donné n'est pas déterminé par notre configuration. Voir [preuves/openrouter-2026-09-11.md](../preuves/openrouter-2026-09-11.md) § 1.3. |
| **Document DPA public** | ⚠ **DPA mutuellement signé = tier ENTERPRISE UNIQUEMENT** — **non disponible en self-serve (statut actuel de Start Academy)**. Vérifié auprès du support OpenRouter, 2026-07. Référence support : https://openrouter.zendesk.com/hc/en-us/articles/47828437697051 · Politique de confidentialité : https://openrouter.ai/privacy (vérifiée 200 le 2026-07-06) |
| **Garanties de transfert hors UE** | Pas de clauses contractuelles types signées bilatéralement en self-serve. Garanties effectives (techniques) ci-dessous. |
| **Date de vérification** | 2026-07-06 (URLs re-vérifiées HTTP 200) — **capture technique du 2026-09-11** : [preuves/openrouter-2026-09-11.md](../preuves/openrouter-2026-09-11.md) |

## Garanties effectives (réelles, vérifiables)

- **Politique par défaut de non-rétention des prompts** : OpenRouter ne conserve pas le contenu des prompts/réponses par défaut — seules des **métadonnées** (tokens, modèle, latence) sont journalisées pour la facturation.
- **Réglages compte à vérifier et capturer** (action ouverte depuis le 2026-07-06) :
  - **Logging OFF** dans les settings du compte (désactiver toute rétention optionnelle de prompts) ;
  - **Option ZDR (Zero Data Retention)** sur les endpoints : https://openrouter.ai/docs/guides/features/zdr (vérifiée 200 le 2026-07-06) — restreint le routage aux endpoints providers garantissant zéro rétention.
  - ⚠ **Tentative de capture du 2026-09-11 : partielle, et elle dit pourquoi.** L'API de compte (`/api/v1/auth/key`) **n'expose aucun champ** de rétention, de ZDR ni de journalisation : ces réglages ne sont pas vérifiables par programme, leur preuve est une copie d'écran du tableau de bord, que seul le titulaire du compte peut produire. **La case reste à cocher.** Détail et méthode : [preuves/openrouter-2026-09-11.md](../preuves/openrouter-2026-09-11.md).
  - ⚠ **Ces garanties ne sont portées par aucun appel.** Le corps envoyé par `llm-client.ts` ne contient **aucun bloc `provider`** : ni refus de collecte, ni exigence ZDR, ni liste blanche d'opérateurs. Tout repose sur un réglage de compte non capturé.
- Trust Portal OpenRouter consultable pour les certifications de sécurité.

## Réponse préparée pour un auditeur qui demanderait le DPA signé

> « Start Academy utilise OpenRouter en offre self-serve, pour laquelle le fournisseur ne propose pas de DPA mutuellement signé (réservé au tier enterprise — vérifié auprès du support, 2026-07). Les garanties effectives en place sont : politique contractuelle par défaut de non-rétention des prompts (métadonnées seules), réglage logging OFF sur le compte, et enforcement ZDR (Zero Data Retention) sur les endpoints d'inférence. Ces réglages sont capturés en preuve. Si un DPA signé devenait une exigence formelle, la migration vers le tier enterprise OpenRouter est la voie identifiée. »

## Points ouverts / limites

- ⚠ **Pas de DPA signé** (self-serve) — limite assumée, **acceptée par le responsable de traitement le 2026-07-07** (validation du registre, gate D-13, cf. registre § Limites connues).
- ⚠ Réglages ZDR/logging OFF **à vérifier et capturer** (copie d'écran) — **toujours ouvert au 2026-09-11**, la bascule prod ayant eu lieu entre-temps. Non produisible par programme (voir ci-dessus).
- ⚠ **Le routage multi-opérateurs (§ Localisation) n'est répercuté ni dans [anthropic.md](anthropic.md), ni dans le registre.** Constat relevé le 2026-09-11, **correction non faite** : elle relève du chantier « fournisseur IA » ouvert par le responsable de traitement.
- ⚠ **Le flux le plus sensible est le plus récent** : depuis le lot C (Traitement 11), c'est un compte rendu de rendez-vous intégral qui part, pas seulement des noms de stagiaires. Le transfert a été accepté le 2026-07-07 sur la base des flux d'alors ; l'extension à celui-ci reste à arbitrer explicitement.
- Mitigation possible si exigence renforcée un jour : ZDR enforcement systématique ; tier enterprise (DPA signé).
