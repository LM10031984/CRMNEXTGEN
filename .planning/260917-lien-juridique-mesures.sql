-- Mesures du relevé 260917-lien-juridique-releve.md — 100 % LECTURE, rejouable.
--
-- À jouer dans une transaction en lecture seule, horodatages en UTC :
--   BEGIN READ ONLY; … ; ROLLBACK;
-- ⚠ Client `pg` Node : lancer avec TZ=UTC. Prisma écrit l'UTC dans des colonnes
-- `timestamp` sans fuseau ; relues en heure de Paris elles glissent de 2 h.
--
-- Rôles « porteurs » (ceux qui peuvent décider d'un financeur) :
--   DIRIGEANT, SALARIE, EI_SELF, AGENT_COMMERCIAL, ALTERNANT, STAGIAIRE.
-- Régime d'un lien, recopié de `releveDeLaConvention` (payer-rule.ts:73-89) :
--   PARTICULIER → contrat ; forme solo (EI, EIRL, AUTO_ENTREPRENEUR) → convention
--   ssi rôle employeur (SALARIE, ALTERNANT, STAGIAIRE), sinon contrat ; toute
--   autre forme (sociétés ET « AUTRE ») → convention, quel que soit le rôle.
-- Financeur candidat d'un lien : `Organization.opcoCode` (NULL → '∅').
-- `SessionParticipant.financingMode` n'est PAS utilisable : rempli sur 44
-- inscriptions sur 376 au 17/09/2026 (et lu par aucune règle de financement).

-- ── Population ─────────────────────────────────────────────────────────────
SELECT count(*) AS liens, count(DISTINCT "personId") AS personnes,
       count(*) FILTER (WHERE "startDate" IS NOT NULL) AS avec_debut,
       count(*) FILTER (WHERE "endDate" IS NOT NULL) AS avec_fin,
       count(*) FILTER (WHERE "isPrimary") AS principaux
FROM "LegalLink";

SELECT role, count(*) AS liens, count(*) FILTER (WHERE "isPrimary") AS principaux
FROM "LegalLink" GROUP BY role ORDER BY liens DESC;

-- ── (a) Liens AGENT_COMMERCIAL vers une organisation NON solo ──────────────
SELECT o."legalForm", count(*) AS liens, count(DISTINCT ll."personId") AS personnes,
       count(DISTINCT o.id) AS organisations
FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
WHERE ll.role = 'AGENT_COMMERCIAL' GROUP BY o."legalForm" ORDER BY liens DESC;

WITH ac AS (
  SELECT ll.* FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE ll.role = 'AGENT_COMMERCIAL' AND o."legalForm" NOT IN ('EI','EIRL','AUTO_ENTREPRENEUR'))
SELECT count(*) AS liens, count(DISTINCT "personId") AS personnes,
       count(DISTINCT "organizationId") AS organisations,
       count(DISTINCT "personId") FILTER (WHERE EXISTS (
         SELECT 1 FROM "LegalLink" e WHERE e."personId" = ac."personId" AND e.role = 'EI_SELF')) AS avec_lien_ei,
       count(*) FILTER (WHERE ac."isPrimary") AS ac_principal,
       count(DISTINCT "personId") FILTER (WHERE EXISTS (
         SELECT 1 FROM "SessionParticipant" sp
         WHERE sp."personId" = ac."personId" AND sp."sponsorOrgId" = ac."organizationId")) AS payes_par_cette_org
FROM ac;

-- par organisation
SELECT o."legalName", o."legalForm", o."opcoCode", count(*) AS agents,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM "SessionParticipant" sp
         WHERE sp."personId" = ll."personId" AND sp."sponsorOrgId" = o.id)) AS agents_payes_par_elle
FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
WHERE ll.role = 'AGENT_COMMERCIAL' AND o."legalForm" NOT IN ('EI','EIRL','AUTO_ENTREPRENEUR')
GROUP BY o."legalName", o."legalForm", o."opcoCode" ORDER BY agents DESC, o."legalName";

-- le motif Katia exact : l'organisation du lien AGENT_COMMERCIAL est le PAYEUR
SELECT p."firstName" || ' ' || left(p."lastName", 1) || '.' AS personne,
       o."legalName" AS organisation, o."legalForm", o."opcoCode",
       p."professionalStatus" AS statut_libre,
       string_agg(s.code || ' ' || to_char(s."startDate", 'DD/MM/YY'), ' ; ' ORDER BY s."startDate") AS sessions
FROM "LegalLink" ll
JOIN "Organization" o ON o.id = ll."organizationId"
JOIN "Person" p ON p.id = ll."personId"
JOIN "SessionParticipant" sp ON sp."personId" = p.id AND sp."sponsorOrgId" = o.id
JOIN "TrainingSession" s ON s.id = sp."sessionId"
WHERE ll.role = 'AGENT_COMMERCIAL' AND o."legalForm" NOT IN ('EI','EIRL','AUTO_ENTREPRENEUR')
GROUP BY p.id, p."firstName", p."lastName", o."legalName", o."legalForm", o."opcoCode", p."professionalStatus"
ORDER BY o."legalName", personne;

-- ── (b) Multi-casquettes, et sessions où le financeur dépend du lien retenu ─
WITH liens AS (
  SELECT ll."personId", o.id AS org, coalesce(o."opcoCode", '∅') AS financeur,
    CASE WHEN o."legalForm" = 'PARTICULIER' THEN 'contrat'
         WHEN o."legalForm" IN ('EI','EIRL','AUTO_ENTREPRENEUR')
           THEN CASE WHEN ll.role IN ('SALARIE','ALTERNANT','STAGIAIRE') THEN 'convention' ELSE 'contrat' END
         ELSE 'convention' END AS regime
  FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE ll.role IN ('DIRIGEANT','SALARIE','EI_SELF','AGENT_COMMERCIAL','ALTERNANT','STAGIAIRE')),
multi AS (
  SELECT "personId", count(DISTINCT financeur) AS financeurs, count(DISTINCT regime) AS regimes
  FROM liens GROUP BY "personId" HAVING count(DISTINCT org) >= 2),
dependants AS (SELECT "personId" FROM multi WHERE financeurs >= 2 OR regimes >= 2)
SELECT (SELECT count(DISTINCT "personId") FROM liens) AS personnes_avec_lien_porteur,
       (SELECT count(*) FROM multi) AS multi_casquettes,
       (SELECT count(*) FROM multi WHERE financeurs >= 2) AS financeurs_differents,
       (SELECT count(*) FROM multi WHERE regimes >= 2) AS regimes_differents,
       (SELECT count(*) FROM dependants) AS l_un_ou_l_autre,
       (SELECT count(*) FROM "SessionParticipant" WHERE "personId" IN (SELECT "personId" FROM dependants)) AS inscriptions,
       (SELECT count(DISTINCT "sessionId") FROM "SessionParticipant" WHERE "personId" IN (SELECT "personId" FROM dependants)) AS sessions,
       (SELECT count(DISTINCT sp."sessionId") FROM "SessionParticipant" sp JOIN "TrainingSession" s ON s.id = sp."sessionId"
         WHERE s.status NOT IN ('COMPLETED','CANCELLED') AND sp."personId" IN (SELECT "personId" FROM dependants)) AS sessions_non_terminees;

-- ── (c) Personnes inscrites chez des financeurs différents ─────────────────
WITH ins AS (
  SELECT sp."personId", s.code, s."startDate", coalesce(o."opcoCode", '∅') AS financeur,
         o."legalName", o."legalForm"
  FROM "SessionParticipant" sp
  JOIN "TrainingSession" s ON s.id = sp."sessionId"
  JOIN "Organization" o ON o.id = sp."sponsorOrgId"),
pers AS (SELECT "personId" FROM ins GROUP BY "personId" HAVING count(DISTINCT financeur) >= 2)
SELECT p."firstName" || ' ' || left(p."lastName", 1) || '.' AS personne,
       string_agg(to_char(i."startDate", 'DD/MM/YY') || ' ' || i.code || ' → ' || i."legalName"
                  || ' [' || i."legalForm" || ', ' || i.financeur || ']', ' | ' ORDER BY i."startDate") AS parcours
FROM pers JOIN ins i ON i."personId" = pers."personId" JOIN "Person" p ON p.id = pers."personId"
GROUP BY p.id, p."firstName", p."lastName" ORDER BY personne;

SELECT count(*) AS personnes_plusieurs_payeurs
FROM (SELECT "personId" FROM "SessionParticipant" GROUP BY "personId" HAVING count(DISTINCT "sponsorOrgId") >= 2) x;

-- ── (d) professionalStatus : valeurs distinctes ────────────────────────────
SELECT coalesce("professionalStatus", '∅ (NULL)') AS valeur, count(*) AS n
FROM "Person" GROUP BY "professionalStatus" ORDER BY n DESC, valeur;

-- ── (e) Statut libre qui contredit le rattachement principal ───────────────
-- Familles reconnues (le reste — « agent immobilier », « conseiller… » — est un
-- MÉTIER, pas un statut : non classable, donc non compté comme contradiction).
WITH fam AS (
  SELECT p.id, p."firstName" || ' ' || left(p."lastName", 1) || '.' AS personne, p."professionalStatus" AS saisi,
    CASE WHEN n ~ '^(salari|employ)' THEN 'SALARIE'
         WHEN n ~ '^agent co' THEN 'AGENT_COMMERCIAL'
         WHEN n ~ '^(gerant|dirigeant|dirirgeant|chef d.entreprise)' THEN 'DIRIGEANT' END AS famille
  FROM (SELECT p.*, translate(lower(btrim(p."professionalStatus")), 'éèêë', 'eeee') AS n
        FROM "Person" p WHERE p."professionalStatus" IS NOT NULL) p),
prim AS (
  SELECT ll."personId", count(*) AS n_principaux, min(ll.role::text) AS role_principal
  FROM "LegalLink" ll WHERE ll."isPrimary" GROUP BY ll."personId")
SELECT famille, count(*) AS personnes,
       count(*) FILTER (WHERE prim."personId" IS NULL) AS sans_principal,
       count(*) FILTER (WHERE prim.n_principaux > 1) AS plusieurs_principaux,
       count(*) FILTER (WHERE prim.n_principaux = 1 AND (
         (famille = 'SALARIE' AND role_principal NOT IN ('SALARIE','ALTERNANT','STAGIAIRE')) OR
         (famille = 'AGENT_COMMERCIAL' AND role_principal IN ('SALARIE','ALTERNANT','STAGIAIRE','DIRIGEANT')) OR
         (famille = 'DIRIGEANT' AND role_principal IN ('SALARIE','ALTERNANT','STAGIAIRE','AGENT_COMMERCIAL')))) AS contredit
FROM fam LEFT JOIN prim ON prim."personId" = fam.id
WHERE famille IS NOT NULL GROUP BY famille ORDER BY famille;

-- ── (f) Pièces déjà générées touchées par professionalStatus ────────────────
-- Le statut n'est stocké dans AUCUN JSON de grille (cf. relevé §3.f). Il entre
-- seulement dans le PROMPT IA de l'analyse des besoins individuelle
-- (ollama-generators.ts:592), du positionnement (:830) et de la grille de
-- session (:1250). Mesurable : les pièces dont le TEXTE IA stocké (rawJson)
-- reprend littéralement le statut saisi (≥ 5 caractères). Borne basse pour les
-- reformulations, faux positifs possibles pour les métiers (« agent immobilier »).
-- La grille de session est un Document sans JSON : seul son nombre est comptable.
SELECT pa.kind::text AS piece, count(*) AS generees, count(*) FILTER (WHERE p."professionalStatus" IS NOT NULL) AS statut_non_vide_aujourd_hui, count(*) FILTER (WHERE p."professionalStatus" IS NOT NULL AND length(btrim(p."professionalStatus")) >= 5 AND position(lower(btrim(p."professionalStatus")) IN lower(pa."rawJson"::text)) > 0) AS texte_ia_reprend_le_statut FROM "PedagogicalAsset" pa JOIN "SessionParticipant" sp ON sp.id = pa."participantId" JOIN "Person" p ON p.id = sp."personId" WHERE pa.kind::text IN ('GRILLE_OBS','ANALYSE_BESOIN','POSITIONNEMENT') GROUP BY pa.kind ORDER BY piece;
SELECT count(*) AS grilles_session_generees, count(DISTINCT d."sessionId") AS sessions, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "SessionParticipant" sp JOIN "Person" p ON p.id = sp."personId" WHERE sp."sessionId" = d."sessionId" AND p."professionalStatus" IS NOT NULL)) AS avec_au_moins_un_statut_aujourd_hui FROM "Document" d WHERE d.type::text = 'GRILLE_OBS_SESSION';
SELECT p."professionalStatus" AS statut, count(*) AS n FROM "PedagogicalAsset" pa JOIN "SessionParticipant" sp ON sp.id = pa."participantId" JOIN "Person" p ON p.id = sp."personId" WHERE pa.kind::text IN ('ANALYSE_BESOIN','POSITIONNEMENT') AND p."professionalStatus" IS NOT NULL AND length(btrim(p."professionalStatus")) >= 5 AND position(lower(btrim(p."professionalStatus")) IN lower(pa."rawJson"::text)) > 0 GROUP BY 1 ORDER BY n DESC LIMIT 12;

-- ── Population inscriptions et éligibilité AGEFICE par lien ─────────────────
SELECT count(*) AS inscriptions, count(*) FILTER (WHERE "financingMode" IS NOT NULL) AS avec_financing_mode, count(*) FILTER (WHERE "participantType" IS NOT NULL) AS avec_participant_type, count(DISTINCT "sessionId") AS sessions FROM "SessionParticipant";
SELECT count(*) AS organisations, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "AgeficeProfile" ap WHERE ap."organizationId" = o.id)) AS avec_profil_agefice FROM "Organization" o;
SELECT (SELECT count(*) FROM "Person" p WHERE EXISTS (SELECT 1 FROM "LegalLink" l WHERE l."personId" = p.id AND l.role IN ('EI_SELF','AGENT_COMMERCIAL') AND EXISTS (SELECT 1 FROM "AgeficeProfile" ap WHERE ap."organizationId" = l."organizationId"))) AS personnes_eligibles_agefice_par_lien,
       (SELECT count(*) FROM "SessionParticipant" sp JOIN "Organization" o ON o.id = sp."sponsorOrgId" JOIN "TrainingSession" s ON s.id = sp."sessionId" WHERE coalesce(o."opcoCode",'') <> 'AGEFICE' AND o."legalForm" NOT IN ('EI','EIRL','AUTO_ENTREPRENEUR','PARTICULIER') AND EXISTS (SELECT 1 FROM "LegalLink" l WHERE l."personId" = sp."personId" AND l.role IN ('EI_SELF','AGENT_COMMERCIAL') AND EXISTS (SELECT 1 FROM "AgeficeProfile" ap WHERE ap."organizationId" = l."organizationId"))) AS inscriptions_payees_par_societe_non_agefice_mais_eligibles,
       (SELECT count(DISTINCT sp."sessionId") FROM "SessionParticipant" sp JOIN "Organization" o ON o.id = sp."sponsorOrgId" WHERE coalesce(o."opcoCode",'') <> 'AGEFICE' AND o."legalForm" NOT IN ('EI','EIRL','AUTO_ENTREPRENEUR','PARTICULIER') AND EXISTS (SELECT 1 FROM "LegalLink" l WHERE l."personId" = sp."personId" AND l.role IN ('EI_SELF','AGENT_COMMERCIAL') AND EXISTS (SELECT 1 FROM "AgeficeProfile" ap WHERE ap."organizationId" = l."organizationId"))) AS sessions_concernees,
       (SELECT count(*) FROM "Document" d JOIN "SessionParticipant" sp ON sp.id = d."participantId" JOIN "Organization" o ON o.id = sp."sponsorOrgId" WHERE d.type::text = 'AGEFICE' AND coalesce(o."opcoCode",'') <> 'AGEFICE' AND o."legalForm" NOT IN ('EI','EIRL','AUTO_ENTREPRENEUR','PARTICULIER')) AS demandes_agefice_sur_inscription_payee_par_societe_non_agefice
;

-- ── (e) détail nommé des contradictions ─────────────────────────────────────
WITH fam AS (
  SELECT p.id, p."firstName" || ' ' || left(p."lastName", 1) || '.' AS personne, p."professionalStatus" AS saisi,
    CASE WHEN n ~ '^(salari|employ)' THEN 'SALARIE'
         WHEN n ~ '^agent co' THEN 'AGENT_COMMERCIAL'
         WHEN n ~ '^(gerant|dirigeant|dirirgeant|chef d.entreprise)' THEN 'DIRIGEANT' END AS famille
  FROM (SELECT p.*, translate(lower(btrim(p."professionalStatus")), 'éèêë', 'eeee') AS n
        FROM "Person" p WHERE p."professionalStatus" IS NOT NULL) p),
prim AS (
  SELECT ll."personId", count(*) AS n_principaux, min(ll.role::text) AS role_principal,
         min(o."legalName" || ' [' || o."legalForm" || ']') AS org_principale
  FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE ll."isPrimary" GROUP BY ll."personId")
SELECT famille AS statut_dit, saisi, personne, role_principal, org_principale
FROM fam JOIN prim ON prim."personId" = fam.id
WHERE prim.n_principaux = 1 AND (
  (famille = 'SALARIE' AND role_principal NOT IN ('SALARIE','ALTERNANT','STAGIAIRE')) OR
  (famille = 'AGENT_COMMERCIAL' AND role_principal IN ('SALARIE','ALTERNANT','STAGIAIRE','DIRIGEANT')) OR
  (famille = 'DIRIGEANT' AND role_principal IN ('SALARIE','ALTERNANT','STAGIAIRE','AGENT_COMMERCIAL')))
ORDER BY statut_dit, personne;
