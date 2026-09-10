# Fiche DPA — Google (Calendar + Drive + SMTP transactionnel)

| Champ | Valeur |
|---|---|
| **Fournisseur** | Google Ireland Ltd (compte **Google Workspace**) |
| **Rôle** | Sous-traitant (art. 28 RGPD) |
| **Service utilisé** | Google Calendar (agenda dédié « Rappel Formations » : events de rappel J-15…J-1 par session) + Google Drive (programmes de formation DOCX, dossier `Start Academy/Formations et programmes/`) + **SMTP transactionnel** `smtp.gmail.com:587` (STARTTLS), compte d'envoi `formation@start-academy.fr` — **actif en production depuis le 2026-09-02** |
| **Données transmises** | Calendar : **noms des sessions et des formateurs** dans les events, **emails des apprenants en attendees** (avec `sendUpdates='none'` — pas de notification envoyée par Google) ; Drive : programmes de formation (pas de PII apprenant) ; **SMTP : contenu intégral des emails sortants** — destinataire, objet, corps (nom, session, montants), pièces jointes le cas échéant |
| **Localisation** | Infrastructure mondiale Google — transferts hors UE encadrés par les clauses du Cloud Data Processing Addendum |
| **Document DPA public** | Google Workspace inclut le **Cloud Data Processing Addendum** (DPA processeur) : https://workspace.google.com/terms/dpa_terms.html (vérifiée 200 le 2026-07-06) |
| **Garanties de transfert hors UE** | Clauses contractuelles types incluses au CDPA, liste de subprocessors publiée, certifications (ISO 27001 etc.) |
| **Date de vérification** | 2026-07-06 (URL re-vérifiée HTTP 200) ; type de compte **confirmé Workspace par le responsable de traitement le 2026-07-07** (checkpoint D-13) ; **extension au transport SMTP le 2026-09-02** (premier email réel prouvé : programme du diagnostic, soumission `83487728`) |

> **Type de compte confirmé : GOOGLE WORKSPACE (payant)** — réponse du responsable de traitement au checkpoint de validation du registre (2026-07-07). Google agit comme sous-traitant avec engagements art. 28 via le Cloud Data Processing Addendum. La variante « compte gratuit » (conditions grand public sans DPA processeur) rédigée initialement ne s'applique pas et a été supprimée de cette fiche.

## Action de preuve

- Vérifier que le DPA/CCT sont bien acceptés dans la console d'administration Workspace et conserver la preuve (capture/horodatage) — action à intégrer au runbook de bascule.

## Mesures techniques côté QualiOF

- Refresh token OAuth à **scope calendar SEUL** (pas d'accès Gmail/autres) — porté en variable d'environnement chiffrée Vercel à la bascule (D-07). Le SMTP est une voie **distincte** de cet OAuth : authentification par **mot de passe d'application** dédié (`SMTP_PASS`, 2FA requise sur le compte), révocable seul sans toucher au token Calendar.
- Expéditeur aligné sur le compte authentifié (`MAIL_FROM` = `SMTP_USER` = `formation@start-academy.fr`) : Gmail ne réécrit pas le « From: », le domaine reste couvert par SPF/DKIM/DMARC de Start Academy.
- Chokepoint applicatif unique (`lib/mailer.ts`) : catégorie d'email **obligatoire** à l'appel, décision d'envoi fail-closed par `TenantEmailSettings`, destinataire masqué dans les logs (D-17).
- `sendUpdates='none'` par défaut : les apprenants invités ne reçoivent aucun email de Google.
- Garde staging : aucune synchronisation Calendar hors production.

## Points ouverts / limites

- Type de compte tranché : **Workspace** (confirmé par le responsable de traitement le 2026-07-07 — checkpoint D-13). Reste l'action de preuve ci-dessus (acceptation DPA/CCT dans la console admin Workspace à capturer).
- Localisation des données Google non garantie UE — transfert hors UE encadré par les clauses contractuelles types du CDPA. **Cette limite vaut désormais aussi pour le contenu des emails sortants**, y compris le programme envoyé aux prospects du salon (Traitement 9).
- Le mot de passe d'application `SMTP_PASS` n'est vérifiable que côté Google : sa nature (mot de passe d'application, et non mot de passe de compte) est **à confirmer par le responsable de traitement**.
