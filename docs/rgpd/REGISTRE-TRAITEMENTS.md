# Registre des traitements — Start Academy (art. 30 RGPD)

| Champ | Valeur |
|---|---|
| **Version** | 1.3 |
| **Date de rédaction** | 2026-07-06 (v1.0) — amendé et validé le 2026-07-07 (v1.1) — amendé le 2026-08-28 (v1.2, Traitement 2 : inscriptions publiques par session) — amendé le 2026-09-01 (v1.3, Traitement 9 : diagnostic express du stand) |
| **Responsable de traitement** | Start Academy — Organisme de formation certifié Qualiopi (siège : Vence) |
| **Contact** | laurent@start-academy.fr |
| **Rédaction** | Générée par assistance IA (Claude), sous contrôle du responsable de traitement |
| **Statut** | ✅ **Validé le 2026-07-07 par Laurent MARX, responsable de traitement (amendement : durée de conservation CNI/RIB étendue)** — gate D-13 levé.<br>⏳ **v1.2 (2026-08-28) : le Traitement 2 a été étendu au lien public par session et à la collecte du n° de sécurité sociale — à contresigner par le responsable de traitement.**<br>⏳ **v1.3 (2026-09-01) : ajout du Traitement 9 (diagnostic express du stand, base légale consentement, conservation 24 mois) — à contresigner par le responsable de traitement.** |

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
| **Destinataires / sous-traitants** | Base et PDF factures : [dpa/supabase.md](dpa/supabase.md) · Envoi des relances : [dpa/ovh-smtp.md](dpa/ovh-smtp.md) · Cron de relance : [dpa/railway.md](dpa/railway.md). |
| **Durée de conservation** | Pièces comptables 10 ans (obligation légale du Code de commerce). Données de relance : durée du dossier. Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | `MAIL_DRY_RUN` actif tant que la bascule production n'est pas validée (aucun email réel), montants stockés en centimes, RBAC (rôle COMPTABLE), scoping `tenantId`. |

## Traitement 5 — Emails transactionnels (convocations, notifications)

| Rubrique | Contenu |
|---|---|
| **Finalité** | Envoi des convocations, notifications de documents et suivis liés aux formations. |
| **Base légale** | Exécution du contrat de formation (art. 6.1.b). |
| **Catégories de données** | Adresses email des apprenants et payeurs, contenus des emails (noms, sessions, pièces jointes documentaires). |
| **Catégories de personnes** | Apprenants, payeurs, formateurs. |
| **Destinataires / sous-traitants** | Transport SMTP : [dpa/ovh-smtp.md](dpa/ovh-smtp.md). |
| **Durée de conservation** | Traces d'envoi (`EmailMessage`) conservées avec le dossier de formation. Validée par le responsable de traitement le 2026-07-07. |
| **Mesures techniques** | **Aucun envoi de masse vers les apprenants sans action explicite** (exigence du responsable de traitement : `notifyLearners` défaut `false`, boutons manuels, opt-in par case à cocher) ; crons de relance préinscriptions/OPCO volontairement débranchés ; `MAIL_DRY_RUN` en staging ; connexion SMTP chiffrée (SSL :465). |

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
| **Catégories de données** | Réponses à 8 questions fermées de qualification professionnelle (rôle, taille d'équipe, origine des affaires, évolution des mandats, usage de l'IA, priorité déclarée, formation suivie dans l'année) ; créneau de rappel souhaité ; identité et coordonnées saisies (prénom, nom, email, téléphone — le téléphone devient obligatoire si la personne demande un rappel dans la semaine). **Aucune pièce, aucun document, aucune donnée sensible au sens de l'art. 9.** |
| **Catégories de personnes** | Visiteurs professionnels du salon (agents et conseillers immobiliers, dirigeants d'agence) — prospects. |
| **Destinataires / sous-traitants** | Base : [dpa/supabase.md](dpa/supabase.md) · Runtime du formulaire public : [dpa/vercel.md](dpa/vercel.md) · Assemblage du programme personnalisé par IA : [dpa/openrouter.md](dpa/openrouter.md) (modèles Anthropic en sous-sous-traitance : [dpa/anthropic.md](dpa/anthropic.md)) · Envoi de l'email : [dpa/ovh-smtp.md](dpa/ovh-smtp.md) · Rattrapage des envois : [dpa/railway.md](dpa/railway.md). **Aucune diffusion à un tiers, aucune revente, aucun partage avec les autres exposants du salon.** |
| **Durée de conservation** | **24 mois** à compter de la collecte pour les prospects sans suite (durée usuelle recommandée par la CNIL en prospection commerciale), puis effacement. Un prospect qui devient apprenant bascule dans le Traitement 1 et suit sa durée. Effacement immédiat sur demande (`laurent@start-academy.fr`). La soumission (`DiagnosticSubmission`) est supprimée **en cascade** avec le lead — pas de PII orpheline. |
| **Mesures techniques** | Consentement horodaté et tracé en clair dans la fiche du prospect ; le formulaire ne LIT aucune donnée, il n'en crée que ; aucune écriture en base avant validation du formulaire complet ; plafond de 250 soumissions / 15 min / IP (garde-fou anti-remplissage automatisé, calibré pour un événement où plusieurs centaines de personnes partagent la même IP publique) ; validation serveur de toutes les réponses contre la liste fermée des questions (le navigateur ne dicte pas le contenu enregistré) ; envoi de l'email conditionné à une case dédiée dans Paramètres → Emails (fail-closed : décochée, rien ne part) ; email transactionnel unitaire déclenché par la personne elle-même — **aucun envoi de masse**. |
| **Ce qui n'est PAS fait** | Pas de création de compte, pas de mot de passe, pas d'upload de pièce, pas de cookie de mesure d'audience sur la page publique, pas de croisement avec un fichier acheté, pas de profilage automatisé produisant un effet juridique (le routage vers une problématique est un simple barème de points, explicable et communicable à la personne). |


---

## Localisation des données

Source de vérité : `.planning/phases/17-fondations-cloud-r-gion-eu-env/17-REGIONS.md` (verrouillage régions EU, Phase 17, amendé Phase 21).

| Plateforme | Rôle | Région | Pays |
|---|---|---|---|
| **Supabase** (projet `gntlqyscahbgjrmsbzil`) | Base Postgres + Storage (pièces CNI/RIB/PDF) | `eu-west-1` (définitive — région immuable, dérogation actée) | Irlande (UE) |
| **Vercel** | Application + fonctions serverless | `cdg1` | France (Paris) |
| **Railway** | Worker de génération + moteurs PDF | `europe-west4` | Pays-Bas (UE) |
| **OVH** (SMTP `ssl0.ovh.net:465`) | Envoi d'emails | Infrastructure OVH | France (UE) |

**Note Vercel :** les fonctions s'exécutent en `cdg1` (Paris) mais le réseau edge de Vercel est mondial — les réponses HTTP transitent par le point de présence le plus proche du visiteur (voir [dpa/vercel.md](dpa/vercel.md)).

## Transferts hors UE

| Flux | Destinataire | Pays | Garanties |
|---|---|---|---|
| Prompts IA (closure, OCR vision) | OpenRouter, Inc. | États-Unis | Politique par défaut de non-rétention des prompts (métadonnées seules) ; réglages compte ZDR/logging à vérifier et capturer. ⚠ **Pas de DPA mutuellement signé en tier self-serve** (réservé enterprise) — limite documentée honnêtement dans [dpa/openrouter.md](dpa/openrouter.md). Risque accepté par le responsable de traitement le 2026-07-07 (validation du registre, gate D-13). |
| Inférence des modèles Claude | Anthropic, PBC (via OpenRouter — sous-sous-traitant) | États-Unis | Pas de relation contractuelle directe : la chaîne contractuelle passe par OpenRouter. Voir [dpa/anthropic.md](dpa/anthropic.md). |
| Google Calendar / Drive | Google Ireland Ltd (compte **Workspace**, confirmé le 2026-07-07) | Infrastructure mondiale Google | DPA processeur inclus (Cloud Data Processing Addendum) avec clauses contractuelles types — voir [dpa/google.md](dpa/google.md). |

## Registre des sous-traitants (art. 28)

| # | Sous-traitant | Rôle | Données transmises | Fiche |
|---|---|---|---|---|
| 1 | OpenRouter | Passerelle IA (closure + OCR vision) | Prompts : noms stagiaires, contexte sessions, images CNI/RIB (OCR) | [dpa/openrouter.md](dpa/openrouter.md) |
| 2 | Anthropic | Fournisseur des modèles Claude (sous-sous-traitant via OpenRouter) | Idem OpenRouter (inférence) | [dpa/anthropic.md](dpa/anthropic.md) |
| 3 | Supabase | Base Postgres + Storage | TOUTE la base (PII apprenants, `SensitiveData`) + pièces (CNI/RIB/PDF) | [dpa/supabase.md](dpa/supabase.md) |
| 4 | Vercel | Hébergement application | Runtime app : cookies de session, formulaire public de préinscription | [dpa/vercel.md](dpa/vercel.md) |
| 5 | Railway | Worker + moteurs PDF | Génération de documents, logs (audités D-17, plan 22-02) | [dpa/railway.md](dpa/railway.md) |
| 6 | Google | Calendar (events sessions) + Drive (programmes) | Noms sessions/formateurs, emails apprenants en attendees | [dpa/google.md](dpa/google.md) |
| 7 | OVH | SMTP transactionnel | Emails apprenants/payeurs (convocations, relances factures) | [dpa/ovh-smtp.md](dpa/ovh-smtp.md) |

## Mesures techniques et organisationnelles (synthèse)

- **Isolement des données sensibles** : table `SensitiveData` séparée (n° SS, pièce d'identité), relation 1:1 avec `Person`, suppression en cascade.
- **Storage privé** : bucket non public, accès exclusivement par **signed URL à TTL de quelques minutes** ; upload direct-to-storage (les pièces ne transitent pas par les serveurs applicatifs).
- **Contrôle d'accès** : RBAC 6 rôles (ADMIN/MANAGER/FORMATEUR/COMMERCIAL/COMPTABLE/LECTEUR), authentification Lucia + argon2, multi-tenant `tenantId` systématique sur les requêtes.
- **Régions EU verrouillées** par écrit (Phase 17) avec checklist anti-défaut-US ; Supabase `eu-west-1`, Vercel `cdg1`, Railway `europe-west4`.
- **Sauvegardes** : backups Supabase quotidiens, rétention 7 jours, stockés dans la même région que le projet (eu-west-1, UE).
- **Emails** : dry-run par défaut hors production, aucun envoi de masse apprenants sans action explicite (opt-in), SMTP chiffré :465.
- **Logs** : audit des `console.*` réalisé (plan 22-02) — les logs applicatifs référencent des identifiants techniques, jamais nom/CNI/RIB en clair.
- **Secrets** : jamais en clair dans le dépôt ; variables d'environnement chiffrées (sensitive) sur Vercel/Railway.

## Limites connues (assumées, non masquées)

1. **Backups non off-site** : les sauvegardes Supabase quotidiennes (7 jours) résident dans la **même région que le projet** (eu-west-1). Un export `pg_dump` périodique vers un stockage hors vendor est au backlog (décision D-12). Risque accepté par le responsable de traitement le 2026-07-07 (validation du registre, gate D-13).
2. **OpenRouter sans DPA signé** en tier self-serve (voir Transferts hors UE et [dpa/openrouter.md](dpa/openrouter.md)) — mitigations : politique de non-rétention par défaut, réglages ZDR/logging OFF, passage au tier enterprise si exigé. Risque accepté par le responsable de traitement le 2026-07-07 (validation du registre, gate D-13).
3. ~~Type de compte Google inconnu~~ — **résolu le 2026-07-07** : compte **Google Workspace** confirmé par le responsable de traitement (DPA processeur inclus, voir [dpa/google.md](dpa/google.md)).

---

## Validation du responsable de traitement (gate D-13)

- [x] Les 8 traitements validés le 2026-07-07 sont exacts et complets.
- [ ] **v1.3** — Traitement 9 (diagnostic express du stand) : finalité, base légale consentement et durée de conservation de 24 mois à contresigner.
- [x] Les durées de conservation sont confirmées — **avec un amendement** : la durée de conservation des scans CNI/RIB est **étendue** (alignée sur la durée du dossier de financement/formation, PAS de suppression après justification du financement) pour rester disponibles lors des contrôles a posteriori des financeurs (AGEFICE, OPCO, DREETS) et du cycle Qualiopi — décision du responsable de traitement du 2026-07-07 (voir Traitement 2). Les autres durées proposées sont validées telles quelles.
- [x] La question du type de compte Google est tranchée : **Google Workspace** (DPA processeur inclus).
- [x] Les 2 limites assumées (backups non off-site, OpenRouter self-serve) sont acceptées.

**Statut : ✅ Validé le 2026-07-07 par Laurent MARX, responsable de traitement (amendement : durée de conservation CNI/RIB étendue).**
Cette validation lève le gate D-13 : la bascule production (plan 22-06, Wave 2) est autorisée côté RGPD.

---
*Start Academy — Registre des traitements (art. 30 RGPD) — v1.3 — socle validé le 2026-07-07, amendements v1.2 et v1.3 en attente de contreseing*
