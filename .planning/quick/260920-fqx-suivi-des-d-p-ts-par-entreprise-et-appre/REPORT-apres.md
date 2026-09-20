# Rapport — envois après formation

## Résultat livré

- Composant serveur intégrable avec une seule prop : `AfterTrainingDelivery({ sessionId })`.
- Aperçu avant envoi du destinataire, de l’objet, du corps et de chaque pièce jointe consultable.
- Ouverture uniquement à partir du lendemain calendaire de la fin de session, fuseau Europe/Paris ; sessions annulées refusées.
- Apprenant individuel : envoi séparé vers `Person.email`, avec la facture **ordinaire** active et le `CERTIFICAT_REALISATION` courant.
- Une facture multi-apprenants n’est jamais jointe à un email individuel, même si son `participantId` nomme aussi l’apprenant. Tous les chemins imposent le payeur actuel. Quand `participantIds` existe, il doit contenir exactement cette inscription. Un `sessionId` renseigné doit être celui de la session ; le legacy `sessionId = null` est accepté uniquement si `participantId` relie directement la facture à l’inscription. Les écarts sont affichés comme blocages et la route privée applique le même contrôle.
- Salariés : regroupement par employeur, destinataire résolu par la cascade réelle de représentation utilisée par les conventions, avec un `ATTESTATION_FIN` individuel par salarié. Aucun certificat de groupe ajouté.
- Expéditeur imposé à `formation@start-academy.fr`.
- Accès lecture/envoi : ADMIN, MANAGER, COMMERCIAL, COMPTABLE. Reprise d’un état SMTP incertain : ADMIN/MANAGER seulement.

## Sécurité et cohérence

- Toutes les lectures sont bornées par `tenantId`, la session et le rôle.
- Le navigateur ne reçoit aucune clé de stockage. Les liens passent par une route privée qui revalide tenant, rôle, session, type et identifiant métier.
- Le client confirme une empreinte liant destinataire, objet, membres du groupe, ids, clés et empreintes des sources courantes.
- Le serveur reconstruit le plan au clic, télécharge uniquement les clés résolues en base, pose un verrou PostgreSQL durable, puis reconstruit encore le plan après le verrou. Toute évolution du destinataire, des membres ou des pièces bloque l’envoi.
- Les régénérations légitimes sont prises en charge : la version courante est la plus récente par `createdAt`, puis `id` ; une pièce absente ou sans fichier bloque clairement.
- Une ligne `EmailMessage` `queued` sert de claim anti-double-clic. Son `relatedEntity` contient l’empreinte du snapshot exact ; l’idempotence porte donc sur cette version et conserve l’historique des versions précédemment envoyées. Elle ne reçoit `sentAt` et `documentIds` qu’après un succès SMTP réel avec `messageId`.
- Après un succès, l’ajout d’un salarié ou le remplacement d’une pièce produit une nouvelle empreinte : l’interface affiche « Pièces, destinataire ou membres mis à jour depuis le dernier envoi », montre le nouvel aperçu et autorise un nouvel envoi explicite. La version déjà envoyée reste auditée.
- Un échec SMTP potentiellement ambigu reste `queued` et n’est jamais relancé automatiquement. Cet état bloque le groupe logique entier, même si son contenu change ensuite. Après 10 minutes, ADMIN/MANAGER vérifie la boîte Envoyés et choisit explicitement soit « non parti — autoriser une nouvelle tentative », soit « retrouvé dans Envoyés — confirmer envoyé ». Dans ce second cas, le snapshot du claim est marqué envoyé sans nouvel appel SMTP et ses participants exacts sont mis à jour. Les deux décisions sont auditées.
- `closingDocsSent` ne marque que les participants appartenant au snapshot confirmé, jamais un membre ajouté pendant l’envoi.
- Aucun email réel ni aucune donnée de production n’a été utilisé pendant les tests.

## Fichiers

- `apps/web/src/lib/post-formation/delivery.ts`
- `apps/web/src/server/actions/after-training-delivery.ts`
- `apps/web/src/components/sessions/after-training-delivery.tsx`
- `apps/web/src/components/sessions/after-training-delivery-client.tsx`
- `apps/web/src/app/api/after-training/[sessionId]/attachments/[kind]/[attachmentId]/route.ts`
- `apps/web/src/lib/post-formation/__tests__/delivery.test.ts`
- `apps/web/src/server/actions/__tests__/after-training-delivery.test.ts`

## Validation

- Tests ciblés : **20/20 réussis**.
- Cas couverts : empreinte destination/source, non-exposition des clés, lendemain Paris, facture ordinaire + certificat individuel, refus d’une facture multi-apprenants, refus d’un ancien payeur sur facture nominative, refus d’une autre session, refus d’un tableau multi-personnes même avec `participantId`, regroupement dirigeant + attestations individuelles, changement après aperçu, changement après verrou, ajout d’un membre après succès, remplacement d’un document après succès, incertitude bloquante malgré un nouveau snapshot, dry-run réessayable, succès SMTP avant traçage, session annulée, reprise manuelle « non parti » et confirmation « bien parti » sans second SMTP.
- `git diff --check` ciblé : réussi.
- TypeScript global (`tsc --noEmit`) : réussi après les dernières corrections.

## Point d’intégration

```tsx
import { AfterTrainingDelivery } from '@/components/sessions/after-training-delivery';

<AfterTrainingDelivery sessionId={session.id} />
```

La page session du lot parallèle a déjà repris cette interface.
