---
phase: quick-260910-c2b
plan: 01
decoupage: C.2b-6
subsystem: inscriptions-crm
tags: [inscription, commanditaire, financeur, avertissement, deep-link, from-link]
requires:
  - quick-260910-c2b-5 # lien-corriger-financeur.ts, champ éditable sur l'inscription
  - quick-260910-c2b-2 # bloc-signature-vue.ts, ContexteAvertissement.financeurSansRegime
provides:
  - "le champ s'appelle « Organisation commanditaire », et chaque option porte son financeur"
  - "l'avertissement « régime incohérent » a DEUX destinations, sur le discriminant existant"
  - "forme d'URL publiée pour ouvrir la fiche organisation sur son champ financeur"
  - "<EditModal> s'ouvre par l'URL, met un champ en évidence, et rend la main à son appelant"
  - "la fiche organisation honore `?from=` : « Retour à la session »"
affects:
  - "tout appelant de <EditModal> (trois props optionnelles, comportement inchangé sans elles)"
  - "le message du moteur (plan-envoi.ts), rendu tel quel dans le récapitulatif d'envoi"
key-files:
  created:
    - apps/web/src/lib/sessions/commanditaire-libelles.ts
    - apps/web/src/lib/sessions/lien-renseigner-financeur.ts
    - apps/web/src/lib/sessions/__tests__/lien-renseigner-financeur.test.ts
    - apps/web/src/components/forms/__tests__/edit-organization-financeur.test.tsx
  modified:
    - apps/web/src/lib/sessions/bloc-signature-vue.ts
    - apps/web/src/lib/sessions/lien-corriger-financeur.ts
    - apps/web/src/lib/signature/plan-envoi.ts
    - apps/web/src/components/sessions/edit-participant-button.tsx
    - apps/web/src/components/sessions/signature/bloc-signature.tsx
    - apps/web/src/components/forms/edit-modal.tsx
    - apps/web/src/components/forms/edit-organization-button.tsx
    - apps/web/src/app/app/organisations/[id]/page.tsx
    - apps/web/src/app/app/sessions/[id]/page.tsx
metrics:
  tasks: 2
  commits: 5
  mutations: 9
  tests_ajoutes: 41
---

# Quick C.2b-6 : l'organisation commanditaire, et les deux destinations de l'avertissement

Deux corrections de Laurent après vérification d'écran le 11/09/2026.

1. « Financeur de l'inscription » nommait une organisation. Le champ s'appelle
   désormais **« Organisation commanditaire »**, et chaque option affiche le
   financeur que porte cette organisation.
2. L'avertissement « régime incohérent » envoyait **toujours** vers le
   formulaire d'inscription. Il distingue maintenant les deux cas et pointe au
   bon endroit.

## La forme d'URL retenue pour la fiche organisation

C'est un **contrat**, publié comme celui de C.2b-5 et testé dans
`apps/web/src/lib/sessions/lien-renseigner-financeur.ts` :

```
/app/organisations/{organizationId}?champ=financeur&from={retour encodé}
```

Exemple réel, tel que le bloc Signature le produit depuis l'onglet « Avant » :

```
/app/organisations/org-roussel?champ=financeur&from=%2Fapp%2Fsessions%2Fses-0048%3Ftab%3Davant
```

| Paramètre        | Rôle                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| `champ=financeur`| le champ mis en évidence et focalisé. **Même mot** que sur l'inscription — un seul vocabulaire pour « le champ financeur ». Il désigne `opcoCode`. |
| `from=`          | le chemin de retour, encodé, **validé à l'arrivée** par `parseFrom`             |

```ts
import { lienRenseignerFinanceur, retourVersOnglet, libelleLienRenseignerFinanceur }
  from '@/lib/sessions/lien-renseigner-financeur';

lienRenseignerFinanceur({
  organizationId,
  retourVers: retourVersOnglet(sessionId, 'avant'),
});
```

**Pourquoi un second contrat plutôt qu'une extension du premier.** Celui de
C.2b-5 ouvre le formulaire d'inscription **sur la même page** : d'où `tab=`
(l'onglet porteur) et `retour=` (l'onglet où revenir). Ici la cible est une
**autre page**, qui n'a ni onglets ni formulaire d'inscription. Traîner ces deux
paramètres sur `/app/organisations/{id}` ferait croire qu'il y existe un onglet
« Avant ».

**Le retour n'a pas été inventé.** Le dépôt a déjà sa convention — `?from=`
(`withFrom` / `parseFrom` / `<BackToListLink>`), en service sur les fiches
apprenant, facture, devis, et repérable dans `budget-agefice/page.tsx:183`. Elle
sert ici telle quelle. Un second mécanisme de retour serait un second endroit où
décider ce qu'est une destination interne acceptable, donc un second endroit où
oublier de refuser `javascript:` et `//host`.

**Le piège de C.2b-5 ne se repose pas, et le retour a été vérifié à l'arrivée.**
Là-bas, `tab=session` était obligatoire parce que les panneaux d'onglet inactifs
sont rendus `hidden` — `display:none` masque jusqu'aux enfants `position:fixed`,
et la modale était réellement ouverte et totalement invisible. Sur
`/app/organisations/{id}` il n'y a pas d'onglet. Ce qui restait à vérifier était
le RETOUR : `edit-organization-financeur.test.tsx` monte `<BackToListLink>` avec
la valeur `from` que le lien y a réellement mise, et vérifie qu'il rend
« Retour à la session » vers `/app/sessions/sess-1?tab=avant`. Un `from` mal
encodé ou refusé par `parseFrom` produirait un « Retour à la liste » vers
`/app/organisations` — panne muette.

## Ce qui a été livré, fichier par fichier

### 1. `apps/web/src/lib/sessions/commanditaire-libelles.ts` — neuf

Les trois chaînes du champ, à un seul endroit :

- `LIBELLE_CHAMP_COMMANDITAIRE = 'Organisation commanditaire'`
- `AIDE_CHAMP_COMMANDITAIRE` — **au mot près** :
  « L'organisation qui porte l'inscription et figure sur la convention. Son
  financeur (OPCO, AGEFICE…) détermine les pièces à signer. »
- `libelleOptionCommanditaire({ label, opcoCode })` :
  - avec financeur → `« Sigma (OPCO EP) »`
  - sans financeur → `« ROUSSEL Camille, EI — aucun financeur »`

Le code brut ne ressort nulle part : `formatFunderCode` rend « OPCO EP » là où
la base stocke `OPCO_EP`, même règle d'affichage que les badges de la fiche
organisation (UX-12). Deux écrans qui épellent différemment le même financeur
font douter qu'il s'agisse du même.

### 2. `apps/web/src/components/sessions/edit-participant-button.tsx`

Libellé, id (`organisation-commanditaire-…`), texte d'aide, options composées par
le module partagé, message de rôle insuffisant. Le `AIDE_MODE` (« COMMENT
l'inscription est financée ») ne bouge pas : c'est l'autre moitié de la levée
d'ambiguïté.

### 3. `apps/web/src/lib/sessions/bloc-signature-vue.ts`

- `ContexteAvertissement` gagne **`sponsorOrgId`** — sans lui, le cas A n'a
  aucune fiche à ouvrir.
- `AvertissementParticipant` gagne **`correction`**, décidée par la nouvelle
  fonction pure `correctionAvertissement(contexte)` :
  - `financeurSansRegime === true` **et** un id d'organisation utilisable →
    `{ cible: 'ORGANISATION', organizationId, libelleOrganisation }` ;
  - sinon → `{ cible: 'INSCRIPTION' }` (y compris sans contexte : on ne devine
    pas, et on ne fabrique pas un lien vers une fiche qu'on ne sait pas nommer).
- `composerAvertissementRegime` écrit **deux problèmes et deux gestes** :

> **Cas A.** Camille ROUSSEL — son organisation commanditaire (DEMO-SIG ROUSSEL
> Camille, EI) n'a aucun régime de financement, alors que son dossier est
> rattaché à une entreprise financée AGEFICE. **Renseignez le financeur de cette
> organisation.** Pièces concernées : convention, dossier AGEFICE. Rien n'a été
> envoyé.

> **Cas B.** Clothilde MANUEL — le financeur de son organisation commanditaire
> (Sigma) n'ouvre pas ces pièces, alors que son dossier est rattaché à une
> entreprise financée AGEFICE. **Corrigez l'organisation commanditaire de
> l'inscription.** Pièce concernée : dossier AGEFICE. Rien n'a été envoyé.

**Le discriminant n'a pas été inventé** : `financeurSansRegime` existe depuis la
correction n°3 et sépare déjà « n'a aucun régime de financement » de « n'ouvre
pas ces pièces ». C'est la même frontière — une seconde règle pour la même
question est exactement ce que le lot C.2b-1 vient de supprimer.

### 4. `apps/web/src/components/sessions/signature/bloc-signature.tsx`

Le composant **ne choisit pas** : il rend l'un des deux `<Link>` selon
`avertissement.correction.cible`. `as Route` (motif `devis/page.tsx:209`), pas
`as any`. Le retour suit le scope dans les deux cas.

### 5. `apps/web/src/components/forms/edit-modal.tsx` — trois props optionnelles

`ouvertParUrl`, `champEnEvidence`, `onFermeture`. Sans elles, comportement
strictement inchangé pour les autres appelants.

⚠ **`onFermeture` remplace `window.location.reload()`.** Quand l'ouverture vient
de l'URL, recharger rouvrirait la modale : les paramètres sont toujours là.
C'est donc l'appelant qui décide de la suite — nettoyer l'URL, puis
`router.refresh()`.

### 6. `apps/web/src/components/forms/edit-organization-button.tsx`

Lit `?champ=`, efface **ce seul paramètre** à la fermeture, **préserve `from=`**.
Le champ `opcoCode` est relabellisé **« Financeur (OPCO, AGEFICE…) »** — voir
« Écart avec l'énoncé ».

### 7. `apps/web/src/app/app/organisations/[id]/page.tsx`

Lit `searchParams` et passe `from` à `<BackToListLink>`, qui rend alors
« Retour à la session ». Gardé par un smoke source, comme le câblage de la fiche
session : la page n'est pas montable en jsdom, et la prop se serait perdue sans
qu'aucun test ne bouge.

### 8. `apps/web/src/app/app/sessions/[id]/page.tsx`

`sponsorOrgId: lu.sponsorOrgId` dans le contexte de l'avertissement. Gardé par
`fiche-session-cablage-signature.smoke.test.ts`.

### 9. `apps/web/src/lib/signature/plan-envoi.ts`

Le message du moteur — rendu **tel quel** dans le récapitulatif d'envoi
(`recapitulatif-envoi.tsx:288`) — cesse de dire « Corrigez le financeur de
l'inscription ».

## Écart avec l'énoncé — à lire

L'énoncé ne demandait pas de toucher au libellé du champ sur la **fiche
organisation**. Il s'appelait « OPCO de rattachement » ; il s'appelle
« Financeur (OPCO, AGEFICE…) ».

Motif : le lien du cas A promet « Renseigner **le financeur** de X » et
atterrissait sur un champ nommé autrement — de quoi faire douter qu'on soit au
bon endroit, c'est-à-dire exactement le défaut que la correction n°1 corrige
ailleurs. Et « OPCO » est faux pour la valeur dominante de cette colonne :
l'AGEFICE est un fonds d'assurance formation, pas un OPCO. Le vocabulaire du
dépôt est déjà « financeur » (`formatFunderCode`, `FUNDER_LABELS`,
`funder-codes.ts`). La colonne, elle, reste `opcoCode`.

Traité en **déviation Rule 2** (cohérence d'un chemin livré), pas en Rule 4 :
aucune structure nouvelle, aucun changement de données.

## Une mutation est restée VERTE, et elle a été corrigée

Retirer `withFrom` de `lienRenseignerFinanceur` — donc supprimer tout retour —
ne faisait **pas** rougir `bloc-signature.test.tsx`. Les deux côtés de
l'assertion passaient par la même fonction : ils collapsaient ensemble. Le test
gardait « quel lien », pas « vers où ».

Les deux tests du cas A exigent désormais aussi, littéralement, le chemin, le
`champ=financeur` et le `from=` encodé de l'onglet — comme le fait déjà le test
du cas B avec `retour=apres`. Mutation rejouée après renforcement : **2 tests
rouges** dans ce fichier (commit `8478537`).

## Mutations — sortie réelle

### Les trois mutations exigées

| #     | Mutation                                                                 | Résultat                                                           |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **a** | routage des deux cas inversé (`financeurSansRegime !== true` → `=== true`) | **10 failed** / 65 ok — `bloc-signature-vue` 5, `bloc-signature` 5 |
| **b** | financeur retiré des parenthèses (`return o.label`)                       | **3 failed** / 15 ok                                               |
| **c** | retour aux anciens libellés (champ + lien)                                | **3 failed** / 27 ok                                               |

Sorties (extraits réels) :

```
(a) ❯ src/lib/sessions/__tests__/bloc-signature-vue.test.ts (43 tests | 5 failed)
    ❯ src/components/sessions/signature/__tests__/bloc-signature.test.tsx (32 tests | 5 failed)
         Tests  10 failed | 65 passed (75)

(b)      → expected [ 'Pré-inscrit', …(14) ] to include 'Sigma (OPCO EP)'
         → expected [ 'Pré-inscrit', …(13) ] to include 'ROUSSEL Camille, EI — aucun financeur'
         → expected 'Sigma' to be 'Sigma (OPCO EP)'
         Tests  3 failed | 15 passed (18)

(c)      → expected 'Financeur de l\'inscription' to be 'Organisation commanditaire'
         → expected <select …>…</select> to be null
         → expected 'Corriger le financeur de l\'inscripti…' to be 'Corriger l\'organisation commanditair…'
         Tests  3 failed | 27 passed (30)
```

### Mutations complémentaires

| Mutation                                                            | Résultat                            |
| -------------------------------------------------------------------- | ----------------------------------- |
| (d) ouverture redevenue purement locale (`open = openLocal`)         | **4 failed** / 7 ok                 |
| (e) `champ=` n'est plus effacé à la fermeture (boucle)               | **3 failed** / 18 ok                |
| (f) `withFrom` retiré du lien — plus aucun retour                    | **6 failed** / 47 ok *(après renforcement ; 4 avant)* |
| (g) câblage retiré : `sponsorOrgId` + `from={sp.from}`               | **2 failed** / 17 ok                |
| (h) une seule phrase d'action pour les deux cas                      | **2 failed** / 41 ok                |
| (i) `champEnEvidence` retiré (plus de focus ni d'anneau)             | **1 failed** / 7 ok                 |

Aucune mutation n'est restée verte — la seule qui l'était (f, sur
`bloc-signature.test.tsx`) est signalée ci-dessus et le test a été renforcé.

## Gates — sortie réelle

```
######## GATE 1 — pnpm lint --force ########
 Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
(2 warnings préexistants, hors périmètre : parametres/page.tsx alt-text,
 diagnostic-r1/use-autosave.ts exhaustive-deps)

######## GATE 2 — tsc --noEmit (@qualiof/web) ########
exit=0

######## GATE 3 — pnpm test --force (sans cache) ########
@qualiof/shared:test:  Test Files  15 passed (15)      Tests  195 passed (195)
@qualiof/db:test:      Test Files   3 passed (3)       Tests   20 passed (20)
@qualiof/web:test:     Test Files 281 passed (281)     Tests 2779 passed | 2 skipped (2781)
 Tasks:    3 successful, 3 total
```

La gate 2 a servi : le premier jet des `ref` de `<EditModal>` utilisait
`(el) => (champRef.current = el)` — une flèche qui **retourne** l'élément, donc
un `LegacyRef` invalide. Trois erreurs `TS2322`, alors que les tests étaient
verts.

## Commits

| Hash      | Objet                                                                       |
| --------- | --------------------------------------------------------------------------- |
| `c3af864` | `test` tests RED des deux corrections                                       |
| `234dcc6` | `feat` « Organisation commanditaire », financeur entre parenthèses          |
| `cc5da03` | `feat` deux destinations + ouverture par URL de la fiche organisation       |
| `8478537` | `test` le cas A exige littéralement sa destination (mutation restée verte)  |
| `8ae382d` | `chore` plus aucune documentation ne nomme le champ par son ancien libellé  |

## À vérifier à la main

Sur SES avec Camille ROUSSEL et Clothilde MANUEL, onglet « Avant » : les deux
encarts doivent porter des liens **différents**, et celui de Camille doit ouvrir
`/app/organisations/…` avec le champ Financeur entouré et focalisé, puis
« Retour à la session » en haut de la fiche.

## Self-Check: PASSED
