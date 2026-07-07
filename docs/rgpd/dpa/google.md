# Fiche DPA — Google (Calendar + Drive)

| Champ | Valeur |
|---|---|
| **Fournisseur** | Google Ireland Ltd (compte **Google Workspace**) |
| **Rôle** | Sous-traitant (art. 28 RGPD) |
| **Service utilisé** | Google Calendar (agenda dédié « Rappel Formations » : events de rappel J-15…J-1 par session) + Google Drive (programmes de formation DOCX, dossier `Start Academy/Formations et programmes/`) |
| **Données transmises** | Calendar : **noms des sessions et des formateurs** dans les events, **emails des apprenants en attendees** (avec `sendUpdates='none'` — pas de notification envoyée par Google) ; Drive : programmes de formation (pas de PII apprenant) |
| **Localisation** | Infrastructure mondiale Google — transferts hors UE encadrés par les clauses du Cloud Data Processing Addendum |
| **Document DPA public** | Google Workspace inclut le **Cloud Data Processing Addendum** (DPA processeur) : https://workspace.google.com/terms/dpa_terms.html (vérifiée 200 le 2026-07-06) |
| **Garanties de transfert hors UE** | Clauses contractuelles types incluses au CDPA, liste de subprocessors publiée, certifications (ISO 27001 etc.) |
| **Date de vérification** | 2026-07-06 (URL re-vérifiée HTTP 200) ; type de compte **confirmé Workspace par le responsable de traitement le 2026-07-07** (checkpoint D-13) |

> **Type de compte confirmé : GOOGLE WORKSPACE (payant)** — réponse du responsable de traitement au checkpoint de validation du registre (2026-07-07). Google agit comme sous-traitant avec engagements art. 28 via le Cloud Data Processing Addendum. La variante « compte gratuit » (conditions grand public sans DPA processeur) rédigée initialement ne s'applique pas et a été supprimée de cette fiche.

## Action de preuve

- Vérifier que le DPA/CCT sont bien acceptés dans la console d'administration Workspace et conserver la preuve (capture/horodatage) — action à intégrer au runbook de bascule.

## Mesures techniques côté QualiOF

- Refresh token OAuth à **scope calendar SEUL** (pas d'accès Gmail/autres) — porté en variable d'environnement chiffrée Vercel à la bascule (D-07).
- `sendUpdates='none'` par défaut : les apprenants invités ne reçoivent aucun email de Google.
- Garde staging : aucune synchronisation Calendar hors production.

## Points ouverts / limites

- Type de compte tranché : **Workspace** (confirmé par le responsable de traitement le 2026-07-07 — checkpoint D-13). Reste l'action de preuve ci-dessus (acceptation DPA/CCT dans la console admin Workspace à capturer).
- Localisation des données Google non garantie UE — transfert hors UE encadré par les clauses contractuelles types du CDPA.
