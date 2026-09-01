# Prompt à coller dans Claude Code

> Copier tout ce qui suit la ligne, dans une session Claude Code à la racine du dépôt.
> Le volet conversion est spécifié dans `.planning/quick/260901-qr7-diagnostic-express-stand-mls/260901-qr7-CONVERSION.md`.

---

Lis d'abord `.planning/quick/260901-qr7-diagnostic-express-stand-mls/260901-qr7-CONVERSION.md`
en entier, puis `260901-qr7-PLAN.md` du même dossier. Tu implémentes le **volet conversion** du
diagnostic express du stand (25 ans du MLS, mercredi 9 septembre — J-8). Le volet technique
(catalogue-map, programme-sur-mesure, worker) est déjà en cours : ne le refais pas, appuie-toi
dessus.

## Ordre imposé — le bloquant d'abord

**LOT 1 — V1 : garantir que les programmes partent réellement (bloquant absolu).**
`vercel.json` ne contient aucune clé `crons`. La soumission est mise en file
(`DiagnosticSubmission` en `PENDING`) et l'envoi est délégué à un worker cron **qui n'est
déclenché par personne**. En l'état, le soir du 9, aucun prospect ne reçoit son programme.

Implémente le déclenchement par le navigateur, qui ne dépend d'aucune configuration
d'infrastructure :
1. une route `POST /api/diagnostic/traiter` qui prend un `submissionId`, ne traite QUE cette
   soumission, est idempotente (une soumission déjà `SENT` ne repart pas), et est protégée par
   un rate-limit sur l'IP comme l'action publique ;
2. `soumettreDiagnostic` retourne le `submissionId` en plus du `leadId` ;
3. l'écran de remerciement déclenche un `fetch` **non bloquant** vers cette route (l'écran est
   déjà affiché, le prospect n'attend rien, et l'échec du fetch ne doit rien casser à l'écran) ;
4. ajoute quand même la clé `crons` dans `vercel.json` pour le worker de rattrapage, ET une
   action « envoyer les programmes en attente » déclenchable depuis le CRM — le cron reste un
   filet, jamais le mécanisme principal.

Rappelle-moi à la fin de vérifier `MAIL_DRY_RUN` et `SMTP_HOST` en production (V2).

**LOT 2 — D1/D2/D3 : capter l'engagement et trier les leads.**
- Sur l'écran de résultat, AVANT le formulaire de contact : « Quand peut-on vous appeler pour
  caler votre journée ? » → trois gros boutons, un seul tap :
  `CETTE_SEMAINE` / `SEMAINE_PROCHAINE` / `PLUS_TARD`. Mêmes cibles tactiles que les questions
  (min-h 64 px), aucune saisie.
- Si `CETTE_SEMAINE`, le téléphone devient **obligatoire** (côté formulaire ET côté Zod dans
  l'action — on ne fait jamais confiance au client).
- Nouveau module **pur** `apps/web/src/lib/diagnostic/priorite.ts` (zéro import prisma / auth /
  React, comme `scoring.ts`) :
  `prioriser({ reponses, rappel, telephone }) → { niveau: 'A'|'B'|'C'; motifs: string[] }`
  Règles exactes au §4 du document de conversion. Écris des tests unitaires sur cette fonction :
  c'est de la logique pure, elle doit être couverte.
- L'action écrit le niveau **en tête** du champ `notes` et dans `lastAction`, au format
  `[A] Diagnostic — <titre de l'axe> — rappel cette semaine`. `lastAction` est la colonne visible
  dans la liste des leads : c'est là que Laurent lira la priorité sans ouvrir les fiches.

**LOT 3 — D4 : l'email.**
Dans `lib/mailer-templates/diagnostic-programme.ts` :
- **Supprime** la phrase « c'est souvent pris en charge en totalité » : elle est fausse pour une
  journée de 8 h. Remplace le bloc financement par les chiffres AGEFICE 2026 du §2 du document
  (42 €/h en présentiel, enveloppe 3 000 €/an, dossier à déposer 15 jours calendaires avant le
  début, enveloppe perdue au 31/12).
- **Un seul CTA**, en bouton : « Réserver mon point financement — 15 min ». L'URL vient d'une
  variable d'environnement `DIAGNOSTIC_CTA_URL` ; si elle est vide, replie sur un lien `tel:`
  construit depuis `OfConfig.phone`. Pas de second lien dans l'email.
- Signature **nominative** (Laurent Marx + portable), pas « L'équipe ».
- **Aucun chiffre de satisfaction** dans ce template, et aucun prix.
- Mets à jour le test du template en conséquence.

**LOT 4 — D5 : le stand tourne en continu.**
Bouton « Nouveau diagnostic » sur l'écran de remerciement (remise à zéro complète de l'état) et
retour automatique à la question 1 au bout de 45 secondes d'inactivité. Le diagnostic se fait
aussi sur l'ordinateur du stand : sans ça, il faut recharger la page entre deux visiteurs.

**LOT 5 — V5 + V6.**
- `MAX_PAR_IP` de 80 à **250** dans `server/actions/diagnostic-public.ts` (plusieurs centaines de
  personnes derrière la même IP publique un soir de salon ; le risque robot est nul).
- Ajoute le traitement « diagnostic express du stand » à `docs/rgpd/REGISTRE-TRAITEMENTS.md` :
  finalité, base légale (consentement), données collectées, durée de conservation, destinataires.

## Contraintes qui n'ont pas changé

- Le résultat affiché au prospect reste calculé **côté client par le module pur** : aucun appel
  réseau entre la première question et l'écran de résultat. Le wifi d'une soirée n'est pas fiable.
- L'IA et l'email ne sont **jamais** sur le chemin critique de la soumission.
- Aucun prix, nulle part, ni à l'écran ni dans l'email.
- Une seule journée proposée (8 h max). Le second axe reste une phrase.
- Rien ne se déploie sans que je joue `pnpm lint`, `pnpm --filter @qualiof/web exec tsc --noEmit`
  et `pnpm test` sur ma machine — annonce-le, ne le promets pas à ma place.

## À la fin

Donne-moi, en une page : ce qui est fait, ce que je dois cocher/vérifier moi-même avant le 9,
et la commande exacte de test bout-en-bout sur téléphone réel en 4G.
