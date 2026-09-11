# Spec — Dossier documentaire unifié par apprenant (« tout dans QualiOF »)

> **Date** : 2026-09-10 · **Auteur** : Laurent + Claude (session Cowork)
> **Statut** : SPEC VALIDÉE PAR LAURENT sur les 3 décisions d'orientation (§1) — à implémenter comme **lot E** du chantier signature électronique, après merge de la PR #35 (lots A+B).
> **Pour** : Claude Code, dépôt QualiOF (`files/`), nouveau worktree depuis `main` (après merge #35 et de `fix/260910-assiduite-archive`).
> **Pré-requis de lecture** : `.planning/specs/2026-09-04-signature-electronique-docs-signes.md` (§2 existant, §4 modèle `Document`, lot C règle « scan et e-signature s'excluent »), `apps/web/src/lib/sessions/participant-phase-items.ts` (`resolveParticipantPhaseDocs`, commit 0b1ba88 — la SEULE fonction qui décide des pièces d'une phase), `components/sessions/qualiopi-matrix/participant-doc-matrix.tsx`, `app/app/apprenants/[id]/page.tsx` (onglet « Documents » existant).

---

## 0. Le problème, tel que formulé le 10/09

« J'aimerais tout centraliser dans QualiOF et arrêter d'emprunter 300 chemins. » Aujourd'hui les pièces d'un apprenant sont réparties entre les onglets Avant/Après (actions), la matrice « Tous les documents » (lecture), l'onglet Documents de la fiche apprenant (documents générés seulement), le dépôt de scan (câblé sur `EMARGEMENT` uniquement) et, hors outil, Drive / mails pour les scans. Ni Laurent ni l'admin ne voient d'un coup d'œil, pour un apprenant donné, ce qui est produit, envoyé, signé, manquant — et l'audit Qualiopi demande exactement ça.

## 1. Décisions d'orientation (Laurent, 10/09/2026)

| # | Décision | Conséquence |
|---|---|---|
| O-1 | **Une pièce collective est déposée une fois** (convention d'entreprise, feuille d'émargement de groupe, analyse collective) et **apparaît dans le dossier de chaque apprenant concerné**. | Le dossier apprenant est une **projection** : il ne stocke rien, il résout `Document` de scope session / organisation / participant. Aucune duplication de fichier. |
| O-2 | **Liste plate**, la phase (Avant / Pendant / Après) devient une simple étiquette de tri, plus une structure d'onglets. Rendu « très visuel et accessible » : une ligne par pièce, un pastille d'état, une action au plus. | Même composant `<DossierApprenant>` rendu depuis la session (par apprenant) et depuis la fiche apprenant (par session). |
| O-3 | **Le zip n'est plus le livrable central** : tout est dans l'outil. Il reste un bouton « Télécharger le dossier » (audit, financeur) qui produit strictement *ce que la liste affiche* — plus de liste séparée à maintenir. | La route zip existante (`session-learner-zip.ts`) est réécrite sur le même résolveur que la vue ; le test d'invariant « compteur == archive » (0b1ba88) est conservé et étendu au dossier complet. |
| O-4 | La règle LOCKED « 1 doc = 1 maison » (Tous-docs MONTRE, Avant/Après AGISSENT) est **assouplie pour le dépôt de scan uniquement** : déposer un signé n'est pas « générer », c'est **compléter une preuve**. Générer / envoyer pour signature restent dans Avant/Après. | La vue plate accepte le glisser-déposer d'un PDF sur n'importe quelle ligne au statut `GENERATED` ou `SENT`. |

## 2. Modèle : un état unique par pièce

Pas de nouvelle table. On formalise la dérivation d'état, aujourd'hui éclatée entre `deriveCellState`, `docStatus[type]` et `Document.status`, en **une fonction pure** `deriveDocState(doc, docStatus, signature)` :

```
MISSING     → pièce attendue, aucun Document
GENERATED   → PDF généré, non signé            (Document.pdfUrl)
SENT        → enveloppe DocuSeal en cours       (lot C — Document.signatureRequestId, pas de signedPdfUrl)
SIGNED      → PDF signé disponible               (Document.signedPdfUrl)
              └ origine : E_SIGN | SCAN          (Document.signatureKind, lot C — sinon déduit : audit-trail présent ⇒ E_SIGN)
NA          → pièce non attendue pour cet apprenant (ex. AGEFICE hors TNS)
```

Règles :
- `SIGNED/E_SIGN` verrouille le dépôt de scan (règle lot C). `SIGNED/SCAN` peut être remplacé par un nouveau scan (avec `AuditLog`).
- Le certificat DocuSeal (`.audit-trail.pdf`) est une pièce **fille**, affichée sous sa pièce mère, jamais fusionnée (rappel : agrafer casserait la signature).
- Pièces attendues pour un couple session × apprenant = `resolveParticipantPhaseDocs` pour les 3 phases, **plus** les pièces collectives résolues au niveau session/organisation (convention entreprise, émargement collectif, analyse collective) — un seul point d'entrée `resolveDossierApprenant(sessionId, participantId)` qui les concatène et étiquette la phase.

## 3. Les deux vues, un composant

`<DossierApprenant items={…} context="session"|"apprenant" />` :

```
┌ Pièce                      Phase    État                  Action
│ ● Convention (ASSALIT)     Avant    Signée · e-sign 02/09  ↓ PDF  ↓ certificat
│ ● Convocation              Avant    Générée                ↓ PDF   ⤓ déposer un scan
│ ○ AGEFICE                  Avant    Envoyée · attend J.B.  relancer
│ ● Émargement (groupe)      Pendant  Signée · scan 09/09    ↓ PDF   remplacer
│ ○ Attestation assiduité    Après    Manquante              (générer : depuis Après)
│ ● Certificat réalisation   Après    Générée                ↓ PDF   ⤓ déposer un scan
└ Programme                  Avant    Générée                ↓ PDF
```

- Pastille : gris = manquante, bleu = générée, ambre = envoyée, vert = signée. Un seul code couleur, réutilisé dans la matrice session (qui devient le résumé « une ligne par apprenant » de ce même état).
- Depuis la **session** : la matrice existante garde sa grille apprenants × pièces (résumé), un clic sur un apprenant ouvre son `<DossierApprenant>` (drawer, même pattern que le drawer Paramètres du 04/09).
- Depuis la **fiche apprenant** : l'onglet « Documents » actuel est remplacé par une section par session (« Session du 12/09 — SES-0111 ») contenant le même composant. Les documents « hors session » existants (CNI, pièces d'identité) restent dans leur carte.
- Dépôt : zone de glisser-déposer sur la ligne + bouton ⤓ ; réutilise `uploadSignedDoc` (clé `signed/…`, `docStatus[type].state = 'MANUAL_OK'`, `signatureKind = 'SCAN'`). Pour une pièce collective, le dépôt se fait sur la ligne « (groupe) » et met à jour le Document de scope session/organisation, donc tous les dossiers.
- Audit Qualiopi : filtre « pièces manquantes ou non signées » en tête de liste, et un compteur « X/Y signées » par apprenant repris dans la matrice.

## 4. Lots

| Lot | Contenu | Livrable seul ? |
|---|---|---|
| E-1 | `deriveDocState` + `resolveDossierApprenant` (pur, testé, y compris pièces collectives) ; migration : rien (colonnes `signedPdfUrl`/`signatureKind` viennent de #35). Tests d'invariant : matrice == dossier == zip. | oui |
| E-2 | `<DossierApprenant>` + drawer depuis la matrice session + dépôt de scan généralisé (remplace le « Déposer le scan » câblé sur `EMARGEMENT`). | oui |
| E-3 | Fiche apprenant : section par session sur le même composant, remplacement de l'onglet Documents. | oui |
| E-4 | Route zip réécrite sur `resolveDossierApprenant` ; bouton « Télécharger le dossier » ; suppression du compteur/infobulle bricolés du bouton Avant si devenus redondants. | oui |

Ordre : E-1 → E-2 → E-3 → E-4. E-2 est celui que l'admin voit ; à montrer à Laurent avant E-3.

## 5. Décisions ouvertes

| # | Question | Proposition |
|---|---|---|
| D-1 | Le programme et la convocation (jamais signés) doivent-ils apparaître dans le dossier ou seulement dans le zip ? | Dans le dossier, état « Générée », sans action de dépôt (bruit minimal, mais complet pour l'audit). |
| D-2 | Faut-il un état « SIGNÉE PARTIELLEMENT » quand un signataire sur deux a signé ? | Non : `SENT` avec le nom du signataire attendu dans le libellé (« attend J.-B. Boutry »). |
| D-3 | Le remplacement d'un scan garde-t-il l'ancien fichier ? | Oui, dans le bucket (nouvelle clé sha8), l'ancien reste référencé dans `AuditLog` seulement. |
| D-4 | Que devient l'onglet « Tous les documents » de la session ? | Il reste, avec la matrice-résumé ; c'est lui qui ouvre le drawer. Pas de 4e onglet. |
