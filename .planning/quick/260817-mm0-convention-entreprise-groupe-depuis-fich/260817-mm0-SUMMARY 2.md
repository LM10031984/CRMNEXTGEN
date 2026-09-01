# Quick 260817-mm0 — Convention entreprise (groupe) depuis la fiche session

**Date :** 2026-08-17
**Branche :** cloud-migration
**Commits :** `b90e168`, `e42ec1c`, `62ec3af`

## Le besoin

Sur la session OPTIMMO (11 salariées, dossier OPCO EP), il était **impossible de
produire depuis l'app la convention au nom de l'entreprise commanditaire**.
Laurent avait dû la générer hors app par script pour la déposer sur le portail.

Règle métier figée le 12/08 : payeur personne morale ⇒ **1 convention unique
signée par le chef d'entreprise pour tout le groupe**, jamais une par salarié
(une convention par stagiaire là où le besoin est celui de l'entreprise est une
non-conformité en audit).

## Ce qui a été livré

Une section **« Convention entreprise »** dans l'onglet *Avant* de la fiche
session : elle liste les commanditaires personnes morales avec leur effectif
(entreprises multi-apprenants d'abord, pattern OPTIMMO) et génère la convention
groupe en un clic. Invisible si la session ne compte que des auto-payeurs.

## Découvertes qui ont simplifié le chantier

- **Le template n'a pas eu à évoluer** : `ConventionData.stagiaires` était déjà
  un tableau (« 1 si AE, N si entreprise avec salariés »). Seule l'orchestration
  manquait — `generateConventionCore` construisait un tableau d'un élément avec
  le commentaire « Pour le MVP, 1 seule personne ».
- **Aucune migration Prisma** : `Document.entityType` est un String libre et
  `participantId` est nullable. Le document groupe porte
  `entityType='organization'` + `entityId=orgId`, `participantId=null`.
- Le code **anticipait déjà ce chantier** : `convention-generator.ts` portait le
  commentaire « pour grouper plusieurs salariés […] on utilisera plus tard
  generateConventionForSession(sessionId, sponsorOrgId) qui agrège ».

## Le piège qui aurait tout gâché

`page.tsx` chargeait les documents avec `participantId: { in: [...] }` puis
faisait `if (!d.participantId) continue`. La convention groupe n'était donc
**ni chargée ni affichée** : les 11 salariées d'OPTIMMO auraient continué
d'afficher « convention manquante » alors que le document existait.

Corrigé en deux temps : la requête inclut désormais les documents
`entityType='organization'`, et une passe reporte la convention groupe sur
chaque salarié du commanditaire — sans jamais écraser une convention
individuelle déjà présente.

## Décisions prises pendant l'exécution

- **Prix hétérogènes ⇒ refus.** Le gabarit exprime le total comme
  « prix unitaire × N stagiaires » et ne sait pas représenter des prix
  différents. Plutôt qu'imprimer un montant **faux** sur un document
  contractuel, l'action refuse et liste les écarts constatés.
- **Notion de régime contractuel centralisée** dans `lib/legal-forms.ts` :
  `requiresContratIndividuel` = `SOLO_FORMS` + `PARTICULIER`. `SOLO_FORMS`
  répond à une autre question (« l'apprenant est-il son propre employeur ? ») et
  n'inclut pas PARTICULIER — les deux notions se recouvrent sans être égales.
- **Représentant absent ⇒ emplacement laissé vide** plutôt que d'inscrire à tort
  le nom d'un salarié comme signataire pour l'entreprise.
- **`generateConventionCore` intacte** : c'est le chemin des auto-payeurs, et le
  test `generators-idempotent` dépend de son `deleteMany` inconditionnel.

## Fichiers

| Fichier | Rôle |
|---|---|
| `apps/web/src/lib/legal-forms.ts` | `requiresContratIndividuel` (source unique du régime) |
| `apps/web/src/lib/closure/convention-core.ts` | `generateConventionEntrepriseCore` (delta) |
| `apps/web/src/server/actions/convention-generator.ts` | `generateConventionEntreprise` |
| `apps/web/src/components/sessions/convention-entreprise-panel.tsx` | Panneau + génération |
| `apps/web/src/app/app/sessions/[id]/page.tsx` | Groupes commanditaires + rattachement du doc groupe |
| `apps/web/src/lib/closure/__tests__/convention-entreprise.test.ts` | 11 tests |

## Vérification

- **1235/1235 tests verts** (156 fichiers), dont 11 nouveaux. Lancer avec les env
  chargées (`dotenv -e ../../.env --`).
- **Build monorepo vert**, `tsc --noEmit` et lint propres.
- **Test de puissance** : retirer le `deleteMany` des conventions individuelles
  fait virer rouge le test correspondant ; restauré ⇒ 11/11.

## Reste à faire

- ⚠ **Jamais exécuté sur une vraie session** : aucun PDF de convention groupe n'a
  été produit pour de bon. À tester sur OPTIMMO (le cas de référence) avant de
  s'en servir pour un dépôt portail. Le rendu WeasyPrint avec N stagiaires dans
  l'annexe n'a pas été relu à l'œil.
- Le champ `Organization.representative` doit être renseigné pour OPTIMMO, sinon
  la ligne signataire sort vide (choix délibéré).
- Chantiers suivants du todo du 12/08, **non traités** : template « Contrat de
  formation professionnelle » pour les auto-payeurs (modèle et écarts consignés
  dans `.planning/specs/2026-08-17-contrat-formation-professionnelle-modele.md`)
  et analyse de besoin par commanditaire.
