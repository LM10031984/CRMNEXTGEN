# Phase 9.3 — Contrat reconstruit (session cloud 2026-06-10)

> **Pourquoi ce document.** L'exécution cloud de la 9.3 n'a PAS eu accès aux
> artefacts GSD locaux (`.planning/` était gitignoré) : ni les 4 plans, ni le
> contrat UnifiedDoc figé, ni les décisions D-09.3-01..08, ni
> `MATRICE-NAVIGATION-DOCS.md`. Les 5 commits de la branche
> `claude/lucid-davinci-kfqfsf` reposent donc sur une **réinterprétation**
> du plan directeur (Partie 1, §3 et Bloc A).
>
> **Usage obligatoire avant merge dans cloud-migration et avant T1** :
> comparer chaque rubrique R-XX ci-dessous à la décision locale D-09.3-XX
> correspondante. Cocher ✅ conforme / ✏️ divergent (avec le correctif).
> Les rubriques marquées ⚠ sont les divergences **suspectées** d'après les
> formulations de Laurent (2026-06-10).

Implémentation concernée :
- `apps/web/src/lib/resolve-docs.ts` (résolveur pur + contrat UnifiedDoc)
- `apps/web/src/lib/resolve-docs-db.ts` (wrappers Prisma)
- `apps/web/src/lib/__tests__/resolve-docs{,-db}.test.ts`
- `packages/db/src/qualiopi-doc-catalog.ts` + `prisma/seed.ts` (triage)
- Surfaces : `app/app/apprenants/[id]/page.tsx`, `components/produits/product-docs-block.tsx`, `app/app/parametres/page.tsx`

---

## R-01 — Contrat UnifiedDoc (≙ D-09.3 contrat figé) ⚠

Champs implémentés :

```ts
{
  source: 'document' | 'pedagogical_asset' | 'person_rib' | 'sensitive_cni'
        | 'agefice_cfp' | 'tenant_markdown';
  sourceId: string;          // id de row, ou clé synthétique `{source}:{ownerId}`
  docType: string | null;    // DocType Prisma si applicable
  label: string;             // FR, depuis doc-scope DOC_TYPE_LABELS.long
  scope: 'participant' | 'session' | 'product' | 'invoice' | 'person'
       | 'organization' | 'tenant';
  sessionId: string | null;
  participantId: string | null;
  personId: string | null;
  href: string;              // lien navigable
  usedStub: boolean;
  generatedAt: Date | null;
}
```

⚠ **Divergence suspectée** : la formulation locale parle de
`sourceTable` + `sourceId` (même paire que la preuve polymorphe de T7).
J'ai nommé le discriminant `source` (valeurs métier snake_case), pas
`sourceTable` (noms de tables Prisma). Si le contrat local impose
`sourceTable: 'Document' | 'PedagogicalAsset' | …`, renommage + remappage
des valeurs à faire (impact : resolver, 3 surfaces, tests — mécanique).

## R-02 — Énumération des sources ⚠

Implémenté : **6 sources**, CNI et RIB comptés séparément
(`sensitive_cni` ← SensitiveData.idDocumentUrl ; `person_rib` ← Person.ribKey).

⚠ **Divergence suspectée** : Laurent mentionne « le test cinq sources ».
Si le découpage local compte 5 (p.ex. « champs CNI/RIB » = 1 source
"pièces identité", ou markdown tenant hors périmètre du test), le test
comportemental 6-sources et l'enum doivent être réalignés. À trancher
contre `MATRICE-NAVIGATION-DOCS.md`.

## R-03 — Règle PII / scoping tenant

Implémenté : entité racine TOUJOURS via `findFirst({ where: { id, tenantId } })` ;
racine introuvable → `null` et **aucune** requête suiveuse ; jamais de
findMany cross-tenant. Tests dédiés (cross-tenant → null + 0 requête).

## R-04 — usedStub / badge 'no_proof'

Implémenté :
- Détection : `rawJson.source === 'stub'` sur PedagogicalAsset (convention
  renderer closure). `Document` → toujours `usedStub: false` (aucune
  persistance stub sur ce modèle — vérifié schéma).
- Rendu : badge amber littéral **« ⚠ no_proof »** + title explicatif, sur
  l'onglet apprenant et le bloc produit.

À vérifier : le contrat local voulait-il aussi remonter `ClosureJob.usedStub`
(persisté sur le job, pas sur l'asset) comme source secondaire ?

## R-05 — Triage des 5 DocType fantômes

| Fantôme | Sort implémenté |
|---|---|
| SATISFACTION | retiré, fusionné → SATISFACTION_CHAUD + SATISFACTION_FROID (ind. 30) |
| PRE_ACCORD_OPCO | retiré du catalogue → jalon OpcoSubmission |
| VALIDATION_OPCO | retiré du catalogue → jalon OpcoSubmission |
| SUPPORT_PEDAGOGIQUE | conservé, **Indicateur 19**, upload manuel |
| CUSTOM | conservé, upload libre, sans indicateur, non obligatoire |

Purge des retirés au re-seed (`deleteMany` sur SATISFACTION /
PRE_ACCORD_OPCO / VALIDATION_OPCO). L'enum Prisma DocType est INCHANGÉ
(pas de migration — les Document existants de ces types restent lisibles).

NOTE : MATRIX_DOC_TYPES (doc-scope, figé D-04 Phase 9.1) garde
PRE_ACCORD_OPCO en colonne matrice — non touché volontairement (hors
périmètre seed). Si la décision locale retire aussi la colonne, c'est un
chantier séparé (docStatus + UI matrice).

## R-06 — Corrections du seed (les « 7 »)

Interprétées comme : (1) SATISFACTION → SATISFACTION_CHAUD, (2) ajout
SATISFACTION_FROID, (3) retrait PRE_ACCORD_OPCO, (4) retrait
VALIDATION_OPCO, (5) SUPPORT_PEDAGOGIQUE ind. 9 → 19 + mention upload
manuel, (6) ajout CUSTOM upload libre, (7) CONVENTION ind. 7 → **ind. 9**.

⚠ Si les 7 corrections locales listent autre chose (p.ex. délais,
responsables, isMandatory), diff contre `QUALIOPI-PLAN-COMPLET.md` §1.

## R-07 — Tags indicateurs du catalogue ⚠

État après correction (verrouillé par 9 tests de mapping) :

| Type | Indicateur |
|---|---|
| CONVENTION | **Indicateur 9** (D-09.3-08 ; dette (b) : pas sous ind. 1 dans T7) |
| PROGRAMME | Indicateur 9 |
| AGEFICE | Indicateur 7 |
| EMARGEMENT / ASSIDUITE | Indicateur 12 |
| EVALUATION_ACQUIS / ATTESTATION_FIN | Indicateur 11 |
| SATISFACTION_CHAUD / _FROID | Indicateur 30 |
| SUPPORT_PEDAGOGIQUE | Indicateur 19 |
| CERTIFICAT_REALISATION | Légal Art. L6353-1 |
| CONVOCATION / CUSTOM | — |
| FACTURE | Légal |

⚠ Le recoupement « 0 drift » contre grille BCI réelle + guide V9 +
QUALIOPI-PLAN-COMPLET n'a PAS été fait (sources locales). Seules les
corrections explicites du plan directeur sont verrouillées.

## R-08 — Surfaces UI et recette

- **Apprenant** : onglet Documents reconstruit sur `resolveDocs()` PUR avec
  les rows déjà chargées par la page (zéro requête ajoutée) ; pièces
  CNI/RIB/CFP visibles dans l'onglet (groupe « Pièces apprenant / hors
  session ») ; factures hors résolveur, appendées comme avant ; libellés
  centralisés doc-scope (maps locales supprimées).
- **Produit** : `<ProductDocsBlock>` (Server Component) sous les onglets,
  via `resolveDocsForProduct` (1 findFirst + 1 findMany).
- **Tenant** : section Documents légaux de /app/parametres + liens directs
  vers les derniers PDFs CGV/RI générés (1 par type), via `resolveDocsForTenant`.
- Hrefs : `/api/documents/{id}` · `/api/pedagogical-assets/{id}` ·
  `/api/apprenants/{personId}/docs/{cni|rib|cfp}` · `/app/parametres`.
- Tri : `generatedAt` desc, entrées sans date (identité/tenant) en fin.
- Recette ≤ 2 clics : tenue sur les 3 fiches. Checkpoint visuel :3010 **non
  rejoué** (pas de runtime cloud).

---

## Checklist de validation (à cocher par Laurent)

- [ ] R-01 vs contrat UnifiedDoc figé (naming `source`/`sourceTable`, champs manquants ?)
- [ ] R-02 vs découpage officiel des sources (5 ou 6 ? périmètre du test)
- [ ] R-03 vs D-09.3 PII
- [ ] R-04 vs définition usedStub (asset seul ou + ClosureJob ?)
- [ ] R-05/R-06 vs triage + 7 corrections exactes
- [ ] R-07 vs grille BCI réelle + guide V9 + QUALIOPI-PLAN-COMPLET §1 (0 drift)
- [ ] R-08 vs UI-SPEC 9.3 (copywriting, placement des surfaces)
- [ ] Checkpoint visuel :3010 (3 surfaces)
- [ ] Décision : merge `claude/lucid-davinci-kfqfsf` → `cloud-migration` (ou correctifs d'abord)
