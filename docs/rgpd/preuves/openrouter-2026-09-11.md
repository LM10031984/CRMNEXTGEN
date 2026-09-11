# Capture des réglages OpenRouter — 2026-09-11

> Action ouverte depuis le 2026-07-06 : « réglages ZDR / logging OFF **à vérifier
> et capturer** avant la bascule prod » ([dpa/openrouter.md](../dpa/openrouter.md),
> registre § Limites connues, point 2). Cette page est la première tentative de
> capture. **Elle est partielle, et dit pourquoi.**

| Champ | Valeur |
|---|---|
| **Date de la capture** | 2026-09-11 |
| **Méthode** | Appels **en lecture seule** à l'API OpenRouter depuis le poste de développement, avec la clé de `.env`. Aucune inférence déclenchée, aucun coût. |
| **Reproductible par** | `curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/auth/key`<br>`curl https://openrouter.ai/api/v1/models/anthropic/claude-sonnet-4.6/endpoints` |

---

## 1. Ce qui est vérifié par la machine

### 1.1 Le compte n'est pas en offre gratuite — mais pas en entreprise non plus

`GET /api/v1/auth/key` répond `"is_free_tier": false`, sans clé de
provisionnement ni clé de gestion, avec un plafond de dépense mensuel configuré.

**Ce que ça ne change pas** : « payant » n'est pas « enterprise ». Le DPA
mutuellement signé reste réservé au tier enterprise (vérifié auprès du support
en 2026-07). Le constat de juillet tient : **pas de DPA signé**.

### 1.2 ⚠ Les réglages demandés ne sont PAS exposés par l'API

La réponse de `/api/v1/auth/key` ne porte **aucun champ** relatif à la rétention
des prompts, au ZDR, ni à la journalisation. Champs réellement retournés :
`label`, `is_management_key`, `is_provisioning_key`, `limit`, `limit_reset`,
`limit_remaining`, `include_byok_in_limit`, `usage`, `usage_daily`,
`usage_weekly`, `usage_monthly`, `byok_usage*`, `is_free_tier`, `expires_at`,
`creator_user_id`, `rate_limit` (ce dernier documenté comme déprécié).

**Conséquence directe : la capture demandée depuis juillet ne peut pas être
produite par un programme.** ZDR et journalisation sont des réglages de tableau
de bord ; leur preuve est une **copie d'écran**, et elle ne peut être faite que
par le titulaire du compte. Voir § 3.

### 1.3 ⚠ Notre modèle est servi par NEUF endpoints, chez CINQ opérateurs

`GET /api/v1/models/anthropic/claude-sonnet-4.6/endpoints` retourne **9 endpoints** :

| Opérateur | Nombre d'endpoints | État rapporté |
|---|---|---|
| Amazon Bedrock | 3 | 0 (normal) |
| Google | 3 | 0 (normal) |
| Claude Platform on AWS | 1 | 0 (normal) |
| Azure (Microsoft) | 1 | 0 (normal) |
| **Anthropic** | 1 | **-2** |

La réponse ne comporte **ni champ de politique de données, ni champ de région**
(clés disponibles : `context_length`, `pricing`, `provider_name`, `quantization`,
`status`, `supported_parameters`, `throughput_last_30m`, `uptime_*`…).

**C'est le constat le plus important de cette capture, et il corrige le
registre.** La fiche [dpa/openrouter.md](../dpa/openrouter.md) affirme que
« l'inférence est routée vers les providers de modèles (**Anthropic** pour
QualiOF) », et [dpa/anthropic.md](../dpa/anthropic.md) construit toute la chaîne
de sous-traitance sur cette affirmation. Elle **n'est pas établie** : le même
modèle est servi par Microsoft, Amazon et Google, et l'endpoint d'Anthropic
lui-même était le seul en état anormal au moment de la mesure. Le destinataire
réel d'un prompt donné n'est pas déterminé par notre configuration.

### 1.4 ⚠ Notre code ne contraint pas le routage

Le corps envoyé par `apps/web/src/lib/llm-client.ts` (`callOpenRouter`) contient
`model`, `messages`, `temperature`, `max_tokens`, et `response_format` quand on
demande du JSON. **Il ne contient aucun bloc `provider`** : ni refus de collecte,
ni exigence ZDR, ni liste blanche d'opérateurs, ni épinglage de région.

Autrement dit, les garanties que le registre présente comme « effectives »
reposent **entièrement sur un réglage de compte que personne n'a capturé**, et
non sur quelque chose que notre code demande à chaque appel.

---

## 2. Flux concernés par ce constat

Tous les flux IA de QualiOF passent par le même client et la même configuration :

| Flux | Traitement au registre | Nature des données envoyées |
|---|---|---|
| Documents de fin de formation | 3 | Noms des stagiaires, contexte de session |
| OCR des pièces de préinscription | 2 | **Images de CNI, RIB, attestations CFP** |
| Programme personnalisé du stand | 9 | Réponses fermées uniquement (aucune identité) |
| Veille réglementaire | 8 | Contenus publics |
| **Compte rendu de rendez-vous de diagnostic** | **11** | **Verbatim intégral d'une conversation professionnelle, appréciations nominatives sur des tiers** |

---

## 3. Ce qui reste à capturer à la main — titulaire du compte uniquement

- [ ] **Réglage de journalisation des prompts** — tableau de bord OpenRouter,
      page *Settings › Privacy*. Copie d'écran datée montrant l'état du
      basculeur.
- [ ] **Politique ZDR / refus de collecte** — même page. Copie d'écran datée.
- [ ] Déposer les copies d'écran à côté de ce fichier et les référencer ici.

Tant que ces trois cases ne sont pas cochées, la phrase du registre
« réglages ZDR/logging à vérifier et capturer » reste **non honorée**, et les
garanties effectives des cinq flux ci-dessus reposent sur une affirmation
invérifiée.

---

## 4. Hors périmètre de cette capture

Relevé mais **non traité**, à verser au chantier « fournisseur IA » :

- La correction de [dpa/anthropic.md](../dpa/anthropic.md), dont la chaîne de
  sous-traitance est bâtie sur un routage vers Anthropic que le § 1.3 ne
  confirme pas.
- La piste d'un garde-fou **par requête** plutôt que par réglage de compte : le
  corps d'un appel OpenRouter accepte un bloc `provider` permettant d'exiger le
  refus de collecte et de restreindre les opérateurs. Ce serait une garantie
  que notre code porte, donc qu'un audit peut lire — au lieu d'une case cochée
  dans un tableau de bord tiers. **À évaluer, non implémenté.**
