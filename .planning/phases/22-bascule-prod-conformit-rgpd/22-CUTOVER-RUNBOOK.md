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
