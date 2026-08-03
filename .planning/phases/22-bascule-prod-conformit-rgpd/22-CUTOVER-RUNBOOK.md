# 22-CUTOVER-RUNBOOK — Bascule production QualiOF (Vercel + Railway + Supabase)

> **Pour qui ?** Ce runbook est écrit pour être suivi par un **non-technicien** (Laurent),
> pattern éprouvé des runbooks `20-DEPLOY.md` (Railway) et `21-DEPLOY-VERCEL.md` (Vercel) :
> tout le chemin nominal se fait au **dashboard** (clics, copier-coller, lecture d'écrans).
> Les quelques commandes techniques citées (scripts `tsx`, `vercel env pull`, requêtes
> Prisma de preuve) sont **exécutées par Claude** sur autorisation explicite de Laurent
> (pattern 21-04 — délégation API/CLI) : **aucune commande CLI n'est obligatoire pour
> Laurent** dans ce document.

**Ce qu'est la bascule** : un changement de **variables d'environnement**, pas de code
(toutes les gardes staging sont pilotées par `NEXT_PUBLIC_APP_ENV` + `MAIL_DRY_RUN`,
Phase 21). Deux « flips » séparés par un gate :

1. **Flip 1 (§2)** : `NEXT_PUBLIC_APP_ENV=production` sur Vercel → l'app sort du mode
   staging (bandeau, filigrane PDF, garde calendrier). Les emails restent en dry-run.
2. **Gate go/no-go (§3)** : pack témoin SES-0094 régénéré et validé. NO-GO → rollback §8.
3. **Flip 2 (§4)** : `MAIL_DRY_RUN=false` sur **Vercel ET Railway** → les emails
   deviennent réels, APRÈS rapport des envois en attente + validation Laurent.

**Réversibilité** : le rollback (§8, décision D-04) est un re-flag staging en ~5 minutes.
La base cloud Supabase reste la vérité dans tous les cas — aucun retour au Mac local.

**Qui exécute quoi** : les sections §1–§7 de ce runbook sont exécutées par les plans
22-06 à 22-10 de la phase, qui remplissent au fur et à mesure le gabarit d'evidence (§9).

| Section | Contenu | Plan exécutant |
| --- | --- | --- |
| §0 | Pré-requis de la fenêtre (checklist) | gate d'entrée (22-06) |
| §1 | Sanity check env (D-18 ②) | 22-06 |
| §2 | Flip 1 — passage en production (Vercel) | 22-06 |
| §3 | Gate go/no-go — pack témoin SES-0094 | 22-07 |
| §4 | Flip 2 — emails réels (rapport + validation) | 22-07 / 22-08 |
| §5 | Invitations équipe (RBAC) | 22-08 |
| §6 | Alertes coûts + backups | 22-09 |
| §7 | Avertissements post-bascule | tous |
| §8 | Plan de rollback (D-04) | si NO-GO |
| §9 | Evidence (gabarit daté) | 22-06..22-10 |

---

## §0 Pré-requis de la fenêtre (checklist — TOUT doit être vert AVANT §2)

À vérifier dans l'ordre. Un seul item rouge = la fenêtre n'ouvre pas.

- [ ] **Phase 20 clôturée** : relevé de stabilité 24 h du worker Railway effectué
      (attendu 2026-07-07 ~08h45 Paris, fin de l'observation démarrée au 20-05)
      **ET** `/gsd:verify-work 20` passé. Sans cette clôture, le compute cloud
      n'est pas formellement prouvé stable.
- [ ] **Audit d'écart data local↔cloud = PASS** (plan 22-03, décision D-01) : le rapport
      `22-DATA-GAP-AUDIT.md` prouve qu'aucune donnée du Postgres local Docker n'est
      postérieure au dump du 2026-07-03 → le cloud est déclaré **unique source de vérité**.
      Pas de re-dump, jamais (il écraserait le travail cloud depuis le 5 juillet).
- [ ] **Re-audit storage final = 0 lien mort** (plan 22-03, décision D-02) : re-jeu de
      l'audit `migrate-storage.ts` DRY→(WRITE si écart)→re-audit contre l'état FINAL de
      la base cloud ; rapport daté déposé dans `.planning/audit/`. Baseline du
      2026-07-06 : 902/902 clés cloud résolvent Supabase. MinIO local NON purgé.
- [ ] **Sanity check env = 0 valeur polluée** (plan 22-04, D-18 ② — détail en §1) :
      aucune variable Vercel/Railway avec espace de fin, `#` ou caractère non-ASCII.
- [ ] **Gate RGPD validé par Laurent** (plan 22-05, décision D-13) : registre des
      traitements + **7 fiches DPA** (OpenRouter, Anthropic, Supabase, Vercel, Railway,
      Google, OVH SMTP) rédigés et validés par le responsable de traitement AVANT que
      les PII prod ne circulent.
- [ ] **CI verte sur `main`** : le dernier run GitHub Actions (job `test`) est vert sur
      `main`. Rappel non-négociable : toute PR `cloud-migration`→`main` se merge en
      **MERGE COMMIT, JAMAIS squash** (leçon 21-04 — le squash fait diverger les branches).

---

## §1 Sanity check env (D-18 ② — leçon PROD-0674, 2 incidents ByteString)

**Pourquoi** : le `.env` racine local contient des commentaires inline (` # ← À REMPLIR`)
que dotenv strippe en local, mais qu'une pose par API/copier-coller embarque tels quels
dans la valeur. Résultat vécu 2× : `OPENROUTER_API_KEY` polluée par un `←` (char 8592)
→ erreur `ByteString` sur le header `Authorization` (l'index de l'erreur pointe le
caractère fautif). Le sanity check garantit : **aucune valeur avec espace de fin, `#`
ou caractère non imprimable ASCII** sur Vercel comme sur Railway.

Procédure (exécutée par Claude, résultats montrés à Laurent) :

1. **Vars non-sensitive (relisibles)** : Claude exécute
   `vercel env pull .env.vercel-prod --environment=production` (projet `qualiof`,
   team `laurents-projects-3806ab87`), puis
   `pnpm tsx apps/web/scripts/sanity-check-env.ts .env.vercel-prod` —
   le script scanne chaque valeur avec la regex `[^\x20-\x7E]|#| +$`
   (non-ASCII imprimable, dièse, espaces de fin) et affiche, pour chaque clé
   suspecte, l'index exact du caractère fautif. **Attendu : 0 clé suspecte.**
2. **Vars sensitive (NON relisibles — Pitfall 2)** : Vercel ne restitue JAMAIS la
   valeur déchiffrée d'une variable « Sensitive » (API ou dashboard). Deux parades
   complémentaires :
   - **re-pose depuis une source assainie** : Claude re-pose chaque sensitive depuis
     le `.env` local passé par un **parser dotenv qui strippe les commentaires
     inline** (jamais la ligne brute) — c'est la remédiation PROD-0674 ;
   - **preuve comportementale** : re-test du bouton **auto-fill IA** d'une fiche
     produit (le flux qui a révélé le bug) — un remplissage réussi prouve que
     `OPENROUTER_API_KEY` est saine de bout en bout.
3. **Règle permanente** (pour toute pose future, Laurent comme Claude) : ne **JAMAIS**
   coller une ligne `.env` brute contenant ` # …` dans un dashboard (Vercel ET Railway
   stockent la valeur BRUTE collée, commentaire compris).

**Preuve à consigner (§9.1)** : sortie du script (0 suspect) + capture/log du re-test
auto-fill réussi.

---

## §2 Flip 1 — passage en production (Vercel, projet `qualiof`, team laurents-projects-3806ab87)

Toutes les manipulations ci-dessous se font dans
**Vercel Dashboard → projet `qualiof` → Settings → Environment Variables**,
environnement **Production**.

### 2.1 Poser les 3 variables Google (⚠ Pitfall 3 : 3 valeurs, PAS 1)

Le portage Calendar (décision D-07) exige **trois** valeurs — porter le seul refresh
token ferait crasher le client Google sur Vercel (fichier `oauth-client.json` absent) :

| Variable | Source (fichier local, JAMAIS copié dans ce runbook) | Type |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | `files/secrets/oauth-client.json` → champ `installed` (ou `web`) → `client_id` | **Sensitive** |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `files/secrets/oauth-client.json` → champ `installed` (ou `web`) → `client_secret` | **Sensitive** |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | `files/secrets/google-token.json` → champ `refresh_token` | **Sensitive** |

⚠ Pose conforme §1 : valeurs assainies (pas d'espace, pas de commentaire), posées par
Claude via API depuis un parser dotenv/JSON propre, ou collées une à une depuis le
fichier JSON (pas depuis une ligne `.env`).

### 2.2 Basculer le flag d'environnement

- `NEXT_PUBLIC_APP_ENV` : changer la valeur `staging` → **`production`**
  (environnement Production). C'est CE flag qui lève d'un coup : bandeau STAGING,
  filigrane PDF, garde calendrier (`sync-session.ts`).
- **`MAIL_DRY_RUN` reste `true` PARTOUT à ce stade** — sur Vercel **ET** sur Railway.
  Le flip des emails réels est le §4, APRÈS le gate §3. Ne pas anticiper.

### 2.3 Redeploy OBLIGATOIRE

⚠ **`NEXT_PUBLIC_*` est inliné au moment du build** : changer la variable ne suffit
PAS, il faut redéployer. **Deployments → dernier deployment Production → ⋯ → Redeploy**
(décocher « Use existing Build Cache » si proposé). Attendre le statut **Ready** (vert).

### 2.4 Preuves du Flip 1 (à consigner en §9.2)

- `https://qualiof.vercel.app/login` répond **200 SANS bandeau STAGING**
  (Claude vérifie : `grep -c "STAGING"` = 0 sur la page, + header `x-vercel-id`
  contenant `cdg1`) ;
- **login OK** : Laurent (ou Claude avec le compte e2e) se connecte et atteint `/app` ;
- capture de l'écran Environment Variables montrant `NEXT_PUBLIC_APP_ENV=production`
  et `MAIL_DRY_RUN=true` (les valeurs sensitive restent masquées — normal).

---

## §3 Gate go/no-go — pack témoin SES-0094 (D-10)

**Le témoin habituel des Phases 20/21** — mêmes critères, pour rester comparable aux
runs précédents. Régénération **complète** du pack fin de formation de la session
SES-0094 (déclenchée depuis la fiche session, bouton pack 1-clic ; le worker Railway
consomme la file Postgres).

Critères de validation (TOUS requis pour le GO) :

| # | Critère | Comment on le prouve |
| --- | --- | --- |
| 1 | **0 stub** | `usedStub=false` en base sur TOUS les documents du pack (requête Prisma par Claude) |
| 2 | **Footer 22 vars OF_*** | contrôle visuel d'un PDF : footer complet (nom, SIRET, RNQ, IBAN…) — les 22 variables `OF_*` Railway alimentent `of-config.ts` |
| 3 | **Docs Qualiopi conformes** | relecture d'échantillon (attestation, certificat, émargement…) au standard des packs validés Phases 20/21 |
| 4 | **Aucun 404** | chaque signed URL des documents du pack répond 200 (curl par Claude) |
| 5 | **`%PDF-` en tête de fichier** | le contenu binaire téléchargé commence par `%PDF-` (pas une page d'erreur HTML) |
| 6 | **PDF SANS filigrane STAGING** (D-08) | contrôle visuel : le filigrane a disparu avec `NEXT_PUBLIC_APP_ENV=production` — c'était la preuve attendue, zéro code |

**Décision** :
- **GO** : tous les critères verts → passer au §4.
- **NO-GO** : un seul critère rouge → **§8 rollback immédiat** (re-flag staging,
  ~5 min), diagnostic à froid, on ne reste PAS en production dégradée.

**Preuve à consigner (§9.3)** : compteurs 0 stub, sorties curl des signed URLs,
PDF échantillon sans filigrane.

---

## §4 Flip 2 — emails réels (D-06 — séquence STRICTE, dans cet ordre)

⚠ **Exigence forte de Laurent (répétée 2×)** : JAMAIS d'envoi de masse vers les
apprenants sans action explicite. Ce flip ne s'exécute qu'après le rapport et la
validation ci-dessous.

1. **Rapport des envois en attente** : Claude génère `22-PENDING-SENDS-REPORT.md` —
   la liste nominative de TOUT ce qui partirait au premier run réel du cron relances
   factures (worker Railway, quotidien 8h) : facture, payeur, email destinataire,
   niveau de relance. ⚠ Règle payeur : un auto-entrepreneur est son propre payeur —
   une relance facture PEUT toucher un apprenant.
   Le rapport inclut AUSSI les **relances « brûlées » en dry-run** (Pitfall 1) : le
   cron incrémente `reminderCount` et pose `lastReminderAt` MÊME en dry-run depuis la
   Phase 20 (traçable via `AuditLog`, action `invoices.reminder_sent`,
   `diff.dryRun=true`) — des niveaux de relance ont été consommés sans qu'aucun email
   ne parte.
2. **Validation Laurent** : Laurent lit le rapport et **décide la remédiation des
   compteurs brûlés** (reset ciblé des `reminderCount` pollués, ou acceptation en
   l'état — en tenant compte des factures qu'il a relancées manuellement hors outil).
   Aucun flip sans cette décision écrite.
3. **Le flip, sur DEUX plateformes** (⚠ Pitfall 10 — en oublier une = moitié des
   emails silencieusement en dry-run) :
   - **Vercel** : projet `qualiof`, env **Production** → `MAIL_DRY_RUN` = `false`
     **+ Redeploy** (même mécanique qu'au §2.3) ;
   - **Railway** : service **worker** → Variables → `MAIL_DRY_RUN` = `false` — le
     changement de variable **redéploie automatiquement le service** : prévoir la
     fenêtre (quelques minutes d'indisponibilité du worker, packs en cours terminés
     ou repris par la file Postgres).
   - Poser aussi sur les deux plateformes, si absentes, les variables SMTP
     (`SMTP_HOST=ssl0.ovh.net`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`,
     `SMTP_PASS` **Sensitive**, `SMTP_FROM`) — valeurs depuis le dashboard Railway
     worker (déjà posées et prouvées au 20-05 côté Railway).
4. **Preuve** : un **email test réel** part vers `laurent@start-academy.fr` (envoi
   déclenché par Claude via le flux applicatif) — la preuve est le **`messageId`
   SMTP retourné** (et PAS un log `dryRun`). À consigner en §9.4 avec le rapport
   et la décision.

---

## §5 Invitations équipe (D-09 — APRÈS gate §3 vert ET §4 fait)

La petite équipe de départ n'est invitée qu'une fois la prod validée et les emails
réels actifs (l'email d'invitation doit réellement partir).

1. **Laurent fournit la liste** : noms + emails + rôle RBAC pour chacun, parmi les
   6 rôles existants (Phase 8) : `ADMIN`, `MANAGER`, `FORMATEUR`, `COMMERCIAL`,
   `COMPTABLE`, `LECTEUR`. (Checkpoint prévu au plan 22-08 — rien à préparer avant.)
2. **Envoi via le flux existant** — aucune manipulation technique :
   **QualiOF → Paramètres → Utilisateurs → Inviter un utilisateur** (le formulaire
   appelle la server action `inviteUser` de `tenant-users.ts`, testée en Phase 8).
   Renvoyer une invitation expirée = bouton « Renvoyer » du même écran.
3. **Preuve (§9.5)** : liste des invités avec leur rôle (sans PII inutile — pas de
   copie des emails dans l'evidence si non nécessaire).

---

## §6 Alertes coûts + backups (D-11 / D-12)

**Email de TOUTES les alertes : `laurent@start-academy.fr`.** Seuils ~1,5× le coût
attendu. ⚠ Les dashboards évoluent : la consigne est « configurer **l'équivalent** de
X » — la **capture d'écran datée** fait foi comme preuve, pas le chemin de clics.

| Plateforme | Mécanique | Réglage recommandé | Où (dashboard) |
| --- | --- | --- | --- |
| **Vercel** | Spend Management (Pro) : budget + notifications email/web à seuils, option pause automatique | Budget **~45 $** ; alertes email ; **NE PAS activer l'auto-pause** (« pause all projects » couperait la prod toute seule) | Team Settings → Billing → Spend Management (rôle Owner/Billing) |
| **Railway** | Usage Limits : « custom email alert » (soft) + « hard limit » (coupe les workloads, min 10 $) | Soft alert **~35 €** ; **hard limit ABSENT ou très haut (≥3× budget)** — un hard limit bas couperait worker + doc-engines d'un coup | Workspace → Usage → Set Usage Limits (admin) |
| **Supabase** | Spend cap (Pro) ON par défaut = plafonne au plan 25 $/mois ; emails d'usage | Vérifier **spend cap ON** (défaut du plan Pro) — plafond dur SANS couper la base | Org → Billing |
| **OpenRouter** | Pas de budget mensuel : **Auto Top-Up OFF** (le solde prépayé devient plafond dur) + credit limit par clé API + alerte de solde | Auto Top-Up **OFF**, solde **~15 €**, **credit limit posée sur la clé de prod** | openrouter.ai → Credits + Keys |

⚠ Anti-Pitfall 5 : une alerte de coût ne doit JAMAIS pouvoir éteindre la prod toute
seule — d'où : pas d'auto-pause Vercel, pas de hard limit Railway bas. Le seul plafond
dur assumé est OpenRouter (voulu — voir §7 pour la conduite à tenir en cas de 402).

**Backups (D-12)** : vérifier au dashboard **Supabase → projet → Database → Backups**
que les snapshots **daily** sont actifs (plan Pro : 7 jours de rétention), projet en
région **eu-west-1** (Irlande, EU — dérogation actée `17-REGIONS.md`). **La capture
d'écran datée EST la preuve** (la doc officielle ne précise pas la région de stockage
des backups ; ils sont dans la même région que le projet, PAS off-site — le pg_dump
hors vendor reste au backlog assumé).

**Preuve à consigner (§9.6)** : 4 captures d'alertes (une par plateforme) + capture
backups Supabase.

---

## §7 Avertissements post-bascule (à relire par Laurent après la fenêtre)

- **La case « notifier les apprenants » du sync calendrier devient RÉELLE**
  (Pitfall 4) : en staging, la garde bloquait tout ; en production, cocher cette case
  sur une **session future** envoie de **vrais emails Google** aux apprenants et au
  formateur (invitations d'agenda). Garde-fous en place : la case est décochée par
  défaut (`notifyLearners=false`) et les sessions **passées** partent automatiquement
  en `sendUpdates='none'` (personne n'est notifié). Réflexe : ne cocher la case
  qu'en le voulant vraiment.
- **JAMAIS d'envoi de masse aux apprenants sans action explicite** (exigence Laurent) :
  l'état livré est conforme — convocations/documents = boutons manuels un par un,
  email de pack closure → uniquement l'admin déclencheur. Les **crons de relances
  préinscriptions/OPCO** (endpoints protégés `CRON_SECRET`) restent **volontairement
  DÉBRANCHÉS** (zéro cron Vercel) — leur activation future suivra le même principe
  rapport préalable + opt-in que le §4.
- **OpenRouter — packs closure en échec HTTP 402** : c'est le plafond dur voulu
  (Auto Top-Up OFF, §6) qui a fait son travail : le solde est à sec → **recharger les
  crédits** au dashboard OpenRouter, puis relancer le pack. Rien d'autre à toucher.
- **MinIO local NON purgé à la bascule** : le stockage local reste intact tant que le
  gate n'est pas soldé. La purge (conteneurs Docker locaux, avec pg_dump d'archive +
  snapshot MinIO préalables) est le **plan 22-10 séparé**, étape destructive avec
  liste finale + mot de validation de Laurent, en tours distincts (convention projet).

---

## §8 Plan de rollback (D-04 — retour au mode staging gardé, ~5 min, réversible)

**Principe** : le rollback est un **re-flag** `NEXT_PUBLIC_APP_ENV=staging` +
`MAIL_DRY_RUN=true` — exactement l'état staging gardé validé en Phase 21. Aucune
donnée n'est touchée.

### 8.1 Critères de déclenchement (l'un suffit)

- Pack témoin SES-0094 **NO-GO** au gate §3 (un critère rouge) ;
- **login cassé** en production (impossible d'atteindre `/app`) ;
- **PDF cassés** (documents illisibles, 404 en série, erreurs de rendu) ;
- **erreur d'environnement non diagnostiquée en moins de 30 minutes** — on ne
  débogue PAS en prod ouverte : on re-flag, on diagnostique à froid.

### 8.2 Le re-flag — tableau exact var → valeur

| Variable | Plateforme | Valeur rollback |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | Vercel (Production) | `staging` |
| `MAIL_DRY_RUN` | Vercel (Production) | `true` |
| `MAIL_DRY_RUN` | Railway (service worker) | `true` |

Puis :

- **Redeploy Vercel OBLIGATOIRE** (Deployments → ⋯ → Redeploy) — `NEXT_PUBLIC_*`
  est inliné au build, le re-flag seul ne change rien tant que l'app n'est pas
  redéployée (même mécanique qu'au §2.3) ;
- **Railway redéploie seul** au changement de variable — rien d'autre à faire.

### 8.3 Ce que le rollback NE touche PAS

- **La base cloud Supabase RESTE la vérité** — il n'y a PAS de rollback vers le
  Postgres du Mac local (obsolète depuis l'audit d'écart D-01 ; un restore local
  écraserait le travail cloud). Les données créées pendant la fenêtre restent en base.
- **Les 3 variables Google (§2.1) peuvent rester posées** : la garde staging de
  `sync-session.ts:84` (early-return quand `NEXT_PUBLIC_APP_ENV=staging`) re-bloque
  le sync calendrier d'elle-même — inutile de dé-poser les secrets.
- **Le storage Supabase** : aucun objet n'est supprimé.

### 8.4 Vérification post-rollback (~2 min, par Claude)

- `/login` répond 200 **AVEC bandeau STAGING** (retour de la garde) ;
- un PDF de test porte à nouveau le **filigrane STAGING** ;
- aucun email réel ne part (log `dryRun` au lieu d'un `messageId`).

---

## §9 Evidence (gabarit — rempli au fil de l'eau par les plans 22-06..22-10)

> Modèle : §9 de `21-DEPLOY-VERCEL.md` (evidence datée, sorties brutes en annexe).
> Chaque sous-section est remplie AU MOMENT de l'exécution, avec date UTC.
> Aucun secret en clair — captures avec valeurs masquées.

### 9.0 Preuves RGPD complémentaires (22-05) — statut

Les 3 actions de preuve déléguées au runbook par le plan 22-05 (capture ZDR/logging
OFF OpenRouter, capture acceptation DPA dashboard Supabase, capture CDPA console
Google Workspace) sont **abandonnées par décision du responsable de traitement**
(Laurent MARX, décision du 2026-07-07, confirmée au GO bascule du 2026-07-30).
Le registre + les 7 fiches DPA validés (gate D-13) restent la référence.

### 9.1 Sanity env (§1) — plan 22-06

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| Sortie `sanity-check-env.ts` sur `.env.vercel-prod` | 0 clé suspecte | ✅ **74 variables scannées, 0 danger ByteString** (pull post-pose ; seul flag = `OF_ADDRESS_STREET` U+00E9, faux positif métier assumé 22-04). Fichier de pull supprimé après scan. | 2026-07-30 |
| Nettoyage `.env` racine (source des re-poses) | 0 commentaire inline classe PROD-0674 | ✅ **5 commentaires inline déplacés en lignes dédiées** (`SESSION_LIFETIME`, `OPENROUTER_MODEL_FAST/QUALITY/VISION`, `OPENROUTER_SITE_URL`) — re-scan : 85 vars, seul reste le faux positif `OF_ADDRESS_STREET`. Backup `.env.bak-22-06` (gitignoré `.env*`). | 2026-07-30 |
| Re-pose des sensitive depuis source assainie | liste des clés re-posées | ✅ **Aucune clé Vercel polluée à re-poser** (scan 22-04 : les 50 vars 21-04 déjà propres, `OPENROUTER_API_KEY` incluse). Seules poses nouvelles : 3 vars `GOOGLE_OAUTH_*` (voir §9.2), chaque valeur sanity-checkée AVANT pose (regex `[^\x20-\x7E]|#| +$` = 0 match sur les 3, champ `installed` du JSON source). | 2026-07-30 |
| Re-test auto-fill IA produit | remplissage réussi (0 ByteString) | ✅ **Preuve par référence** : `OPENROUTER_API_KEY` n'a PAS été touchée dans cette fenêtre (aucune re-pose — la preuve comportementale vise les clés re-posées). Auto-fill E2E re-testé OK le 2026-07-06 post-fix D-18 ① ; clé confirmée saine par scan 22-04 puis par le scan post-pose ci-dessus. Le flux OpenRouter côté worker est re-prouvé par le pack SES-0094 (§9.3). | 2026-07-30 |

### 9.2 Flip production (§2) — plan 22-06

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| PR `cloud-migration`→`main` | merge commit, CI verte, diff = 0 | ✅ PR **#8** mergée **MERGE COMMIT** `42d69c7` (2026-07-30T13:23:32Z), gate `test` pass (1m31s), `git diff origin/main origin/cloud-migration` = **0 ligne**. (Check « Vercel » preview en fail = comportement volontaire connu 21-04, non-requis.) | 2026-07-30 |
| Capture vars Vercel | `NEXT_PUBLIC_APP_ENV=production`, `MAIL_DRY_RUN=true`, 3 vars Google posées (masquées) | ✅ 3 vars `GOOGLE_OAUTH_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN` posées **HTTP 201, type `sensitive`, target `["production"]`** via API REST (payload JSON exact — jamais de ligne .env brute). `NEXT_PUBLIC_APP_ENV=production` (type encrypted, relisible) — pull de contrôle : `NEXT_PUBLIC_APP_ENV="production"` + `MAIL_DRY_RUN="true"`. ⚠ Incident consigné : 1ʳᵉ pose via `printf \| vercel env add` (stdin sans newline) a stocké des **valeurs VIDES** — détecté par vérification de longueur post-pose, 4 vars supprimées puis re-posées par API REST (leçon : pose par API JSON, jamais stdin CLI sans newline). | 2026-07-30 |
| `MAIL_DRY_RUN=true` sur les DEUX plateformes | Vercel ET Railway | ✅ Vercel : `MAIL_DRY_RUN="true"` (pull). ⚠ **Railway worker : la variable ÉTAIT ABSENTE** (avec `SMTP_HOST` posé, `isDryRun()` aurait rendu false — seul filet : absence de `SMTP_USER/SMTP_PASS`, le relais OVH refuse sans auth) → **posée `MAIL_DRY_RUN=true`** (déviation Rule 2, redeploy auto Railway). Vérifiée post-pose : `MAIL_DRY_RUN=true` dans `railway variables --service worker`. | 2026-07-31 |
| Redeploy production | build avec le nouvel env (`NEXT_PUBLIC_*` inliné) | ✅ `vercel redeploy` du deployment production issu du merge PR #8 → **Ready en 3 min**, aliasé `https://qualiof.vercel.app`. | 2026-07-30 |
| `/login` post-redeploy | 200, grep `STAGING` = 0, `x-vercel-id` contient `cdg1` | ✅ `HTTP 200` ; `STAGING occurrences: 0` (bandeau disparu) ; `x-vercel-id: cdg1::cdg1::…` | 2026-07-30T18:29:19Z |
| Login → `/app` | accès OK | ✅ Login réel `e2e@start-academy.fr` via Playwright `--project=setup` contre `https://qualiof.vercel.app` : **1 passed (7.0s)**, storageState créé (session posée, `/app` atteint). | 2026-07-31 |

### 9.3 Pack témoin SES-0094 (§3) — plan 22-06 (rapport complet : `22-GONOGO-SES-0094.md`)

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| Compteurs stub (Prisma) | `usedStub=false` sur 100 % des docs du pack | ✅ Batch `08fd14dc` COMPLETED **21/21 en 93 s** (worker Railway, Mac hors boucle) — **`usedStub=true` : 0/21** (ClosureJob), pdfKey 21/21 | 2026-08-03 |
| curl signed URLs | 200 partout, 0× 404, `%PDF-` en tête | ✅ **21/21 en HTTP 200 + `%PDF-` — 0×404** | 2026-08-03T06:51:35Z |
| PDF échantillon | footer 22 `OF_*` complet, SANS filigrane STAGING | ✅ ATTESTATION + ÉMARGEMENT : footer propre (SIRET/NDA/contact), 0 filigrane. ⚠ Pré-requis découvert et corrigé : **22 OF_* Railway polluées par guillemets littéraux** (re-pose 06/07) → 12 re-posées propres + 10 vides supprimées, redeploy, pack re-régénéré. **PDF SYNCHRONE Vercel** (devis témoin `GET /api/quotes/[id]/pdf`, Gotenberg) : 200, `%PDF-`, **sans filigrane** (D-08 prouvé sur le chemin qui le portait en 21-06), teardown 0 résidu | 2026-08-03T09:32:53Z |
| Contrôle analyse des besoins (ajout Laurent 30/07) | présence par stagiaire OU explication | ✅ Hors pack **by design** (Avant/Après, types.ts:23) ; 3/3 stagiaires ont leur `PedagogicalAsset ANALYSE_BESOIN` (04/06/2026, pdf oui) — fond traité au todo dédié | 2026-08-03 |
| Décision gate | GO / NO-GO (si NO-GO → §8 + horodatage du rollback) | **Proposition Claude : GO** (6 critères verts) — _décision Laurent en attente (checkpoint Task 4)_ | |

### 9.4 Rapport relances + flip emails (§4) — plans 22-07/22-08

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| `22-PENDING-SENDS-REPORT.md` | liste nominative + relances brûlées dry-run | _(à remplir)_ | |
| Décision Laurent | validation + décision remédiation compteurs | _(à remplir)_ | |
| Flip `MAIL_DRY_RUN=false` ×2 | capture Vercel (+ redeploy) ET Railway (redeploy auto) | _(à remplir)_ | |
| Email test réel | `messageId` SMTP vers laurent@start-academy.fr (pas `dryRun`) | _(à remplir)_ | |

### 9.5 Invitations équipe (§5) — plan 22-08

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| Liste des invités | nom + rôle RBAC par personne (sans PII inutile) | _(à remplir)_ | |
| Envoi des invitations | emails d'invitation réellement partis (flux `inviteUser`) | _(à remplir)_ | |

### 9.6 Alertes coûts + backups (§6) — plan 22-09

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| Capture Vercel Spend Management | budget ~45 $, alertes email, auto-pause OFF | _(à remplir)_ | |
| Capture Railway Usage Limits | soft alert ~35 €, hard limit absent/haut | _(à remplir)_ | |
| Capture Supabase Billing | spend cap ON | _(à remplir)_ | |
| Capture OpenRouter Credits/Keys | Auto Top-Up OFF, solde ~15 €, credit limit clé prod | _(à remplir)_ | |
| Capture Supabase Database → Backups | snapshots daily actifs, 7 j, projet eu-west-1 | _(à remplir)_ | |

### 9.7 Purge locale (§7 dernier point) — plan 22-10 (destructif, gate séparé)

| Preuve | Attendu | Résultat | Date |
| --- | --- | --- | --- |
| Archives préalables | pg_dump local (via `docker exec`) + snapshot MinIO conservés | _(à remplir)_ | |
| Mot de validation Laurent | liste finale présentée + mot explicite reçu (tours distincts) | _(à remplir)_ | |
| Preuve de purge | conteneurs Docker locaux supprimés, archives intactes | _(à remplir)_ | |

---

## Récapitulatif

- **La bascule = 2 flips de variables** : `NEXT_PUBLIC_APP_ENV=production` (§2, Vercel
  + redeploy) puis, après gate SES-0094 (§3) et rapport validé (§4),
  `MAIL_DRY_RUN=false` sur **Vercel ET Railway**.
- **Fenêtre** : n'ouvre que si TOUTE la checklist §0 est verte (Phase 20 close, audit
  d'écart `22-DATA-GAP-AUDIT.md` PASS, storage 0 lien mort, sanity env
  `sanity-check-env.ts` 0 suspect, gate RGPD validé, CI verte).
- **Rollback (§8)** : re-flag `NEXT_PUBLIC_APP_ENV=staging` + `MAIL_DRY_RUN=true`
  (~5 min) ; la base cloud reste la vérité, jamais de restore local.
- **Preuves** : chaque section produit son evidence datée en §9 — le runbook n'est
  « exécuté » que quand §9 est rempli.
