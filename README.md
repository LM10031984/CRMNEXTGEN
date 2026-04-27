# QualiOF

CRM Qualiopi local-first pour Start Academy. Remplace SmartOF, gère nativement le cas EI / multi-casquettes (Pascal BIANCO), connecté à Qualiopi Gen pour la génération de docs IA.

> **Statut** : palier 1 (fondations) en cours. Voir `docs/PROGRESS.md`.

---

## 🍎 Prérequis

```bash
# Vérifier
node --version            # 20+
pnpm --version            # 10+
docker --version          # OrbStack (recommandé sur Apple Silicon)
ollama --version          # natif via brew
```

Si quelque chose manque :

```bash
brew install --cask orbstack          # Docker plus léger sur M-series
brew install node@20
npm install -g pnpm@latest
brew install ollama                    # natif > containerisé sur Apple Silicon
```

Pour l'IA, on a besoin d'au moins ces 3 modèles déjà téléchargés :
- `mistral-small:24b` (rapide) → `ollama pull mistral-small:24b`
- `qwen3:30b-a3b` (raisonnement) → `ollama pull qwen3:30b-a3b`
- `nomic-embed-text:latest` (embeddings) → `ollama pull nomic-embed-text`

---

## 🚀 Démarrage

```bash
# 1. Variables d'env
cp .env.example .env
# Génère un AUTH_SECRET valide :
echo "AUTH_SECRET=\"$(openssl rand -hex 32)\"" >> .env.local

# 2. Lance les services Docker
make up

# 3. Installe les deps + génère le client Prisma
pnpm install
pnpm --filter @qualiof/db db:generate

# 4. Première migration + seed initial
pnpm --filter @qualiof/db db:migrate
pnpm --filter @qualiof/db db:seed

# 5. Importe les données SmartOF (apprenants, entreprises, formateurs, produits)
pnpm --filter @qualiof/db import:smartof

# 6. Lance le front Next.js
pnpm --filter @qualiof/web dev
```

Tu accèdes à :
- **App** : http://localhost:3000 (login : `admin@startacademy.fr` / `admin`)
- **MinIO** : http://localhost:9001 (qualiof / qualiof_dev_minio)
- **Postgres** : localhost:5432 (qualiof / qualiof_dev)
- **Prisma Studio** : `pnpm --filter @qualiof/db db:studio`

---

## 📂 Structure du mono-repo

```
qualiof/
├── apps/
│   └── web/                  # Next.js 14 + tRPC + Lucia (palier 1+)
├── packages/
│   ├── db/                   # Prisma schema (32 modèles) + seed + importeur SmartOF
│   └── shared/               # Zod schemas, helpers (Luhn, normalize, codes), constantes
├── docs/
│   ├── MVP-SPEC.md           # Spec MVP originale
│   ├── VISION.md             # Roadmap long terme
│   └── PROGRESS.md           # Avancement par palier
├── docker-compose.yml        # Postgres + Redis + MinIO + Gotenberg
├── Makefile
├── package.json              # workspace racine
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 📋 Roadmap (4 paliers de 1 semaine)

- **Palier 1** — Fondations + import SmartOF ✅ (en cours)
  - Mono-repo, schéma Prisma 32 modèles, importeur Excel, login Lucia, sidebar, dashboard
- **Palier 2** — CRUD complet + cas EI + adapter Qualiopi Gen
  - `<PersonOrOrgPicker>`, `<LegalLinkEditor>`, wizard sessions, test Playwright Pascal BIANCO
- **Palier 3** — Doc-engine + 6 templates + AGEFICE pré-rempli
  - FastAPI Python + docxtpl + pypdf, mapping AGEFICE 54 champs
- **Palier 4** — Bouton magique fin-de-formation + IA locale
  - BullMQ closure worker, Ollama adapter, idempotence, zip download

Détails : `docs/PROGRESS.md`.

---

## 🔌 Intégrations

- **Qualiopi Gen** (Supabase cloud) : 9 Edge Functions IA pédagogiques (`generate-analyse-besoin`, `-qcm`, `-grille`, `-deroule`, `-competencies`). Le CRM les appelle via HTTPS.
- **Ollama** (local) : provider IA par défaut pour assistant rédaction, recherche sémantique apprenants, complétion fiches.
- **MinIO** (local) : tous les PDFs (conventions, AGEFICE, docs pédagogiques).
- **Anthropic Claude** : fallback optionnel si une clé API est fournie.
