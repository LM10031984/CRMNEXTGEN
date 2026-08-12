# Rapport de synchronisation SmartOF 12/08/2026 — SIMULATION (dry-run)

> Généré le 2026-08-12 06:26 UTC par `apps/web/scripts/sync-smartof-1208.ts` — **AUCUNE écriture en base n'a été faite.**
> Base cible : cloud production Supabase. L'écriture réelle (`WRITE=1`) est une **étape séparée**, à lancer uniquement après validation de ce rapport par Laurent.

## 1. Vue d'ensemble

| Source | Export 12/08 | En base (avant) |
| --- | --- | --- |
| Apprenants | 272 | 327 personnes (apprenants + formateurs + contacts) |
| Entreprises | 237 | 275 |
| Sessions | 96 | 76 |
| Inscriptions | 388 | 303 |

**Clé de fusion : UID SmartOF** (jamais l'email). Rapprochements secondaires (SIRET, nom exact, code session) listés explicitement ci-dessous pour validation.

**Ce qui va se passer au WRITE (après ta validation)** :
- **7 apprenants créés**, 1 mis à jour, 14 rapprochés par nom (UID nouvellement tracé)
- **14 entreprises créées**, 18 mises à jour, 8 rapprochées par SIRET/nom
- **16 sessions créées**, 5 mises à jour (dates/nom uniquement), ⚠ 3 créations bloquées (produit inconnu)
- **2 inscriptions créées sur des sessions existantes** + 80 sur les nouvelles sessions
- 0 prix HT/stagiaire posés (0 € → montant SmartOF) — un montant existant n'est JAMAIS écrasé
- 1 liens apprenant×entreprise créés (additifs, rôles EI_SELF/AGENT_COMMERCIAL/SALARIE)
- 14 affectations formateur créées (uniquement nouvelles sessions ou sessions sans formateur)

---

## 2. Nouveaux

### Nouveaux apprenants (7)

- PETOIN BRIAN <info@agencebristol.com>
- DABURON YANN <y.daburon@ashley-paker.fr>
- SEVRIN Julien <julien.sevrin@kwfrance.com>
- VARAVA Nataliya <varava@orpi.com>
- NICOLAS Jilbert <nicolas.jilbert@ladresse.com>
- GUERBETTE Maxime <maxime.guerbette@iadfrance.fr>
- MURRAY CHLOE <chloe.murray@imobilier.email>

### Nouvelles entreprises (14)

- PETOIN - BRISTOL (SIRET 79836858500047) — PA AGEFICE : AGEFICE 06
- AGEFICE 04
- COMMISSAIRE KARINE (SIRET 38316198100071) — PA AGEFICE : AGEFICE 06
- FORLANI Gavina (SIRET 48306131300035) — PA AGEFICE : AGEFICE 06
- TOUATI JEREMY (SIRET 84917341400038) — PA AGEFICE : AGEFICE 06
- MCH ORPI
- Don-Christopher DUMLAO (SIRET 94223490700015) — PA AGEFICE : AGEFICE 06
- MR SEVRIN JULIEN (SIRET 83910268800026) — PA AGEFICE : AGEFICE 06
- Pastorino Immobilier (SIRET 93284464000015) — PA AGEFICE : AGEFICE 06
- VARAVA (SIRET 83053306300020) — PA AGEFICE : AGEFICE 06
- Yann DABURON (SIRET 94418183300012)
- SAS NS ANTIBES IMMOBILIER (SIRET 90169239200011)
- Ashley&Parker (SIRET 91809967200019)
- FERRARI (SIRET 91809967200019) — PA AGEFICE : AGEFICE 06 — ⚠ SIRET IDENTIQUE à « Ashley&Parker » dans le même export (à vérifier)

### Nouvelles sessions (16)

- SES-0069 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (14/05/2026 → 14/05/2026) — statut SmartOF : Validée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0102 — L'intelligence artificielle au service des conseillers immobiliers (72h) (28/07/2026 → 07/08/2026) — statut SmartOF : En projet — produit : L'intelligence artificielle au service des conseillers immobiliers (72h) — 2 inscription(s)
- SES-0071 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (29/05/2026 → 29/05/2026) — statut SmartOF : Validée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0008 — PRÉ-INSCRIPTION A VOTRE FUTURE FORMATION (Les dates de votre formation seront fournies ultérieurement) (01/01/2026 → 31/12/2026) — statut SmartOF : Validée — produit : L'IA au service des conseillers immobiliers (8h) — 68 inscription(s) — ⚠ durée inhabituelle (365 j) : confirmer avant création
- SES-0061 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (20/03/2026 → 20/03/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0070 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (21/05/2026 → 21/05/2026) — statut SmartOF : Validée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0068 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (07/05/2026 → 07/05/2026) — statut SmartOF : Validée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0100 — L'intelligence artificielle au service des conseillers immobiliers (72h) (27/07/2026 → 06/08/2026) — statut SmartOF : En projet — produit : L'intelligence artificielle au service des conseillers immobiliers (72h) — 10 inscription(s)
- SES-0062 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (26/03/2026 → 26/03/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0105 — Session de Formation IA Optimo Service transactions (14/09/2026 → 14/09/2026) — statut SmartOF : En projet — produit : L'intelligence artificielle au service des conseillers immobiliers (72h) — 0 inscription(s)
- SES-0067 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (30/04/2026 → 30/04/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0064 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (09/04/2026 → 09/04/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0066 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (23/04/2026 → 23/04/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0065 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (16/04/2026 → 16/04/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0060 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (12/03/2026 → 12/03/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)
- SES-0063 — Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 (02/04/2026 → 02/04/2026) — statut SmartOF : Annulée — produit : Immobilier : gagnez 2h par jour grâce à l’IA - 8h00 — 0 inscription(s)

### Nouvelles inscriptions (sur sessions déjà en base) (2)

- STEVE NOEL → SES-0096 — payeur : NOEL Steve — 3024.00 € HT
- COMMISSAIRE KARINE → SES-0097 — payeur : COMMISSAIRE KARINE — 3024.00 € HT

### Nouveaux liens apprenant × entreprise (1)

- FONTAINE VANESSA → FONTAINE Vanessa [EI_SELF]

### Nouvelles affectations formateur (14)

- Nicolas GOSSART → SES-0069 (nouvelle session, formateur principal)
- Jean-Guy OURMIÈRES → SES-0102 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0071 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0061 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0070 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0068 (nouvelle session, formateur principal)
- Jean-Guy OURMIÈRES → SES-0100 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0062 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0067 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0064 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0066 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0065 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0060 (nouvelle session, formateur principal)
- Nicolas GOSSART → SES-0063 (nouvelle session, formateur principal)

> ℹ️ Les **80 inscriptions des nouvelles sessions** seront créées avec elles (payeur = commanditaire SmartOF, prix HT = budget commanditaire ÷ nb d'apprenants).

---

## 3. Mises à jour (champs modifiés, avant → après)

### Apprenants mis à jour (UID connu) (1 fiches)

| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |
| --- | --- | --- | --- |
| BARRIERE Marc | Email | marc@conceptpatrimoine.fr | marc_barriere@hotmail.fr |

### Entreprises mises à jour (UID connu) (18 fiches)

| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |
| --- | --- | --- | --- |
| BELINGARD Charline (SIRET 98138517200011) | Forme juridique (NON appliquée — info) | EI | EIRL → EIRL |
| PANCRACIO CHARLOTTE (SIRET 91965461600011) | NAF | (vide) | 6831Z |
| PANCRACIO CHARLOTTE (SIRET 91965461600011) | Représentant | (vide) | CHARLOTTE PANCRACIO |
| PANCRACIO CHARLOTTE (SIRET 91965461600011) | Activité | (vide) | Immobilier |
| PANCRACIO CHARLOTTE (SIRET 91965461600011) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| CATELAIN Stéphane (SIRET 82746214400029) | NAF | (vide) | 6831Z |
| CATELAIN Stéphane (SIRET 82746214400029) | Représentant | (vide) | Stéphane Catelain |
| CATELAIN Stéphane (SIRET 82746214400029) | RCS | (vide) | Antibes |
| CATELAIN Stéphane (SIRET 82746214400029) | Activité | (vide) | immobilier |
| CATELAIN Stéphane (SIRET 82746214400029) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| AGENCE IMMOBILIERE LES CIGALES (SIRET 48144228300026) | SIRET | (vide) | 48144228300026 |
| AGENCE IMMOBILIERE LES CIGALES (SIRET 48144228300026) | Téléphone | (vide) | 0494440344 |
| AGENCE IMMOBILIERE LES CIGALES (SIRET 48144228300026) | Email | (vide) | saintraphael@nestenn.com |
| AGENCE IMMOBILIERE LES CIGALES (SIRET 48144228300026) | Adresse (rue) | (vide) | 60 rue Gambetta |
| AGENCE IMMOBILIERE LES CIGALES (SIRET 48144228300026) | Adresse (CP) | (vide) | 83700 |
| AGENCE IMMOBILIERE LES CIGALES (SIRET 48144228300026) | Adresse (ville) | (vide) | Saint Raphaël |
| Solution Immobilier (SIRET 95352516900025) | NAF | (vide) | 6831Z |
| Solution Immobilier (SIRET 95352516900025) | Représentant | (vide) | Baptiste Quilichini |
| Solution Immobilier (SIRET 95352516900025) | RCS | (vide) | Antibes |
| Solution Immobilier (SIRET 95352516900025) | Activité | (vide) | immobilier |
| Solution Immobilier (SIRET 95352516900025) | Forme juridique (NON appliquée — info) | AUTRE | EIRL → EIRL |
| PERRIEN Eric (SIRET 94386684800014) | NAF | (vide) | 4619B |
| PERRIEN Eric (SIRET 94386684800014) | Représentant | (vide) | Eric Perrien |
| PERRIEN Eric (SIRET 94386684800014) | RCS | (vide) | Antibes |
| PERRIEN Eric (SIRET 94386684800014) | Activité | (vide) | immobilier |
| PERRIEN Eric (SIRET 94386684800014) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| BARRIERE Marc (SIRET 88087175100017) | Email | marc@conceptpatrimoine.fr | marc_barriere@hotmail.fr |
| FABBRE JESSICA (SIRET 88227052300013) | NAF | (vide) | 4619B |
| FABBRE JESSICA (SIRET 88227052300013) | Représentant | (vide) | JESSICA FABBRE |
| FABBRE JESSICA (SIRET 88227052300013) | Activité | (vide) | Immobilier |
| FABBRE JESSICA (SIRET 88227052300013) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| Yannick RUSSO (SIRET 83806339400020) | NAF | (vide) | 4619B |
| Yannick RUSSO (SIRET 83806339400020) | Représentant | (vide) | YANNICK RUSSO |
| Yannick RUSSO (SIRET 83806339400020) | Activité | (vide) | Immobilier |
| Yannick RUSSO (SIRET 83806339400020) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| Olivier Besset | Raison sociale | BESSET Olivier | Olivier Besset |
| TAYLOR BRIVAL (SIRET 80972230900030) | NAF | (vide) | 4619B |
| TAYLOR BRIVAL (SIRET 80972230900030) | Téléphone | (vide) | 0650781396 |
| TAYLOR BRIVAL (SIRET 80972230900030) | Email | (vide) | taylor972m@gmail.com |
| TAYLOR BRIVAL (SIRET 80972230900030) | Activité | (vide) | IMMOBILIER |
| TAYLOR BRIVAL (SIRET 80972230900030) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| NOEL Steve (SIRET 94875522800038) | Représentant | (vide) | NOEL Steve |
| NOEL Steve (SIRET 94875522800038) | RCS | (vide) | Cannes |
| NOEL Steve (SIRET 94875522800038) | Activité | (vide) | immobilier |
| NOEL Steve (SIRET 94875522800038) | Forme juridique (NON appliquée — info) | AUTO_ENTREPRENEUR | Entreprise Individuel (EI) → EI |
| BESSET Olivier | NAF | (vide) | 6619B |
| BESSET Olivier | Représentant | (vide) | Olivier BESSET |
| BESSET Olivier | RCS | (vide) | Nice |
| BESSET Olivier | Activité | (vide) | Courtage |
| BESSET Olivier | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| KRETCHMANN Pierre (SIRET 51210499300039) | NAF | (vide) | 4619B |
| KRETCHMANN Pierre (SIRET 51210499300039) | Représentant | (vide) | PIERRE KRETCHMANN |
| KRETCHMANN Pierre (SIRET 51210499300039) | Activité | (vide) | Immobilier |
| KRETCHMANN Pierre (SIRET 51210499300039) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| KING Kristin | NAF | (vide) | 6831Z |
| KING Kristin | Représentant | (vide) | Kristin King |
| KING Kristin | RCS | (vide) | Nice |
| KING Kristin | Activité | (vide) | immobilier |
| KING Kristin | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| QUILICHINI Florent (SIRET 87893821600016) | NAF | (vide) | 6831Z |
| QUILICHINI Florent (SIRET 87893821600016) | Représentant | (vide) | Florent Quilichini |
| QUILICHINI Florent (SIRET 87893821600016) | RCS | (vide) | Cannes |
| QUILICHINI Florent (SIRET 87893821600016) | Activité | (vide) | immobilier |
| QUILICHINI Florent (SIRET 87893821600016) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| TOURNECUILLERT Marc (SIRET 44278580400026) | NAF | (vide) | 6831Z |
| TOURNECUILLERT Marc (SIRET 44278580400026) | Représentant | (vide) | Marc Tournecuillert |
| TOURNECUILLERT Marc (SIRET 44278580400026) | RCS | (vide) | Nice |
| TOURNECUILLERT Marc (SIRET 44278580400026) | Activité | (vide) | immobilier |
| TOURNECUILLERT Marc (SIRET 44278580400026) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |
| QUILICHINI Baptiste (SIRET 81095131900021) | NAF | (vide) | 6820A |
| QUILICHINI Baptiste (SIRET 81095131900021) | Représentant | (vide) | Baptiste Quilichini |
| QUILICHINI Baptiste (SIRET 81095131900021) | RCS | (vide) | Antibes |
| QUILICHINI Baptiste (SIRET 81095131900021) | Activité | (vide) | immobilier |
| QUILICHINI Baptiste (SIRET 81095131900021) | Forme juridique (NON appliquée — info) | AUTRE | Entreprise Individuel (EI) → EI |

### Sessions mises à jour (dates / nom) (5 fiches)

| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |
| --- | --- | --- | --- |
| SES-0096 | Nom | Claude d'anthropic pour les conseillers immobiliers - 25/05/2026 | L'intelligence artificielle au service des conseillers immobiliers (72h) |
| SES-0101 | Nom | L'IA au service des conseillers immobiliers (8h) - 27/07/2026 | L'IA au service des conseillers immobiliers (8h) |
| SES-0082 | Date de début | 11/04/2026 | 10/04/2026 |
| SES-0082 | Date de fin | 11/04/2026 | 10/04/2026 |
| SES-0086 | Nom | TRACFIN | Tracfin 4h |
| SES-0097 | Nom | L'intelligence artificielle au service des conseillers immobiliers (72h) - 27/07/2026 | L'intelligence artificielle au service des conseillers immobiliers (72h) |

### Prix HT/stagiaire posés (0 € en base → montant SmartOF)

_Aucun._

### N° de sécurité sociale ajoutés/modifiés (valeurs masquées — RGPD) (11)

- DUMLAO Don (nouveau)
- BENSOURI Jihane (nouveau)
- BROSSARD Vincent (nouveau)
- TOURNIAIRE Nicolas (nouveau)
- LAUGIER JULIEN (nouveau)
- LECRUBIER Caroline (nouveau)
- MONFORT Adrien (nouveau)
- FORLANI Gavina (nouveau)
- PASTORINO Corentin (nouveau)
- FERRARI stephane (nouveau)
- LASSELIN Sophie (modifié)

### Profils AGEFICE (PA) mis à jour (19)

- PANCRACIO CHARLOTTE : PA AGEFICE (vide) → AGEFICE 06
- CATELAIN Stéphane : PA AGEFICE (vide) → AGEFICE 06
- Caroline LECRUBIER : PA AGEFICE (vide) → AGEFICE 06
- Jihane Bensouri : PA AGEFICE (vide) → AGEFICE 06
- Julien Laugier : PA AGEFICE (vide) → AGEFICE 04
- PERRIEN Eric : PA AGEFICE (vide) → AGEFICE 06
- Vincent Brossard : PA AGEFICE (vide) → AGEFICE 06
- FABBRE JESSICA : PA AGEFICE (vide) → AGEFICE 06
- Yannick RUSSO : PA AGEFICE (vide) → AGEFICE 06
- M&H IMMO : PA AGEFICE (vide) → AGEFICE 06
- TAYLOR BRIVAL : PA AGEFICE (vide) → AGEFICE 06
- LASSELIN : PA AGEFICE (vide) → AGEFICE 14 CCI DE CAEN
- NOEL Steve : PA AGEFICE (vide) → AGEFICE 06
- KRETCHMANN Pierre : PA AGEFICE (vide) → AGEFICE 06
- KING Kristin : PA AGEFICE (vide) → AGEFICE 06
- Nicolas Tourniaire : PA AGEFICE (vide) → AGEFICE 06
- QUILICHINI Florent : PA AGEFICE (vide) → AGEFICE 06
- TOURNECUILLERT Marc : PA AGEFICE (vide) → AGEFICE 06
- QUILICHINI Baptiste : PA AGEFICE (vide) → AGEFICE 06


---

## 4. Rapprochements à VALIDER (UID SmartOF inconnu → fiche existante trouvée)

Ces fiches existent en base **sans UID SmartOF tracé**. Le script propose de les rapprocher (l'UID sera attaché, les champs non vides mis à jour). **Vérifier qu'il ne s'agit pas d'homonymes.**

### Apprenants rapprochés par nom+prénom exact (14 fiches)

| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |
| --- | --- | --- | --- |
| DUMLAO Don | Civilité | (vide) | Monsieur |
| DUMLAO Don | Date de naissance | — | 14/02/1987 |
| DUMLAO Don | Email | d.dumlaro@ashley-parker.fr | d.dumlao@ashley-parker.fr |
| DUMLAO Don | Adresse (rue) | (vide) | 239, Bd du Mont Boron |
| DUMLAO Don | Adresse (CP) | (vide) | 06300 |
| DUMLAO Don | Adresse (ville) | (vide) | Nice |
| DUMLAO Don | Niveau d'étude | (vide) | Bac-Bac pro-BT-BP |
| DUMLAO Don | Expérience dirigeant | (vide) | Entre 1 et 3 ans |
| DUMLAO Don | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| BENSOURI Jihane | Nom de naissance | (vide) | Bensouri |
| BENSOURI Jihane | Date de naissance | — | 01/04/1996 |
| BENSOURI Jihane | Adresse (rue) | (vide) | 185 Promenade des Anglais |
| BENSOURI Jihane | Adresse (CP) | (vide) | 06200 |
| BENSOURI Jihane | Adresse (ville) | (vide) | Nice |
| BENSOURI Jihane | Niveau d'étude | (vide) | Bac+3 : Licence ou maîtrise |
| BENSOURI Jihane | Expérience dirigeant | (vide) | Entre 1 et 3 ans |
| BENSOURI Jihane | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| BROSSARD Vincent | Civilité | (vide) | Monsieur |
| BROSSARD Vincent | Date de naissance | — | 04/08/1975 |
| BROSSARD Vincent | Adresse (rue) | (vide) | 15 AV ALFRED BORRIGLIONE |
| BROSSARD Vincent | Adresse (CP) | (vide) | 06000 |
| BROSSARD Vincent | Adresse (ville) | (vide) | NICE |
| BROSSARD Vincent | Niveau d'étude | (vide) | Bac+3 : Licence ou maîtrise |
| BROSSARD Vincent | Expérience dirigeant | (vide) | Plus de 10 ans |
| BROSSARD Vincent | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| TOURNIAIRE Nicolas | Date de naissance | — | 19/10/1999 |
| TOURNIAIRE Nicolas | Adresse (rue) | (vide) | 18 AV DES MIMOSAS |
| TOURNIAIRE Nicolas | Adresse (CP) | (vide) | 06800 |
| TOURNIAIRE Nicolas | Adresse (ville) | (vide) | CAGNES SUR MER |
| TOURNIAIRE Nicolas | Niveau d'étude | (vide) | Bac+3 : Licence ou maîtrise |
| TOURNIAIRE Nicolas | Expérience dirigeant | (vide) | Entre 1 et 3 ans |
| TOURNIAIRE Nicolas | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| LAUGIER JULIEN | Nom de naissance | (vide) | Laugier |
| LAUGIER JULIEN | Date de naissance | — | 10/06/2004 |
| LAUGIER JULIEN | Adresse (rue) | (vide) | 540 Route des Selves |
| LAUGIER JULIEN | Adresse (CP) | (vide) | 04320 |
| LAUGIER JULIEN | Adresse (ville) | (vide) | Castellet-Les-Sausses |
| LAUGIER JULIEN | Niveau d'étude | (vide) | Bac+2 : BTS-DUT-DEUG |
| LAUGIER JULIEN | Expérience dirigeant | (vide) | Entre 1 et 3 ans |
| LAUGIER JULIEN | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| LECRUBIER Caroline | Date de naissance | — | 29/03/1973 |
| LECRUBIER Caroline | Email | c.lecrubier@ashley-parker.fr | caroline.lecrubier@gmail.com |
| LECRUBIER Caroline | Adresse (rue) | (vide) | 1 avenue DESAMBROIS |
| LECRUBIER Caroline | Adresse (CP) | (vide) | 06000 |
| LECRUBIER Caroline | Adresse (ville) | (vide) | Nice |
| LECRUBIER Caroline | Niveau d'étude | (vide) | Bac+2 : BTS-DUT-DEUG |
| LECRUBIER Caroline | Expérience dirigeant | (vide) | Entre 4 et 10 ans |
| LECRUBIER Caroline | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| MONFORT Adrien | Civilité | M. | Monsieur |
| MONFORT Adrien | Téléphone | 06637946270 | 0663794627 |
| MONFORT Adrien | Adresse (rue) | (vide) | 87 AV FRANCISQUE PERRAUD |
| MONFORT Adrien | Niveau d'étude | (vide) | Bac+5 : Supérieur à la maîtrise |
| MONFORT Adrien | Fonction | (vide) | AGENT COMMERCIAL |
| MONFORT Adrien | Expérience dirigeant | (vide) | Plus de 10 ans |
| MONFORT Adrien | Statut BPF | F.4 - Travailleurs indépendants, professions libérales, professions non salariées et autres | F.1.a - Salariés d’employeurs privés hors apprentis |
| FORLANI Gavina | Civilité | (vide) | Madame |
| FORLANI Gavina | Date de naissance | — | 29/04/1968 |
| FORLANI Gavina | Adresse (rue) | (vide) | 70 BD CARNOT |
| FORLANI Gavina | Adresse (ville) | (vide) | 06300 |
| FORLANI Gavina | Niveau d'étude | (vide) | Bac-Bac pro-BT-BP |
| FORLANI Gavina | Expérience dirigeant | (vide) | Entre 4 et 10 ans |
| FORLANI Gavina | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| PASTORINO Corentin | Civilité | (vide) | Monsieur |
| PASTORINO Corentin | Nom de naissance | (vide) | Pastorino |
| PASTORINO Corentin | Date de naissance | — | 29/01/2004 |
| PASTORINO Corentin | Email | (vide) | corentinpastorino@gmail.com |
| PASTORINO Corentin | Adresse (rue) | (vide) | 40 RTE DE LA MANDA |
| PASTORINO Corentin | Adresse (CP) | (vide) | 06670 |
| PASTORINO Corentin | Adresse (ville) | (vide) | COLOMARS |
| PASTORINO Corentin | Niveau d'étude | (vide) | Bac-Bac pro-BT-BP |
| PASTORINO Corentin | Expérience dirigeant | (vide) | Entre 1 et 3 ans |
| PASTORINO Corentin | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| FERRARI stephane | Nom de naissance | (vide) | ferrari |
| FERRARI stephane | Date de naissance | — | 05/08/1987 |
| FERRARI stephane | Adresse (rue) | (vide) | 1 rue jean baptiste barili |
| FERRARI stephane | Adresse (CP) | (vide) | 06000 |
| FERRARI stephane | Adresse (ville) | (vide) | nice |
| FERRARI stephane | Niveau d'étude | (vide) | BEP-CAP |
| FERRARI stephane | Expérience dirigeant | (vide) | Entre 4 et 10 ans |
| FERRARI stephane | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| LASSELIN Sophie | Civilité | Mme | Madame |
| LASSELIN Sophie | Nom de naissance | (vide) | Lasselin |
| LASSELIN Sophie | Niveau d'étude | (vide) | Bac+2 : BTS-DUT-DEUG |
| LASSELIN Sophie | Expérience dirigeant | PLUS_10_ANS | Plus de 10 ans |
| LASSELIN Sophie | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| TOUATI JEREMY | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |
| BRIVAL Taylor | Nom de naissance | (vide) | Taylor Brival |
| COMMISSAIRE KARINE | Statut BPF | (vide) | F.1.a - Salariés d’employeurs privés hors apprentis |

### Entreprises rapprochées par SIRET (2 fiches)

| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |
| --- | --- | --- | --- |
| M&H IMMO (SIRET 82057254300024) | Raison sociale | Adrien MONFORT | M&H IMMO |
| M&H IMMO (SIRET 82057254300024) | NAF | (vide) | 6831Z |
| M&H IMMO (SIRET 82057254300024) | Téléphone | (vide) | 0663794627 |
| M&H IMMO (SIRET 82057254300024) | Email | (vide) | adrien.monfort@ladresse.com |
| M&H IMMO (SIRET 82057254300024) | Adresse (rue) | (vide) | Canéopole, 11 CHEMIN DE L'INDUSTRIE |
| M&H IMMO (SIRET 82057254300024) | Adresse (CP) | (vide) | 06110 |
| M&H IMMO (SIRET 82057254300024) | Adresse (ville) | (vide) | LE CANNET |
| M&H IMMO (SIRET 82057254300024) | RCS | (vide) | CANNES |
| M&H IMMO (SIRET 82057254300024) | Activité | (vide) | Conseiller Immobilier |
| LASSELIN (SIRET 48369783500062) | Raison sociale | Sophie LASSELIN | LASSELIN |
| LASSELIN (SIRET 48369783500062) | Téléphone | (vide) | 0616299341 |
| LASSELIN (SIRET 48369783500062) | Email | (vide) | s.lasselin@ashley-parker.fr |
| LASSELIN (SIRET 48369783500062) | Adresse (rue) | (vide) | 29 RUE TRINITE |
| LASSELIN (SIRET 48369783500062) | Adresse (CP) | (vide) | 14700 |
| LASSELIN (SIRET 48369783500062) | Adresse (ville) | (vide) | FALAISE |
| LASSELIN (SIRET 48369783500062) | Activité | (vide) | IMMOBILIER |
| LASSELIN (SIRET 48369783500062) | Forme juridique (NON appliquée — info) | AUTO_ENTREPRENEUR | Entreprise Individuel (EI) → EI |

### Entreprises rapprochées par raison sociale (6 fiches)

| Fiche | Champ | Avant (base) | Après (SmartOF 12/08) |
| --- | --- | --- | --- |
| Caroline LECRUBIER (SIRET 89405023600013) | SIRET | (vide) | 89405023600013 |
| Caroline LECRUBIER (SIRET 89405023600013) | NAF | (vide) | 6831Z |
| Caroline LECRUBIER (SIRET 89405023600013) | Téléphone | (vide) | 0666045645 |
| Caroline LECRUBIER (SIRET 89405023600013) | Email | (vide) | c.lecrubier@ashley-parker.fr |
| Caroline LECRUBIER (SIRET 89405023600013) | Adresse (rue) | (vide) | 1 avenue DESAMBROIS |
| Caroline LECRUBIER (SIRET 89405023600013) | Adresse (CP) | (vide) | 06000 |
| Caroline LECRUBIER (SIRET 89405023600013) | Adresse (ville) | (vide) | NICE |
| Caroline LECRUBIER (SIRET 89405023600013) | Activité | (vide) | IMMOBILIER |
| Jihane Bensouri (SIRET 93442362500011) | SIRET | (vide) | 93442362500011 |
| Jihane Bensouri (SIRET 93442362500011) | NAF | (vide) | 6831Z |
| Jihane Bensouri (SIRET 93442362500011) | Téléphone | (vide) | 0769169736 |
| Jihane Bensouri (SIRET 93442362500011) | Email | (vide) | j.bensouri@ashley-parker.fr |
| Jihane Bensouri (SIRET 93442362500011) | Adresse (rue) | (vide) | 185A PRO DES ANGLAIS |
| Jihane Bensouri (SIRET 93442362500011) | Adresse (CP) | (vide) | 06200 |
| Jihane Bensouri (SIRET 93442362500011) | Adresse (ville) | (vide) | nice |
| Jihane Bensouri (SIRET 93442362500011) | Activité | (vide) | immobilier |
| Jihane Bensouri (SIRET 93442362500011) | Forme juridique (NON appliquée — info) | EI | AUTRE → AUTRE |
| Julien Laugier (SIRET 93288125300011) | SIRET | (vide) | 93288125300011 |
| Julien Laugier (SIRET 93288125300011) | NAF | (vide) | 6831Z |
| Julien Laugier (SIRET 93288125300011) | Téléphone | (vide) | 0650205339 |
| Julien Laugier (SIRET 93288125300011) | Email | (vide) | julien.laugier4@gmail.com |
| Julien Laugier (SIRET 93288125300011) | Adresse (rue) | (vide) | ROUTES LES SELVES |
| Julien Laugier (SIRET 93288125300011) | Adresse (CP) | (vide) | 04320 |
| Julien Laugier (SIRET 93288125300011) | Adresse (ville) | (vide) | CASTELLET-LES-SAUSSES |
| Julien Laugier (SIRET 93288125300011) | Activité | (vide) | IMMOBILIER |
| Julien Laugier (SIRET 93288125300011) | Forme juridique (NON appliquée — info) | EI | AUTRE → AUTRE |
| Vincent Brossard (SIRET 48356219500055) | SIRET | (vide) | 48356219500055 |
| Vincent Brossard (SIRET 48356219500055) | NAF | (vide) | 6831Z |
| Vincent Brossard (SIRET 48356219500055) | Téléphone | (vide) | 0676937342 |
| Vincent Brossard (SIRET 48356219500055) | Email | (vide) | v.brossard@ashley-parker.fr |
| Vincent Brossard (SIRET 48356219500055) | Adresse (rue) | (vide) | 15 AV ALFRED BORRIGLIONE |
| Vincent Brossard (SIRET 48356219500055) | Adresse (CP) | (vide) | 06100 |
| Vincent Brossard (SIRET 48356219500055) | Adresse (ville) | (vide) | NICE |
| Vincent Brossard (SIRET 48356219500055) | Activité | (vide) | IMMOBILIER |
| ASHLEY PARKER (SIRET 88167888200021) | SIRET | (vide) | 88167888200021 |
| ASHLEY PARKER (SIRET 88167888200021) | Adresse (rue) | (vide) | 4 boulevard carnot |
| ASHLEY PARKER (SIRET 88167888200021) | Adresse (CP) | (vide) | 06300 |
| ASHLEY PARKER (SIRET 88167888200021) | Adresse (ville) | (vide) | Nice |
| Nicolas Tourniaire (SIRET 98383705500018) | SIRET | (vide) | 98383705500018 |
| Nicolas Tourniaire (SIRET 98383705500018) | NAF | (vide) | 6831Z |
| Nicolas Tourniaire (SIRET 98383705500018) | Téléphone | (vide) | 0617144856 |
| Nicolas Tourniaire (SIRET 98383705500018) | Email | (vide) | n.tourniaire@ashley-parker.fr |
| Nicolas Tourniaire (SIRET 98383705500018) | Adresse (rue) | (vide) | 18 AV DES MIMOSAS |
| Nicolas Tourniaire (SIRET 98383705500018) | Adresse (CP) | (vide) | 06800 |
| Nicolas Tourniaire (SIRET 98383705500018) | Adresse (ville) | (vide) | CAGNES SUR MER |
| Nicolas Tourniaire (SIRET 98383705500018) | Activité | (vide) | IMMOBILIER |

### Sessions rapprochées par code (3)

- SES-0096 (UID SmartOF nouvellement tracé)
- SES-0101 (UID SmartOF nouvellement tracé)
- SES-0097 (UID SmartOF nouvellement tracé)


---

## 5. Conflits / ambiguïtés — ARBITRAGE REQUIS (rien ne sera écrit sur ces points)

### ⚠ Homonymes (UID inconnu, plusieurs candidats en base)

_Aucun._

### ⚠ Montants divergents (base ≠ SmartOF, tous deux non nuls) (72)

- LOUVRIER Marie Eglantine → SES-0027 : base 2452.00 € HT ≠ SmartOF 1600.00 € HT — NON appliqué, arbitrage requis
- LE CABELLEC Béatrice → SES-0034 : base 2500.00 € HT ≠ SmartOF 2625.00 € HT — NON appliqué, arbitrage requis
- MARZIAC Sébastien → SES-0034 : base 2500.00 € HT ≠ SmartOF 2625.00 € HT — NON appliqué, arbitrage requis
- DU ROY DE CHAUMARAY SYND UP Charlotte → SES-0029 : base 2000.00 € HT ≠ SmartOF 3080.00 € HT — NON appliqué, arbitrage requis
- GÉRAUD TAURINO Franco → SES-0029 : base 120.00 € HT ≠ SmartOF 3080.00 € HT — NON appliqué, arbitrage requis
- DARCEL Florian → SES-0042 : base 2500.00 € HT ≠ SmartOF 2625.00 € HT — NON appliqué, arbitrage requis
- NEVES CORREIA Jennifer → SES-0042 : base 2500.00 € HT ≠ SmartOF 2625.00 € HT — NON appliqué, arbitrage requis
- NEVES CORREIA Ramiro → SES-0042 : base 2500.00 € HT ≠ SmartOF 2625.00 € HT — NON appliqué, arbitrage requis
- LEYRAT Jean → SES-0077 : base 240.00 € HT ≠ SmartOF 480.00 € HT — NON appliqué, arbitrage requis
- MAIETTA EVIMERIA Anthony → SES-0077 : base 240.00 € HT ≠ SmartOF 480.00 € HT — NON appliqué, arbitrage requis
- DAMPENON Alexandre → SES-0018 : base 1600.00 € HT ≠ SmartOF 3080.00 € HT — NON appliqué, arbitrage requis
- BESSET Olivier → SES-0018 : base 1600.00 € HT ≠ SmartOF 3080.00 € HT — NON appliqué, arbitrage requis
- RUFFO Caroline → SES-0018 : base 1600.00 € HT ≠ SmartOF 3080.00 € HT — NON appliqué, arbitrage requis
- LAFITTE Angélique → SES-0018 : base 600.00 € HT ≠ SmartOF 3080.00 € HT — NON appliqué, arbitrage requis
- SAGLIER Manuèle → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- BUIRON NEYRAT IMMO Sandrine → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- PEREIRA Justine → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- LAMBERT Virginie → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- MONNOT Caroline → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- BAGGIANI NEYRAT IMMO Alexia → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- BOUSQUET NEYRAT IMMO Bruno → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- RABIAN NEYRAT IMMO Françoise → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- FONTENEAU NEYRAT IMMO Philippe → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- BLANDIN NEYRAT IMMO Karine → SES-0079 : base 315.43 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- FONTAINE NEYRAT IMMO Vanessa → SES-0079 : base 672.00 € HT ≠ SmartOF 218.18 € HT — NON appliqué, arbitrage requis
- SIMEONE Loic → SES-0031 : base 900.00 € HT ≠ SmartOF 3024.00 € HT — NON appliqué, arbitrage requis
- BERREBI Anu → SES-0086 : base 144.00 € HT ≠ SmartOF 168.00 € HT — NON appliqué, arbitrage requis
- MICHELS (RIVIERA ESTATE) Laetitia → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- LOTTIER (RIVIERA ESTATE) Aurélie → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- MULLIGAN (RIVIERA ESTATE) Kati → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- VOUILLAMOZ Eric → SES-0086 : base 144.00 € HT ≠ SmartOF 168.00 € HT — NON appliqué, arbitrage requis
- OLMO (RIVIERA ESTATE) Anne Marie → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- LATANZA Sara → SES-0086 : base 168.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- KHELIFI (RIVIERA ESTATE) Katia → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- BALKIN (RIVIERA ESTATES) Alex → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- GOURCI (RIVIERA ESTATE) Pauline → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- LALLART (RIVIERA ESTATE) Laurence → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- PARTYKA (RIVIERA ESTATE) Julia → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- SHACKLTON (RIVIERA ESTATE) Domino → SES-0086 : base 144.00 € HT ≠ SmartOF 109.09 € HT — NON appliqué, arbitrage requis
- BARRIERE Marc → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- GRIMALDI Carla → SES-0002 : base 2903.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- DRIARD Charles → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- SPINELLI Manon → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- BARRIÈRE Anthony → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- DAVID Vincent → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- PANCRAZI Marlène → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- ROUX Sébastien → SES-0002 : base 3045.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- SIMEONE Loic → SES-0002 : base 644.00 € HT ≠ SmartOF 304.50 € HT — NON appliqué, arbitrage requis
- GUIGUE NEYRAT IMMO Antoine → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- RUSSO NEYRAT IMMO Lucie → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- TETE NEYRAT IMMO Emmanuel → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- RICHEBOIS Germain → SES-0050 : base 500.00 € HT ≠ SmartOF 672.00 € HT — NON appliqué, arbitrage requis
- LECUELLE Antonin → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- NEYRAT Bastien → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- GUIGUE NEYRAT IMMO John → SES-0050 : base 672.00 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- MIARINI Léo → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- BONNEAU NEYRAT IMMO Anastasia → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- DUMONTEIL Noémie → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- DECHEMARDIN Bruno → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- CONTASSOT NEYRAT IMMO Denis → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- VOYON NEYRAT IMMO Deborah → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- MOISSET NEYRAT IMMO Véronique → SES-0050 : base 418.56 € HT ≠ SmartOF 184.62 € HT — NON appliqué, arbitrage requis
- FOURNEAU ( SOLUTION IMMO ) Johanna → SES-0092 : base 672.00 € HT ≠ SmartOF 480.00 € HT — NON appliqué, arbitrage requis
- KLUMPER ( SOLUTION IMMO ) Jami → SES-0092 : base 672.00 € HT ≠ SmartOF 480.00 € HT — NON appliqué, arbitrage requis
- SEVIERI Franck → SES-0022 : base 2364.00 € HT ≠ SmartOF 3024.00 € HT — NON appliqué, arbitrage requis
- BOUKHOBZA AGENCE ALBERT 1ER Charles → SES-0030 : base 925.00 € HT ≠ SmartOF 2160.00 € HT — NON appliqué, arbitrage requis
- JOZWICKI Sandra → SES-0030 : base 2851.20 € HT ≠ SmartOF 3024.00 € HT — NON appliqué, arbitrage requis
- CANDEAGO Audrey → SES-0009 : base 297.60 € HT ≠ SmartOF 240.00 € HT — NON appliqué, arbitrage requis
- MOLINIER HABITAT CONCEPT IMMO Julien → SES-0040 : base 336.00 € HT ≠ SmartOF 240.00 € HT — NON appliqué, arbitrage requis
- NADJII HABITAT CONCEPT IMMO Naouel → SES-0040 : base 336.00 € HT ≠ SmartOF 240.00 € HT — NON appliqué, arbitrage requis
- MOLINIER HABITAT CONCEPT IMMO Dominique → SES-0040 : base 336.00 € HT ≠ SmartOF 240.00 € HT — NON appliqué, arbitrage requis
- MOLINIER HABITAT CONCEPT IMMO Sophie → SES-0040 : base 336.00 € HT ≠ SmartOF 240.00 € HT — NON appliqué, arbitrage requis

### ⚠ Payeurs divergents (sponsor en base ≠ commanditaire SmartOF) (30)

- LIMA Nelson → SES-0027 : payeur base "Nelson LIMA" ≠ SmartOF "TEAM PRIMOS (Le Castel Real estate)" — NON appliqué (corrections manuelles protégées)
- LANIER Johan → SES-0015 : payeur base "Harald STARKE" ≠ SmartOF "Riviera Keys" — NON appliqué (corrections manuelles protégées)
- BRIVAL Taylor → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "TAYLOR BRIVAL" — NON appliqué (corrections manuelles protégées)
- LECRUBIER Caroline → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "Caroline LECRUBIER" — NON appliqué (corrections manuelles protégées)
- LAUGIER JULIEN → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "Julien Laugier" — NON appliqué (corrections manuelles protégées)
- BENSOURI Jihane → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "Jihane Bensouri" — NON appliqué (corrections manuelles protégées)
- LASSELIN Sophie → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "LASSELIN" — NON appliqué (corrections manuelles protégées)
- BROSSARD Vincent → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "Vincent Brossard" — NON appliqué (corrections manuelles protégées)
- TOURNIAIRE Nicolas → SES-0101 : payeur base "ASHLEY PARKER" ≠ SmartOF "Nicolas Tourniaire" — NON appliqué (corrections manuelles protégées)
- SIMEONE Loic → SES-0031 : payeur base "Loic SIMEONE" ≠ SmartOF "LS PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- DONJON Valérie → SES-0051 : payeur base "VALERIE PERRIER" ≠ SmartOF "PERRIER Valérie" — NON appliqué (corrections manuelles protégées)
- OUABID Said → SES-0005 : payeur base "OUABID Saïd" ≠ SmartOF "DELIVAUTO" — NON appliqué (corrections manuelles protégées)
- BARRIERE Marc → SES-0002 : payeur base "BARRIERE Marc" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- GRIMALDI Carla → SES-0002 : payeur base "Carla GRIMALDI" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- DRIARD Charles → SES-0002 : payeur base "DRIARD Charles" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- SPINELLI Manon → SES-0002 : payeur base "Manon SPINELLI" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- MANUEL Clothilde → SES-0002 : payeur base "Sigma" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- BARRIÈRE Anthony → SES-0002 : payeur base "BARRIERE Anthony" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- DAVID Vincent → SES-0002 : payeur base "DAVID Vincent" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- PANCRAZI Marlène → SES-0002 : payeur base "PANCRAZI Marlène" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- SIMEONE Loic → SES-0002 : payeur base "Loic SIMEONE" ≠ SmartOF "CONCEPT PATRIMOINE" — NON appliqué (corrections manuelles protégées)
- LECUELLE Antonin → SES-0050 : payeur base "Neyrat immo" ≠ SmartOF "NEYRAT Immobilier Chalon sur Saone" — NON appliqué (corrections manuelles protégées)
- MIARINI Léo → SES-0050 : payeur base "Neyrat immo" ≠ SmartOF "NEYRAT Immobilier Chalon sur Saone" — NON appliqué (corrections manuelles protégées)
- DUMONTEIL Noémie → SES-0050 : payeur base "Neyrat immo" ≠ SmartOF "NEYRAT Immobilier Chalon sur Saone" — NON appliqué (corrections manuelles protégées)
- DECHEMARDIN Bruno → SES-0050 : payeur base "Neyrat immo" ≠ SmartOF "NEYRAT Immobilier Chalon sur Saone" — NON appliqué (corrections manuelles protégées)
- SAGNES - CELLENEUVE IMMOBILIER Mathilde → SES-0049 : payeur base "Eric PECOUL" ≠ SmartOF "CELLENEUVE IMMOBILIER - CABINET PECOUL" — NON appliqué (corrections manuelles protégées)
- JACQUES Laurence → SES-0044 : payeur base "Laurence GUILLEMIN" ≠ SmartOF "GUILLEMIN Laurence" — NON appliqué (corrections manuelles protégées)
- LANIER Johan → SES-0020 : payeur base "Harald STARKE" ≠ SmartOF "Riviera Keys" — NON appliqué (corrections manuelles protégées)
- CANDEAGO Audrey → SES-0009 : payeur base "Nestenn France" ≠ SmartOF "Nestenn Fréjus" — NON appliqué (corrections manuelles protégées)
- ROSSI Valérie → SES-0009 : payeur base "Delphine CHAUGNE" ≠ SmartOF "Nestenn Fréjus" — NON appliqué (corrections manuelles protégées)

### ⚠ Sessions à créer BLOQUÉES (produit SmartOF non tracé en base) (3)

- SES-0104 — Event Avec Sebastien Tedesco (01/03/2026 → 31/10/2026) — produit SmartOF "Event Avec Sebastien Tedesco" non tracé en base → création BLOQUÉE, arbitrage requis
- SES-0098 — Formation L'agence de l'olivier (30/06/2026 → 31/12/2026) — produit SmartOF "Formation L'agence de l'olivier" non tracé en base → création BLOQUÉE, arbitrage requis
- SES-0099 — Coaching Indiv / L'intelligence artificielle au service des conseillers immobiliers (72h) (24/08/2026 → 03/09/2026) — produit SmartOF "Coaching Indiv" non tracé en base → création BLOQUÉE, arbitrage requis

### ⚠ Statuts de session divergents (info — le statut QualiOF est conservé) (6)

- SES-0089 : base=VALIDATED / SmartOF=À facturer (COMPLETED) — NON appliqué (QualiOF pilote la clôture)
- SES-0094 : base=PLANNED / SmartOF=En projet (DRAFT) — NON appliqué (QualiOF pilote la clôture)
- SES-0091 : base=VALIDATED / SmartOF=À facturer (COMPLETED) — NON appliqué (QualiOF pilote la clôture)
- SES-0101 : base=PLANNED / SmartOF=En projet (DRAFT) — NON appliqué (QualiOF pilote la clôture)
- SES-0093 : base=COMPLETED / SmartOF=Validée (VALIDATED) — NON appliqué (QualiOF pilote la clôture)
- SES-0092 : base=VALIDATED / SmartOF=À facturer (COMPLETED) — NON appliqué (QualiOF pilote la clôture)

### ⚠ Produits de session divergents (info — non appliqué) (1)

- SES-0096 : produit base ≠ produit SmartOF (L'intelligence artificielle au service des conseillers immobiliers (72h)) — NON appliqué, arbitrage requis

### ⚠ Formateurs non résolus

_Aucun._

### ⚠ Inscriptions non résolues (10)

- GUERBETTE Maxime → SES-0104 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- MURRAY CHLOE → SES-0104 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- GUIGO Cameron → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- BARRIERE Marc → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- MONFORT Adrien → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- NICOLAS Jilbert → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- SEVRIN Julien → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- FLEURY Valéry → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- PETOIN BRIAN → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage
- BELINGARD Charline → SES-0099 : session à création BLOQUÉE (produit inconnu) — inscription en attente d'arbitrage

### ⚠ Rattachements non résolus (3)

- CHAUGNE Delphine × AGENCE IMMOBILIERE LES CIGALES (UID hors périmètre export)
- Guerbette Maxime ×  (UID hors périmètre export)
- MURRAY CHLOE ×  (UID hors périmètre export)

### Sessions en base ABSENTES de l'export SmartOF (aucune suppression — info)

_Aucun._


---

## 6. Ignoré volontairement (et pourquoi)

| Élément | Volume | Raison |
| --- | --- | --- |
| Créneaux de formation | 877 | L'émargement QualiOF suit la convention figée 9h-13h / 14h-18h (règle métier non négociable) ; la base n'utilise quasiment pas SessionSlot (18 en base). Importer 876 créneaux toucherait des sessions dont les documents sont déjà générés. À arbitrer séparément si besoin. |
| Charges des sessions | 1 | Coûts formateurs SmartOF — pas de modèle cible côté QualiOF (hors périmètre). |
| Statut des sessions existantes | 6 divergences | QualiOF pilote le cycle de clôture (packs, docs) ; écraser le statut casserait le workflow. Diff listé §5. |
| sponsorOrg des inscriptions existantes | 30 divergences | Des corrections manuelles existent (ex. SES-0101 EI agent commercial) — jamais d'écrasement automatique. |
| Montants : 0 € SmartOF | — | Un 0 € n'écrase JAMAIS un montant en base (règle métier Tréso). |
| Champs vides SmartOF | — | Une cellule vide n'écrase jamais une valeur en base. |
| Documents/packs QualiOF (Document, ClosureBatch, PedagogicalAsset…) | — | Jamais touchés par la sync. |
| Adresse de facturation entreprises, liens formulaire d'inscription, champs BPF session | — | Pas de champ cible en base / donnée non exploitée. |
| Fiches archivées côté SmartOF | 2 | Ignorées (— ; entreprises : AGENCE IMMOBILIERE LES CIGALES ; sessions : SES-0103 — Event Avec Sebastien Tedesco (01/05/2026 → 30/09/2026)). |
| Forme juridique des entreprises existantes | — | Jamais réécrite (corrections manuelles possibles) — divergences listées dans les tableaux §3. |

---

## 7. Étape suivante

1. **Laurent valide ce rapport** (en particulier §4 rapprochements et §5 conflits).
2. Écriture réelle (étape séparée) : `WRITE=1 pnpm exec dotenv -e ../../.env -- tsx scripts/sync-smartof-1208.ts` depuis `apps/web` — séquentiel, idempotent (re-run = 0 changement).
3. Re-jouer le script en DRY après le WRITE pour prouver l'idempotence (tout doit ressortir « inchangé »).
