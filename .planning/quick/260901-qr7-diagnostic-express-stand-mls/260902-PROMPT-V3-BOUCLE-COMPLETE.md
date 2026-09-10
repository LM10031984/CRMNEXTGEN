# Prompt V3 — boucler le diagnostic du stand de bout en bout (état du dépôt au 02/09 après-midi)

> Remplace `260901-qr7-PROMPT-V2.md`. Contexte : `260901-qr7-CONVERSION.md` (stratégie, copy,
> chiffres AGEFICE) et `260902-JOURNEES-FAROS.md` (les 4 journées IA × métier, validées par Laurent).
> À coller tel quel dans Claude Code, à la racine du dépôt.

---

Tu boucles le diagnostic express du stand Start Academy (25 ans du MLS, **mercredi 9 septembre,
18 h-23 h**). La chaîne doit tenir de bout en bout, prouvée par un test réel, pas supposée :

**QR code → 8 questions sur le téléphone du prospect → lead dans le CRM (source « Salon — 25 ans
du MLS », engagement de rappel, priorité A/B/C) → email de programme IA × métier assemblé sur ses
réponses → un seul bouton vers la prise de rendez-vous 15 min → relances J+1 / J+4 / J+10.**

État du dépôt, vérifié : LOTS 1-6 livrés (`a050ff8`, `1a6d259`) — route `/api/diagnostic/traiter`
déclenchée par le navigateur du prospect, cron Vercel `*/5` en rattrapage, `CRON_SECRET` posé et
vérifié le 02/09, boutons de rappel, `priorite.ts`, fiche lead. **Ne les refais pas.** Le 02/09,
deux modifications sont dans l'arbre de travail, non commitées, non testées (sandbox sans vitest) :
`lib/mailer-templates/diagnostic-programme.ts` (email v2, signature équipe) et
`lib/diagnostic/worker.ts` (dry-run ≠ SENT, messageId conservé). Commence par les relire, lancer
les tests, et les commiter séparément si vert.

## Doctrine — ARBITRÉE par Laurent, ne pas rouvrir

- **Notre patte, c'est l'IA.** Le programme envoyé couple TOUJOURS l'IA et le métier selon les
  réponses. Les journées viennent du contenu Faros (`260902-JOURNEES-FAROS.md`), jamais d'un
  catalogue générique.
- **Une journée maximum** (8 h). Le parcours e-learning complet se vend *pendant* la journée,
  jamais dans l'email. Le second axe reste une phrase.
- **Aucun prix nulle part.** Seuls les droits AGEFICE (42 €/h, 336 €/journée, 3 000 €/an, dépôt
  15 jours calendaires avant, perte au 31/12) figurent dans l'email.
- **Un seul lien cliquable** : le bouton de réservation. Le téléphone est en signature, en texte.
- **Signature « L'équipe Start Academy »**, prénom + portable du responsable en dessous.
- **Le mot « pige » est interdit** dans tout ce qui part vers un prospect (règle du 11/08/2026).
- Résultat calculé côté client par le module pur — zéro réseau entre la question 1 et le résultat.
  IA et email jamais sur le chemin critique.

## LOT 1 — Les 4 journées IA × métier (le cœur de ce prompt)

1. **Crée les 4 produits** `TrainingProduct` décrits dans `260902-JOURNEES-FAROS.md`, avec les
   titres, tarifs HT et l'option J4 que Laurent y a annotés. Passe par un script de seed
   idempotent (`scripts/seed-journees-faros.ts`, clé = `code`, réexécutable sans doublon), pas
   par des INSERT à la main. `durationHours: 8`, `modality` présentiel, `theme` renseigné,
   `isActive: true`, `objectives` = string[], `programMd` = le déroulé du document, **une idée par
   ligne** (c'est ce que le modèle recopie pour l'ancrage), les références `[M1-A1]` retirées du
   `programMd` mais conservées dans un commentaire du seed.
2. **Vérifie « pige »** : `grep -i pige` sur les 4 `programMd` doit être vide. Ajoute un test qui
   l'affirme pour tout produit dont le code figure dans `catalogue-map.ts`.
3. **Re-route `catalogue-map.ts`** : `JOURNEES` = J1 sur PROSPECTION_MANDATS, J2 sur
   IA_PRODUCTIVITE, J3 sur NOTORIETE_DIGITALE, J4 sur MANAGEMENT_EQUIPE (**plus de repli forcé**
   vers l'IA productivité — supprime le commentaire « trou de catalogue »). Les anciens produits
   restent en second choix. Le niveau IA (Q5) ne départage plus entre produits : passe-le dans le
   prompt de `programme-sur-mesure.ts` pour qu'un débutant reçoive le socle en tête de journée et
   qu'un utilisateur régulier reçoive les commandes et les agents. Mets à jour les tests de
   `catalogue-map`.
4. **Prompt du sur-mesure** : ajoute au `SYSTEM` la règle « chaque séquence relie explicitement un
   geste IA à un résultat métier (mandat, vendeur, heure gagnée, visibilité) » — sans jamais
   sortir du programme source. L'ancrage ≥ 0,7 et ≥ 3 séquences restent.

## LOT 2 — L'email et le bouton

1. Le template v2 est en place. Vérifie-le sur **Gmail mobile, Apple Mail et Outlook** via un
   envoi réel à Laurent et Jean-Guy (pas seulement le HTML dans un navigateur).
2. **`DIAGNOSTIC_CTA_URL`** : Laurent fournit le lien de sa page de réservation (Google Agenda
   « Réservations » ou Calendly). Pose-le en production Vercel, redéploie, et prouve dans l'email
   reçu que le bouton pointe dessus (et non sur `tel:`). Si le lien n'est pas encore fourni,
   mets-le en tête du rapport comme bloquant — ne remplace pas par un lien inventé.
3. Nom d'expéditeur : Laurent tranche entre « Start Academy » et « QualiOF » (`MAIL_FROM`). Si
   « Start Academy », vérifie que l'adresse est le compte SMTP authentifié ou un alias « Envoyer
   en tant que », sinon Gmail réécrit le From. Ne touche pas aux factures ni aux convocations.

## LOT 3 — La preuve de bout en bout (rien ne compte tant que ce n'est pas vert)

Rejoue la chaîne complète **depuis un téléphone en 4G** avec le QR imprimé, sur un lead de test
que tu supprimes à la fin :

1. QR → formulaire → résultat affiché sans réseau → contact + bouton « cette semaine ».
2. Le lead apparaît dans `/app/leads` avec la source stand, le rappel, le téléphone, la priorité,
   et la fiche `leads/[id]` montre le programme envoyé (`personnalisation`).
3. La soumission passe en **SENT avec un `messageId`** dans `personnalisation.envoi`, par le
   chemin navigateur (pas le cron). Un SENT sans messageId est un échec.
4. L'email arrive en boîte de réception (pas spam) sur Gmail ET sur une boîte non-Google, en
   moins de 2 minutes, avec la bonne journée Faros pour les réponses données, le bouton vers la
   réservation, la signature équipe.
5. Le clic sur le bouton ouvre la page de réservation sur mobile ET sur ordinateur.
6. Coupe la route navigateur (simule) : le cron rattrape la soumission dans les 5 minutes.
7. `MAIL_DRY_RUN` absent ou `false` et `SMTP_HOST` renseigné en prod (`vercel env ls production`).
8. `MAX_PAR_IP` ≥ 250 / 15 min (des centaines de personnes derrière une IP le soir du 9).

## LOT 4 — Après le stand : les relances

À partir de la fiche lead et de `priorite.ts`, sans nouvel automatisme sur le chemin critique :
- **J+1** : vue « à rappeler aujourd'hui » dans `/app/leads` (leads A + « cette semaine »), avec
  le script d'appel de `260901-qr7-CONVERSION.md` affiché sur la fiche.
- **J+4** : email « 2 options de dates » — brouillon généré depuis la fiche, envoi déclenché à la
  main par Laurent (bouton), catégorie `diagnostic_program`.
- **J+10** : email « date limite + porte de sortie », même mécanique.
Chaque envoi est tracé sur le lead (`lastAction`, notes). Pas d'envoi automatique sans clic.

## Contraintes inchangées

- Laurent joue lui-même `pnpm lint`, `pnpm --filter @qualiof/web exec tsc --noEmit` et `pnpm test`
  avant tout merge — annonce-le, ne le promets pas à sa place.
- Branche et commits séparés par LOT. Le seed des produits est réexécutable ; le lead de test est
  supprimé à la fin.
- Purge les doublons de synchro (`* 2.*`, `* 3.*`) avant de lancer tsc : la liste vérifiée est
  dans `260901-qr7-DOUBLONS-A-SUPPRIMER.txt`.

## Rapport final attendu (une page)

1. LOT 3, point par point : vert ou pas, avec capture de l'email reçu sur mobile et la ligne du
   lead de test (SENT + horodatage + messageId), puis la preuve de suppression du lead.
2. Ce que Laurent doit faire à la main : lien de réservation, mot de passe d'application Gmail,
   case Paramètres → Emails → « Programme du diagnostic express » cochée + interrupteur général,
   test 4G du QR imprimé, décision du nom d'expéditeur.
3. LOT 1, 2, 4 : fait / restant, avec les commits.
