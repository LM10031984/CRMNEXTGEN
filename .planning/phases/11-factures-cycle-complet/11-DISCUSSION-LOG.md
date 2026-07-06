# Phase 11: Factures cycle complet - Discussion Log

> **Audit trail only.** Decisions captured in CONTEXT.md — this log preserves alternatives.

**Date:** 2026-05-19
**Phase:** 11-factures-cycle-complet
**Areas discussed:** Modélisation avoirs · UI page liste · Relances automatiques · Export comptable
**Context du pivot :** Phase 11 avait été interrompue lors d'une discussion antérieure pour insérer Phase 9.1 (Centralisation Qualiopi 360°). Phase 9.1 livrée 2026-05-18, retour sur Phase 11.

---

## Area 1 — Modélisation avoirs (NCN)

### Q — Comment modéliser l'avoir en BDD ?
| Option | Description | Selected |
|--------|-------------|----------|
| Réutiliser Invoice + status=CREDIT_NOTE + originalInvoiceId | Minimal, 1 source de vérité | ✓ |
| Nouveau model CreditNote séparé | Plus propre comptable mais double maintenance | |

→ **D-01**

### Q — Numérotation des avoirs
| Option | Description | Selected |
|--------|-------------|----------|
| Préfixe distinct AVO-NNNNNN | Convention française CGI 289 | ✓ |
| Continu avec FAC- | Illégal en France | |
| Configurable | Tenant.creditNotePrefix libre | ✓ (sous-option : default 'AVO') |

→ **D-02** (préfixe distinct AVO, configurable Tenant)

### Q — Création d'un avoir, d'où ?
| Option | Description | Selected |
|--------|-------------|----------|
| Bouton fiche facture | Visible si status ∈ ISSUED/PAID/PARTIAL/OVERDUE | ✓ |
| Page dédiée /app/factures/avoirs/nouveau | Plus visible mais 2 clics | |
| Les deux | Plus flexible mais double UI | |

→ **D-03**

### Q — Avoir partiel ou total ?
| Option | Description | Selected |
|--------|-------------|----------|
| Partiel + total | Saisie montant HT ≤ facture | ✓ |
| Total uniquement | 100% facture annulée | |

→ **D-04**

---

## Area 2 — UI page liste `/app/factures`

### Q1 — KPI top de la page
Réponse user : **1**

| Option | Description | Selected |
|--------|-------------|----------|
| 4 PrioCard métier | CA mois / Impayés / DSO / À facturer | ✓ |
| 3 PrioCard + bandeau urgence | OVERDUE > J+45 | |
| Compteurs discrets | Pas de gros KPI | |

→ **D-05**

### Q2 — Filtres
Réponse user : **4 (Les 3 combinés)**

| Option | Description | Selected |
|--------|-------------|----------|
| Statut multi-chips uniquement | | |
| Période + Payeur | | |
| Type FAC/AVO + "Voir impayés" | | |
| Les 3 combinés | Statut + Période + Payeur + Type + raccourci impayés | ✓ |

→ **D-06**

### Q3 — Cross-nav depuis fiche apprenant + fiche session
Réponse user : **1**

| Option | Description | Selected |
|--------|-------------|----------|
| Style Phase 9.1 partout | Bloc Factures + drill fiche apprenant + fiche session | ✓ |
| Liste factures uniquement | Pas de cross-nav | |

→ **D-07**

### Q4 — Bulk actions multi-sélect
Réponse user : **1**

| Option | Description | Selected |
|--------|-------------|----------|
| Pas pour cette phase | Actions ligne par ligne | ✓ |
| Marquer payé en bulk | | |
| Toutes (payé + relance + supprimer) | | |

→ **D-08**

---

## Area 3 — Relances automatiques (FACT-03)

### Q1 — Infrastructure
Réponse user : **3 (Hybride)**

| Option | Selected |
|--------|----------|
| Cron BullMQ quotidien | |
| Calc à la volée + bouton manuel | |
| Hybride : cron daily + bouton manuel "Envoyer relance maintenant" | ✓ |

→ **D-09**

### Q2 — Délais de relance
Réponse user : **2 (Configurable tenant)**

| Option | Selected |
|--------|----------|
| Hardcoded J+30 + J+45 | |
| Configurable tenant `Tenant.invoiceReminderDays: [30, 45]` | ✓ |
| Selon délais convention (OPCO 60j / AGEFICE 30j) | |

→ **D-10**

### Q3 — Canal
Réponse user : **1 (Email seul)**

→ **D-11**

### Q4 — Nombre de niveaux + ton
Réponse user : **1**

| Option | Selected |
|--------|----------|
| 2 niveaux (J+30 amical + J+45 ferme) | ✓ |
| 3 niveaux | |
| 1 seul niveau | |

→ **D-12**

### Q5 — Après paiement reçu
Réponse user : **1 (Auto-stop sur PAID)**

→ **D-13**

---

## Area 4 — Export comptable (FACT-04)

### Q6 — Format d'export
Réponse user : **1 (xlsx générique)**

| Option | Selected |
|--------|----------|
| xlsx générique 12 colonnes | ✓ |
| FEC officiel Bercy | |
| Les deux | |
| Demander à l'expert-comptable d'abord | |

→ **D-14**

### Q7 — Période d'export
Réponse user : **1 (Sélecteur)**

| Option | Selected |
|--------|----------|
| Sélecteur Mois courant / Mois dernier / Trimestre / Année / Personnalisé | ✓ |
| Tout depuis le début | |

→ **D-15**

### Q8 — Inclure les avoirs
Réponse user : **1 (Oui même export, montant négatif)**

| Option | Selected |
|--------|----------|
| Oui dans le même export | ✓ |
| Export séparé factures/avoirs | |

→ **D-16**

### Q9 — RBAC export
Réponse user : **1 (ADMIN + COMPTABLE)**

| Option | Selected |
|--------|----------|
| ADMIN + COMPTABLE | ✓ |
| ADMIN seul | |

→ **D-17**

---

## Closing

User : "C" pour discuter Relances + Export (au lieu de defaults A ou defer B).

Toutes les Q répondues : `Q1 3 Q2 2 Q3 1 Q4 1 Q5 1 Q6 1 Q7 1 Q8 1 Q9 1`.

## Claude's Discretion

- Texte exact des templates email (J+30 amical / J+45 ferme) — à raffiner pendant le plan
- Choix Dialog vs AlertDialog "Créer un avoir" — réutiliser pattern Phase 9 `ReassignLeadButton`
- Tri par défaut liste factures (recommandation : `issueDate DESC, number DESC`)
- Sticky header tableau (cohérence Phase 9.1)
- Empty state strings

## Deferred Ideas (vers CONTEXT.md > deferred)

- FEC officiel Bercy → si contrôle fiscal Phase 14 ou ad-hoc
- Bulk actions multi-sélect → Phase 14 si demandé
- 3ème niveau relance J+60 → via config tenant si besoin runtime
- Notif cloche relances → Phase 14
- Rapprochement bancaire auto → grand chantier deferred
- Export Sage/Cegid → ad-hoc si expert-comptable spécifique
- Génération facture auto à clôture session → Phase 14 auto-trigger
