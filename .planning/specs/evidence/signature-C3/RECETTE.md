# Recette d'acceptation du lot C.3 — le retour automatique

**La seule preuve qui compte** (Laurent, 11/09/2026) : sur un **aperçu Vercel**,
avec `SIGNATURE_PROVIDER=docuseal` et la catégorie « Signature électronique »
cochée, un envoi réel — je signe en client, je reçois « à votre tour », je signe
en OF depuis le CRM, le PDF signé et le certificat reviennent **seuls**, la
cellule passe au vert, je reçois l'exemplaire signé.

Les tests automatisés ne prouvent RIEN de cette chaîne-là : ils gardent ce que
le code décide, jamais que DocuSeal appelle vraiment notre URL, que le HMAC
concorde, que le PDF se télécharge et que le bucket accepte l'écriture.

---

## 0. État au 11/09/2026 — ce qui manque pour que la recette soit possible

L'environnement **Preview** du projet `qualiof` ne porte que **quatre**
variables : `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `MAIL_DRY_RUN`. Le
build passe (c'est tout ce que `env.ts` exige au démarrage), mais **à
l'exécution, la chaîne de signature ne peut pas fonctionner** :

| Manque | Conséquence concrète si on lance la recette sans |
|---|---|
| `SIGNATURE_PROVIDER`, `DOCUSEAL_API_KEY`, `DOCUSEAL_BASE_URL` | `getSignatureProvider()` est fail-closed : le bouton « Envoyer » refuse, et le webhook rend 503. |
| `DOCUSEAL_WEBHOOK_SECRET` | `verifyWebhook` refuse **tout** — y compris les vrais appels de DocuSeal. Le retour n'arrive jamais. |
| `GOTENBERG_URL` / `WEASYPRINT_URL` | La régénération **avec ancres** échoue à l'ouverture du récapitulatif : rien ne part, même pas la première demande. |
| `STORAGE_PROVIDER` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Le PDF signé et le certificat ne peuvent pas être écrits : `submission.completed` rend `telechargement-impossible`… ou échoue à l'upload. |
| `SMTP_*`, `MAIL_FROM` | Aucun email ne part : ni « à votre tour », ni l'exemplaire. |
| `MAIL_DRY_RUN` **à `false`** | Idem — la couche env est PRIORITAIRE sur les réglages tenant. |
| `CRON_SECRET` | Les deux crons rendent 401 (sans effet sur la recette, qui n'en dépend pas). |
| `OF_*` | L'email est signé « Start Academy — Start Academy », sans nom ni téléphone. |

⚠ **`MAIL_DRY_RUN=false` en Preview contredit une règle posée le 10/09/2026**
(« ajouter `MAIL_DRY_RUN=true` en Preview comme assurance », pour qu'un aperçu
n'envoie jamais de vrais emails). La recette l'exige — c'est une **dérogation
consciente et temporaire**, à remettre à `true` juste après. Tant qu'elle dure,
tout email déclenché depuis l'aperçu part pour de bon.

⚠ **La base d'aperçu est `qualiof-apercu`** (compte `laurent@start-academy.fr`,
pooler `aws-1-eu-west-1`), **jamais la production** (`gntlqyscahbgjrmsbzil`,
compte `msn.com`, pooler `aws-0`). Les deux migrations du lot C.3 doivent y être
appliquées avant la recette.

---

## 1. Préparer l'aperçu

```bash
# Depuis le worktree files-signature, projet déjà lié (vercel link --project qualiof).

# 1.1 — Les variables, en scope PREVIEW UNIQUEMENT. Jamais « All Environments » :
#       l'aperçu écrirait alors dans le stockage de production.
vercel env add SIGNATURE_PROVIDER preview      # docuseal
vercel env add DOCUSEAL_API_KEY preview
vercel env add DOCUSEAL_BASE_URL preview       # https://api.docuseal.eu
vercel env add DOCUSEAL_WEBHOOK_SECRET preview # une chaîne aléatoire, à recopier dans DocuSeal
vercel env add GOTENBERG_URL preview
vercel env add WEASYPRINT_URL preview
vercel env add STORAGE_PROVIDER preview        # supabase
vercel env add SUPABASE_URL preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
vercel env add SMTP_HOST preview
vercel env add SMTP_PORT preview
vercel env add SMTP_SECURE preview
vercel env add SMTP_USER preview
vercel env add SMTP_PASS preview
vercel env add MAIL_FROM preview
vercel env add CRON_SECRET preview
# OF_NAME, OF_SIRET, OF_RNQ, OF_RESP_PRENOM, OF_RESP_NOM, OF_RESP_PHONE, OF_EMAIL…

# 1.2 — MAIL_DRY_RUN doit passer à false (dérogation, cf. ci-dessus)
vercel env rm MAIL_DRY_RUN preview
vercel env add MAIL_DRY_RUN preview            # false

# 1.3 — Les migrations sur la base d'APERÇU, jamais la prod.
#       Récupérer son URL, puis la passer EN LIGNE DE COMMANDE.
vercel env pull --environment=preview .env.apercu
DATABASE_URL="…apercu…" DIRECT_URL="…apercu…" \
  pnpm --filter @qualiof/db exec prisma migrate deploy

# 1.4 — Redéployer pour que les variables soient prises.
git commit --allow-empty -m "chore: redeploy apercu" && git push
```

## 2. LEVER LA PROTECTION DE L'APERÇU — sinon rien de tout ceci ne marche

**Constaté le 11/09/2026, et c'est bloquant.** L'aperçu est derrière **Vercel
Deployment Protection** (`vercel_auth_enabled: true`). Un `POST` sur
`/api/webhooks/docuseal` reçoit **401 « Protected deployment »** de l'edge
Vercel, **avant** que notre code tourne :

```
$ curl -X POST https://qualiof-git-feat-signature-do-228463-….vercel.app/api/webhooks/docuseal
{"protection":{"vercel_auth_enabled":true,…},"error":{"message":"Protected deployment","code":"401"}}
```

DocuSeal recevrait donc 401 sur CHAQUE appel, indéfiniment. Aucune signature ne
reviendrait, et rien dans QualiOF ne le dirait — la pièce resterait « En
attente » pour toujours.

**La bonne réponse n'est PAS de désactiver la protection** (l'aperçu porte des
données de démonstration et doit rester privé), mais le **Protection Bypass for
Automation** : un secret par projet, que les services tiers passent **en
paramètre d'URL** quand ils ne savent pas poser d'en-tête — le cas de DocuSeal,
comme de Stripe ou GitHub (docs Vercel, vérifié le 11/09/2026).

1. Vercel → projet `qualiof` → Settings → **Deployment Protection** →
   *Protection Bypass for Automation* → **Generate Secret**, et le copier.
2. L'URL du webhook devient celle-ci, secret compris.

⚠ Notre vérification HMAC porte sur le **corps**, pas sur l'URL : ajouter ce
paramètre ne perturbe pas `verifyWebhook`.

## 3. Déclarer le webhook chez DocuSeal

URL à poser dans DocuSeal (Settings → Webhooks) — **l'alias de BRANCHE**, pas
l'URL d'un déploiement : elle est stable d'un déploiement à l'autre. ⚠ Vercel
TRONQUE les noms de branche longs et ajoute un hachage — l'alias réel se lit
avec `vercel inspect <url-du-deploiement>`, il ne se devine pas :

```
https://qualiof-git-feat-signature-do-228463-laurents-projects-3806ab87.vercel.app/api/webhooks/docuseal?x-vercel-protection-bypass=LE_SECRET_DE_BYPASS
```

Événements à cocher : `form.completed`, `form.declined`, `submission.completed`,
`submission.expired`. Secret DocuSeal : **exactement** la valeur de
`DOCUSEAL_WEBHOOK_SECRET`.

**Vérifier que la porte est ouverte** avant d'aller plus loin — sans les
variables DocuSeal on doit obtenir **503** (`signature-non-configuree`), et avec
elles **401** (`signature-invalide`). Les deux prouvent que la route est
ATTEINTE ; un 401 « Protected deployment » prouverait l'inverse :

```bash
curl -X POST "https://…vercel.app/api/webhooks/docuseal?x-vercel-protection-bypass=LE_SECRET" \
  -H 'content-type: application/json' -d '{"event_type":"form.completed","data":{}}'
```

## 4. Dans l'aperçu

1. Paramètres → Envois d'emails : cocher **« Signature électronique (demandes,
   relances, exemplaires signés) »**, et l'interrupteur général (ou ajouter la
   session témoin aux « sessions autorisées en mode test »).
2. Paramètres → Signataire de l'organisme : nom + **votre adresse**.
3. Une session avec une convention d'entreprise, dont le **responsable de
   l'organisation** porte **votre adresse** elle aussi.

## 5. Le parcours, et ce qu'on observe à chaque étape

| # | Geste | Ce qui doit se produire | Où le vérifier |
|---|---|---|---|
| 1 | Bloc « Signature » → **Envoyer pour signature** | Récapitulatif, aperçu du PDF **avec ancres**, ordre « 1. client · 2. OF » | à l'écran |
| 2 | **Envoyer** | Ligne verte, « **Email envoyé à …** » sous la pièce ; cellule « En attente » | à l'écran |
| 3 | — | L'email « **Convention à signer — {organisation}** » arrive | boîte mail |
| 4 | Signer en **client** chez DocuSeal | `SignatureRequest` → `PARTIALLY_SIGNED`, `signedAt` posé sur le client | fiche session (rechargée) |
| 5 | — | L'email « **À votre tour de signer** » arrive | boîte mail |
| 6 | — | Le lien « **Signer maintenant** » apparaît sur la ligne de l'OF | bloc « Signature » |
| 7 | Signer en **OF** depuis le CRM | `submission.completed` part de DocuSeal | — |
| 8 | — | **Sans rien faire** : la cellule passe au **vert « Signé »** | fiche session |
| 9 | — | L'email « **Votre exemplaire signé** » arrive, **deux pièces jointes** : le PDF et le `*.audit-trail.pdf` | boîte mail |
| 10 | — | Cloche ADMIN « signature.completed » | notifications |
| 11 | Télécharger la pièce | C'est le **PDF SIGNÉ** qui sort, panneau de signature visible dans Adobe Reader | Adobe Reader |

## 6. Ce qu'il faut verser ici après la recette

- les deux PDF reçus (document signé + certificat) ;
- une capture de la cellule verte ;
- le corps des trois emails reçus ;
- et, si quelque chose a cloché, **ce qui a cloché** — une recette qui ne
  consigne que les succès ne prouve rien.

## 7. Après la recette, sans attendre

```bash
vercel env rm MAIL_DRY_RUN preview && vercel env add MAIL_DRY_RUN preview   # true
```

Et retirer le webhook DocuSeal pointant sur l'alias de branche le jour où la
branche est fusionnée — sinon il continuera d'appeler une URL qui a changé de
contenu.
