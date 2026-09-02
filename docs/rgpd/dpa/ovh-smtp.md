# Fiche DPA — OVH (SMTP)

> ⛔ **FICHE ÉCARTÉE LE 2026-09-02 — conservée à titre d'historique.**
> Le transport d'emails de QualiOF est assuré par **Google Workspace**
> (`smtp.gmail.com:587`) — voir [google.md](google.md). OVH avait été retenu sur
> hypothèse au 2026-07-06, puis démenti au 2026-08-03 (la boîte de l'organisme est
> Workspace, pas OVH). **Aucun email n'a jamais transité par OVH** : le circuit est
> resté en `MAIL_DRY_RUN` jusqu'à son ouverture, directement sur Workspace.
> Ne pas produire cette fiche à un auditeur comme sous-traitant actif.

| Champ | Valeur |
|---|---|
| **Fournisseur** | OVH SAS (OVHcloud) — société française, siège à Roubaix |
| **Rôle** | Sous-traitant (art. 28 RGPD) — transport des emails |
| **Service utilisé** | SMTP `ssl0.ovh.net:465` (connexion SSL/TLS) — envoi des emails transactionnels de QualiOF |
| **Données transmises** | Contenu des **emails apprenants et payeurs** : convocations, notifications documentaires, relances de factures (noms, sessions, montants, pièces jointes le cas échéant) |
| **Localisation** | France / Union européenne — OVHcloud héberge ses services email sur ses infrastructures européennes |
| **Document DPA public** | Le DPA (accord de traitement des données) est intégré aux **conditions contractuelles OVHcloud** ; engagements RGPD publiés : https://www.ovhcloud.com/fr/personal-data-protection/ (vérifiée 200 le 2026-07-06) |
| **Garanties de transfert hors UE** | Non applicable en principe (société française, données UE). ⚠ La localisation précise du service email mutualisé n'est pas garantie contractuellement ligne à ligne — à vérifier si un auditeur le demande. |
| **Date de vérification** | 2026-07-06 (URL re-vérifiée HTTP 200) |

## Mesures techniques côté QualiOF

- Connexion SMTP chiffrée (SSL, port 465) ; `SMTP_PASS` en variable d'environnement chiffrée (Vercel + Railway).
- `MAIL_DRY_RUN=true` tant que la bascule production n'est pas validée : aucun email réel ne part.
- **Aucun envoi de masse vers les apprenants sans action explicite** (opt-in par case à cocher, `notifyLearners` défaut `false`) — exigence du responsable de traitement.
- Crons de relance préinscriptions/OPCO volontairement débranchés à la bascule.

## Points ouverts / limites

- La bascule `MAIL_DRY_RUN=false` (plan 22-06+) est conditionnée au rapport préalable des envois en attente + validation Laurent (D-06).
