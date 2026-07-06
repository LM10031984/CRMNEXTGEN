# Fiche DPA — Google (Calendar + Drive)

| Champ | Valeur |
|---|---|
| **Fournisseur** | Google LLC / Google Ireland Ltd (selon le type de compte) |
| **Rôle** | Sous-traitant (art. 28 RGPD) — ⚠ qualification dépendante du type de compte (voir variantes) |
| **Service utilisé** | Google Calendar (agenda dédié « Rappel Formations » : events de rappel J-15…J-1 par session) + Google Drive (programmes de formation DOCX, dossier `Start Academy/Formations et programmes/`) |
| **Données transmises** | Calendar : **noms des sessions et des formateurs** dans les events, **emails des apprenants en attendees** (avec `sendUpdates='none'` — pas de notification envoyée par Google) ; Drive : programmes de formation (pas de PII apprenant) |
| **Localisation** | Infrastructure mondiale Google — pas de garantie de résidence UE par défaut |
| **Document DPA public** | **Dépend du type de compte — voir les 2 variantes ci-dessous** |
| **Date de vérification** | 2026-07-06 (URLs re-vérifiées HTTP 200) |

---

## ⚠ QUESTION BLOQUANTE — à CONFIRMER par Laurent au checkpoint (Open Question 1)

**Le compte Google utilisé pour Calendar/Drive est-il un compte GRATUIT (grand public) ou un compte GOOGLE WORKSPACE (payant) ?**

Les deux variantes sont rédigées ci-dessous ; la bonne sera conservée (et l'autre supprimée) après la réponse au checkpoint de validation du registre.

---

## VARIANTE A — Compte Google gratuit (grand public)

- **Cadre contractuel** : conditions d'utilisation grand public + politique de confidentialité https://policies.google.com/privacy (vérifiée 200 le 2026-07-06).
- ⚠ **PAS de DPA processeur** : dans les conditions grand public, Google n'agit pas comme sous-traitant au sens de l'art. 28 avec engagements contractuels dédiés — **point d'attention MAJEUR** puisque des données personnelles de tiers (noms sessions/formateurs, **emails d'apprenants en attendees**) sont placées dans les events Calendar.
- **Mitigations en place** : scope OAuth minimal (calendar uniquement), `sendUpdates='none'` (aucun email envoyé par Google aux apprenants), agenda dédié séparé.
- **Mitigation backlog** : **migration vers Google Workspace** (variante B) pour obtenir le DPA processeur ; alternativement, retirer les emails apprenants des attendees (events informatifs sans invités).
- ⚠ À VALIDER PAR LE RESPONSABLE DE TRAITEMENT : acceptation temporaire du risque + arbitrage sur la migration Workspace.

## VARIANTE B — Compte Google Workspace (payant)

- **Cadre contractuel** : Google Workspace inclut le **Cloud Data Processing Addendum** (DPA processeur) : https://workspace.google.com/terms/dpa_terms.html (vérifiée 200 le 2026-07-06).
- Google agit comme sous-traitant avec engagements art. 28 : clauses contractuelles types pour les transferts hors UE, liste de subprocessors publiée, certifications (ISO 27001 etc.).
- **Action si cette variante s'applique** : vérifier que le DPA/CCT sont bien acceptés dans la console d'administration Workspace et conserver la preuve.
- Mitigations techniques identiques (scope minimal, `sendUpdates='none'`).

---

## Mesures techniques côté QualiOF (communes)

- Refresh token OAuth à **scope calendar SEUL** (pas d'accès Gmail/autres) — porté en variable d'environnement chiffrée Vercel à la bascule (D-07).
- `sendUpdates='none'` par défaut : les apprenants invités ne reçoivent aucun email de Google.
- Garde staging : aucune synchronisation Calendar hors production.

## Points ouverts / limites

- ⚠ **Type de compte à confirmer** (question bloquante ci-dessus) — la fiche sera figée sur la bonne variante après le checkpoint.
- ⚠ Localisation des données Google non garantie UE (les deux variantes) — transfert encadré par CCT uniquement en variante B.
