# Prompt V2 — reste à faire avant le 9 (état du dépôt vérifié le 01/09 après-midi)

> Remplace `260901-qr7-PROMPT-CLAUDE-CODE.md` (LOTS 1-6 : livrés en `a050ff8`, vérifié).
> Contexte : voir `260901-qr7-CONVERSION.md` (stratégie, copy, chiffres AGEFICE).

---

Tu termines le diagnostic express du stand (25 ans du MLS, **mercredi 9 septembre, 18 h**).
Les LOTS 1 à 6 sont livrés et mergés (`a050ff8`, `1a6d259`) : route `/api/diagnostic/traiter`,
crons Vercel, boutons de rappel, `priorite.ts`, template corrigé, fiche lead, worker Railway
retiré. Ne les refais pas. Voici ce qui reste, vérifié dans le dépôt à l'instant.

## Doctrine email — ARBITRÉE, ne pas rouvrir

Tout email part de **Vercel** via le SMTP Google Workspace (587 — ouvert chez Vercel, doc
officielle). Le domaine est déjà authentifié (SPF Google strict, DKIM Google, DMARC
`p=quarantine/sp=reject` — vérifié dans les DNS le 01/09). **Railway n'envoie plus jamais
d'email** (SMTP bloqué tous ports, mesuré) ; Brevo écarté par Laurent.

## LOT A — Les preuves (à faire en premier, rien ne compte tant que ce n'est pas vert)

1. **Cohérence expéditeur/authentification** : Gmail réécrit silencieusement le « From: » si
   l'adresse n'est ni le compte authentifié ni un alias « Envoyer en tant que ». Compare le
   `SMTP_USER` de prod avec l'`emailFrom` de la config OF ; si divergence, signale-le-moi —
   ça se règle côté Gmail, pas côté code.
2. **`SMTP_PASS` = mot de passe d'application** (2FA requise). Invérifiable depuis le code :
   mets-le en tête de ton rapport pour que Laurent le confirme à la main.
3. **`CRON_SECRET` absent en production** : à poser (le cron tourne sans protection).
4. **Rejoue Jean-Guy** (soumission `83487728-…`, FAILED par Railway) : « Renvoyer le
   programme » puis chemin Vercel, et confirme le passage en **SENT** avec l'horodatage.
   C'est la preuve de bout en bout du circuit — la première case de la checklist du 8.

## LOT B — Finitions vérifiées manquantes

1. **Phrase de consentement** (`diagnostic-form.tsx:381`) : « …ne sont transmises à personne
   d'autre » est trop absolue (l'infrastructure d'envoi est un sous-traitant). Reformule en
   restant vrai : « jamais revendues, hébergées dans l'Union européenne ». Vérifie la
   cohérence avec l'entrée déjà ajoutée au registre RGPD.
2. **Plafond IP du salon** : `MAX_PAR_IP` n'apparaît plus dans `diagnostic-public.ts` —
   retrouve où vit le rate-limit du diagnostic et assure un plafond d'au moins **250 / 15 min**
   (des centaines de personnes derrière une seule IP publique le soir du 9).
3. **Purge les doublons de synchro Drive** : `find` sur `* 2.*` — il y en a jusque dans
   `src/` (`diagnostic-public 2.ts`, `page 2.tsx`, tests dupliqués). Vérifie que chaque
   doublon est identique ou plus vieux que l'original avant suppression, puis supprime-les
   tous et propose une entrée `.gitignore` si un motif le permet. Ils polluent tsc et les tests.

## LOT C — APRÈS le 9, ne bloque rien cette semaine

Les relances de factures et emails de closure côté Railway n'ont jamais rien pu envoyer.
Migre ces envois vers le chemin Vercel (même patron file + cron que le diagnostic).
Branche et commits séparés — c'est de la dette, pas du stand.

## Contraintes inchangées

- Résultat calculé côté client par le module pur — zéro réseau entre la question 1 et le résultat.
- IA et email jamais sur le chemin critique. Aucun prix nulle part. Une seule journée (8 h max).
- Laurent joue lui-même `pnpm lint`, `pnpm --filter @qualiof/web exec tsc --noEmit` et
  `pnpm test` avant tout merge — annonce-le, ne le promets pas à sa place.

## Rapport final attendu (une page)

1. LOT A : chaque preuve, verte ou pas, avec ce que Laurent doit confirmer à la main
   (mot de passe d'application, case Paramètres → Emails, test 4G du QR imprimé, lead de test supprimé).
2. LOT B : fait / restant.
3. La ligne Jean-Guy : SENT + horodatage.
