# Envois AGEFICE et alertes formation

## Demande et périmètre

Le 18 septembre 2026, l'utilisateur autorise l'implémentation dans QualiOF des envois AGEFICE initial et final et des alertes à formation@start-academy.fr. Workflow GSD quick imposé par CLAUDE.md. Aucune modification ni aucun envoi en production pendant le développement.

## Décisions

- D-01 : rester dans QualiOF, réutiliser Next.js, Prisma, mailer SMTP et cron existants ; pas de scénario Make.
- D-02 : préparer le message et les pièces, présenter le destinataire et permettre un clic d'envoi explicite. Résoudre le point d'accueil AGEFICE depuis le département vérifié sur la CFP et le référentiel importé. Ne jamais choisir silencieusement une adresse en cas d'ambiguïté ou remplacer le point d'accueil par l'entreprise du stagiaire.
- D-03 : demande initiale avec CNI, attestation CFP, RIB, convention signée, demande de prise en charge signée, programme. Les quatre autres pièces ne nécessitent pas de signature. Conserver les certificats de signature associés comme pièces complémentaires.
- D-04 : message initial « Bonjour,\n\nJe vous prie de trouver ci-joint une nouvelle demande de prise en charge pour {Prénom NOM}\nSon numéro de sécurité sociale : {NIR}\n\nMerci\n\nBien à vous,\n\nBéatrice Blanc ». Ne pas réutiliser le nom ni le NIR d'exemple de l'utilisateur comme données de test réelles.
- D-05 : fin de formation, objet « FIN DE FORMATION pour {Prénom NOM} » et texte « Bonjour,\n\nJ'espère que vous allez bien.\n\nVoici la fin de formation pour {Prénom NOM}\nCi-joint toutes les signatures, la facture.\n\nBonne journée,\n\nBéatrice Blanc ». Joindre RIB, émargement signé, assiduité signée, facture acquittée. Signature unique.
- D-06 : expéditeur des envois AGEFICE et destinataire des alertes internes : formation@start-academy.fr. Respecter les garde-fous d'envoi du tenant et le dry-run ; ne jamais marquer envoyé un email supprimé ou simulé.
- D-07 : alerte lors de la création d'une session persistée, lors de la soumission effective d'une inscription via lien, et lorsque RIB, CFP, CNI ou convention signée manquent à J−21. Contrôler immédiatement les inscriptions tardives ; contrôler quotidiennement les sessions futures jusqu'au début, avec déduplication et rappels espacés.
- D-08 : aucun NIR ni justificatif en pièce jointe dans les alertes internes, uniquement identité utile, session, éléments manquants et lien QualiOF. Droits serveur et isolation tenant obligatoires.

## Hypothèses retenues

- J−21 signifie 21 jours calendaires, calculés selon Europe/Paris ; il s'agit d'une règle de gestion demandée, pas d'une affirmation réglementaire.
- Les rappels identiques sont espacés de sept jours. Une nouvelle inscription tardive ou une modification pertinente du dossier peut produire une nouvelle alerte.
- Le NIR est récupéré du stockage sensible existant et exigé pour le modèle initial demandé ; aucune valeur n'est inventée.
- Les connexions SMTP et l'annuaire existent potentiellement, mais leur validité en production reste à vérifier séparément. Le développement ne les active pas.

## Existant vérifié localement

- `apps/web/src/server/actions/opco-submission.ts` compose des brouillons et utilise les PDF signés et certificats, mais son contrôle d'envoi doit couvrir les pièces réellement présentes et les droits.
- `apps/web/src/lib/opco/pieces-dossier.ts` distingue déjà convention et demande AGEFICE à signer des autres pièces.
- `apps/web/src/lib/opco/destinataire-dossier.ts` utilise le point d'accueil rattaché ; la résolution depuis la CFP doit être vérifiée et raccordée.
- `apps/web/src/lib/mailer.ts` retourne `{ ok: true, dryRun: true }` pour les simulations/suppressions : les appelants doivent distinguer ce résultat d'un départ réel.
- Le cron `apps/web/src/app/api/cron/alerts/route.ts` et `apps/web/src/lib/alertes/notifier.ts` existent. Préserver leurs alertes actuelles.

## Hors périmètre

Envoi externe automatique sans clic, activation SMTP en production, import aveugle de nouveaux destinataires, modification des règles financières AGEFICE, refonte générale des signatures.
