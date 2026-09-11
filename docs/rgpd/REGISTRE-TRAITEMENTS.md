# Registre des traitements — Start Academy (art. 30 RGPD)

| Champ | Valeur |
|---|---|
| **Version** | 1.7 |
| **Date de rédaction** | 2026-07-06 (v1.0) — amendé et validé le 2026-07-07 (v1.1) — amendé le 2026-08-28 (v1.2, Traitement 2 : inscriptions publiques par session) — amendé le 2026-09-01 (v1.3, Traitement 9 : diagnostic express du stand) — amendé le 2026-09-02 (v1.4, sous-traitant SMTP : OVH → Google Workspace ; v1.5, Traitement 5 : les traces d'envoi `EmailMessage` deviennent effectives + purge automatique) — amendé le 2026-09-10 (v1.6, Traitement 10 : signature électronique des pièces contractuelles) — amendé le 2026-09-11 (v1.7, Traitement 11 : compte rendu de rendez-vous de diagnostic et pré-remplissage IA) |
| **Responsable de traitement** | Start Academy — Organisme de formation certifié Qualiopi (siège : Vence) |
| **Contact** | laurent@start-academy.fr |
| **Rédaction** | Générée par assistance IA (Claude), sous contrôle du responsable de traitement |
| **Statut** | ✅ **Validé le 2026-07-07 par Laurent MARX, responsable de traitement (amendement : durée de conservation CNI/RIB étendue)** — gate D-13 levé.<br>⏳ **v1.2 (2026-08-28) : le Traitement 2 a été étendu au lien public par session et à la collecte du n° de sécurité sociale — à contresigner par le responsable de traitement.**<br>⏳ **v1.3 (2026-09-01) : ajout du Traitement 9 (diagnostic express du stand, base légale consentement, conservation 24 mois) — à contresigner par le responsable de traitement.**<br>⏳ **v1.4 (2026-09-02) : le sous-traitant du transport d'emails est **Google Workspace**, pas OVH — à contresigner par le responsable de traitement.**<br>⏳ **v1.5 (2026-09-02) : Traitement 5 — la table `EmailMessage` existait au schéma mais n'avait aucun écrivain ; elle devient un stockage réel (destinataire, objet, corps, documents joints) au service d'une seconde finalité (preuve d'envoi). Durée inchangée (dossier de formation), désormais APPLIQUÉE par une purge quotidienne — **la valeur de 5 ans retenue pour l'automatiser est à contresigner**.**<br>⏳ **v1.6 (2026-09-10) : ajout du Traitement 10 (signature électronique via DocuSeal, instance UE, conservation 5 ans) — à contresigner. ⚠ Gate : le DPA DocuSeal doit être accepté avant tout envoi sur un dossier réel (lot C).**<br>⏳ **v1.7 (2026-09-11) : ajout du Traitement 11 (compte rendu de rendez-vous de diagnostic, pré-remplissage IA). Le verbatim d'une conversation professionnelle est un stockage de données personnelles que le registre ne connaissait pas — il existait dans le code avant d'exister ici. **Durée de 90 jours et base d'intérêt légitime pour les collaborateurs cités à contresigner.** ⚠ Voir Limites connues, point 5 : ces collaborateurs ne sont pas informés (art. 14).** |

> Ce registre couvre les traitements de données à caractère personnel opérés via l'application interne **QualiOF** (CRM/back-office de Start Academy, non commercialisé à des tiers) déployée sur infrastructure cloud (voir § Localisation des données). Il est versionné dans le dépôt de code (`docs/rgpd/`) et exportable en PDF pour présentation à un auditeur Qualiopi ou à la CNIL.

---

## Traitement 1 — Gestion des apprenants et des sessions (CRM 360°)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Gestion du cycle de vie des formations : dossiers apprenants, sessions, émargements, suivi pédagogique et conformité Qualiopi. |
| **Base légale** | Exécution du contrat de formation (art. 6.1.b RGPD) ; obligations légales de l'OF (art. 6.1.c) pour les pièces exigées par le Code du travail / Qualiopi. |
| **Catégories de données** | Identité (nom, prénom, nom de naissance, date de naissance, civilité), coordonnées (email, téléphone, adresse personnelle), parcours (niveau d'études, diplômes, expérience et statut professionnels), casquettes juridiques EI/Enseigne (liens `Person`↔`Organization` via `LegalLink`). |
| **Catégories de personnes** | Apprenants, formateurs, contacts d'organisations, prospects. |
| **Destinataires / sous-traitants** | Hébergement base : [dpa/supabase.md](dpa/supabase.md) · Hébergement applicatif : [dpa/vercel.md](dpa/vercel.md). |
| **Durée de conservation** | Durée de la relation contractuelle + durée du cycle de certification Qualiopi (preuves d'audit), puis archivage limité aux obligations légales. Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | Multi-tenant `tenantId` sur toutes les tables métier, RBAC 6 rôles (ADMIN/MANAGER/FORMATEUR/COMMERCIAL/COMPTABLE/LECTEUR), sessions Lucia, données sensibles isolées dans la table `SensitiveData` (1:1 Person). |

## Traitement 2 — Pré-inscriptions self-service + OCR IA

> **Amendement du 2026-08-28 (v1.2)** — le formulaire public existe désormais en
> deux points d'entrée : un lien individuel (`/preinscription/{jeton}`) et un lien
> **par session** (`/inscription/{jeton}`), révocable. Même finalité, mêmes
> destinataires ; ce qui change est signalé ci-dessous.

| Rubrique | Contenu |
|---|---|
| **Finalité** | Collecte des informations et pièces d'inscription directement auprès du candidat (formulaire public tokenisé, par candidat ou par session de formation), extraction automatique par OCR IA (CNI recto/verso, RIB, attestation CFP) pour éviter la ressaisie. |
| **Base légale** | Mesures précontractuelles à la demande de la personne (art. 6.1.b) ; consentement horodaté sur le formulaire (`rgpdAcceptedAt`). |
| **Catégories de données** | Identité et coordonnées saisies (dont nom de naissance et adresse postale), entreprise et SIRET déclarés, **numéro de sécurité sociale** (v1.2 — exigé par les dossiers de financement AGEFICE) + **documents sensibles par nature documentaire** : pièce d'identité (recto et verso), RIB, attestation CFP — uploadés en direct-to-storage vers un bucket **privé**, accessibles uniquement via **signed URLs à TTL de quelques minutes**. Données extraites structurées (`extractedData`).<br>**Minimisation du n° de sécurité sociale (v1.2)** : il transite dans l'appel de soumission mais n'est **jamais écrit dans la table alimentée par le formulaire public** ; il n'est enregistré qu'à la validation de l'inscription, dans la table `SensitiveData` séparée. Une demande rejetée ne le conserve pas. |
| **Catégories de personnes** | Candidats à l'inscription (futurs apprenants). |
| **Destinataires / sous-traitants** | Storage des pièces : [dpa/supabase.md](dpa/supabase.md) · OCR vision : [dpa/openrouter.md](dpa/openrouter.md) (modèles Anthropic via OpenRouter : [dpa/anthropic.md](dpa/anthropic.md)) · Runtime formulaire public : [dpa/vercel.md](dpa/vercel.md). |
| **Durée de conservation** | **Brouillons abandonnés (v1.2)** : les pièces sont téléversées avant que la demande n'existe en base ; celles qu'aucune demande ne rattache sont purgées au-delà de **30 jours** (`pnpm storage:purge-drafts`).<br>**Scans CNI/RIB : conservation alignée sur la durée du dossier de financement/formation** (identique au Traitement 1) — ils ne sont PAS supprimés après justification du financement. **Décision du responsable de traitement en date du 2026-07-07** (amendement à la proposition initiale de suppression anticipée). **Justification : les pièces doivent rester disponibles pour les contrôles a posteriori des financeurs (AGEFICE, OPCO, DREETS) et pour le cycle de certification Qualiopi.** Lien public à expiration (`expiresAt`). |
| **Mesures techniques** | Bucket Storage privé + signed URL TTL minutes, upload direct-to-storage (les pièces ne transitent pas par le serveur applicatif), token unique à expiration, table `SensitiveData` séparée pour la pièce d'identité après conversion, rate-limiting WAF sur `/preinscription` **et `/inscription`** (30 req/60 s/IP, règles `rate-limit-preinscription` et `rate-limit-inscription`).<br>**Ajouts v1.2** : jeton de session aléatoire (32 caractères hexadécimaux) sans lien avec le code de session et **révocable** — la régénération invalide tout lien déjà diffusé ; **aucune écriture en base avant la soumission** du formulaire, donc un lien diffusé largement ne crée pas de dossiers vides contenant des données personnelles partielles ; limitation applicative de 5 soumissions/heure/IP ; refus automatique des dépôts quand la session est complète ou close. |

## Traitement 3 — Génération des documents Qualiopi (pack closure IA)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Génération assistée par IA des documents de fin de formation (attestations, certificats, QCM, grilles, déroulés…) exigés par le référentiel Qualiopi. |
| **Base légale** | Exécution du contrat de formation et obligations de l'OF certifié (art. 6.1.b et 6.1.c). |
| **Catégories de données** | Prompts transmis au fournisseur IA contenant : noms des stagiaires, contexte de session (produit, dates, formateur), éléments pédagogiques. Pas de CNI/RIB dans ce flux (l'OCR des pièces relève du Traitement 2). |
| **Catégories de personnes** | Apprenants, formateurs. |
| **Destinataires / sous-traitants** | IA : [dpa/openrouter.md](dpa/openrouter.md) et, en sous-sous-traitance, [dpa/anthropic.md](dpa/anthropic.md) · Rendu/stockage des PDF : [dpa/railway.md](dpa/railway.md) (worker + moteurs PDF) et [dpa/supabase.md](dpa/supabase.md) (Storage). |
| **Durée de conservation** | Documents générés conservés avec le dossier de formation (durée du Traitement 1). Côté fournisseur IA : politique par défaut de non-rétention des prompts chez OpenRouter (voir fiche). Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | Worker isolé (Railway, région EU), authentification Bearer (`DOC_ENGINE_TOKEN`) sur les moteurs PDF exposés, audit des logs PII réalisé (plan 22-02) : les logs applicatifs référencent des IDs, pas de PII brut. |

## Traitement 4 — Facturation et relances (trésorerie OPCO/AGEFICE)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Émission des factures et avoirs, suivi des encaissements (CA prévu/signé/encaissé, DSO), relances de paiement, suivi des budgets AGEFICE par apprenant et par année. |
| **Base légale** | Exécution du contrat (art. 6.1.b) ; obligations comptables et fiscales (art. 6.1.c). |
| **Catégories de données** | Identité et coordonnées des payeurs (règle métier : l'auto-entrepreneur est son propre payeur — une relance facture peut donc toucher directement un apprenant), montants, dates d'échéance, emails de relance. |
| **Catégories de personnes** | Payeurs : organisations (enseignes, financeurs OPCO/AGEFICE) et personnes physiques (apprenants auto-entrepreneurs). |
| **Destinataires / sous-traitants** | Base et PDF factures : [dpa/supabase.md](dpa/supabase.md) · Envoi des relances : [dpa/google.md](dpa/google.md) (SMTP Google Workspace) · Cron de relance : [dpa/railway.md](dpa/railway.md). ⚠ Au 2026-09-02 **aucune relance n'a jamais été transmise** : l'egress SMTP est bloqué chez Railway, d'où part le cron. |
| **Durée de conservation** | Pièces comptables 10 ans (obligation légale du Code de commerce). Données de relance : durée du dossier. Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | `MAIL_DRY_RUN` actif tant que la bascule production n'est pas validée (aucun email réel), montants stockés en centimes, RBAC (rôle COMPTABLE), scoping `tenantId`. |

## Traitement 5 — Emails transactionnels (convocations, notifications)

| Rubrique | Contenu |
|---|---|
| **Finalité** | 1. Envoi des convocations, notifications de documents et suivis liés aux formations.<br>2. **(v1.5)** **Preuve d'envoi** : savoir qu'un document a quitté l'organisme, à qui et quand. Sans cette trace, l'application régénérait en silence une convention déjà partie chez un financeur — le destinataire gardant une version que l'outil croyait obsolète (correctif du 02/09/2026, lot 0 · 0.2). |
| **Base légale** | Exécution du contrat de formation (art. 6.1.b). |
| **Catégories de données** | Adresses email des apprenants et payeurs, contenus des emails (noms, sessions, pièces jointes documentaires).<br>**(v1.5) Ce qui est effectivement écrit en base** dans `EmailMessage`, et seulement quand l'envoi emportait des documents : expéditeur, **destinataire**, **objet**, **corps du message**, **ids des documents joints** (`documentIds`), horodatage d'envoi, rattachement libre (ex. `opcoSubmission:<id>`). **Rien n'est écrit** pour un envoi sans pièce jointe, ni en mode `MAIL_DRY_RUN`, ni quand les réglages `TenantEmailSettings` suppriment l'envoi, ni sur échec SMTP : on ne trace que ce qui est réellement parti. |
| **Catégories de personnes** | Apprenants, payeurs, formateurs. |
| **Destinataires / sous-traitants** | Transport SMTP : [dpa/google.md](dpa/google.md) — **Google Workspace** (`smtp.gmail.com:587`, compte d'envoi `formation@start-academy.fr`). La fiche [dpa/ovh-smtp.md](dpa/ovh-smtp.md) décrivait le fournisseur envisagé jusqu'au 2026-09-02 ; **aucun email n'a jamais transité par OVH** (le circuit était en `MAIL_DRY_RUN` jusqu'à l'activation, puis a été ouvert directement sur Workspace). |
| **Durée de conservation** | Traces d'envoi (`EmailMessage`) conservées avec le dossier de formation. Validée par le responsable de traitement le 2026-07-07.<br>**(v1.5) Application effective** : purge automatique quotidienne (worker 8h Europe/Paris), échéance ancrée sur la **fin de la formation la plus tardive** parmi les documents joints — pas sur la date d'envoi, sinon une convocation expédiée six mois avant la session serait purgée six mois avant le dossier qu'elle documente. Trace orpheline (documents supprimés) : repli sur la date d'envoi. **Durée retenue pour automatiser : 5 ans** (`DUREE_CONSERVATION_DOSSIER_FORMATION_ANNEES`, `lib/rgpd/retention.ts` — une seule valeur à changer). Justification : le cycle de certification Qualiopi est de 3 ans, mais les contrôles a posteriori des financeurs (AGEFICE, OPCO, DREETS) portent au-delà — même raisonnement que l'extension décidée le 2026-07-07 pour les scans CNI/RIB. ⏳ **À contresigner.** |
| **Mesures techniques** | **Aucun envoi de masse vers les apprenants sans action explicite** (exigence du responsable de traitement : `notifyLearners` défaut `false`, boutons manuels, opt-in par case à cocher) ; crons de relance préinscriptions/OPCO volontairement débranchés ; `MAIL_DRY_RUN` en staging ; connexion SMTP chiffrée (STARTTLS :587) ; **garde-fou applicatif par catégorie** (`TenantEmailSettings`, fail-closed : sans case cochée, rien ne part).<br>**(v1.5)** Écriture de la trace **après** le départ SMTP réel et **hors du chemin d'erreur** : un échec d'enregistrement n'annule pas l'envoi et ne fait pas croire à un échec. Minimisation : aucune ligne pour les envois sans document joint. Purge quotidienne journalisée (nombre de traces supprimées, sans PII).<br>⚠ **Effet de bord assumé** : la trace d'envoi est aussi ce qui prouve qu'un document est « engagé » et ne doit pas être régénéré. La purger fait retomber le document en « libre ». Acceptable **uniquement** parce qu'à l'échéance le dossier de formation lui-même est hors durée de conservation ; si cette durée devait être raccourcie sous celle des documents, ce raisonnement tomberait. |

## Traitement 6 — Synchronisation Google Calendar (rappels formations)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Création automatique d'événements de rappel de sessions dans un agenda dédié (« Rappel Formations »), avec liens vers les documents/programmes (Google Drive). |
| **Base légale** | Intérêt légitime de l'OF (organisation interne des formations, art. 6.1.f). Qualification validée par le responsable de traitement le 2026-07-07 (validation globale du registre). |
| **Catégories de données** | Noms des sessions et des formateurs dans les événements ; emails des apprenants en tant qu'invités (attendees) ; programmes de formation sur Drive. |
| **Catégories de personnes** | Apprenants, formateurs. |
| **Destinataires / sous-traitants** | [dpa/google.md](dpa/google.md) — compte **Google Workspace** (confirmé par le responsable de traitement le 2026-07-07) : DPA processeur inclus (Cloud Data Processing Addendum). |
| **Durée de conservation** | Événements conservés dans l'agenda tant que la session figure au dossier de formation. Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | `sendUpdates='none'` par défaut (les invités ne reçoivent pas de notification Google), OAuth à scope minimal (calendar uniquement), garde staging (synchronisation désactivée hors production). |

## Traitement 7 — Comptes utilisateurs internes (RBAC)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Authentification et gestion des droits des utilisateurs internes de Start Academy sur QualiOF. |
| **Base légale** | Intérêt légitime (sécurité et administration du SI interne, art. 6.1.f) ; exécution du contrat de travail pour les salariés. |
| **Catégories de données** | Email professionnel, nom, mot de passe (haché argon2 — jamais stocké en clair), rôle, sessions d'authentification, journal d'audit (`AuditLog`). |
| **Catégories de personnes** | Utilisateurs internes (dirigeant, équipe administrative, formateurs, commerciaux, comptable). |
| **Destinataires / sous-traitants** | [dpa/supabase.md](dpa/supabase.md), [dpa/vercel.md](dpa/vercel.md). |
| **Durée de conservation** | Durée du compte + journal d'audit conservé pour traçabilité. Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | Hachage argon2, sessions Lucia (cookies httpOnly, `secure` en production, `sameSite=lax`), RBAC 6 rôles, invalidation de session en base au logout. |

## Traitement 8 — Veille réglementaire (RSS + IA)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Veille automatisée sur les sources réglementaires de la formation professionnelle (flux RSS résumés par IA). |
| **Base légale** | Intérêt légitime (obligation de veille Qualiopi, indicateur 23-25). |
| **Catégories de données** | **Aucune PII apprenant** — contenus publics des flux RSS uniquement. |
| **Catégories de personnes** | N/A (pas de personne concernée au sens PII apprenant ; auteurs d'articles publics le cas échéant). |
| **Destinataires / sous-traitants** | IA de résumé : [dpa/openrouter.md](dpa/openrouter.md) · Exécution : [dpa/railway.md](dpa/railway.md). |
| **Durée de conservation** | Articles et résumés conservés à des fins de preuve Qualiopi (indicateur veille). |
| **Mesures techniques** | Flux isolé, aucun croisement avec les données apprenants. |

## Traitement 9 — Diagnostic express du stand (salon, QR code)

> **Ajouté le 2026-09-01 (v1.3)** — dispositif de prospection déployé pour les
> 25 ans du MLS (9 septembre 2026). Formulaire public sans compte, atteint par un
> QR code imprimé sur le stand.

| Rubrique | Contenu |
|---|---|
| **Finalité** | Proposer à un visiteur de salon, en 90 secondes, la journée de formation du catalogue qui correspond à sa priorité déclarée ; lui envoyer par email le programme de cette journée ; permettre un rappel commercial qu'il a lui-même sollicité. |
| **Base légale** | **Consentement** (art. 6.1.a) — case à cocher obligatoire et horodatée sur le formulaire, portant explicitement sur l'envoi du programme **et** sur le rappel. Sans la case, aucune donnée n'est enregistrée. |
| **Minimisation vers l'IA** | Le prompt d'assemblage du programme ne contient **que les réponses aux questions fermées** et le programme du catalogue : ni prénom, ni nom, ni email, ni téléphone ne sont transmis à OpenRouter/Anthropic. |
| **Catégories de données** | Réponses à 8 questions fermées de qualification professionnelle (rôle, taille d'équipe, origine des affaires, évolution des mandats, usage de l'IA, priorité déclarée, formation suivie dans l'année) ; créneau de rappel souhaité ; identité et coordonnées saisies (prénom, nom, email, téléphone — le téléphone devient obligatoire si la personne demande un rappel dans la semaine). **Aucune pièce, aucun document, aucune donnée sensible au sens de l'art. 9.** |
| **Catégories de personnes** | Visiteurs professionnels du salon (agents et conseillers immobiliers, dirigeants d'agence) — prospects. |
| **Destinataires / sous-traitants** | Base : [dpa/supabase.md](dpa/supabase.md) · Runtime du formulaire public : [dpa/vercel.md](dpa/vercel.md) · Assemblage du programme personnalisé par IA : [dpa/openrouter.md](dpa/openrouter.md) (modèles Anthropic en sous-sous-traitance : [dpa/anthropic.md](dpa/anthropic.md)) · Envoi de l'email : [dpa/google.md](dpa/google.md) (SMTP Google Workspace) · Rattrapage des envois : cron Vercel, même runtime que le formulaire ([dpa/vercel.md](dpa/vercel.md)) — **Railway ne participe plus à ce traitement**. **Aucune diffusion à un tiers, aucune revente, aucun partage avec les autres exposants du salon.** |
| **Durée de conservation** | **24 mois** à compter de la collecte pour les prospects sans suite (durée usuelle recommandée par la CNIL en prospection commerciale), puis effacement. Un prospect qui devient apprenant bascule dans le Traitement 1 et suit sa durée. Effacement immédiat sur demande (`laurent@start-academy.fr`). La soumission (`DiagnosticSubmission`) est supprimée **en cascade** avec le lead — pas de PII orpheline. |
| **Mesures techniques** | Consentement horodaté et tracé en clair dans la fiche du prospect ; le formulaire ne LIT aucune donnée, il n'en crée que ; aucune écriture en base avant validation du formulaire complet ; plafond de 250 soumissions / 15 min / IP (garde-fou anti-remplissage automatisé, calibré pour un événement où plusieurs centaines de personnes partagent la même IP publique) ; validation serveur de toutes les réponses contre la liste fermée des questions (le navigateur ne dicte pas le contenu enregistré) ; envoi de l'email conditionné à une case dédiée dans Paramètres → Emails (fail-closed : décochée, rien ne part) ; email transactionnel unitaire déclenché par la personne elle-même — **aucun envoi de masse**. |
| **Ce qui n'est PAS fait** | Pas de création de compte, pas de mot de passe, pas d'upload de pièce, pas de cookie de mesure d'audience sur la page publique, pas de croisement avec un fichier acheté, pas de profilage automatisé produisant un effet juridique (le routage vers une problématique est un simple barème de points, explicable et communicable à la personne). |


## Traitement 10 — Signature électronique des pièces contractuelles

> **Ajouté le 2026-09-10 (v1.6)** — spec « Signature électronique & retour des
> documents signés » du 2026-09-04. Remplace Adobe Sign et met fin à
> l'éparpillement des PDF signés sur Google Drive : la source de vérité
> documentaire redevient QualiOF.

| Rubrique | Contenu |
|---|---|
| **Finalité** | Faire signer électroniquement les pièces contractuelles d'une formation — convention de formation, demande de prise en charge AGEFICE, attestation d'assiduité — et **rapatrier le document signé et sa preuve de signature** dans le dossier de formation, pour les contrôles des financeurs et l'audit Qualiopi. |
| **Base légale** | Exécution du contrat de formation (art. 6.1.b) ; obligations légales de l'OF et exigences des financeurs (art. 6.1.c) pour la conservation d'une preuve de signature opposable. |
| **Catégories de données** | **Contenu du document signé** : identité et coordonnées de l'entreprise bénéficiaire et de son représentant, identité complète du stagiaire (nom, prénom, date et lieu de naissance, adresse), **n° de sécurité sociale** et **IBAN/BIC** pour le dossier AGEFICE, SIRET, montants et heures.<br>**Données propres à la signature**, constituant le certificat : nom, adresse email et rôle du signataire, **adresse IP**, user-agent, horodatages d'envoi/ouverture/signature, **image de la signature manuscrite tracée**. |
| **Catégories de personnes** | Dirigeants des entreprises bénéficiaires, stagiaires (dont travailleurs indépendants AGEFICE), signataire de l'organisme de formation. |
| **Destinataires / sous-traitants** | Signature électronique : [dpa/docuseal.md](dpa/docuseal.md) (**instance UE**) · Envoi des liens de signature : [dpa/google.md](dpa/google.md) (SMTP Google Workspace) — **c'est QualiOF qui écrit aux signataires, pas le prestataire de signature** · Stockage du signé et du certificat : [dpa/supabase.md](dpa/supabase.md) · Rendu du PDF à signer : [dpa/railway.md](dpa/railway.md). |
| **Durée de conservation** | **5 ans**, alignée sur la durée du dossier de formation et de financement (contrôles a posteriori AGEFICE / OPCO / DREETS, cycle de certification Qualiopi) — cohérent avec l'amendement du 2026-07-07 sur les pièces justificatives. Le document signé et son certificat sont **rapatriés dans le bucket privé QualiOF** dès la complétion : le prestataire n'est pas la source de vérité, sa copie résiduelle est purgée à l'échéance. |
| **Mesures techniques** | **Aucun email envoyé par le prestataire de signature** (`send_email: false` sur l'envoi et sur chaque signataire) : les liens partent du mailer QualiOF, fail-closed, avec catégorie décochable par tenant — le prestataire ne constitue aucune liste de diffusion à partir de nos signataires.<br>**Webhooks authentifiés** HMAC-SHA256 sur `timestamp.corps`, fenêtre de rejeu de 5 minutes, comparaison à temps constant ; **sans secret configuré, tout webhook est rejeté**.<br>**Fail-closed en production** : sans clé API ni région configurées, la fonction est désactivée avec un message à l'admin — jamais d'envoi silencieux ni de repli en mode simulé.<br>**Aucun modèle de document stocké chez le prestataire** : chaque envoi part du PDF généré par QualiOF, les champs de signature étant posés par des ancres textuelles invisibles — pas de copie de gabarit porteuse de PII côté prestataire.<br>**Signataires résolus, jamais devinés** : sans email identifié, l'envoi est bloqué avec un message nominatif plutôt qu'adressé à une adresse approximative.<br>Signé et certificat servis par signed URL à TTL court depuis un bucket privé. |
| **Ce qui n'est PAS fait** | Pas de signature qualifiée ni avancée avec vérification d'identité par pièce (niveau simple/SES assumé) ; pas de copie d'archive sur un Drive tiers (décision O-1 : Drive n'est plus une destination de travail) ; pas de conservation du document chez le prestataire comme source de vérité. |

---

## Traitement 11 — Compte rendu de rendez-vous de diagnostic (pré-remplissage IA)

> **Ajouté le 2026-09-11 (v1.7)** — spec « Chaîne Diagnostic → Proposition »
> du 2026-09-01, §6.4 (lot C). Le commercial mène son rendez-vous de diagnostic
> en conversation libre plutôt qu'en lisant 94 questions à l'écran, puis dépose
> le compte rendu verbatim dans QualiOF pour qu'il pré-remplisse le
> questionnaire. **C'est le stockage le plus sensible de la chaîne** : le
> verbatim d'une conversation professionnelle, qui contient des appréciations
> nominatives sur des collaborateurs absents du rendez-vous.

| Rubrique | Contenu |
|---|---|
| **Finalité** | Éviter la ressaisie d'un questionnaire de 94 questions après un rendez-vous mené en conversation libre : un appel à un modèle de langage rapproche le compte rendu du questionnaire et propose des réponses, **chacune accompagnée de l'extrait qui la justifie**. Une réponse proposée n'est acquise qu'après confirmation humaine explicite. |
| **Base légale** | **Mesures précontractuelles** (art. 6.1.b) pour le dirigeant rencontré, qui sollicite une proposition de formation.<br>**Intérêt légitime** (art. 6.1.f) pour les collaborateurs cités par lui au cours de la conversation : dimensionner une offre de formation collective suppose de connaître la situation de l'équipe. Mise en balance : durée de conservation courte (90 jours), aucune diffusion à un tiers, aucune décision automatisée produisant un effet juridique, aucune donnée de l'art. 9, et le texte source ne quitte jamais le back-office interne. |
| **Minimisation vers l'IA** | Le prompt contient **le compte rendu et le catalogue de questions, rien d'autre**. Il ne contient **aucune fiche équipe** (`DiagnosticParticipant` : nom affiché, chiffre d'affaires N-1, objectif), **aucune coordonnée** du lead, aucun identifiant de dossier. Les réponses déjà saisies par le commercial ne sont pas soumises non plus.<br>⚠ **Limite assumée, tranchée le 2026-09-11** : les prénoms et noms prononcés **à l'intérieur du verbatim** sont transmis tels quels — le texte source est la matière même du traitement. Une pseudonymisation a été étudiée puis **écartée** : au moment de l'extraction, le CRM ne connaît que le dirigeant (les fiches équipe se saisissent à la main, après), si bien que « masquer les noms connus » n'aurait masqué personne d'autre que lui. Inscrire au registre une mesure qui ne protège pas serait pire que l'absence assumée. Voir Limites connues, point 5. |
| **Catégories de données** | **Compte rendu verbatim** (`Diagnostic.transcriptText`) : propos tenus en rendez-vous, appréciations sur des collaborateurs nommés, chiffres d'activité et de production individuels, projets de l'entreprise.<br>**Réponses extraites** : valeur, indice de confiance, et **citation du compte rendu** qui la justifie (`DiagnosticAnswer.aiQuote`).<br>**Traçabilité de la génération** : modèle utilisé, date, version du prompt, empreinte de l'entrée, durée (`AIGenerationJob`). |
| **Catégories de personnes** | Dirigeants d'agence immobilière rencontrés en rendez-vous (prospects ou clients) ; **leurs collaborateurs, salariés et agents commerciaux indépendants, cités par le dirigeant** — tiers au rendez-vous, dont les données sont donc collectées indirectement (art. 14). |
| **Destinataires / sous-traitants** | Base : [dpa/supabase.md](dpa/supabase.md) · Runtime de l'extraction : [dpa/vercel.md](dpa/vercel.md) · Rapprochement compte rendu / questionnaire : [dpa/openrouter.md](dpa/openrouter.md) — **OpenRouter, Inc., États-Unis**, modèle `anthropic/claude-sonnet-4.6`, avec **Anthropic, PBC (États-Unis) en sous-sous-traitance** ([dpa/anthropic.md](dpa/anthropic.md)) · Purge quotidienne : worker [dpa/railway.md](dpa/railway.md). **Aucune diffusion à un tiers, aucun envoi par email, aucune exposition publique.** |
| **⏳ Question ouverte — transfert hors UE (11/09/2026)** | **Le compte rendu intégral d'un rendez-vous professionnel sort de l'UE à chaque extraction.** Les flux IA existants (documents closure, OCR des pièces) partent déjà chez le même sous-traitant, et ce transfert a été **accepté le 2026-07-07** (gate D-13) — mais ce qu'ils transportent est d'une autre nature : des noms de stagiaires et un contexte de session, pas une conversation entière portant des appréciations sur des tiers qui l'ignorent.<br>**Trois faits à peser, et aucun n'est nouveau :** ① OpenRouter est en offre **self-serve, donc sans DPA mutuellement signé** (réservé au tier enterprise, vérifié auprès du support en 2026-07) ; ② Anthropic est atteint **sans lien contractuel direct**, la chaîne passe par OpenRouter ; ③ les réglages **ZDR et logging OFF** qui portent l'essentiel des garanties effectives étaient marqués « à vérifier et capturer avant la bascule prod » — **cette capture n'est à ce jour consignée nulle part**.<br>**Le précédent est de cette semaine** : pour la signature électronique (Traitement 10, v1.6), l'arbitrage a été de prendre l'**instance UE** du prestataire. La même question se pose ici, et elle appelle une réponse explicite plutôt qu'une extension tacite de l'acceptation de juillet.<br>**Options identifiées** : (a) statu quo assumé, avec capture effective des réglages ZDR/logging comme gate ; (b) tier enterprise OpenRouter, pour obtenir un DPA signé ; (c) exécution de l'extraction sur un modèle **local** (Ollama), qui supprime le transfert — à ce jour impossible en production, l'instance Ollama étant `http://localhost:11434` et le choix du fournisseur étant **global, pas par appel**. **À trancher par le responsable de traitement.** |
| **Durée de conservation** | **90 jours** pour le compte rendu — **la durée la plus courte du registre, à dessein**. Elle court depuis la **dernière preuve d'usage** : le plus récent de la date du rendez-vous, de la dernière extraction et de la création du diagnostic. Ce choix évite qu'un enregistrement resté trois mois dans un dictaphone soit purgé la nuit de son dépôt, sans jamais allonger la conservation d'un texte qui ne sert plus.<br>Purge **automatique quotidienne**, greffée sur le worker qui purge déjà les traces d'envoi ; suppression **manuelle** possible à tout moment depuis l'onglet du diagnostic.<br>La purge efface **le texte seul** : les réponses confirmées par un humain appartiennent au diagnostic et suivent le Traitement 1. La traçabilité de la génération (modèle, date) est conservée — donnée d'audit, non personnelle. |
| **Mesures techniques** | **Jamais exposé** : le compte rendu n'apparaît sur aucun lien public, dans aucun document remis au client, et **ne descend jamais dans les propriétés d'un composant client** — seule sa taille est affichée.<br>**Jamais journalisé** : l'`AuditLog` enregistre des compteurs (longueur, nombre de réponses retenues, motifs de rejet), jamais le texte ni les réponses.<br>**Rien de non confirmé ne sort** : synthèses, snapshot, rapport d'audit et proposition lisent exclusivement les réponses confirmées par un humain ; un test de contrat relit le code source pour qu'un futur lecteur ait à en décider explicitement.<br>**Citation vérifiée contre la source** : une réponse dont l'extrait ne se retrouve pas dans le compte rendu est écartée avant écriture — un modèle ne peut pas fabriquer une justification crédible et la faire confirmer.<br>Accès réservé aux rôles ADMIN / MANAGER / COMMERCIAL du tenant, requêtes scopées par tenant. |
| **Ce qui n'est PAS fait** | **Aucun enregistrement audio ni vidéo n'est stocké dans QualiOF** : seul le texte déposé par le commercial l'est.<br>Pas d'import automatique depuis un dictaphone connecté (prévu, non réalisé).<br>Pas de profilage automatisé produisant un effet juridique : le modèle propose des réponses, il ne décide rien — le prix, les droits au financement et le contenu de l'offre sortent de fonctions de calcul déterministes, jamais d'un modèle de langage.<br>Pas de réutilisation du compte rendu pour entraîner un modèle (non-rétention par défaut côté sous-traitant, réglages ZDR / journalisation désactivée). |

---

---

## Localisation des données

Source de vérité : `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` (verrouillage régions EU, Phase 17, amendé Phase 21).

| Plateforme | Rôle | Région | Pays |
|---|---|---|---|
| **Supabase** (projet `gntlqyscahbgjrmsbzil`) | Base Postgres + Storage (pièces CNI/RIB/PDF) | `eu-west-1` (définitive — région immuable, dérogation actée) | Irlande (UE) |
| **Vercel** | Application + fonctions serverless | `cdg1` | France (Paris) |
| **Railway** | Worker de génération + moteurs PDF | `europe-west4` | Pays-Bas (UE) |
| **Google Workspace** (SMTP `smtp.gmail.com:587`) | Envoi d'emails | Infrastructure mondiale Google — transferts encadrés par le Cloud Data Processing Addendum | Google Ireland Ltd (contractant UE) |
| **DocuSeal** (`api.docuseal.eu`) | Signature électronique des pièces contractuelles | Instance **EU Cloud** | UE — région exacte à confirmer sur le DPA |

**Note Vercel :** les fonctions s'exécutent en `cdg1` (Paris) mais le réseau edge de Vercel est mondial — les réponses HTTP transitent par le point de présence le plus proche du visiteur (voir [dpa/vercel.md](dpa/vercel.md)).

## Transferts hors UE

| Flux | Destinataire | Pays | Garanties |
|---|---|---|---|
| Prompts IA (closure, OCR vision) | OpenRouter, Inc. | États-Unis | Politique par défaut de non-rétention des prompts (métadonnées seules) ; réglages compte ZDR/logging à vérifier et capturer. ⚠ **Pas de DPA mutuellement signé en tier self-serve** (réservé enterprise) — limite documentée honnêtement dans [dpa/openrouter.md](dpa/openrouter.md). Risque accepté par le responsable de traitement le 2026-07-07 (validation du registre, gate D-13). |
| Inférence des modèles Claude | Anthropic, PBC (via OpenRouter — sous-sous-traitant) | États-Unis | Pas de relation contractuelle directe : la chaîne contractuelle passe par OpenRouter. Voir [dpa/anthropic.md](dpa/anthropic.md). |
| **Compte rendu verbatim d'un rendez-vous de diagnostic** (v1.7) | OpenRouter, Inc. → Anthropic, PBC | États-Unis | Mêmes garanties effectives que les autres flux IA (non-rétention par défaut, ZDR, logging OFF) — mais **la nature de la donnée change d'échelle** : conversation professionnelle intégrale, appréciations nominatives sur des tiers non informés. ⏳ **Transfert à arbitrer explicitement** par le responsable de traitement, cf. Traitement 11, rubrique « Question ouverte ». Gate préalable dans tous les cas : capturer la preuve des réglages ZDR / logging OFF, action ouverte depuis 2026-07. |
| Google Calendar / Drive | Google Ireland Ltd (compte **Workspace**, confirmé le 2026-07-07) | Infrastructure mondiale Google | DPA processeur inclus (Cloud Data Processing Addendum) avec clauses contractuelles types — voir [dpa/google.md](dpa/google.md). |

## Registre des sous-traitants (art. 28)

| # | Sous-traitant | Rôle | Données transmises | Fiche |
|---|---|---|---|---|
| 1 | OpenRouter | Passerelle IA (closure + OCR vision) | Prompts : noms stagiaires, contexte sessions, images CNI/RIB (OCR) | [dpa/openrouter.md](dpa/openrouter.md) |
| 2 | Anthropic | Fournisseur des modèles Claude (sous-sous-traitant via OpenRouter) | Idem OpenRouter (inférence) | [dpa/anthropic.md](dpa/anthropic.md) |
| 3 | Supabase | Base Postgres + Storage | TOUTE la base (PII apprenants, `SensitiveData`) + pièces (CNI/RIB/PDF) | [dpa/supabase.md](dpa/supabase.md) |
| 4 | Vercel | Hébergement application | Runtime app : cookies de session, formulaire public de préinscription | [dpa/vercel.md](dpa/vercel.md) |
| 5 | Railway | Worker + moteurs PDF | Génération de documents, logs (audités D-17, plan 22-02) | [dpa/railway.md](dpa/railway.md) |
| 6 | Google | Calendar (events sessions) + Drive (programmes) + **SMTP transactionnel** (`smtp.gmail.com:587`) | Noms sessions/formateurs, emails apprenants en attendees ; contenu des emails sortants (convocations, relances, programme du diagnostic) | [dpa/google.md](dpa/google.md) |
| ~~7~~ | ~~OVH~~ | ~~SMTP transactionnel~~ | **Écarté le 2026-09-02** — jamais activé, aucun email transmis. Fiche conservée à titre d'historique : [dpa/ovh-smtp.md](dpa/ovh-smtp.md) |
| 8 | DocuSeal | Signature électronique (instance **UE**) | PDF des pièces contractuelles (identité, adresse, n° SS et IBAN véhiculés par le dossier AGEFICE) + données de signature (email, IP, horodatages, image de la signature) | [dpa/docuseal.md](dpa/docuseal.md) |

## Mesures techniques et organisationnelles (synthèse)

- **Isolement des données sensibles** : table `SensitiveData` séparée (n° SS, pièce d'identité), relation 1:1 avec `Person`, suppression en cascade.
- **Storage privé** : bucket non public, accès exclusivement par **signed URL à TTL de quelques minutes** ; upload direct-to-storage (les pièces ne transitent pas par les serveurs applicatifs).
- **Contrôle d'accès** : RBAC 6 rôles (ADMIN/MANAGER/FORMATEUR/COMMERCIAL/COMPTABLE/LECTEUR), authentification Lucia + argon2, multi-tenant `tenantId` systématique sur les requêtes.
- **Régions EU verrouillées** par écrit (Phase 17) avec checklist anti-défaut-US ; Supabase `eu-west-1`, Vercel `cdg1`, Railway `europe-west4`. Le seul maillon hors UE par nature est le transport d'emails (Google Workspace) — encadré par le CDPA et ses clauses contractuelles types.
- **Sauvegardes** : backups Supabase quotidiens, rétention 7 jours, stockés dans la même région que le projet (eu-west-1, UE).
- **Emails** : dry-run par défaut hors production, aucun envoi de masse apprenants sans action explicite (opt-in), SMTP chiffré :465.
- **Logs** : audit des `console.*` réalisé (plan 22-02) — les logs applicatifs référencent des identifiants techniques, jamais nom/CNI/RIB en clair.
- **Secrets** : jamais en clair dans le dépôt ; variables d'environnement chiffrées (sensitive) sur Vercel/Railway.

## Limites connues (assumées, non masquées)

1. **Backups non off-site** : les sauvegardes Supabase quotidiennes (7 jours) résident dans la **même région que le projet** (eu-west-1). Un export `pg_dump` périodique vers un stockage hors vendor est au backlog (décision D-12). Risque accepté par le responsable de traitement le 2026-07-07 (validation du registre, gate D-13).
2. **OpenRouter sans DPA signé** en tier self-serve (voir Transferts hors UE et [dpa/openrouter.md](dpa/openrouter.md)) — mitigations : politique de non-rétention par défaut, réglages ZDR/logging OFF, passage au tier enterprise si exigé. Risque accepté par le responsable de traitement le 2026-07-07 (validation du registre, gate D-13).
3. ~~Type de compte Google inconnu~~ — **résolu le 2026-07-07** : compte **Google Workspace** confirmé par le responsable de traitement (DPA processeur inclus, voir [dpa/google.md](dpa/google.md)).
4. ⚠ **DocuSeal : DPA non encore récupéré ni accepté** (v1.6, 2026-09-10). Le compte est bien sur l'**instance UE** (`api.docuseal.eu`, créé le 2026-09-04). Reste à obtenir le DPA, vérifier la liste des sous-traitants ultérieurs et conserver la preuve d'acceptation. **Gate : aucun envoi sur un dossier réel avant.** Voir [dpa/docuseal.md](dpa/docuseal.md).
5. ⚠ **Collaborateurs cités dans un compte rendu de diagnostic : non informés** (v1.7, 2026-09-11). Un dirigeant qui décrit son équipe en rendez-vous nous transmet des données sur des personnes qui n'en savent rien — collecte indirecte au sens de l'**art. 14**. L'information individuelle est aujourd'hui **impossible en pratique** : nous ne disposons ni de leurs coordonnées, ni parfois de leur identité complète, tant qu'ils ne sont pas inscrits à une formation. Mitigations en place : conservation de 90 jours, aucune diffusion, aucune décision automatisée, aucun envoi. Mitigation étudiée et **écartée le 2026-09-11** : pseudonymiser les noms connus du CRM avant l'appel n'aurait masqué que le dirigeant, les collaborateurs cités étant précisément ceux dont nous n'avons pas le nom à ce moment-là. Piste durable : mentionner le traitement dans la proposition commerciale remise au dirigeant, qui la diffuse à son équipe. **À contresigner ou à corriger par le responsable de traitement.**

---

## Validation du responsable de traitement (gate D-13)

- [x] Les 8 traitements validés le 2026-07-07 sont exacts et complets.
- [ ] **v1.3** — Traitement 9 (diagnostic express du stand) : finalité, base légale consentement et durée de conservation de 24 mois à contresigner.
- [ ] **v1.5** — Traitement 5 : la seconde finalité (preuve d'envoi), les données réellement écrites dans `EmailMessage` (destinataire, objet, corps, documents joints) et **la durée de 5 ans retenue pour automatiser la purge** sont à contresigner. La durée est le seul point qui appelle un arbitrage : le registre disait « avec le dossier de formation » sans nombre, il en fallait un pour purger.
- [ ] **v1.6** — Traitement 10 (signature électronique DocuSeal) : catégories de données (dont adresse IP, image de la signature, n° SS et IBAN véhiculés par le dossier AGEFICE), hébergement UE et durée de conservation de 5 ans à contresigner. Gate associé : DPA accepté avant le lot C.
- [ ] **v1.7** — Traitement 11 (compte rendu de rendez-vous de diagnostic) : la **durée de 90 jours**, la **base d'intérêt légitime** retenue pour les collaborateurs cités par le dirigeant, et la **limite d'information de l'art. 14** (point 5 des limites connues) sont à contresigner. **Arbitrages ouverts, tranchés le 2026-09-11 pour le premier, en attente pour le second :**
  - [x] *Pseudonymiser les noms avant l'appel ?* → **Non.** Les prénoms des collaborateurs sont précisément ceux que le CRM ne connaît pas au moment de l'extraction (la grille équipe se remplit à la main, après) : masquer « les noms connus » n'aurait masqué que le dirigeant. Une mesure de façade inscrite au registre vaut moins que son absence assumée. Décision du responsable de traitement, 2026-09-11.
  - [ ] ⏳ *Le transfert du verbatim hors UE est-il couvert par l'acceptation du 2026-07-07, ou appelle-t-il son propre arbitrage — comme l'instance UE retenue cette semaine pour la signature ?* Voir Traitement 11, rubrique « Question ouverte ». **Gate indépendant de la réponse : capturer la preuve des réglages ZDR / logging OFF du compte OpenRouter, action ouverte depuis 2026-07.**
- [x] Les durées de conservation sont confirmées — **avec un amendement** : la durée de conservation des scans CNI/RIB est **étendue** (alignée sur la durée du dossier de financement/formation, PAS de suppression après justification du financement) pour rester disponibles lors des contrôles a posteriori des financeurs (AGEFICE, OPCO, DREETS) et du cycle Qualiopi — décision du responsable de traitement du 2026-07-07 (voir Traitement 2). Les autres durées proposées sont validées telles quelles.
- [x] La question du type de compte Google est tranchée : **Google Workspace** (DPA processeur inclus).
- [x] Les 2 limites assumées (backups non off-site, OpenRouter self-serve) sont acceptées.

**Statut : ✅ Validé le 2026-07-07 par Laurent MARX, responsable de traitement (amendement : durée de conservation CNI/RIB étendue).**
Cette validation lève le gate D-13 : la bascule production (plan 22-06, Wave 2) est autorisée côté RGPD.

---
*Start Academy — Registre des traitements (art. 30 RGPD) — v1.7 — socle validé le 2026-07-07, amendements v1.2 à v1.7 en attente de contreseing*
