# SmartOF — Formule prix confirmée 2026-06-03

## TL;DR
Le prix HT par stagiaire pour une formation est dans :
```
produit.presetTarification.tarifs[N].budget[M].prixUnitaireHT
```

Pour `PROD-0042` (formation 72h "L'IA au service des conseillers immo") :
**3024 € HT par stagiaire**

## Vérification SES-0093

| Source | Prix par stagiaire |
|---|---|
| **SmartOF API** (vérité) | **3024 €** |
| QualiOF `TrainingProduct.priceHT` (catalogue) | 336 € (≈ 3024/9, erreur import) |
| QualiOF `SessionParticipant.priceHT` (par inscription) | 0 € (jamais saisi) |

## Cascade d'override prévue

```
Produit.presetTarification.tarifs[*].budget[*].prixUnitaireHT
                ↓ propagé à la création de session
TrainingSession.pricePerLearner   (peut être négocié à la session)
                ↓ propagé à l'inscription
SessionParticipant.priceHT        (peut être custom par stagiaire)

# Calculs côté Session :
CA_prevu      = SUM(SessionParticipant.priceHT)
CA_encaisse   = SUM(priceHT WHERE Invoice.status='PAID' OR paymentReceived)
Reste         = CA_prevu - CA_encaisse
Taux_encaiss  = CA_encaisse / CA_prevu
```

## Endpoints SmartOF utiles

| Endpoint | Param clé | Retour utile |
|---|---|---|
| `POST /api/session/list` | rien | 86 sessions ; identifier par `customId` (ex "SES-0093"), lien vers produit via `produitFormationViseeUid` |
| `POST /api/produit/get` | `{ produitFormationUid }` | Prix dans `presetTarification.tarifs[*].budget[*].prixUnitaireHT` |
| `POST /api/apprenant/list` | rien | 250 apprenants, match par `meta.nom` / `meta.prenom` |
| `POST /api/factures/list` | rien | **Seulement 4 factures** (limite API connue, pas utile pour SES-0093) |

## Action côté QualiOF

1. **Script `sync-smartof-api.ts`** (à coder) :
   - GET toutes les sessions + produits
   - Pour chaque produit : extraire `prixUnitaireHT` → `TrainingProduct.priceHT`
   - Pour chaque session : backfill `pricePerLearner` depuis le produit
   - Pour chaque participant : backfill `priceHT` (uniquement si 0)
   - Audit visuel des écarts avant écrasement
2. **Update tous les générateurs** :
   - Attestation assiduité AGEFICE : utiliser `participant.priceHT > 0 ? participant : session.pricePerLearner > 0 ? session : product.priceHT`
   - Idem facture, convention, AGEFICE
3. **Page Audit Tréso** : reproduire les 2 formules Airtable
   - `Statut_Opco` (4 états)
   - `Statut_encaissement` (10 états)
