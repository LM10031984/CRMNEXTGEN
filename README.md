# QualiOF — Starter pack

Logiciel de gestion d'organisme de formation Qualiopi-friendly, conçu pour résoudre proprement le cas **personne physique × auto-entreprise × salarié**.

> **Statut :** dossier de bootstrap. Le code applicatif sera généré par Claude Code à partir de `docs/MVP-SPEC.md`.

---

## 🍎 Prérequis Mac

```bash
# Vérifier ce qui est installé
docker --version          # Docker Desktop (ou OrbStack, plus léger)
node --version            # 20+
pnpm --version            # 9+
python3 --version         # 3.11+ (pour palier 3 uniquement)
ollama --version          # optionnel, recommandé en natif sur Apple Silicon
```

Si quelque chose manque :

```bash
brew install --cask docker          # ou orbstack (plus rapide sur M-series)
brew install node                    # ou via fnm/nvm
npm install -g pnpm                  # gestionnaire de paquets
brew install python@3.11
brew install ollama                  # natif > containerisé sur Mac M-series
```

---

## 🚀 Démarrage en 3 minutes

```bash
# 1. Copier les variables d'env
cp .env.example .env

# 2. Lancer les services Docker (Postgres, Redis, MinIO, Gotenberg)
make up

# 3. (Optionnel) Lancer Ollama natif et puller le modèle
ollama serve &
ollama pull llama3.1:8b
```

À ce stade tu as :

| Service | URL | Identifiants |
|---------|-----|--------------|
| Postgres | `localhost:5432` | `qualiof` / `qualiof_dev` |
| Redis | `localhost:6379` | – |
| MinIO console | http://localhost:9001 | `qualiof` / `qualiof_dev_minio` |
| Gotenberg | http://localhost:3001 | – |
| Ollama | http://localhost:11434 | – |

**Rien d'autre ne tourne encore.** L'app Next.js, le doc-engine Python et les workers BullMQ vont être générés par Claude Code étape par étape.

---

## 📋 Étapes suivantes

1. **Ouvre Claude Code** dans ce dossier (`claude` dans le terminal)
2. Démarre une nouvelle session avec ce prompt initial :

   > *Lis `docs/MVP-SPEC.md` et attaque le **palier 1**. Pose-moi une question avant de commencer si quelque chose n'est pas clair, sinon c'est parti.*

3. Laisse Claude Code faire le palier 1 (~3-4 jours de travail itératif)
4. Quand le palier 1 est validé, demande le palier 2, puis le palier 3

À chaque fin de palier, le fichier `docs/PROGRESS.md` sera mis à jour automatiquement, et tu pourras tester via `make dev`.

---

## 🗺️ Carte des fichiers

```
qualiof-starter/
├── README.md                # tu es ici
├── Makefile                 # commandes raccourcies (make up, make dev, etc.)
├── .env.example             # template variables d'env
├── docker-compose.yml       # Postgres + Redis + MinIO + Gotenberg
└── docs/
    ├── MVP-SPEC.md          # 👉 LE fichier à donner à Claude Code
    └── VISION.md            # cible long terme (lot 2, 3, ...)
```

---

## 🎯 Scope MVP rappelé

**Dans le MVP (4 semaines) :**
- Auth multi-user + 4 rôles
- Apprenants / organisations / formateurs avec gestion native du cas EI
- Sessions + émargement
- Génération auto de 6 documents Qualiopi (convention, programme, convocation, émargement, attestation, certificat)
- Branchement HTTP sur ton outil questionnaires existant
- Import CSV depuis Airtable + SmartOF

**Reporté au lot 2 :**
- PDF AGEFICE
- Facturation complète + numérotation continue
- BPF Cerfa 10443
- Workflows Kanban + automatisations
- Signature électronique Yousign
- 32 indicateurs Qualiopi en feu tricolore

---

## 🆘 Si quelque chose merde

```bash
make logs        # voir les logs Docker
make down        # tout arrêter
make clean       # tout arrêter + supprimer les volumes (RESET COMPLET, données perdues)
make up          # relancer
```
