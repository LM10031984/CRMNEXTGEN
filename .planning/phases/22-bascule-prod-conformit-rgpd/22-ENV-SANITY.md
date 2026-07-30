# 22-ENV-SANITY — Sanity check des variables d'environnement (D-18 ②)

**Date du scan :** 2026-07-06
**Outil :** `apps/web/scripts/sanity-check-env.ts` (regex `/[^\x20-\x7E]|#| +$/` — non-ASCII imprimable, dièse inline, espaces de fin)
**Règle de sécurité :** aucune VALEUR n'est affichée ni consignée — seulement le nom de clé, l'index du premier caractère suspect et son codepoint.

## Contexte (pourquoi ce scan)

2 incidents ByteString déjà survenus (leçon PROD-0674) : les dashboards Vercel/Railway
stockent la valeur BRUTE posée par API — un commentaire inline du `.env` racine
(` # ← À REMPLIR`) finit dans la valeur, et un caractère non-ASCII (`←` U+2190) dans
`OPENROUTER_API_KEY` casse le header `Authorization` (`Cannot convert argument to a
ByteString`, l'index de l'erreur pointe le caractère fautif). Ce scan est l'étape
« sanity check env » du runbook de bascule (§1).

## Commandes exécutées

```bash
# Pull des env production du projet Vercel qualiof (fichier gitignoré via `.env*`)
vercel env pull .env.vercel-prod --environment=production --yes

# Scan 1 — env Vercel production (état réellement déployé)
cd apps/web && pnpm tsx scripts/sanity-check-env.ts ../../.env.vercel-prod

# Scan 2 — .env racine (SOURCE des re-poses — c'est lui qui portait les « ← À REMPLIR »)
cd apps/web && pnpm tsx scripts/sanity-check-env.ts ../../.env

# Nettoyage : le dump d'env prod ne reste pas sur disque
rm .env.vercel-prod
```

## Scan 1 — Vercel production (`.env.vercel-prod`, pull du 2026-07-06)

```
✗ OF_ADDRESS_STREET: caractère suspect à l'index 22 (codepoint U+00E9)

71 variables scannées, 1 polluées
```

**Analyse :**

| Clé | Codepoint | Verdict |
| --- | --- | --- |
| `OF_ADDRESS_STREET` | U+00E9 (`é`) | **Faux positif métier** : accent français légitime de l'adresse du siège (« Inférieur »). Cette valeur alimente les footers PDF / documents OF, elle ne transite JAMAIS dans un header HTTP → aucun risque ByteString. **Décision runbook §1 : conserver telle quelle** (l'écraser en ASCII dégraderait les documents Qualiopi). |

**Confirmation D-18 ① :** `OPENROUTER_API_KEY` est présente dans le pull et scanne
**PROPRE** (plus de U+2190) — le nettoyage immédiat post-PROD-0674 du 2026-07-06 est
confirmé par preuve de scan. Idem pour les 49 autres variables posées en 21-04
(28 app + 22 `OF_*`) : **zéro commentaire inline, zéro espace de fin** côté Vercel prod.

Le total de 71 inclut les variables système injectées par Vercel dans le pull
(`VERCEL_*`, `TURBO_*`, `NX_DAEMON`) — toutes propres.

## Scan 2 — `.env` racine (source des re-poses)

```
✗ SESSION_LIFETIME: caractère suspect à l'index 11 (codepoint U+0023)
✗ OF_ADDRESS_STREET: caractère suspect à l'index 22 (codepoint U+00E9)
✗ OPENROUTER_MODEL_FAST: caractère suspect à l'index 38 (codepoint U+0023)
✗ OPENROUTER_MODEL_QUALITY: caractère suspect à l'index 35 (codepoint U+0023)
✗ OPENROUTER_MODEL_VISION: caractère suspect à l'index 36 (codepoint U+0023)
✗ OPENROUTER_SITE_URL: caractère suspect à l'index 40 (codepoint U+0023)

85 variables scannées, 6 polluées
```

**Analyse :**

| Clé | Codepoint | Verdict |
| --- | --- | --- |
| `SESSION_LIFETIME` | U+0023 (`#`) | Commentaire inline (` # 30 jours`) — **classe PROD-0674** : toute pose API naïve de cette ligne embarquerait le commentaire. À stripper avant re-pose. |
| `OPENROUTER_MODEL_FAST` | U+0023 (`#`) | Commentaire inline — classe PROD-0674. |
| `OPENROUTER_MODEL_QUALITY` | U+0023 (`#`) | Commentaire inline — classe PROD-0674. |
| `OPENROUTER_MODEL_VISION` | U+0023 (`#`) | Commentaire inline — classe PROD-0674. |
| `OPENROUTER_SITE_URL` | U+0023 (`#`) | Commentaire inline (` # update quand Vercel deploy`) — classe PROD-0674, ET valeur à re-pointer de toute façon (localhost:3010 → qualiof.vercel.app) lors de la bascule. |
| `OF_ADDRESS_STREET` | U+00E9 (`é`) | Même faux positif métier que côté Vercel (adresse accentuée légitime). |

⚠ **Les valeurs Vercel prod correspondantes sont PROPRES** (scan 1) : les commentaires
inline du `.env` racine n'ont donc PAS re-contaminé la prod depuis le fix D-18 ①.
Mais le `.env` racine reste la SOURCE de toute re-pose future → **toute re-pose
(runbook §1, plan 22-06) DOIT passer par un parse dotenv (valeur nettoyée) puis ce
sanity check post-pose** — jamais de copie de ligne brute.

## Variables absentes du pull (Pitfall 2)

Absentes du pull production : **`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` /
`SMTP_FROM` / `MAIL_FROM` / `MAIL_REPLY_TO` / `CRON_SECRET`** — non posées en 21-04
(MAIL_DRY_RUN=true, SMTP inutile au staging) ou marquées sensitive.

**Note Pitfall 2 :** Les vars sensitive ne sont PAS dans le pull — leur assainissement
= re-pose depuis source propre + preuve comportementale (auto-fill IA produit re-testé
OK post-D-18 ①, à re-prouver au runbook §9.1). Au moment de poser les vars SMTP pour le
flip MAIL_DRY_RUN (runbook §4 / plan 22-07), appliquer le même protocole : valeur
nettoyée (jamais de ligne brute avec commentaire), puis preuve comportementale (email
témoin réel).

## Conclusion runbook §1

- **Vercel prod : GO** — aucune valeur ByteString-dangereuse (le seul flag est l'accent
  légitime de l'adresse OF).
- **`.env` racine : 5 lignes à commentaire inline identifiées** (`SESSION_LIFETIME`,
  `OPENROUTER_MODEL_FAST/QUALITY/VISION`, `OPENROUTER_SITE_URL`) — la CORRECTION
  éventuelle (nettoyage du fichier source et/ou re-pose) appartient au runbook §1
  (plan 22-06), pas à ce plan (aucune mutation d'env prod en Wave 1).
- `.env.vercel-prod` supprimé du disque après scan ; couvert par `.gitignore` (`.env*`).

---
*Phase 22 — Plan 22-04, Task 1 (D-18 ②)*
