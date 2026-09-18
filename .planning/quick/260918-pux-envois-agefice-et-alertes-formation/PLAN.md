---
phase: quick-260918-pux
plan: "01"
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [AGEFICE-INITIAL, AGEFICE-FINAL, FORMATION-ALERTES]
files_modified:
  - apps/web/src/server/actions/opco-submission.ts
  - apps/web/src/lib/opco/pieces-dossier.ts
  - apps/web/src/lib/opco/destinataire-dossier.ts
  - apps/web/src/lib/mailer.ts
  - apps/web/src/components/dossiers-opco/submission-editor.tsx
  - apps/web/src/components/dossiers-opco/compose-opco-button.tsx
  - apps/web/src/lib/alertes/formation.ts
  - apps/web/src/server/actions/sessions.ts
  - apps/web/src/server/actions/preinscription-public.ts
  - apps/web/src/app/api/cron/alerts/route.ts
  - apps/web/src/server/actions/__tests__/opco-submission-signe.test.ts
  - apps/web/src/lib/alertes/__tests__/formation.test.ts
must_haves:
  truths:
    - "Un utilisateur habilité prépare puis envoie un dossier initial complet au point d'accueil AGEFICE approprié."
    - "L'envoi final est distinct de la demande initiale et exige ses quatre pièces."
    - "Une simulation, un refus ou une erreur ne sont jamais affichés comme un email réellement envoyé."
    - "La boîte formation reçoit les événements demandés et les dossiers incomplets à J−21 sans répétition quotidienne identique."
  artifacts:
    - path: apps/web/src/server/actions/opco-submission.ts
      provides: "Composition et envoi contrôlés des dossiers initial et final"
    - path: apps/web/src/lib/alertes/formation.ts
      provides: "Événements formation et contrôle de complétude J−21"
    - path: apps/web/src/app/api/cron/alerts/route.ts
      provides: "Exécution périodique protégée du contrôle"
  key_links:
    - from: apps/web/src/components/dossiers-opco/submission-editor.tsx
      to: apps/web/src/server/actions/opco-submission.ts
      via: "Prévisualisation puis clic d'envoi, erreurs serveur présentées"
    - from: apps/web/src/server/actions/opco-submission.ts
      to: apps/web/src/lib/mailer.ts
      via: "Envoi des pièces autorisées, statut persistant seulement après départ réel"
    - from: apps/web/src/app/api/cron/alerts/route.ts
      to: apps/web/src/lib/alertes/formation.ts
      via: "Contrôle des dossiers futurs à vingt et un jours ou moins"
---

<objective>
Livrer les deux envois AGEFICE et les trois alertes internes dans les parcours QualiOF existants. Ce plan quick regroupe trois lots métier ; chaque lot doit être réalisé et vérifié séparément. Ne pas élargir la tâche aux autres mécanismes OPCO ou aux alertes existantes.
</objective>

<context>
@CLAUDE.md
@.planning/quick/260918-pux-envois-agefice-et-alertes-formation/CONTEXT.md
@apps/web/src/lib/opco/pieces-dossier.ts
@apps/web/src/lib/opco/destinataire-dossier.ts
@apps/web/src/lib/mailer.ts
@apps/web/src/lib/alertes/notifier.ts

<interfaces>
`composeOpcoSubmission(participantId: string): Promise<ComposeResult>` crée le brouillon existant. `SubmissionAttachment` porte `{ key, filename, kind, included, signe? }` ; le contenu éditable du brouillon n'est pas une preuve d'autorisation de la clé de stockage.
`sendMail(input: SendMailInput): Promise<SendMailResult>` retourne `{ ok, messageId?, dryRun?, suppressed?, error? }`. `context` exige tenantId et category, et accepte sessionId, documentIds et relatedEntity. Préserver les catégories et la politique tenant ; étendre le contrat minimalement si nécessaire pour tracer les résultats incertains.
`versionAJoindre({pdfUrl,signedPdfUrl})` privilégie la version signée ; `piecesNonSignees` ne détecte pas les pièces absentes. Ajouter donc une validation explicite de complétude, et relire l'état réel au moment de l'envoi.
</interfaces>
</context>

<tasks>
<task type="auto" tdd="true">
<name>Lot 1 : rendre l'envoi initial AGEFICE complet, sûr et fidèle au modèle</name>
<files>apps/web/src/server/actions/opco-submission.ts, apps/web/src/lib/opco/pieces-dossier.ts, apps/web/src/lib/opco/destinataire-dossier.ts, apps/web/src/lib/mailer.ts, apps/web/src/server/actions/__tests__/opco-submission-signe.test.ts</files>
<behavior>Un manque parmi les six pièces bloque ; seules convention et demande doivent être signées. Un NIR absent, un point d'accueil ambigu, une clé étrangère au tenant, un rôle non autorisé ou un double envoi sont refusés. Dry-run/suppression restent non envoyés. Aucun appel SMTP réel pendant les tests.</behavior>
<action>Per D-01 à D-04 et D-06, étendre les tests existants avant l'implémentation. Réutiliser le référentiel départemental et les données CFP vérifiées ; afficher un manque ou une ambiguïté au lieu de choisir un email arbitraire. Générer le modèle exact, avec échappement HTML, depuis les données sensibles existantes, sans journaliser le NIR. Contrôler les permissions métier existantes et le tenant pour toutes les actions de composition, lecture, édition et envoi. Recalculer les pièces requises depuis les documents autorisés et refuser leur exclusion ou leur substitution par une clé libre. Conserver les certificats associés. Réserver atomiquement un envoi avant SMTP selon le modèle persistant existant ; deux requêtes concurrentes ne doivent pas expédier deux emails. Dry-run et suppression libèrent la réservation sans statut envoyé. Un échec après un éventuel départ reste visible et ne déclenche pas une nouvelle expédition aveugle. Vérifier que l'expéditeur effectif correspond à formation@start-academy.fr ; ne pas modifier silencieusement l'expéditeur de tous les autres usages du mailer.</action>
<verify><automated>pnpm --filter @qualiof/web exec vitest run src/server/actions/__tests__/opco-submission-signe.test.ts src/lib/opco/__tests__/pieces-dossier.test.ts src/lib/opco/__tests__/destinataire-dossier.test.ts</automated></verify>
<done>Brouillon nominatif complet et contrôlé ; signatures et pièces manquantes bloquantes ; envoi unique et statut fidèle au résultat du transport, sans régression OPCO non AGEFICE.</done>
</task>

<task type="auto" tdd="true">
<name>Lot 2 : ajouter le dossier de fin de formation au parcours d'envoi</name>
<files>apps/web/src/server/actions/opco-submission.ts, apps/web/src/lib/opco/pieces-dossier.ts, apps/web/src/components/dossiers-opco/compose-opco-button.tsx, apps/web/src/components/dossiers-opco/submission-editor.tsx, apps/web/src/server/actions/__tests__/opco-submission-signe.test.ts</files>
<behavior>La composition finale ne remplace pas le brouillon initial. RIB, émargement signé, assiduité signée et facture acquittée doivent tous appartenir au dossier. Une facture non acquittée ou une version non signée bloque. Le message reprend le nom courant et une seule signature Béatrice Blanc.</behavior>
<action>Per D-05 et D-06, exposer deux intentions de composition dans le parcours existant et conserver une identité persistante distincte pour chaque type d'envoi. Réutiliser les documents et factures existants ; ne jamais considérer le seul nom de fichier ou le statut envoyé d'une facture comme une preuve d'acquittement. Employer les pièces signées couvrant réellement l'apprenant, y compris les conventions ou émargements groupés selon les règles existantes. Présenter avant envoi le destinataire, l'objet, le corps, les pièces et tous les blocages. Conserver le même moteur de droits, réservation, envoi et historique que le lot 1. Si une évolution du schéma est indispensable, ajouter une migration rétrocompatible et son test, puis documenter les fichiers supplémentaires dans le résumé ; ne pas appliquer cette migration en production.</action>
<verify><automated>pnpm --filter @qualiof/web exec vitest run src/server/actions/__tests__/opco-submission-signe.test.ts src/components/dossiers-opco/__tests__/submission-editor.test.tsx</automated></verify>
<done>Deux parcours initiaux/finals identifiables, prévisualisables et envoyables explicitement ; quatre pièces finales obligatoires, acquittement et signatures vérifiés côté serveur.</done>
</task>

<task type="auto" tdd="true">
<name>Lot 3 : raccorder les alertes session, inscription et dossier incomplet J−21</name>
<files>apps/web/src/lib/alertes/formation.ts, apps/web/src/lib/alertes/__tests__/formation.test.ts, apps/web/src/server/actions/sessions.ts, apps/web/src/server/actions/preinscription-public.ts, apps/web/src/app/api/cron/alerts/route.ts</files>
<behavior>Une création persistée et une soumission effective génèrent chacune une alerte ; enregistrer un brouillon ne suffit pas. J−22 n'alerte pas ; J−21 et inscriptions tardives alertent si incomplets ; un dossier complet n'alerte pas. Un rejeu quotidien n'envoie pas de doublon. Un changement de date recalcule l'éligibilité. Une convention de groupe signée et couvrant l'apprenant compte comme complète.</behavior>
<action>Per D-07 et D-08, créer un module central des alertes formation utilisant le mailer, sa politique tenant et les mécanismes de persistance/déduplication existants. Déclencher après réussite de la transaction de création et de la soumission publique ; une défaillance email ne doit pas annuler l'inscription, et l'événement doit rester récupérable pour reprise. Le contrôle de complétude examine chaque apprenant concerné : RIB, CNI, CFP et convention signée, avec liens directs et libellés métier, sans NIR ni pièce jointe. Exécuter immédiatement pour une inscription tardive et quotidiennement via le cron protégé existant, pour les sessions à venir dans les 21 jours calendaires Europe/Paris ; exclure les sessions annulées. Dédupliquer durablement par tenant, événement, session/apprenant et échéance ; espacer de sept jours les rappels identiques, sans marquer notifié un dry-run/suppression. Assurer une reprise des événements dont l'envoi a échoué et préserver toutes les autres alertes du cron. Vérifier les chemins de création alternatifs avant de déclarer les trois alertes couvertes.</action>
<verify><automated>pnpm --filter @qualiof/web exec vitest run src/lib/alertes/__tests__/formation.test.ts src/lib/alertes/__tests__/cron-alerts-cablage-j15.smoke.test.ts src/app/api/cron/__tests__/vercel-crons.test.ts</automated></verify>
<done>Les trois alertes sont raccordées, persistantes, isolées par tenant, relançables et sans doublons quotidiens ; les cas J−21, tardifs, dates modifiées et erreurs de transport sont testés.</done>
</task>
</tasks>

<verification>
Exécuter les tests ciblés puis la vérification TypeScript de l'application. Tester les deux prévisualisations en environnement local avec transport mocké/dry-run. Documenter les limites préexistantes et les éventuels nouveaux fichiers dans SUMMARY.md. Aucun destinataire réel, aucun secret ni NIR réel dans les fixtures ou captures. Vérifier explicitement concurrence, droits, documents étrangers, reprise après résultat incertain et absence de régression des autres financeurs.
</verification>

<success_criteria>
Les modèles demandés, les dix obligations documentaires réparties entre les deux envois, les trois événements et la règle J−21 sont couverts. Le bouton d'envoi ne peut contourner les contrôles serveur. L'interface distingue préparation, suppression/simulation, départ réel et résultat incertain. Aucune activation ou expédition de production n'a eu lieu pendant la réalisation.
</success_criteria>

<output>
Créer `.planning/quick/260918-pux-envois-agefice-et-alertes-formation/SUMMARY.md` avec modifications, tests exécutés, résultats, limites opérationnelles et éventuelles migrations à appliquer via le processus de déploiement existant.
</output>
