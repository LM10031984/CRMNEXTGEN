# Audit champs AGEFICE vs BDD QualiOF — 2026-05-25

Comparaison exhaustive : 60 champs PDF AGEFICE (`agefice-form-fill.ts:324-430`) vs schéma BDD (`Person`, `SensitiveData`, `Organization`, `TrainingSession`, `TrainingProduct`, `Tenant`).

Légende : ✓ saisi UI · ⚠️ saisi édition mais pas création · ❌ pas saisi (inféré/inventé) · 🔧 hardcodé/calculé

## A — STAGIAIRE (Person)

| Champ AGEFICE | Source BDD | Création UI | Édition UI | Statut |
|---|---|---|---|---|
| Civilité MR/MME | `Person.civility` | ✓ | ✓ | OK |
| Nom | `Person.lastName` | ✓ | ✓ | OK |
| Prénom | `Person.firstName` | ✓ | ✓ | OK |
| Nom de naissance | `Person.birthName` | ✓ | ✓ | OK |
| Date de naissance | `Person.birthDate` | ✓ | ✓ | OK |
| N° Sécurité Sociale | `SensitiveData.socialSecurityNb` | ✓ | ⚠️ | OK |
| Téléphone | `Person.phone` | ✓ | ✓ | OK |
| Email | `Person.email` | ✓ | ✓ | OK |
| **Dernier diplôme** (dropdown 6) | `Person.diplomas` (texte libre) | ❌ | ⚠️ texte libre | **À AJOUTER (dropdown AGEFICE)** |
| **Expérience pro** (4 tranches) | `Person.professionalExperience` (texte libre) | ❌ | ⚠️ texte libre | **À AJOUTER (dropdown AGEFICE)** |

## B — ENTREPRISE (Organization du sponsor stagiaire)

| Champ AGEFICE | Source BDD | Statut |
|---|---|---|
| Raison sociale | `Organization.legalName` | ✓ OK |
| Nom commercial | `Organization.brandName` | ✓ OK |
| SIRET | `Organization.siret` | ✓ OK |
| Code APE/NAF | `Organization.naf` | ✓ OK |
| Activité pro | `Organization.activityDescription` | ✓ OK |
| Forme juridique (dropdown) | `Organization.legalForm` (enum LegalForm) | ✓ OK (mapping `resolveFormeJuridique`) |
| Adresse | `Organization.address` (JSON) | ✓ OK |
| Code postal | `Organization.address.postalCode` | ✓ OK |
| Ville | `Organization.address.city` | ✓ OK |

## C — FORMATION (TrainingSession + TrainingProduct + Location)

| Champ AGEFICE | Source BDD | Statut |
|---|---|---|
| Intitulé exact | `TrainingProduct.title` | ✓ OK |
| Thématique | `TrainingProduct.targetAudience` (proxy) ? | ⚠️ à vérifier |
| Type ACTION/BILAN/VAE (checkbox) | ? (toujours ACTION par défaut) | 🔧 hardcodé probable |
| Obligatoire OUI/NON | ? | 🔧 hardcodé probable |
| Reconversion OUI/NON | ? | 🔧 hardcodé probable |
| Niveau INITIATION/MAJ/PERFECT | ? | 🔧 hardcodé probable |
| Certif TITRE_HOMOLOGUE/CQP/etc | ? | 🔧 hardcodé probable |
| Date début/fin | `TrainingSession.startDate/endDate` | ✓ OK |
| Durée Présentiel Coll/Indiv | `TrainingProduct.durationHours` | ✓ OK (mais split coll/indiv non géré) |
| Durée FOAD Synch/Asynch | ? | ⚠️ probablement 0 par défaut |
| Nom formateur | `SessionTrainer.person.fullName` (primary) | ✓ OK |
| Lieu (code postal/ville/adresse) | `Location.address` | ✓ OK |
| Prix HT | `SessionParticipant.priceHT` (fallback product) | ✓ OK |
| En entreprise OUI/NON | ? | 🔧 hardcodé probable |
| Déroulement pédagogique | `TrainingProduct.programMd` ? | ⚠️ à vérifier |

## D — ÉVALUATION & ATTESTATION

| Champ AGEFICE | Source BDD | Statut |
|---|---|---|
| Quiz / Contrôle continu / Relevés / Feuilles présence / Autre | ? | 🔧 hardcodé probable (cochage par défaut) |
| RNCP / Autre Diplôme / Diplôme Etat / Attestation Stage | ? | 🔧 hardcodé probable |
| Mandat OUI/NON | ? | 🔧 hardcodé probable |
| Signature lieu + date | calculé | ✓ OK |

## E — POINT D'ACCUEIL AGEFICE (PA)

| Champ AGEFICE | Source BDD | Statut |
|---|---|---|
| Nom PA + N° PA + interlocuteur + adresse + CP + ville + tel + email | `AgeficePointAccueil` (table dédiée, importée 2026-05-15) | ✓ OK |

## F — ORGANISME DE FORMATION (Tenant + Responsable + Contact)

| Champ AGEFICE | Source BDD | Statut |
|---|---|---|
| Raison sociale + NDA + SIRET + adresse OF | `Tenant.*` (Phase 7 Paramètres) | ✓ OK |
| Responsable OF (civilité/nom/prénom/tel/email) | `Tenant.respPersonId` ou hardcodé | ⚠️ à vérifier |
| Contact OF (idem) | idem | ⚠️ à vérifier |

## Synthèse

- **Champs AGEFICE total** : ~60
- **Champs saisis directement (✓)** : ~35 (58%)
- **Champs inférés/heuristique (⚠️)** : 5 (8%) — risque AGEFICE invente
- **Champs hardcodés/par défaut (🔧)** : ~15 (25%) — section FORMATION + ÉVALUATION + ATTESTATION
- **Champs vraiment "absents UI" (❌)** : **2** — diplôme + expérience pro stagiaire

## Top priorité actions (par criticité Qualiopi & fréquence)

1. **Diplôme stagiaire — dropdown AGEFICE 6 options** (Person.diplomas)
2. **Expérience pro stagiaire — dropdown AGEFICE 4 tranches** (Person.professionalExperience)
3. **Section FORMATION (catégorie C)** : champs type/niveau/certif/mandat probablement hardcodés "ACTION + INITIATION + SANS_QUALIFICATION" par défaut — à vérifier et exposer dans le formulaire produit si Laurent veut varier
4. **Section ÉVALUATION & ATTESTATION (catégorie D)** : même question — cases probablement toujours cochées identiquement, à voir si conforme à la réalité Start Academy

## Hors scope ce fix (chantier ultérieur)

- Catégorie C : ajouter dropdowns "Type formation / Niveau / Certif / Mandat" sur TrainingProduct si Laurent les fait varier
- Catégorie D : exposer "Méthodes évaluation" sur TrainingProduct
- Validation responsable/contact OF dans Paramètres
