# Pitfalls Research

**Domain:** Migration d'une app Next.js 14 + Prisma + BullMQ + Lucia + S3/MinIO + PDF (Gotenberg/WeasyPrint/poppler) du Docker local vers Vercel + Supabase + Upstash + 3ᵉ hôte (Railway/Fly) — app RGPD-sensible (PII : CNI/RIB de stagiaires)
**Researched:** 2026-07-04
**Confidence:** MEDIUM (Vercel limits vérifiés HIGH via docs officielles ; le reste sur connaissance stack stable — accès web/Context7 bloqué dans cet environnement, chaque claim version-sensible flaggé pour vérif en exécution de phase)

> ⚠ **Note environnement recherche** : WebSearch / WebFetch / Context7 ont été refusés pendant cette recherche (sauf un hit cache Vercel). Les limites Vercel (4,5 Mo body, 300s Hobby / 800s Pro) sont **HIGH confidence** (docs officielles `vercel.com/docs/functions/limitations`, last_updated 2026-06-19). Les autres chiffres exacts (taille upload Supabase, comportement Supavisor, quotas Upstash) sont issus de connaissance stack et **DOIVENT être re-vérifiés au premier plan de la phase concernée** avant d'être codés en dur. Les seuils sont donnés comme ordres de grandeur à confirmer, pas comme vérité gravée.

---

## Critical Pitfalls

### Pitfall 1 : Prisma + Supavisor transaction mode (port 6543) — prepared statements & migrate sur la mauvaise URL

**What goes wrong:**
Deux échecs classiques et distincts :
1. **App runtime** : l'app pointe sur le pooler transaction mode (`:6543`) sans `?pgbouncer=true`. Prisma émet des prepared statements que le pooler transaction-mode ne peut pas garder entre requêtes → erreurs intermittentes `prepared statement "s0" already exists` ou `does not exist`, en apparence aléatoires (dépend du routing pool).
2. **Migrations** : `prisma migrate deploy` lancé sur l'URL poolée `:6543` → advisory locks et DDL long-lived échouent ou se comportent mal. Les migrations **doivent** passer par la connexion directe / session mode.

Aggravé ici par la dette connue : historiquement `db push` en local, **jamais** `prisma migrate deploy` contre la base cloud → risque de **drift** (le schéma Supabase peut ne pas correspondre à l'historique de migrations).

**Why it happens:**
Supabase donne deux URLs (pooler `:6543` transaction, direct/session `:5432`) et Prisma a besoin des deux : `url` (poolée, `pgbouncer=true`) pour le client, `directUrl` (directe) pour `migrate`/`db pull`. Les devs collent une seule URL partout. Le drift vient de ce que `db push` ne crée pas de fichiers de migration — la base cloud n'a jamais rejoué l'historique.

**How to avoid:**
- `datasource db { url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }`.
- `DATABASE_URL` = pooler `:6543` avec `?pgbouncer=true&connection_limit=1` (serverless : 1 conn/invocation).
- `DIRECT_URL` = connexion directe `:5432` (session), utilisée par `migrate deploy`.
- **Résoudre le drift AVANT toute migration** : sur base cloud vierge, faire un `prisma migrate diff` entre l'état schema.prisma et la base, puis baseline (`migrate resolve --applied`) l'historique existant, ou repartir d'un `migrate deploy` sur base vide restaurée depuis le dump prouvé (staging E1-E4). Ne PAS lancer `migrate deploy` à l'aveugle sur une base peuplée par `db push`.
- Vérifier IPv4 : Supavisor est IPv4-compatible ; la connexion directe historique était IPv6-only (peut nécessiter l'add-on IPv4 ou l'usage du pooler session mode pour les migrations selon la config réseau de l'hôte worker).

**Warning signs:**
`prepared statement already exists` intermittent, erreurs `advisory lock` pendant migrate, `migrate deploy` qui hang, ou `The column X does not exist` au runtime (symptôme drift déjà connu du projet — cf. mémoire `feedback_prisma_migrate_deploy`).

**Phase to address:**
**Phase Base Supabase** (première phase infra). C'est un pré-requis bloquant : rien ne marche tant que les 2 URLs + le drift ne sont pas résolus. Gate : `migrate deploy` vert sur base cloud + un round-trip Prisma read/write depuis un worker.

---

### Pitfall 2 : Interactive transactions Prisma cassées en transaction pooling mode

**What goes wrong:**
`prisma.$transaction(async (tx) => { ... })` (transactions interactives) ouvre une transaction qui doit rester collée à **une** connexion physique sur plusieurs allers-retours. En transaction pooling mode (`:6543`), le pooler peut rendre la connexion au pool entre deux requêtes → transaction corrompue / erreurs. Le code du projet utilise probablement des transactions interactives (factures, closure batch `closureBatch.update`, réconciliation).

**Why it happens:**
Transaction mode pooling ≠ session mode. Il tient une connexion seulement le temps d'une transaction *déclarée côté serveur*, mais Prisma interactive tx fait plusieurs statements applicatifs — le contrat n'est pas garanti à travers pgbouncer transaction mode selon les cas.

**How to avoid:**
- Privilégier les transactions **array/batch** (`prisma.$transaction([q1, q2])`) qui partent en un seul aller-retour — safe en pooling.
- Pour les vraies transactions interactives multi-étapes (closure batch, avoirs), router ces opérations vers la connexion **session mode** (`:5432`) via un second client Prisma, ou les exécuter côté **worker** (hôte Railway/Fly avec connexion session/directe stable) plutôt que dans une server action serverless.
- Auditer tous les `$transaction(async` du code avant bascule.

**Warning signs:**
Erreurs sporadiques dans les flux factures / closure, deadlocks (déjà vus en local : `closureBatch.update maxAttempts:1 no retry`), transactions qui échouent seulement sous charge concurrente.

**Phase to address:**
**Phase Base Supabase** + audit dans **Phase Worker** (le worker devrait porter les transactions lourdes). Gate : lister les `$transaction` interactifs et décider par cas (batch vs session-mode vs worker).

---

### Pitfall 3 : Body 4,5 Mo Vercel vs upload de photos CNI/RIB (pilier Pré-inscriptions IA)

**What goes wrong:**
Vercel impose **4,5 Mo max** sur le body d'une fonction/server action (`413 FUNCTION_PAYLOAD_TOO_LARGE`) — **vérifié HIGH** (docs officielles). Or le pilier #4 (pré-inscriptions self-service) et l'`IdentityDocsCard` uploadent des **photos de CNI/RIB/CFP** prises au smartphone : 3–12 Mo fréquents, parfois plus. En local (Next dev, MinIO direct) ça passait sans limite ; sur Vercel les uploads casseront silencieusement pour les gros fichiers → **pilier cassé en prod**.

**Why it happens:**
La limite 4,5 Mo est invisible en dev local. Le flux actuel poste le fichier vers une server action / route API qui le relaie vers le stockage — tout transite par la fonction Vercel.

**How to avoid:**
- **Ne pas faire transiter les fichiers par Vercel.** Upload direct client → Supabase Storage via **signed upload URL** (le client demande une URL signée à une petite server action, puis PUT direct vers Supabase). Le body Vercel ne porte que la métadonnée.
- Alternative : resumable/TUS pour les très gros fichiers.
- Compression/resize côté client avant upload (les CNI n'ont pas besoin de 12 Mo).
- Tester avec de **vraies photos smartphone** (pas des PDF de 200 Ko).

**Warning signs:**
`413` sur upload, uploads qui marchent en dev mais échouent en prod uniquement pour certains fichiers, OCR qui ne reçoit jamais l'image.

**Phase to address:**
**Phase Storage (Supabase Storage + migration objets)** — refonte du chemin d'upload en direct-to-storage. C'est un **changement de code**, pas juste de la config. Gate : upload d'une photo CNI de 10 Mo réussi en prod + OCR déclenché.

---

### Pitfall 4 : poppler / pdftoppm absent du runtime Vercel (OCR + PDF cassés côté serverless)

**What goes wrong:**
Le stack dépend de binaires natifs : `pdftoppm` (poppler-utils) pour l'OCR vision (CNI→image), Gotenberg (Chromium) et WeasyPrint (Python) pour le rendu PDF. **Vercel serverless n'a pas ces binaires** et ne peut pas les installer proprement. Si un bout du flux closure/OCR tourne dans une server action Vercel qui shell-out vers `pdftoppm`, ça casse en prod.

**Why it happens:**
En local tout tourne dans Docker (mêmes binaires partout). Sur Vercel, seul le runtime Node/Python managé existe — pas d'apt-get, pas de binaire système garanti.

**How to avoid:**
- **Tout le rendu PDF et l'OCR-préprocessing sortent de Vercel** vers le 3ᵉ hôte (Railway/Fly) : Gotenberg + WeasyPrint + poppler-utils y tournent en containers. Vercel appelle ces services via HTTP.
- L'OCR (`pdftoppm` → image → LLM vision) doit s'exécuter **dans le worker** (Railway/Fly), pas dans une server action.
- Auditer chaque `spawn`/`exec`/appel binaire du code et vérifier qu'aucun ne reste dans le périmètre Vercel.

**Warning signs:**
`pdftoppm: command not found`, `ENOENT`, PDF vides, OCR qui échoue seulement en prod. Le projet a déjà noté « Vercel serverless has no poppler binary ».

**Phase to address:**
**Phase Worker / 3ᵉ hôte** (Gotenberg + WeasyPrint + poppler co-localisés) + audit dans **Phase App Vercel**. Gate : un pack closure complet généré end-to-end avec l'app sur Vercel et le rendu sur l'hôte tiers.

---

### Pitfall 5 : Durée de fonction Vercel vs flux PDF/closure synchrones

**What goes wrong:**
Certaines server actions synchrones (génération d'un PDF unique via Gotenberg, export xlsx, fiche AGEFICE) peuvent dépasser la durée par défaut. **Vérifié HIGH** : Hobby = 300s max (pas d'extension), Pro = 300s défaut / 800s max / 1800s beta. Le pack closure complet (~3 min désormais, mais historiquement 12 min) **ne doit jamais** tourner dans une server action — il est déjà en BullMQ, bien. Le piège est ailleurs : les petits rendus PDF « synchrones » (convocation, attestation à la volée) qui appellent Gotenberg sur l'hôte tiers **froid** (cold start Railway/Fly) peuvent flirter avec le timeout.

**Why it happens:**
En local, latence ~0 vers Gotenberg. En cloud : Vercel → hôte tiers (peut-être en cold start) → Chromium boot → réseau. La somme peut dépasser les attentes, surtout sur Hobby (300s dur).

**How to avoid:**
- Confirmer que **tout le lourd reste asynchrone** (BullMQ) — déjà le cas pour le pack.
- Pour les rendus « à la volée », soit garder l'hôte tiers chaud (min instances ≥ 1, cf. cold start Pitfall 9), soit basculer même les PDF unitaires en job asynchrone avec polling/toast.
- Si Vercel Pro : `maxDuration` explicite par route (défaut 300s, max 800s). Ne pas compter sur l'extended 1800s (beta).
- Décider **Hobby vs Pro** tôt : Hobby plafonne à 300s dur — insuffisant pour certains flux si l'hôte tiers est froid.

**Warning signs:**
`504 FUNCTION_INVOCATION_TIMEOUT`, PDF unitaires qui timeout le matin (première requête = cold start), différence de comportement selon l'heure.

**Phase to address:**
**Phase App Vercel** (choix plan + `maxDuration`) + **Phase Worker** (keep-warm hôte tiers). Gate : rendu PDF unitaire sous timeout après cold start simulé.

---

### Pitfall 6 : BullMQ sur Upstash — polling brûle le quota par-requête + jobs delayed

**What goes wrong:**
BullMQ fait du polling actif (BRPOPLPUSH / blocking commands) et maintient des connexions Redis longues. Upstash facture **par requête** (REST) ou par commande selon le plan. Un worker BullMQ idle génère un **flux constant** de commandes → la facture Upstash explose alors que l'app ne fait « rien ». De plus, Upstash a historiquement **déconseillé BullMQ** pour cette raison, et les **jobs delayed/repeatable** (crons factures, relances) reposent sur du polling qui aggrave le compteur. `maxRetriesPerRequest` doit être `null` pour BullMQ (ioredis), sinon crashes.

**Why it happens:**
Modèle de prix serverless (par-requête) incompatible avec un consommateur long-polling. En local, Redis Docker est gratuit et illimité → le coût du polling était invisible. Le worker tourne 24/7.

**How to avoid:**
- **Décision structurante à prendre tôt** : Upstash convient-il pour un worker BullMQ 24/7 ? Deux options :
  - **(A) Redis dédié sur le 3ᵉ hôte** (Railway/Fly a des add-ons Redis, ou Redis en container) — connexion TCP persistante, pas de facturation par-commande. **Recommandé** vu qu'on a déjà un hôte Railway/Fly pour les workers.
  - **(B) Upstash** seulement si on utilise un plan à connexion TCP (pas REST) et qu'on accepte le coût du polling — vérifier le pricing par-commande vs fixe.
- Régler `connection: { maxRetriesPerRequest: null, enableReadyCheck: false }` (obligatoire BullMQ).
- Réduire l'agressivité du polling si Upstash retenu.
- Estimer le coût : (nb workers × fréquence polling × 86400s × 30j) commandes/mois — le chiffrer avant de choisir.

**Warning signs:**
Facture Upstash qui grimpe sans trafic utilisateur, `max daily request limit exceeded`, workers qui se déconnectent, crashs ioredis `maxRetriesPerRequest`.

**Phase to address:**
**Phase Worker / Redis** — c'est un **choix d'architecture** (Redis co-localisé sur l'hôte worker vs Upstash), pas un simple branchement. Recommandation forte : Redis sur le 3ᵉ hôte, réserver Upstash à des usages request-based légers. Gate : coût Redis mensuel projeté < seuil budget + worker stable 24h.

---

### Pitfall 7 : Cookies Lucia derrière Vercel — secure/domain/sameSite + proxy

**What goes wrong:**
Lucia émet un cookie de session ; en prod HTTPS sur Vercel il faut `Secure`. Trois pièges :
1. `sessionCookie.attributes.secure` doit être `true` en prod (déjà géré via `NODE_ENV=production` selon la mémoire) — mais si `NODE_ENV` n'est pas correctement `production` sur Vercel (ou en staging), le cookie non-secure est rejeté par le navigateur en HTTPS → **login impossible, boucle de redirection**.
2. **Domaine** : si l'app tourne sur un domaine custom + un domaine `.vercel.app`, le cookie doit avoir le bon `domain`/`sameSite`. Le formulaire public `/p/[token]` (cross-context) et les redirections 308 (nombreuses dans le projet) peuvent perdre le cookie.
3. **CSRF** : Lucia recommande la vérification d'origine sur les server actions POST ; derrière le proxy Vercel, `Host`/`Origin` peuvent différer → faux positifs CSRF si vérif d'origine stricte.

**Why it happens:**
En local (http://localhost) `secure=false` marche. Le passage HTTPS + domaine custom + proxy Vercel change les contraintes cookie d'un coup.

**How to avoid:**
- Forcer `secure: true` en prod, `sameSite: 'lax'`, ne PAS fixer `domain` sauf besoin sous-domaine explicite.
- Vérifier `NEXT_PUBLIC_APP_ENV` / `NODE_ENV` réellement `production` sur Vercel (le flag staging existe déjà — attention à ne pas laisser secure=false en staging HTTPS).
- Tester le flux complet login → app → logout + le form public tokenisé sur le domaine final.
- Vérifier la vérif d'origine CSRF avec le `Host` réel Vercel.

**Warning signs:**
Login qui « marche puis déconnecte », boucle de redirection `/login`, cookie absent dans DevTools, 403 CSRF sur server actions en prod seulement.

**Phase to address:**
**Phase App Vercel** (config cookie + domaine) — à tester avant d'inviter les utilisateurs. Gate : login/logout OK sur domaine final + form public OK.

---

### Pitfall 8 : RGPD — région, logs contenant du PII, backups hors UE

**What goes wrong:**
App RGPD-sensible (CNI/RIB de stagiaires). Erreurs classiques à la bascule cloud :
1. **Région** : créer le projet Supabase / le déploiement Vercel dans une région **US** par défaut (Supabase propose souvent us-east ; Vercel `iad1` = Washington par défaut — **vérifié HIGH** dans les limits) → données PII hors UE = non-conforme.
2. **Logs avec PII** : les `console.error`/`console.log` du projet (worker, generators) peuvent logger des objets contenant nom/CNI/RIB. Sur Vercel/Railway/Upstash, ces logs partent chez des tiers, potentiellement hors UE, et sont conservés.
3. **Backups** : les backups Supabase / dumps peuvent atterrir dans une région/bucket hors UE.
4. **Sous-traitants sans DPA** : Vercel, Supabase, Upstash, Railway/Fly, OpenRouter, Anthropic = sous-traitants au sens RGPD. La dette DPA est déjà identifiée (RGPD-DPA prioritaire).

**Why it happens:**
Les défauts régionaux des providers sont US. Le logging PII est invisible tant que les logs restent locaux. La bascule multiplie soudain les sous-traitants.

**How to avoid:**
- **Région EU explicite partout** : Supabase EU (Frankfurt/Paris), Vercel région EU (`fra1`/`cdg1`), Upstash EU, Railway/Fly région EU. Vérifier **avant** de créer les projets (changer de région = recréer).
- **Scrubber de logs** : bannir le log d'objets Person/SensitiveData bruts ; logger des IDs, pas des CNI/RIB. Auditer les `console.*` du worker et des generators.
- Vérifier la région des backups Supabase.
- **Registre des traitements + DPA** : documenter les 6 sous-traitants (déjà engagé par le GO vision) + export Art. 20 / suppression Art. 17 (DOC-01/02 en backlog — à ré-arbitrer, deviennent plus urgents en cloud multi-users).

**Warning signs:**
Region `us-east-1` / `iad1` dans les dashboards, CNI/RIB visibles dans les logs Vercel/Railway, aucun DPA signé, pas de région backup documentée.

**Phase to address:**
**Phase 0 / cadrage infra** (choix région = irréversible sans recréation) + **Phase Conformité/DPA** (scrubbing logs, DPA, registre). Gate : toutes les régions = EU documentées + audit `console.*` sans PII + DPA listés.

---

### Pitfall 9 : Cold starts & private networking Railway/Fly

**What goes wrong:**
1. **Cold start** : sur Fly/Railway avec scale-to-zero, la première requête vers Gotenberg/WeasyPrint/worker après inactivité subit un boot (container + Chromium) de plusieurs secondes → PDF « à la volée » lents/timeout (cf. Pitfall 5).
2. **Private networking** : Vercel (serverless, IPs dynamiques) → hôte tiers. Si l'hôte tiers restreint par IP allowlist, Vercel ne peut pas être allowlisté proprement (pas d'IP stable sans Secure Compute/Static IPs payant). Le réseau privé Fly/Railway (`.internal`) n'est **pas** accessible depuis Vercel (réseaux distincts) → il faut exposer Gotenberg/worker sur un endpoint public **protégé par secret** (header token), pas par IP.
3. **Worker → Supabase/Redis** : le worker doit joindre la base (session mode) et Redis ; vérifier IPv4/IPv6 et que la connexion directe Supabase est atteignable depuis Fly/Railway.

**Why it happens:**
On raisonne « tout dans le même Docker network » comme en local. En cloud, Vercel et l'hôte tiers sont des réseaux séparés ; le private networking ne franchit pas la frontière.

**How to avoid:**
- Endpoints Gotenberg/WeasyPrint **publics mais authentifiés** (Bearer token en env, jamais en clair, pas dans une var non chiffrée). Ne pas compter sur l'IP allowlisting depuis Vercel.
- **Keep-warm** l'hôte tiers : min instances ≥ 1 (coût vs latence — arbitrage budget).
- Tester la connectivité worker→Supabase directe (IPv4 add-on si besoin) et worker→Redis.
- Health-check + retry sur les appels Vercel→hôte tiers (le cold start peut donner un premier 502).

**Warning signs:**
Premier PDF du matin en timeout/502, `connection refused` vers `.internal` depuis Vercel, worker qui ne joint pas la base (IPv6).

**Phase to address:**
**Phase Worker / 3ᵉ hôte** (exposition + auth + keep-warm) + validation dans **Phase Bascule**. Gate : appel Vercel→Gotenberg authentifié OK après cold start + worker joint base & Redis.

---

### Pitfall 10 : Data cutover — sequences, timezone, extensions, key naming des objets

**What goes wrong:**
Au dump final → restore Supabase, plusieurs pièges (le restore data-only a déjà été prouvé 5822=5822 en staging, mais le **cutover final** ajoute des risques) :
1. **Séquences** : restore data-only sans réaligner les sequences (`setval`) → prochains INSERT en conflit de PK / doublons d'ID.
2. **Extensions** : le projet active `pgcrypto`, `uuid_ossp`, `pg_trgm`, `unaccent` (+ `postgresqlExtensions`). Si une extension n'est pas activée dans le schéma Supabase attendu (Supabase les met dans le schéma `extensions`, pas `public`) → fonctions introuvables au runtime (recherche trigram, unaccent).
3. **Timezone** : timestamps stockés UTC (bon), mais vérifier que le calcul jours ouvrés FR / émargement 9h-13h/14h-18h ne dérive pas selon le TZ de la base cloud.
4. **Objets MinIO → Supabase Storage** : re-uploader tous les objets (RIB/CNI/PDF) et **surtout réécrire les clés** dans la base (`Person.ribKey`, `Document`...). Supabase Storage a des contraintes de nommage de clé (pas de `//`, caractères, préfixe bucket) différentes de MinIO. Si les clés en base ne matchent pas le nouveau layout → **liens morts vers des PII** (docs Qualiopi introuvables = incident conformité).
5. **Pas de bucket policies façon AWS IAM** : Supabase Storage utilise RLS Postgres, pas des policies S3 JSON. Le bucket privé + signed URLs doit être re-modélisé côté Supabase (RLS ou service_role côté serveur).

**Why it happens:**
Le restore data-only ne touche ni sequences ni extensions ni storage. La migration d'objets et la réécriture de clés est un chantier séparé souvent sous-estimé.

**How to avoid:**
- Après restore : script `setval` sur toutes les sequences (ou dump avec ownership/sequences), vérifier `SELECT last_value`.
- Vérifier les 4 extensions actives + `search_path` incluant `extensions` si Supabase les y place.
- Script de migration objets MinIO→Supabase **idempotent** avec table de correspondance ancienne clé→nouvelle clé, puis UPDATE en base, puis **vérification** : chaque `ribKey`/`Document.key` résout à un objet existant (0 lien mort).
- Re-modéliser l'accès privé : bucket privé + signed URL générée côté serveur (service_role), TTL court.
- **Destructif = étape séparée** (convention projet) : le cutover final avec pg_dump + vérif invariants avant de couper le local.

**Warning signs:**
`duplicate key value violates unique constraint` juste après cutover, `function unaccent does not exist`, docs/PII 404 après bascule, dates d'émargement décalées d'1h.

**Phase to address:**
**Phase Storage** (migration objets + réécriture clés + RLS) + **Phase Bascule** (sequences, extensions, vérif invariants). Gate : 0 lien mort storage + sequences réalignées + les 4 extensions résolvent + un pack closure régénéré post-cutover.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Faire transiter les uploads CNI/RIB par une server action Vercel | Zéro refonte du flux upload | Casse à >4,5 Mo (413), pilier pré-inscription cassé en prod | **Never** — direct-to-storage obligatoire |
| Une seule `DATABASE_URL` (pooler) partout, y compris migrate | Config simple | Migrations qui hang, prepared statement errors, drift masqué | **Never** |
| Upstash pour BullMQ 24/7 sans chiffrer le coût | Setup rapide (managé) | Facture par-commande qui explose, quota daily dépassé | Seulement si coût polling chiffré < Redis dédié |
| Garder Gotenberg/OCR dans le périmètre Vercel | Un hôte de moins | `command not found` poppler, pas de Chromium → flux cassé | **Never** — hôte tiers obligatoire |
| Scale-to-zero sur l'hôte tiers | Économie ~quelques €/mois | Cold start = PDF à la volée en timeout | OK si tous les PDF passent en asynchrone (BullMQ) |
| Logger des objets Prisma bruts (`console.error(person)`) | Debug rapide | PII (CNI/RIB) dans logs tiers hors contrôle = incident RGPD | **Never** en prod — logger des IDs |
| Ne pas résoudre le drift, lancer `migrate deploy` sur base peuplée par db push | Gagner une étape | `column X does not exist` runtime, migrations désynchronisées | **Never** |
| Signed URL TTL longue (jours) pour éviter de re-signer | Moins d'appels | Lien PII qui fuite reste valide longtemps | **Never** pour PII — TTL courte (minutes) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Prisma ↔ Supavisor (6543) | URL poolée pour migrate + pas de `pgbouncer=true` | `url`=pooler `?pgbouncer=true&connection_limit=1` ; `directUrl`=session `:5432` pour migrate |
| Prisma `$transaction(async)` ↔ pooling | Transactions interactives en transaction mode | Batch array, ou session mode, ou déporter au worker |
| Uploads ↔ Vercel | POST fichier via server action (>4,5 Mo → 413) | Signed upload URL, PUT client→Supabase direct |
| OCR/PDF ↔ Vercel | `spawn('pdftoppm')` / Chromium en serverless | Tout binaire natif sur hôte tiers Railway/Fly |
| BullMQ ↔ Upstash | Polling 24/7 = coût par-commande + `maxRetriesPerRequest` non-null | Redis TCP dédié sur hôte worker + `maxRetriesPerRequest:null` |
| Lucia ↔ Vercel HTTPS | `secure` cookie mal réglé / domaine custom | `secure:true` prod, `sameSite:lax`, tester domaine final + form public |
| SMTP nodemailer ↔ serverless | Connexion SMTP longue depuis server action Vercel | Envoi email **dans le worker** (BullMQ), pas dans la server action serverless |
| Supabase Storage ↔ MinIO mental model | Attendre des bucket policies S3/IAM JSON | RLS Postgres + service_role serveur + signed URLs |
| Vercel ↔ hôte tiers | IP allowlist / private `.internal` | Endpoint public + Bearer token secret (env chiffrée) |
| Objets storage ↔ base | Migrer les fichiers sans réécrire les clés en DB | Table de correspondance + UPDATE + vérif 0 lien mort |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `connection_limit` par défaut × N invocations serverless | Saturation connexions Postgres, `too many connections` | `connection_limit=1` sur URL poolée, laisser Supavisor gérer le pool | Dès quelques utilisateurs concurrents |
| Worker concurrency=3/timeout 600s hérité du GPU local | Latence LLM cloud différente, timeouts mal calibrés | Recalibrer concurrency + timeout (600→~120s) selon latence OpenRouter observée | Dès la 1ʳᵉ génération de pack en cloud |
| Polling BullMQ Upstash | Facture qui grimpe sans trafic | Redis dédié TCP, réduire polling | 24/7 dès le worker allumé |
| Egress Supabase pour téléchargement de PDF | Facture egress si les PDF (packs, docs Qualiopi) sont servis via Supabase | Signed URL direct client (l'egress reste, mais pas via Vercel) ; surveiller le volume ZIP packs | Volume de téléchargements packs élevé |
| Vercel Image Optimization sur photos CNI/RIB | Coût image optimization + PII dans le cache CDN | `unoptimized` pour les images PII, ne jamais passer CNI/RIB par `next/image` | Dès affichage d'aperçus |
| Cold start hôte tiers sur PDF synchrone | 1ʳᵉ requête du jour lente/timeout | Keep-warm min≥1 ou tout async | Après chaque période d'inactivité |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| CNI/RIB via `next/image` (optimization) → cache CDN public | PII cachée sur le CDN Vercel | `unoptimized`, servir via signed URL courte, jamais de PII en cache CDN |
| Signed URL TTL longue pour PII | Lien CNI/RIB qui fuite reste exploitable | TTL minutes, régénérer à la demande |
| Secret d'auth hôte tiers en variable non chiffrée | Accès non authentifié à Gotenberg/worker | Bearer token en env chiffrée (garde-fou : jamais de secret en var custom claire) |
| Bucket Supabase public par erreur | Tous les CNI/RIB exposés en URL devinable | Bucket **privé** + RLS + service_role serveur ; vérifier `public=false` |
| Logs contenant CNI/RIB chez tiers hors UE | Violation RGPD, non-conformité audit | Scrubber logs, logger des IDs |
| `NODE_ENV`/`APP_ENV` mal réglé → secure cookie off en HTTPS | Session volable, ou login cassé | Vérifier prod réel, cookie `secure` |
| Form public `/p/[token]` sans rate-limit en cloud | Bruteforce token / abus OCR (coût LLM) | Rate-limit (Upstash ratelimit ou middleware), TTL token, taille upload bornée |
| service_role key Supabase exposée côté client | Bypass total RLS = accès à toute la base | service_role **uniquement serveur/worker**, jamais dans le bundle client |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Upload CNI silencieusement échoué (413) sans message | Le stagiaire croit avoir envoyé, l'admin ne reçoit rien | Erreur explicite + compression + direct-to-storage |
| PDF à la volée qui timeout (cold start) sans feedback | L'admin attend puis 504, re-clique, doublons | Passer en async + toast « pack en génération » (pattern déjà présent) |
| Login qui déconnecte en boucle (cookie secure) | Équipe ne peut pas travailler = objectif v6 manqué | Tester login/logout sur domaine final avant invitations |
| Latence LLM cloud vs local ressentie | Pack plus lent/rapide, attentes recalées | Communiquer le temps estimé, garder le toast de progression |
| Docs Qualiopi 404 après cutover (clés cassées) | Audit Qualiopi : preuve introuvable = risque NC | Vérif 0 lien mort storage avant de couper le local |

## "Looks Done But Isn't" Checklist

- [ ] **Migrations cloud :** `migrate deploy` a-t-il **vraiment** tourné vert sur la base cloud (pas juste `db push`) et le drift est-il résolu ? — vérifier `_prisma_migrations` peuplé + `migrate status` clean
- [ ] **Uploads gros fichiers :** testé avec une **vraie photo smartphone 8-12 Mo** (pas un PDF 200 Ko) ? — vérifier direct-to-storage, pas de 413
- [ ] **Poppler/Chromium :** l'OCR et TOUS les rendus PDF tournent-ils bien **hors** Vercel ? — grep `spawn`/`exec` sans binaire dans le périmètre Vercel
- [ ] **Coût Upstash/Redis :** le worker 24/7 a-t-il un coût mensuel **chiffré** et sous budget ? — laisser tourner 24h et lire la facture
- [ ] **Région EU :** Supabase, Vercel, Upstash, Railway/Fly **tous** en région EU documentée ? — screenshot des dashboards
- [ ] **Logs sans PII :** audit des `console.*` du worker/generators — aucun objet Person/SensitiveData brut loggé
- [ ] **Storage 0 lien mort :** chaque `ribKey`/`Document.key` résout à un objet existant après migration ? — script de vérif
- [ ] **Sequences :** réalignées après restore ? — un INSERT test ne collisionne pas
- [ ] **Extensions :** `pg_trgm`/`unaccent`/`pgcrypto`/`uuid_ossp` résolvent au runtime ? — une recherche trigram fonctionne
- [ ] **Cookie/login :** login → app → logout + form public `/p/[token]` OK sur domaine final ?
- [ ] **Email :** envoi SMTP déplacé dans le worker (pas server action serverless) ? — un email de fin de pack part en prod
- [ ] **DPA :** les 6 sous-traitants (Vercel, Supabase, Upstash, Railway/Fly, OpenRouter, Anthropic) au registre + DPA identifiés ?
- [ ] **CI filet :** GitHub Actions (lint+tsc+tests) + E2E closure + smoke routes verts **avant** bascule (CI-01/TEST-01/02) — dont le test pré-existant en échec corrigé ou explicitement quarantiné

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Drift Prisma détecté au runtime | MEDIUM | Repartir d'une base restaurée depuis le dump prouvé, baseline l'historique de migrations, `migrate deploy` propre |
| Uploads CNI cassés en prod (413) | MEDIUM | Basculer le flux en direct-to-storage (signed upload URL) + compression client |
| Facture Upstash explosée | LOW | Migrer Redis vers l'hôte tiers (TCP), reconfigurer `connection` BullMQ |
| poppler/Chromium absent Vercel | MEDIUM | Déporter le service sur l'hôte tiers, remplacer les appels par HTTP |
| Liens PII morts après cutover | HIGH | Re-mapper clés MinIO→Supabase, UPDATE en base, revalider ; si local coupé sans backup → perte de preuves Qualiopi (donc **ne pas couper avant vérif**) |
| Login en boucle (cookie) | LOW | Corriger `secure`/`sameSite`/`NODE_ENV`, redéployer |
| PII dans logs tiers | MEDIUM | Scrubber les logs, purger les logs existants, ajouter au registre RGPD |
| Région US créée par erreur | HIGH | Recréer le projet en région EU + re-migrer les données (irréversible sans recréation) |

## Pitfall-to-Phase Mapping

Ordonnancement suggéré : **Cadrage région/plan → Base Supabase → Storage → Worker/3ᵉ hôte → App Vercel → CI/filet → Bascule**.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Prisma pooler + migrate + drift | Base Supabase (bloquant #1) | `migrate deploy` vert + `migrate status` clean + round-trip R/W |
| 2. Transactions interactives pooling | Base Supabase + Worker | Audit des `$transaction(async` + décision par cas |
| 3. Body 4,5 Mo vs CNI/RIB | Storage | Upload photo 10 Mo réussi + OCR déclenché |
| 4. poppler/Chromium hors Vercel | Worker / 3ᵉ hôte | Pack closure end-to-end app-Vercel + rendu-tiers |
| 5. Durée fonction Vercel | App Vercel + Worker | PDF unitaire sous timeout après cold start |
| 6. BullMQ/Upstash coût | Worker / Redis (choix archi) | Coût mensuel projeté < budget + worker stable 24h |
| 7. Cookies Lucia Vercel | App Vercel | login/logout + form public OK sur domaine final |
| 8. RGPD région/logs/backups | Cadrage (région) + Conformité/DPA | Régions EU documentées + logs sans PII + DPA listés |
| 9. Cold start / networking tiers | Worker / 3ᵉ hôte + Bascule | Appel Vercel→Gotenberg authentifié après cold start |
| 10. Cutover sequences/ext/clés | Storage + Bascule | 0 lien mort + sequences OK + extensions OK + pack régénéré |

## Sources

- **Vercel Functions Limits** (HIGH) — `https://vercel.com/docs/functions/limitations`, last_updated 2026-06-19 : body 4,5 Mo (`413 FUNCTION_PAYLOAD_TOO_LARGE`), maxDuration Hobby 300s / Pro 800s (défaut 300s) / 1800s beta, région défaut `iad1` (US). **Vérifié directement pendant cette recherche.**
- **Connaissance stack (MEDIUM)** — Prisma+PgBouncer/Supavisor (url/directUrl, pgbouncer=true, prepared statements en transaction mode, interactive tx), Supabase Storage (bucket RLS ≠ policies S3, signed URLs, TUS pour gros fichiers), BullMQ+ioredis (`maxRetriesPerRequest:null`, polling), Lucia v3 (secure cookie, CSRF origin). **À re-vérifier au premier plan de chaque phase** (WebFetch/Context7 étaient bloqués dans cet environnement de recherche).
- **Mémoire projet (HIGH pour le contexte)** — `feedback_prisma_migrate_deploy` (drift `column X does not exist`), `feedback_worker_no_react_imports`, `feedback_prisma_db_push_sandbox`, `feedback_destructif_etape_separee`, `project_staging_vercel_2026_06_16` (restore prouvé 5822=5822), `.env single-file / t3-env fails loud`, worker concurrency=3/timeout 600s hérité GPU local.

---
*Pitfalls research for: migration cloud QualiOF (Vercel + Supabase + Upstash + Railway/Fly) — app RGPD PII*
*Researched: 2026-07-04*
