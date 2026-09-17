-- DRY-RUN — Katia T., fin du rattachement « agent commercial » chez GCS Century 21
-- Immo d'azur et début du rattachement « salariée ». PRÉPARÉ LE 17/09/2026, NON JOUÉ.
--
-- 100 % LECTURE. Aucune écriture : les lignes « après » sont des SELECT de
-- littéraux, jamais des INSERT/UPDATE. À jouer dans BEGIN READ ONLY … ROLLBACK,
-- client lancé en TZ=UTC.
--
-- ⛔ VOLONTAIREMENT INEXÉCUTABLE en l'état : la date de début du salariat n'est
-- pas connue (Laurent, « après janvier 2026 »). Tant que 'AAAA-MM-JJ' n'est pas
-- remplacé, le cast `::date` échoue et rien ne s'affiche.
--
-- ⛔ PRÉREQUIS AVANT TOUTE ÉCRITURE RÉELLE (cf. relevé §1) : 12 lecteurs du code
-- prennent « le » lien vers le payeur par `legalLinks.find(organizationId ===
-- sponsorOrgId)`, sans date. Deux liens vers Century 21 (agent commercial
-- terminé + salariée) rendraient ce choix arbitraire. Ce dry-run montre l'effet
-- d'une résolution DATÉE ; le code actuel ne la fait pas.
--
-- Ce qui ne bouge JAMAIS : le lien EI_SELF vers « Katia Tchakmakjian »
-- (SIRET 82106517400046, AGEFICE, principal). Il porte SES-0043 (04–14/01/2026).

WITH params AS (
  SELECT 'AAAA-MM-JJ'::date AS debut_salariat          -- ← date à fournir par Laurent
),
personne AS (
  SELECT DISTINCT ll."personId" AS id
  FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE o.siret = '89221099800019' AND ll.role = 'AGENT_COMMERCIAL'
    AND EXISTS (SELECT 1 FROM "LegalLink" e JOIN "Organization" eo ON eo.id = e."organizationId"
                WHERE e."personId" = ll."personId" AND eo.siret = '82106517400046' AND e.role = 'EI_SELF')
),
-- ① AVANT — les liens tels qu'en base
avant AS (
  SELECT ll.id, o."legalName", o.siret, o."legalForm", o."opcoCode", ll.role::text AS role,
         ll."isPrimary", ll."startDate"::date AS debut, ll."endDate"::date AS fin
  FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE ll."personId" = (SELECT id FROM personne)
),
-- ② APRÈS PROPOSÉ — rien n'est écrasé : l'ancien lien se TERMINE, un nouveau COMMENCE
apres AS (
  SELECT id, "legalName", siret, "legalForm", "opcoCode", role, "isPrimary", debut,
         CASE WHEN siret = '89221099800019' AND role = 'AGENT_COMMERCIAL'
              THEN (SELECT debut_salariat FROM params) - 1 ELSE fin END AS fin,
         'inchangé sauf fin' AS nature
  FROM avant
  UNION ALL
  SELECT NULL, "legalName", siret, "legalForm", "opcoCode", 'SALARIE', false,
         (SELECT debut_salariat FROM params), NULL::date, 'NOUVEAU'
  FROM avant WHERE siret = '89221099800019' AND role = 'AGENT_COMMERCIAL'
)
SELECT 'avant' AS etat, a.*, NULL AS nature FROM avant a
UNION ALL
SELECT 'après', p.* FROM apres p
ORDER BY etat DESC, siret, role;

-- ③ EN AVAL — chaque inscription, le lien retenu à la DATE DE LA SESSION
WITH params AS (SELECT 'AAAA-MM-JJ'::date AS debut_salariat),
personne AS (
  SELECT DISTINCT ll."personId" AS id FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE o.siret = '89221099800019' AND ll.role = 'AGENT_COMMERCIAL'
)
SELECT s.code, s.status::text, s."startDate"::date AS debut_session, o."legalName" AS payeur, o."legalForm",
       coalesce(o."opcoCode", '∅') AS financeur_fige_par_l_inscription,
       -- rôle vers le payeur, aujourd'hui (le code lit le premier lien trouvé, sans date)
       (SELECT string_agg(ll.role::text, ',') FROM "LegalLink" ll
         WHERE ll."personId" = sp."personId" AND ll."organizationId" = sp."sponsorOrgId") AS role_vers_payeur_avant,
       -- rôle vers le payeur, résolu à la date de la session après correction
       CASE WHEN o.siret = '89221099800019'
            THEN CASE WHEN s."startDate"::date >= (SELECT debut_salariat FROM params) THEN 'SALARIE' ELSE 'AGENT_COMMERCIAL' END
            ELSE (SELECT string_agg(ll.role::text, ',') FROM "LegalLink" ll
                   WHERE ll."personId" = sp."personId" AND ll."organizationId" = sp."sponsorOrgId") END AS role_vers_payeur_apres_date,
       -- éligibilité AGEFICE selon la règle ACTUELLE (OU_AGEFICE) : le lien EI suffit, quel que soit le payeur
       (o."opcoCode" = 'AGEFICE' OR EXISTS (
          SELECT 1 FROM "LegalLink" ll JOIN "Organization" lo ON lo.id = ll."organizationId"
          JOIN "AgeficeProfile" ap ON ap."organizationId" = lo.id
          WHERE ll."personId" = sp."personId" AND ll.role IN ('EI_SELF','AGENT_COMMERCIAL'))) AS eligible_agefice_regle_actuelle
FROM "SessionParticipant" sp
JOIN "TrainingSession" s ON s.id = sp."sessionId"
JOIN "Organization" o ON o.id = sp."sponsorOrgId"
WHERE sp."personId" = (SELECT id FROM personne)
ORDER BY s."startDate";

-- ④ PIÈCES DÉJÀ GÉNÉRÉES, et ce qui les engage (envoi, signature, dossier financeur)
WITH personne AS (
  SELECT DISTINCT ll."personId" AS id FROM "LegalLink" ll JOIN "Organization" o ON o.id = ll."organizationId"
  WHERE o.siret = '89221099800019' AND ll.role = 'AGENT_COMMERCIAL'
)
SELECT s.code, d.type::text AS piece, d.status, d."createdAt", d."signedAt",
       d."signatureRequestId" IS NOT NULL AS partie_en_signature,
       EXISTS (SELECT 1 FROM "OpcoSubmission" os WHERE os."participantId" = sp.id
                 AND os.status::text <> 'DRAFT' AND os.attachments::text LIKE '%' || d."pdfUrl" || '%') AS jointe_a_un_dossier_envoye,
       EXISTS (SELECT 1 FROM "EmailMessage" em WHERE em."documentIds"::text LIKE '%' || d.id || '%') AS citee_dans_un_email
FROM "Document" d
JOIN "SessionParticipant" sp ON sp.id = d."participantId"
JOIN "TrainingSession" s ON s.id = d."sessionId"
WHERE sp."personId" = (SELECT id FROM personne)
ORDER BY s."startDate", d."createdAt";
