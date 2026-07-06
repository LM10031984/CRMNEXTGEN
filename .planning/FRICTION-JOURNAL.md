# Journal de friction — QualiOF

> Frictions opérationnelles repérées en usage réel. Alimente le milestone U1
> (restructuration de ce qui agace au quotidien — juillet, post-audit).
> Juin nettoie ce qui se voit devant l'auditeur ; juillet restructure ce qui agace.

| # | Date | Friction | Surface | Destin |
|---|------|----------|---------|--------|
| F-01 | 2026-06-10 | **Page session : chaque doc affiché 3-4 fois** (étape 2, étape 4, bloc Documents session ET matrice du bas) — je ne sais pas quelle occurrence fait foi. | `app/sessions/[id]` | U1 — source unique d'affichage par doc |
| F-02 | 2026-06-10 | **Header session porte une copie dénormalisée du nom du produit** (vue « L'intellligence artificielle », triple L, alors que l'étape 1 lit le bon nom). Champ dupliqué au lieu de lire le produit → viole « 1 doc = 1 home ». Corriger la donnée (typo) + supprimer la dénormalisation. | `app/sessions/[id]` header | Donnée = quick-fix ; dénormalisation = U1 |
| F-03 | 2026-06-10 | **Enquête HOTFIX 3 confirmée (complète F-02)** : le header lit `TrainingSession.name` (champ libre éditable via `SessionTitleInline`, seedé comme copie du `product.title` au format « {titre} ({Xh}) - {date} - »), tandis que l'étape 1 lit `session.product.title` (live). La coquille « intellligence » (triple L) était bien dans `session.name` seul (DB id `99aef6b8`), PAS dans `product.title` → dénormalisation **SANS justification de snapshot** (pas de timestamp, pas de figement métier voulu, simple recopie au seed/import). Coquille corrigée à la source (UPDATE Postgres sur `session.name`). La dénormalisation elle-même N'A PAS été supprimée (candidat U2 — Laurent tranche : soit `session.name` devient un vrai libellé voulu et indépendant, soit le header lit `product.title`). | `app/sessions/[id]` header / schema `TrainingSession.name` | U2 — supprimer la dénormalisation ou assumer le libellé |
