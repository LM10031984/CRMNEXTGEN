# Phase 14 — Textes EXACTS Start Academy (source de vérité, pilote SES-0097)

**Origine :** extraits le 2026-06-25 des événements MANUELLEMENT créés et validés par Laurent (laurent@start-academy.fr) dans l'agenda « Rappel Formations ». Ce sont les textes à figer MOT POUR MOT dans `apps/web/src/lib/calendar/texts.ts` (plan 14-02). Ne pas paraphraser.

> ⚠️ Distinction confirmée : les événements créés à 06:51 par `formation@start-academy.fr` (récurrents quotidiens + copies froid en texte brut, SANS invités ni pièces jointes, SANS countdown) sont les **imports .ics cassés à purger** (plan 14-05), PAS la référence. La référence = les événements ci-dessous (HTML, invités, pièces jointes, colorId).

---

## 1. Événement FORMATION (all-day, colorId `7` Paon)

**Titre validé (exemple) :** `Formation IA conseillers immobiliers (72h) — J. Touati & K. Commissaire — SES-0097`
- Format titre suggéré : `Formation {THEME_COURT} ({DUREE_H}h) — {INITIALES_OU_NOMS_APPRENANTS} — {SES_CODE}`

**Description (HTML, `<br>` comme saut de ligne) — TEXTE STANDARD :**
```
Rappel – Votre formation {FORMATION} commence bientôt !

Bonjour,

Nous vous rappelons que votre formation <b>{FORMATION}</b> débutera le <b>{DATE_DEBUT} à {HEURE_DEBUT}</b>.

📍 Lieu : {LIEU}
⏳ Durée : {DUREE_JOURS} journées ({DUREE_H}h)
👨‍🏫 Formateur : {FORMATEUR}

Pour un bon déroulement de la formation, nous vous invitons à :
✔️ Vérifier que vous avez bien reçu tous les documents nécessaires
✔️ Préparer votre matériel (ordinateur, cahier, stylo, etc.)
✔️ Anticiper votre trajet ou vérifier votre connexion si la formation est en ligne

Merci de bien vouloir consulter et lire les documents suivants :
Charte accueil handicap
Règlement intérieur
Conditions générales de vente

Si vous avez la moindre question, n'hésitez pas à nous contacter à formation@start-academy.fr ou au 07 80 91 95 31.

Nous avons hâte de vous retrouver et vous souhaitons une excellente formation !

À très bientôt à l'Académie de Start !

Emma de Start Academy
```
Variables : `{FORMATION}` (titre produit), `{DATE_DEBUT}` (jj/mm/aaaa), `{HEURE_DEBUT}` (= 8h00 dans pilote ; sinon convention 9h00 — voir note horaires), `{LIEU}`, `{DUREE_JOURS}`, `{DUREE_H}`, `{FORMATEUR}` (préfixer « M. » / « Mme »).

**Pièces jointes (attachments Drive) sur l'événement formation :** Charte accueil handicap `1HxT_uy6UNIZBYGSl9gchT0sS9_DaidNM`, Règlement intérieur `1o44Zg9dXdbyJpQ-U5Tpfbx8lZjcm-Qyf`, CGV `11mfi7rl8BQFhETty4vGat3GmoGclBuFx`, **Programme de la session** (PDF Drive propre à la session, ex. pilote `1bNZhx2mfPIjizEMo6Z3GGpP_Uj6CGIv7`).

---

## 2. Rappels quotidiens J-15 → veille (colorId `6` Mandarine, notification POPUP, PAS email)

Même corps que le texte standard formation ci-dessus, AVEC en plus la ligne **countdown** calculée par jour (« dans X jours »). Le countdown n'existe PAS dans le pilote (c'était la limite des .ics → abandonnés) : il doit être calculé. Placement : juste après le titre d'accroche.
- Exemple de ligne : `📅 Votre formation commence dans {X} jour(s) !` (X = jours ouvrés/calendaires entre le jour du rappel et {DATE_DEBUT}, selon formule du plan 14-02 `countdown.ts`).
- La veille (J-1) : `{X}` = 1 → « dans 1 jour ». Le jour J n'a pas de rappel (rappels J-15 → veille).
- Liens docs : en POPUP, mettre les URLs en clair dans la description (pas d'attachment sur un popup) :
  `Charte accueil handicap : https://drive.google.com/file/d/1HxT_uy6UNIZBYGSl9gchT0sS9_DaidNM/view` · RI `…/1o44Zg9dXdbyJpQ-U5Tpfbx8lZjcm-Qyf/view` · CGV `…/11mfi7rl8BQFhETty4vGat3GmoGclBuFx/view`.

---

## 3. Bloc SIÈGE Vence (conditionnel) — À LA PLACE du texte standard

**Condition :** lieu de la session = **siège Start Academy, 618 Bd Jean Maurel inférieur, 06140 Vence** (détection par adresse). Hors siège (ex. Century 21 Mandelieu) → texte standard SANS ce bloc.

Le bloc accès/logistique s'AJOUTE au corps standard (obligation Qualiopi) :
```
🛣️ Accès par les transports :
  • Depuis Cannes : https://maps.app.goo.gl/s5KgRixyx2JLNut76
  • Depuis Menton : https://maps.app.goo.gl/FwbStuapPLrejoKJ9
🚌 Accès par la route :
  • Depuis Cannes : https://maps.app.goo.gl/HQfYZeSWCJZrCk4h6
  • Depuis Menton : https://maps.app.goo.gl/bpU7iYeoCHqFT7Fn7
🍽️ Restauration :
  • le NEOSUD — 6 place du Grand Jardin, Vence
  • Le VIETNAM-&-Sushi-Là — 14 av. Henri Isnard, Vence
  • Les Petits Tabliers — 7 av. Marcellin Maurel, Vence
🛏️ Hébergement : https://www.booking.com/city/fr/vence.fr.html
```

---

## 4. Satisfaction à froid — 3 relances (colorId `3` Raisin, popup), pièce jointe C7.i30 `1uNEa7QemfEYKyYf5ywGIdvyshWTjhYjd`

Salutation personnalisée : `Bonjour {Prénom1}, bonjour {Prénom2}, …` (prénoms des apprenants).

### RELANCE 1 — fin + 1 mois
```
Bonjour {SALUTATION_PRENOMS},

On sait que vous êtes très occupés à chasser le prochain bien d'exception et à décrocher des mandats comme des pros ! Mais nous avons besoin de votre coup de main pour un petit (mais très utile) questionnaire de satisfaction.

Il s'agit d'une évaluation « à froid » : on aimerait connaître votre ressenti sur la formation, maintenant que vous avez un peu de recul. Votre avis nous permettra de continuer à améliorer nos services et nos formations, pour vous aider à être encore plus performants sur le terrain.

Ça ne vous prendra que quelques minutes, promis ! Ouvrez la pièce jointe ou suivez le lien (selon les instructions) pour compléter le questionnaire.

<b>Pourquoi c'est important ?</b>
Parce que vos retours concrets sont la meilleure boussole pour ajuster nos programmes et répondre au mieux à vos besoins. Vos succès sont aussi les nôtres, alors on compte vraiment sur vous.

Merci mille fois pour votre participation !
Excellente journée, et à bientôt sur le terrain de l'immobilier !

Bien cordialement,
L'équipe Start Academy

(PS : Aucun questionnaire n'a été maltraité lors de la rédaction de cet e-mail… On vous l'assure !)
```

### RELANCE 2 — fin + 1 mois et 15 jours
```
<b>RELANCE 2 (1 mois et 15 jours après la fin) — si pas encore répondu au questionnaire à froid.</b>

Bonjour {SALUTATION_PRENOMS},

On sait que vous êtes très occupés à chasser le prochain bien d'exception et à décrocher des mandats comme des pros ! Mais nous avons besoin de votre coup de main pour un petit (mais très utile) questionnaire de satisfaction.

Il s'agit d'une évaluation « à froid » : on aimerait connaître votre ressenti sur la formation, maintenant que vous avez un peu de recul. Votre avis nous permettra de continuer à améliorer nos services et nos formations, pour vous aider à être encore plus performants sur le terrain.

Ça ne vous prendra que quelques minutes, promis ! Ouvrez la pièce jointe ou suivez le lien (selon les instructions) pour compléter le questionnaire.

Merci mille fois pour votre participation !
Bien cordialement,
L'équipe Start Academy
```

### RELANCE 3 — fin + 2 mois (dernière)
```
<b>RELANCE 3 (2 mois après la fin) — dernière relance si pas de réponse au questionnaire à froid.</b>

Bonjour {SALUTATION_PRENOMS},

On sait que vous êtes très occupés à chasser le prochain bien d'exception et à décrocher des mandats comme des pros ! Mais nous avons besoin de votre coup de main pour un petit (mais très utile) questionnaire de satisfaction.

Il s'agit d'une évaluation « à froid » : on aimerait connaître votre ressenti sur la formation, maintenant que vous avez un peu de recul. Votre avis nous permettra de continuer à améliorer nos services et nos formations.

Ça ne vous prendra que quelques minutes, promis ! Ouvrez la pièce jointe ou suivez le lien (selon les instructions) pour compléter le questionnaire.

Merci mille fois pour votre participation !
Bien cordialement,
L'équipe Start Academy
```

---

## Notes structurelles confirmées par le pilote
- **Froid timing** : RELANCE 1 = fin + 1 mois, RELANCE 2 = fin + 1 mois 15 j, RELANCE 3 = fin + 2 mois. Créneaux pilote = 09:00–09:30. `overrideReminders: [{method:'popup', minutes:0}]`.
- **Invités** (formation + froid) : formateur réel (laurent@start-academy.fr, accepted) + apprenants (emails réels). Règle sendUpdates : passé = `none`, futur = toggle.
- **Couleurs** : formation `7`, rappel quotidien `6`, froid `3`.
- **Horaires** : pilote = 8h00 (cas particulier saisi à la main). Convention QualiOF standard = 9h00–13h00 / 14h00–18h00 figée en const (NE PAS recalculer). Utiliser l'heure réelle de la session si disponible, sinon 9h00.
