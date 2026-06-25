# Phase 14 — Intégration Google Calendar (rappels/convocations/satisfaction) — Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Task Boundary

Automatiser, par session de formation, la création d'événements Google Calendar (convocation/rappels + relances satisfaction à froid) dans l'agenda « Rappel Formations », pour remplacer le process manuel de Laurent. Deux modes : backfill audit (sessions ≥ mars 2025) + automatique sur chaque nouvelle session.
</domain>

<decisions>
## Implementation Decisions (verrouillées)

### Accès Google (FAIT)
- OAuth **app interne** sous **formation@start-academy.fr** (accès owner sur « Rappel Formations »). Compte de service abandonné (règle org `iam.managed.disableServiceAccountKeyCreation`). Cf [[reference_google_calendar_oauth]].
- Credentials dans `files/secrets/` (gitignored) : `oauth-client.json` + `google-token.json` (refresh_token). Lib `googleapis` dans apps/web.
- Agenda cible : « Rappel Formations » id `c_a18d08db6df83139c06c26e91e4cdb59ac244baeac93fe5c237d66c628a578a5@group.calendar.google.com`.

### Événements par session
- **Événement formation** : journée(s) bloquée(s) start→end, lieu, description = texte rappel exact, docs.
- **Rappels quotidiens J-15 → veille** : un événement par jour (15) avec **« dans X jours » calculé** (countdown exact par jour). Rappel = **simple notification d'agenda (pop-up), PAS d'email**.
- **Satisfaction à froid** : 3 relances à **1 mois**, **1 mois + 15 j**, **2 mois** après la fin. Texte froid exact + questionnaire C7.i30.

### Invités (règle clé)
- **Formateur** : toujours invité (réel). Email récupéré depuis la session (Jean-Guy/Laurent/Julien/Christophe selon session).
- **Apprenants** : mis dans les invités dans TOUS les cas, MAIS :
  - **Sessions passées** → ajoutés **sans notification** (`sendUpdates:'none'`) — trace/audit seulement.
  - **Sessions à venir** → **option à cocher** (toggle) qui décide s'ils reçoivent **réellement** l'invitation Google (`sendUpdates:'all'` si coché, sinon `'none'`).

### Textes (obligation : formulation EXACTE de Start Academy)
- Reprendre **mot pour mot** les textes fournis par Laurent (rappel « Rappel – Votre formation … commence bientôt ! … Emma de Start Academy » ; froid « Bonjour … chasser le prochain bien d'exception … L'équipe Start Academy »). Variables : formation, dates, horaires, lieu, formateur, countdown.
- **Template SIÈGE étendu** automatique quand lieu = siège Vence (618 Bd Jean Maurel inférieur, 06140 Vence) : ajoute bloc accès transports/route + restauration + hébergement. Cf [[reference_rappel_siege_vence_qualiopi]]. Détection par adresse du lieu.

### Pièces jointes
- **Programme de la session** (PDF Drive de la session) + **Charte accueil handicap** + **Règlement intérieur** + **CGV**. Via attachments Google Calendar (Drive fileUrl) ou liens en description.

### Couleurs
- Code couleur par type : Formation (bleu/Paon=7), Rappel quotidien (orange/Mandarine=6), Satisfaction froid (violet/Raisin=3).

### Modes
- **Backfill** one-shot : toutes les sessions `startDate >= 2025-03-01` (70 sessions à ce jour, 69 passées). Preuve d'audit Qualiopi.
- **Auto** : hook à la création/planification d'une session → crée les événements.
- **Idempotent** : re-run ne doit pas dupliquer (clé déterministe par session+type, ex. extendedProperties.private ou iCalUID stable).

### Pré-requis d'exécution
- **Purge** des ~350 événements importés cassés (.ics sans invités) de « Rappel Formations » via l'API avant le backfill propre.
</decisions>

<specifics>
## Specific Ideas

- Pilote manuel SES-0097 déjà fait via MCP (modèle de rendu validé par Laurent : couleurs, invités, textes, docs).
- Scripts jetables existants à ne PAS confondre avec le worker cible : `_gen-ics-rappels.ts` (.ics abandonné), `_google-oauth-setup.ts`, `_google-test.ts`.
- Approche .ics abandonnée : l'import Google retire les invités + ne calcule pas le countdown.
- Liens docs statiques connus (Drive) : CGV `11mfi7rl8BQFhETty4vGat3GmoGclBuFx`, RI `1o44Zg9dXdbyJpQ-U5Tpfbx8lZjcm-Qyf`, Charte PSH `1HxT_uy6UNIZBYGSl9gchT0sS9_DaidNM`, C7.i30 froid `1uNEa7QemfEYKyYf5ywGIdvyshWTjhYjd`.
</specifics>

<canonical_refs>
## Canonical References

- [[reference_google_calendar_oauth]] — accès API + credentials.
- [[reference_rappel_siege_vence_qualiopi]] — template siège Vence (obligation Qualiopi).
- Pilote SES-0097 (agenda « Rappel Formations »).
</canonical_refs>
