<!--
Gabarit court, volontairement. Il ne pose qu'une question : ce qui est corrigé ici
sera-t-il réellement en production après la fusion ?
-->

## Ce que ça change



## Déploiement — à remplir

Fusionner dans `main` déploie **Vercel seulement**. Le worker Railway tourne sur une
image Docker figée : il continue d'exécuter l'ancien code tant qu'on ne la reconstruit pas.

- [ ] **Cette PR ne touche rien que le worker exécute** — rien à faire, la fusion suffit.
- [ ] **Cette PR touche du code exécuté par le worker** → `railway up` **obligatoire après fusion**.

Sont concernés : `apps/web/scripts/*-worker*.ts` (closure, veille, reminders, ocr) et
**tout ce qu'ils importent** — en particulier `apps/web/src/lib/closure/**` (le `renderer`
et **tous les gabarits PDF** : émargement, attestation, certificat…), `packages/db`,
`packages/shared`.

```bash
railway link --project qualiof-worker --environment production --service worker
railway up --service worker          # JAMAIS `railway redeploy` : il rejoue l'ancienne image
```

> Le job CI `worker-image` ne déploie rien — il prouve seulement que l'image compile
> (`push: false`). Le voir vert, ou `SKIPPED`, ne dit rien de ce qui tourne en production.

## Migration de base

- [ ] Aucune migration.
- [ ] Migration incluse → **ne pas fusionner à moins de 10 minutes d'une autre PR à migration**
      (le Deploy Hook déploie la tête de `main`, pas le commit migré — `docs/deferred.md` § D-5).

## Vérifié comment

<!-- Gates passés, et ce qui reste à jouer sur le déploiement après fusion. -->
