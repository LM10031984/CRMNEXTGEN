# Liens publics à jeton — passe de lisibilité

**Date :** 2026-09-10 · **Statut :** livrable de texte, **non appliqué, non commité**
**À appliquer dans :** worktree `files-chaine` (branche `chaine/lot-f-campagne-rdv`) — voir §4.

> Demande de Laurent : « Le code est juste — la campagne ne duplique rien, elle rend
> la main au pipeline existant — mais je n'ai pas pu le deviner en regardant l'écran. »
> Donc : **du texte, pas de la plomberie.** Aucun renommage d'URL (des liens sont
> peut-être déjà diffusés), aucune modification de logique.

---

## 1. Le constat qui explique la confusion

Il n'y a pas trois liens à jeton mais **cinq** : `/inscription`, `/preinscription`,
`/rdv`, `/invitation` et `/proposition`.

Et surtout : **les trois liens clients créent tous un `PreEnrollment`**
(`session-enrollment-public.ts:211` pour `/inscription`, le formulaire public pour
`/preinscription`, la campagne pour `/rdv`). Trois portes, un seul couloir.

La distinction n'est donc **pas** dans ce que les liens produisent — c'est identique —
mais dans **qui les reçoit et combien de personnes les utilisent** :

| Lien | Pour qui | Combien de personnes | Ce qu'on y fait |
|---|---|---|---|
| `/inscription/[token]` | diffusion large (email, WhatsApp) | **plusieurs**, lien permanent de la session | demander son inscription à une session déjà programmée |
| `/preinscription/[token]` | **une** personne nommée | **une seule** | déposer ses pièces, constituer son dossier |
| `/rdv/[token]` | l'équipe d'une entreprise, via son dirigeant | **plusieurs**, un par participant ensuite | se signaler et choisir une date ; le dossier se remplit ensuite ailleurs |
| `/invitation/[token]` | un utilisateur **interne** | une seule, une seule fois | activer son compte QualiOF |
| `/proposition/[token]` | le **décideur** de l'entreprise | une | lire le chiffrage, accepter ou discuter |

Le mot qui fait la différence, à tenir dans tous les textes :
**collectif · nominatif · groupe · interne · décideur**.

---

## 2. Les 5 phrases d'accroche

Une phrase par écran, placée en tête, avant le formulaire. Elle dit **à qui l'écran
s'adresse** et **ce qu'on y fait** — dans cet ordre.

### `/inscription/[token]` — lien permanent d'une session

> **Vous demandez votre inscription à cette session de formation.** Ce lien est celui
> de la session : plusieurs personnes peuvent l'utiliser. Renseignez vos coordonnées,
> Start Academy revient vers vous pour constituer votre dossier.

### `/preinscription/[token]` — dossier individuel

> **Votre dossier de formation, personnel et nominatif.** Déposez ici vos pièces —
> pièce d'identité, RIB, attestation de versement CFP si vous êtes indépendant.
> Start Academy les vérifie et vous relance si l'une manque.

### `/rdv/[token]` — campagne de groupe

> **Votre entreprise organise cette formation et vous y êtes convié.** Dites-nous qui
> vous êtes et choisissez la date qui vous convient parmi celles proposées : vous
> recevrez ensuite **votre lien personnel** pour déposer vos pièces. Vous ne voyez ici
> que votre propre inscription.

### `/invitation/[token]` — interne

> **Cette invitation ouvre votre accès à QualiOF, l'outil interne de Start Academy.**
> Choisissez un mot de passe pour activer votre compte. Ce lien ne fonctionne qu'une fois.

### `/proposition/[token]` — proposition commerciale

> **La proposition de formation établie pour votre entreprise** : contenu, dates, budget
> et prise en charge. À lire, puis à accepter ou à discuter avec votre interlocuteur
> Start Academy.

---

## 3. Les 4 libellés CRM

Chaque endroit où l'on copie un lien doit **nommer lequel** et **dire à qui l'envoyer**.
Libellé du bouton + une phrase d'aide dessous.

### 3.1 Fiche session → bloc « Inscriptions en ligne »
`apps/web/src/components/sessions/session-enrollment-block.tsx` (libellé actuel : `Copier`)

- **Bouton :** `Copier le lien d'inscription à la session`
- **Aide :** Lien **permanent et collectif**, à diffuser largement (email, WhatsApp).
  Chaque personne qui l'ouvre demande son inscription à *cette* session.

### 3.2 Pré-inscriptions → nouveau lien
`apps/web/src/components/preinscriptions/new-link-button.tsx`

- **Bouton :** `Copier le lien de dossier individuel`
- **Aide :** Lien **nominatif**, à envoyer à **une seule** personne. Elle y dépose ses
  pièces ; le dossier arrive en validation.

### 3.3 Campagne → fiche campagne et création
`apps/web/src/components/campagne/campagne-actions.tsx` (intitulé actuel : « Le lien à diffuser »)
`apps/web/src/components/campagne/nouvelle-campagne-form.tsx`
*(les deux uniquement sur la branche `chaine/lot-f-campagne-rdv`)*

- **Bouton :** `Copier le lien de campagne (groupe)`
- **Aide :** À remettre **au dirigeant**, qui le transmet à son équipe. Chaque
  participant recevra ensuite *son* lien de dossier individuel.

### 3.4 Proposition → lien émis
`apps/web/src/components/proposition/proposal-actions.tsx` (toast actuel : « Lien copié »)

- **Bouton :** `Copier le lien de la proposition`
- **Aide :** À envoyer **au décideur**. Il y consulte le chiffrage et répond.
  Ne pas diffuser aux participants.

### 3.5 Un défaut à corriger au passage
`apps/web/src/app/rdv/[token]/page.tsx` déclare
`metadata.title = 'Votre pré-inscription — Start Academy'` — **le même titre que
`/preinscription`**. C'est la confusion inscrite dans l'onglet du navigateur.
À remplacer par : `Votre inscription au groupe — Start Academy`.

---

## 4. Où appliquer, et pourquoi pas ici

`/rdv/[token]`, `campagne-actions.tsx` et `nouvelle-campagne-form.tsx` **n'existent pas**
sur `feat/signature-docs-signes`. Ils sont apportés par le commit `c384d5c`
(« lot F — la campagne de RDV »), sur `chaine/lot-f-campagne-rdv`, montée dans le
worktree **`files-chaine`** — **8 commits d'avance** sur la branche signature.

Ce même commit a **déjà modifié le §7 de la spec**. Y toucher depuis la branche
signature créerait un conflit au merge. D'où : **tout appliquer depuis `files-chaine`**,
en une seule passe, les écrans côte à côte.

---

## 5. Texte à insérer dans la spec §7

À placer en tête du `## 7. Le lien de pré-inscription par RDV (EnrollmentBatch)` de
`.planning/specs/2026-09-01-chaine-diagnostic-proposition.md`.

```markdown
### 7.0 Les cinq liens publics à jeton — ne pas les confondre

Constat du 10/09/2026 : le code est juste (la campagne ne duplique rien, elle rend la
main au pipeline `PreEnrollment` existant), mais **rien à l'écran ne permettait de
distinguer les liens**. Les trois liens clients aboutissent au même `PreEnrollment` :
la différence n'est pas dans ce qu'ils produisent, elle est dans **qui les reçoit et
combien de personnes les utilisent**.

| Lien | Pour qui | Nb d'utilisateurs | Ce qu'on y fait |
|---|---|---|---|
| `/inscription/[token]` | diffusion large | plusieurs (permanent, par session) | demander son inscription à une session programmée |
| `/preinscription/[token]` | une personne nommée | une seule | déposer ses pièces, constituer son dossier |
| `/rdv/[token]` | l'équipe d'une entreprise, via son dirigeant | plusieurs | se signaler, choisir une date ; le dossier se remplit ensuite sur son lien individuel |
| `/invitation/[token]` | utilisateur **interne** | une, une seule fois | activer son compte QualiOF |
| `/proposition/[token]` | le décideur | une | lire le chiffrage, accepter ou discuter |

**Règle de rédaction, à tenir pour tout nouveau lien public.** Chaque écran public
ouvre par une phrase qui dit à qui il s'adresse puis ce qu'on y fait. Chaque endroit du
CRM où l'on copie un lien nomme lequel et dit à qui l'envoyer. Le mot discriminant est
toujours l'un de : **collectif · nominatif · groupe · interne · décideur**.

**Pas de renommage d'URL** : des liens sont diffusés. La levée d'ambiguïté est
textuelle, jamais structurelle.
```
