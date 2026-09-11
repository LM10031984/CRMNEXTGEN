---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-9
subsystem: signature-electronique
tags: [signature, vocabulaire, fiche-organisation, typage, regles-de-test, tests-mutation]
requires:
  - quick-260910-c2b-8 # signataireOf passé à la vue, test de source du FIL
  - lot-C.2a # resoudreEmailRepresentant refuse nominativement, sans repli
provides:
  - "« responsable de l'organisation » à l'écran et dans la spec — « dirigeant » proscrit"
  - "le champ « Responsable — signe les conventions » sur la fiche organisation, AVEC son email"
  - "un avertissement nominatif quand l'email manque : ce qui bloque l'envoi se dit AVANT l'envoi"
  - "`signataireOf` obligatoire — l'oublier est une erreur `tsc`, plus un silence"
  - "deux règles de test opposables dans `.claude/commands/signature.md`, avec leurs incidents"
affects:
  - "`construireVueSignature` : `signataireOf?` → `signataireOf` (16 appels de test mis à jour)"
  - "modale d'édition d'organisation : libellé « Représentant légal » → « Responsable — signe les conventions »"
  - "récapitulatif d'envoi : `ORG_REPRESENTATIVE` se lit « responsable de l'organisation »"
  - "spec §3, §3 bis, §5 lot C alignées ; §3 ter ajoutée (le mot et sa frontière)"
key-files:
  created:
    - apps/web/src/lib/organisations/responsable-organisation.ts
    - apps/web/src/components/organisations/responsable-organisation.tsx
    - apps/web/src/lib/organisations/__tests__/responsable-organisation.test.ts
    - apps/web/src/components/organisations/__tests__/responsable-organisation.test.tsx
    - apps/web/src/lib/signature/__tests__/vocabulaire-responsable.source.test.ts
  modified:
    - apps/web/src/app/app/organisations/[id]/page.tsx
    - apps/web/src/components/forms/edit-organization-button.tsx
    - apps/web/src/components/forms/__tests__/edit-organization-champs.test.tsx
    - apps/web/src/components/sessions/signature/recapitulatif-envoi.tsx
    - apps/web/src/components/sessions/signature/__tests__/recapitulatif-envoi.test.tsx
    - apps/web/src/lib/sessions/bloc-signature-vue.ts
    - apps/web/src/lib/sessions/__tests__/bloc-signature-vue.test.ts
    - apps/web/src/lib/signature/text-tags.ts
    - apps/web/src/lib/signature/__tests__/signataire-of.source.test.ts
    - .planning/specs/2026-09-04-signature-electronique-docs-signes.md
    - .claude/commands/signature.md
metrics:
  tasks: 3
  commits: 5
  mutations: 4
  tests_ajoutes: 43
---

# Quick C.2b-9 : le mot juste, une prop qu'on ne peut plus oublier, et la règle écrite

Trois demandes de Laurent du 11/09/2026. Aucune migration, aucun changement dans
le moteur de résolution.

## Demande n°1 — « responsable de l'organisation », jamais « dirigeant »

**La précision métier qui change le mot.** Pour un salarié, le signataire de la
convention est le **responsable d'agence** — la personne désignée comme
`Organization.representative` sur la fiche de l'organisation bénéficiaire. Pas
nécessairement le représentant légal.

« Dirigeant » (et « représentant légal ») affirment donc une **qualité juridique
que la donnée ne porte pas**. Le champ dit seulement qui représente
l'organisation et signe ses conventions. Le mot faux fait chercher un mandataire
social, fait hésiter à saisir le nom qui convient, et pousse à « corriger » une
cascade qui est juste.

**La cascade n'a pas bougé d'une ligne.** `representant.ts` — `representative`,
sinon le premier contact principal — est inchangé. Le nouveau module
`lib/organisations/responsable-organisation.ts` l'APPELLE ; il ne le recopie pas.
C'est ce qui empêche la fiche d'annoncer un responsable différent de celui qui
recevra le lien.

**Ce que la fiche organisation dit maintenant.** Un champ en tête de l'identité
juridique : le libellé, le nom résolu, **son email**, et un `role="alert"`
nominatif quand l'adresse manque — parce que sans elle, aucune convention ne part
pour cette organisation (refus nominatif du moteur depuis C.2a). L'admin
l'apprenait jusqu'ici au moment d'envoyer, sur un autre écran, après avoir
préparé son dossier.

**La garde est lexicale, et elle distingue l'usage de la mention.** Laurent
demande que le MOTIF du renommage soit écrit en commentaire — et ce motif
contient le mot. La règle retenue : entre guillemets français, le mot est CITÉ
(autorisé en commentaire) ; ailleurs, il est EMPLOYÉ (interdit). Et dans un
**littéral de chaîne**, il est interdit **même cité** : un commentaire s'adresse
au prochain développeur, une chaîne s'affiche.

## Demande n°2 — `signataireOf` obligatoire

Le lot C.2b-8 avait mesuré le trou : la prop étant optionnelle, un futur
appelant pouvait l'oublier **sans erreur `tsc`**, et seul un test de source
gardait l'appelant existant. `signataireOf?: … | null` devient
`signataireOf: … | null`, et le repli `a.signataireOf ?? null` disparaît — il
aurait masqué l'oubli qu'on venait d'interdire.

**`null` reste légitime** (Paramètres organisme incomplets) : c'est **l'absence**
qui devient impossible, pas **« pas d'OF »**. Les 15 appels de test qui ne la
passaient pas reçoivent `SANS_OF`, une constante nommée — un `null` nu dans
quinze appels ressemble à du remplissage ; nommé, il dit que ce test ne prétend
rien garder du signataire OF. Aucune promesse de test n'a été affaiblie.

**La garantie se garde par le typeur, pas par un `expect`.** Un bloc
`@ts-expect-error` fait échouer `tsc --noEmit` sur `Unused '@ts-expect-error'
directive` si quelqu'un remet la prop en optionnel.

**Et ce que `tsc` ne voit pas** : `signataireOf: null` compile parfaitement et
produirait exactement le même écran amputé. C'est l'assertion littérale de
`signataire-of.source.test.ts` qui l'attrape. Prop obligatoire **et** test de
câblage — les deux, jamais l'une à la place de l'autre.

## Demande n°3 — les deux règles de test, écrites avec leurs incidents

`.claude/commands/signature.md` §3 bis. Onze tests de ce chantier se sont révélés
ne rien garder ; **aucun n'a été repéré en relecture, tous par mutation**.

1. **Toute prop qui traverse `page.tsx` a un TEST DE CÂBLAGE.** Incident C.2b-8 :
   retirer `signataireOf:` faisait disparaître l'organisme de toutes les lignes en
   production, **95 tests restaient verts**. Même trou en C.2b-1.
2. **Aucun test ne compare sa valeur attendue au retour de la fonction qu'il
   teste.** Incident C.2b-6 : un `href` comparé au retour de
   `lienRenseignerFinanceur` restait vert quand le constructeur cessait de poser
   ce retour — les deux côtés bougeaient ensemble.

Ajouté au passage : §2.7 fixe le vocabulaire et **interdit de migrer une valeur
d'enum dans un lot de libellés** (dire et s'arrêter) ; §3.5 aligne la boucle sur
**LES TROIS gates** de `/quick` — elle n'en citait que deux, dont un script
`typecheck` qui n'existe pas.

## Ce qui garde « dirigeant », et pourquoi

Le renommage est **textuel, jamais structurel**. Gardé par le test
« la FRONTIÈRE » de `vocabulaire-responsable.source.test.ts` :

| Ce qui reste | Motif |
|---|---|
| `SignerRole.DIRIGEANT` (`regime.ts`, Prisma, migration `20260910160000`) | valeur de `OpcoCatalog.conventionSigner`, seedée et migrée |
| `LinkRole.DIRIGEANT` + libellé « Dirigeant » (fiche organisation, `gap-row.tsx`) | **autre concept** : le rôle d'une personne dans une organisation, pas le signataire |
| `DiagParticipantStatut.DIRIGEANT` | autre domaine (chaîne diagnostic) |
| `Tenant.signatureDirigeantPath` | colonne, image de signature de l'OF |
| « stagiaire-dirigeant », « Dirigeant TNS » (spec §3, §3 bis) | désignent le TNS lui-même, signataire via `Person.email` |
| `of.resp.titre ?? 'Dirigeant'` (attestation AGEFICE, analyse de besoin) | qualité de l'OF lui-même, pas de l'organisation cliente |
| « Représentant légal inconnu… » (`representant.ts`) | **fichier du moteur, hors périmètre** — à trancher séparément |

## Mutations exécutées

| # | Mutation | Sortie réelle |
|---|---|---|
| 1 | « dirigeant » réintroduit dans `PHRASE_AUCUN_EMAIL` | **2 rouges** (usage + littéral d'écran) |
| 1 bis | le mot **cité** `« dirigeant »` dans la même chaîne | **1 rouge** — la dérogation ne fuit pas dans l'écran |
| 2 | avertissement d'email manquant retiré du composant | **2 rouges** : `Unable to find an accessible element with the role "alert"` |
| 3 | `signataireOf` remis en optionnel | `pnpm test` **reste vert (2879)** ; `tsc` échoue : `TS2578: Unused '@ts-expect-error' directive` |

La mutation 3 est la démonstration honnête de la demande n°2 : ce n'est **pas un
test** qui l'attrape, c'est le typeur.

## Gates

```
pnpm lint                                      3 successful (2 warnings pré-existantes, hors lot)
pnpm --filter @qualiof/web exec tsc --noEmit   code de sortie 0
pnpm test                                      286 fichiers, 2879 tests, 2 skipped
```
