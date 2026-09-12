-- Inscriptions que la règle élargie BUG-11 déclarait AGEFICE et que le régime ne déclarera plus.
SELECT s.code            AS session,
       p."lastName" || ' ' || p."firstName" AS apprenant,
       so."legalName"    AS sponsor,
       so."opcoCode"     AS financeur_inscription,
       (SELECT string_agg(DISTINCT o2."opcoCode", ',')
          FROM "LegalLink" ll
          JOIN "Organization" o2 ON o2.id = ll."organizationId"
         WHERE ll."personId" = p.id AND ll."organizationId" <> so.id) AS autres_financeurs,
       EXISTS (SELECT 1 FROM "Document" d
                WHERE d."participantId" = sp.id AND d.type = 'AGEFICE') AS a_deja_le_dossier
  FROM "SessionParticipant" sp
  JOIN "Person" p        ON p.id  = sp."personId"
  JOIN "TrainingSession" s ON s.id = sp."sessionId"
  JOIN "Organization" so ON so.id = sp."sponsorOrgId"
 WHERE COALESCE(so."opcoCode", '') <> 'AGEFICE'
   AND EXISTS (SELECT 1 FROM "LegalLink" ll
                JOIN "Organization" o2 ON o2.id = ll."organizationId"
               WHERE ll."personId" = p.id
                 AND (ll.role = 'EI_SELF' OR o2."opcoCode" = 'AGEFICE')
                 AND ll."organizationId" <> so.id);
