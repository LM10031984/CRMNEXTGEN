/** Audit strictly read-only. Never invokes the importer; DB transaction rolls back.
 * pnpm --filter @qualiof/db exec tsx scripts/audit-agefice-annuaire.ts --env /external/.env
 * Optional --snapshot /existing/snapshot.json reuses the public source for a second DB audit.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import pg from 'pg';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DEPTS = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((d) => d !== '20'),
  '2A',
  '2B',
  '971',
  '972',
  '973',
  '974',
  '976',
];
const ENDPOINT = 'https://communication-agefice.fr/ajax/json.php';
const arg = (key: string) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? undefined : process.argv[index + 1];
};
const norm = (s: unknown) => String(s ?? '').trim();
const fold = (s: unknown) =>
  norm(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const email = (s: unknown) => norm(s).toLowerCase();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cell = (s: unknown) =>
  norm(s)
    .replace(/\|/g, '/')
    .replace(/[\r\n]/g, ' ');
type Centre = {
  name: string;
  email: string;
  numberPta: string;
  postalCode: string;
  city: string;
  departmentsServed: string[];
};
type Official = {
  fetchedAt: string;
  endpoint: string;
  successes: string[];
  failures: { department: string; reason: string }[];
  centres: Centre[];
};
type Stored = Centre & { department: string };

async function fetchOfficial(): Promise<Official> {
  const successes: string[] = [],
    failures: Official['failures'] = [];
  const map = new Map<string, Centre>();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < DEPTS.length) {
        const department = DEPTS[cursor++];
        if (department === undefined) break;
        try {
          const response = await fetch(`${ENDPOINT}?dept=${department}`, {
            signal: AbortSignal.timeout(12000),
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const rows: unknown = await response.json();
          if (!Array.isArray(rows)) throw new Error('Format non tabulaire');
          for (const raw of rows) {
            if (!raw || typeof raw !== 'object' || raw.refCentreGestion == null)
              throw new Error('Entrée sans référence PTA');
            const numberPta = norm(raw.refCentreGestion);
            const centre = map.get(numberPta) ?? {
              numberPta,
              name: norm(raw.nom),
              email: norm(raw.email),
              postalCode: norm(raw.codePostal).padStart(5, '0'),
              city: norm(raw.ville),
              departmentsServed: [],
            };
            if (!centre.departmentsServed.includes(department))
              centre.departmentsServed.push(department);
            map.set(numberPta, centre);
          }
          successes.push(department);
        } catch (error) {
          const msg = error instanceof Error ? error.message : '';
          failures.push({
            department,
            reason: /^HTTP \d+$|^Format non tabulaire$|^Entrée sans référence PTA$/.test(msg)
              ? msg
              : 'Réseau, délai ou décodage indisponible',
          });
        }
        await sleep(250);
      }
    }),
  );
  return {
    fetchedAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    successes: successes.sort(),
    failures,
    centres: [...map.values()]
      .map((c) => ({ ...c, departmentsServed: c.departmentsServed.sort() }))
      .sort((a, b) => a.numberPta.localeCompare(b.numberPta, 'fr', { numeric: true })),
  };
}

async function readDatabase() {
  const envPath = arg('--env');
  if (!envPath) throw new Error('ENV_FILE_REQUIRED');
  const env = parse(await readFile(envPath));
  const url = env.DIRECT_URL || env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_ABSENT');
  const target = new URL(url);
  if (['localhost', '127.0.0.1', '::1'].includes(target.hostname))
    throw new Error('LOCAL_DATABASE_REFUSED');
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 15000,
    statement_timeout: 15000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const mode = await client.query('SHOW transaction_read_only');
    if (mode.rows[0]?.transaction_read_only !== 'on') throw new Error('READ_ONLY_NOT_ACTIVE');
    const centres = await client.query<Stored>(
      'SELECT "name", "email", "numberPta", "postalCode", "city", "department", "departmentsServed" FROM "AgeficePointAccueil"',
    );
    const profiles = await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE p."pointAccueilId" IS NULL)::int AS unattached,
      count(*) FILTER (WHERE p."pointAccueilId" IS NOT NULL AND NULLIF(trim(a.email), '') IS NULL)::int AS attached_without_email
      FROM "AgeficeProfile" p LEFT JOIN "AgeficePointAccueil" a ON a.id = p."pointAccueilId"`);
    const fieldKeys = await client.query(`SELECT DISTINCT key FROM "AgeficeProfile" p,
      LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(p."paFields"::jsonb) = 'object' THEN p."paFields"::jsonb ELSE '{}'::jsonb END) AS key ORDER BY key`);
    // Values used only within PostgreSQL; returned output contains counts and key names only.
    const routing = await client.query(`WITH source AS (
      SELECT p."pointAccueilLockedManually" AS locked,
        NULLIF(trim(p."paNumber"), '') AS pa_number, NULLIF(trim(p."paName"), '') AS pa_name,
        NULLIF(trim(p."paFields"->>'N° de PTA'), '') AS field_number,
        COALESCE(NULLIF(trim(p."paFields"->>'Nom du PTA'), ''), NULLIF(trim(p."paFields"->>'Nom du PA AGEFICE'), '')) AS field_name,
        COALESCE(NULLIF(trim(p."paFields"->>'Code Postal (Entreprise)'), ''), NULLIF(trim(p."paFields"->>'Code postal (Entreprise)'), '')) AS cfp_cp,
        NULLIF(trim(o.address->>'postalCode'), '') AS org_cp
      FROM "AgeficeProfile" p JOIN "Organization" o ON o.id = p."organizationId"
    ), postal AS (
      SELECT *, regexp_replace(COALESCE(cfp_cp, org_cp, ''), '\\s', '', 'g') AS cp FROM source
    ), location AS (
      SELECT *, CASE WHEN cp ~ '^[0-9]{4,5}$' THEN
        CASE WHEN left(lpad(cp, 5, '0'), 2) IN ('97', '98') THEN left(lpad(cp, 5, '0'), 3)
        WHEN left(lpad(cp, 5, '0'), 2) = '20' THEN CASE WHEN cp::int <= 20190 THEN '2A' ELSE '2B' END
        ELSE left(lpad(cp, 5, '0'), 2) END ELSE NULL END AS dept FROM postal
    ), candidates AS (
      SELECT l.*, n.matches AS number_matches, nm.matches AS name_matches, c.matches AS coverage_matches,
        nv.matches AS number_verified, nmv.matches AS name_verified, fn.matches AS field_number_matches,
        fnv.matches AS field_number_verified, fnm.matches AS field_name_matches
      FROM location l
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE trim(a."numberPta") = l.pa_number) n(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE trim(a."numberPta") = l.field_number) fn(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE trim(a."numberPta") = l.field_number
        AND l.dept = ANY(a."departmentsServed") AND NULLIF(trim(a.email), '') IS NOT NULL) fnv(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE
        regexp_replace(translate(lower(a.name), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]', '', 'g') =
        regexp_replace(translate(lower(l.field_name), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]', '', 'g')) fnm(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE
        regexp_replace(translate(lower(a.name), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]', '', 'g') =
        regexp_replace(translate(lower(l.pa_name), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]', '', 'g')) nm(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE l.dept = ANY(a."departmentsServed") AND NULLIF(trim(a.email), '') IS NOT NULL) c(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE trim(a."numberPta") = l.pa_number
        AND l.dept = ANY(a."departmentsServed") AND NULLIF(trim(a.email), '') IS NOT NULL) nv(matches)
      CROSS JOIN LATERAL (SELECT count(*) FROM "AgeficePointAccueil" a WHERE
        regexp_replace(translate(lower(a.name), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]', '', 'g') =
        regexp_replace(translate(lower(l.pa_name), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc'), '[^a-z0-9]', '', 'g')
        AND l.dept = ANY(a."departmentsServed") AND NULLIF(trim(a.email), '') IS NOT NULL) nmv(matches)
    ) SELECT count(*)::int AS profiles,
      count(*) FILTER (WHERE cfp_cp IS NOT NULL)::int AS cfp_postal_present,
      count(*) FILTER (WHERE cfp_cp IS NULL AND org_cp IS NOT NULL)::int AS org_postal_fallback,
      count(*) FILTER (WHERE cfp_cp IS NULL AND org_cp IS NULL)::int AS postal_missing,
      count(*) FILTER (WHERE cfp_cp IS NOT NULL AND dept IS NOT NULL)::int AS department_from_cfp,
      count(*) FILTER (WHERE cfp_cp IS NULL AND dept IS NOT NULL)::int AS department_from_org,
      count(*) FILTER (WHERE dept IS NULL)::int AS department_unresolved,
      count(*) FILTER (WHERE pa_number IS NOT NULL)::int AS pa_number_present,
      count(*) FILTER (WHERE pa_name IS NOT NULL)::int AS pa_name_present,
      count(*) FILTER (WHERE field_number IS NOT NULL)::int AS field_pta_number_present,
      count(*) FILTER (WHERE field_number_matches = 1)::int AS field_pta_number_unique,
      count(*) FILTER (WHERE field_number_matches = 1 AND field_number_verified = 1)::int AS field_pta_number_unique_with_coverage,
      count(*) FILTER (WHERE field_name IS NOT NULL)::int AS field_pta_name_present,
      count(*) FILTER (WHERE field_name_matches = 1)::int AS field_pta_name_unique,
      count(*) FILTER (WHERE locked)::int AS manually_locked,
      count(*) FILTER (WHERE number_matches = 1)::int AS exact_number_unique,
      count(*) FILTER (WHERE number_matches > 1)::int AS exact_number_ambiguous,
      count(*) FILTER (WHERE pa_number IS NOT NULL AND number_matches = 0)::int AS exact_number_missing,
      count(*) FILTER (WHERE name_matches = 1)::int AS normalized_name_unique,
      count(*) FILTER (WHERE name_matches > 1)::int AS normalized_name_ambiguous,
      count(*) FILTER (WHERE pa_name IS NOT NULL AND name_matches = 0)::int AS normalized_name_missing,
      count(*) FILTER (WHERE dept IS NOT NULL AND coverage_matches = 1)::int AS department_unique,
      count(*) FILTER (WHERE dept IS NOT NULL AND coverage_matches > 1)::int AS department_ambiguous,
      count(*) FILTER (WHERE dept IS NOT NULL AND coverage_matches = 0)::int AS department_without_candidate,
      count(*) FILTER (WHERE NOT locked AND number_matches = 1 AND number_verified = 1)::int AS proposed_by_number_and_department,
      count(*) FILTER (WHERE NOT locked AND pa_number IS NULL AND name_matches = 1 AND name_verified = 1)::int AS proposed_by_name_and_department,
      count(*) FILTER (WHERE NOT locked AND pa_number IS NULL AND pa_name IS NULL AND coverage_matches = 1)::int AS proposed_by_department_alone
      FROM candidates`);
    await client.query('ROLLBACK');
    return {
      centres: centres.rows,
      profiles: profiles.rows[0],
      fieldKeys: fieldKeys.rows.map((r) => r.key),
      routing: routing.rows[0],
      readOnlyConfirmed: true,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

async function main() {
  const outDir = resolve(ROOT, 'verification');
  await mkdir(outDir, { recursive: true });
  const snapshotPath = arg('--snapshot');
  const official: Official = snapshotPath
    ? JSON.parse(await readFile(snapshotPath, 'utf8'))
    : await fetchOfficial();
  if (!snapshotPath)
    await writeFile(
      resolve(outDir, 'agefice-annuaire-officiel-2026-09-18.json'),
      JSON.stringify(official, null, 2) + '\n',
    );
  const report: string[] = [
    '# Audit du référentiel AGEFICE — 18 septembre 2026',
    '',
    `Audit exécuté : ${new Date().toISOString()}. Snapshot officiel : ${official.fetchedAt}.`,
    '',
    '## Méthode et limites',
    '',
    '- Lecture seule : transaction PostgreSQL BEGIN READ ONLY, contrôle du mode puis ROLLBACK. Aucun import ni modification en base.',
    '- Aucune personne ni document apprenant lus. Les profils sont interrogés uniquement par comptages agrégés ; aucune identité, aucun NIR ni secret enregistré.',
    '- Référentiel institutionnel : nom du point, numéro PTA, email professionnel public, code postal, ville et couverture. Pas de nom de contact.',
    '- Source : [annuaire officiel](https://communication-agefice.fr/trouver-un-point-daccueil/) et [endpoint public par département](https://communication-agefice.fr/ajax/json.php?dept=06). La page a retourné HTTP 503 via le navigateur de recherche ; l’endpoint public fonctionne séparément.',
    '- 101 départements au maximum, concurrence 3, pause 250 ms entre requêtes par worker, timeout 12 s. Aucune validation de délivrabilité SMTP.',
    '',
    '## Collecte officielle',
    '',
    `- Départements interrogés avec succès : ${official.successes.length}/101.`,
    `- Points d'accueil distincts : ${official.centres.length}.`,
    `- Points officiels sans email : ${official.centres.filter((c) => !norm(c.email)).length}.`,
    `- Échecs : ${official.failures.length}${official.failures.length ? ' (' + official.failures.map((f) => `${f.department}: ${f.reason}`).join('; ') + ')' : ''}.`,
    '',
  ];
  try {
    const db = await readDatabase();
    const byNumber = new Map<string, Stored[]>(),
      byNatural = new Map<string, Stored[]>();
    for (const c of db.centres) {
      if (norm(c.numberPta))
        byNumber.set(norm(c.numberPta), [...(byNumber.get(norm(c.numberPta)) ?? []), c]);
      const key = `${c.postalCode}|${fold(c.name)}`;
      byNatural.set(key, [...(byNatural.get(key) ?? []), c]);
    }
    const duplicates = [...byNumber].filter(([, rows]) => rows.length > 1);
    const duplicatesNatural = [...byNatural].filter(([, rows]) => rows.length > 1);
    const emails = new Map<string, number>();
    for (const c of db.centres)
      if (email(c.email)) emails.set(email(c.email), (emails.get(email(c.email)) ?? 0) + 1);
    const emailGroups = [...emails.values()].filter((n) => n > 1);
    const matched = new Set<Stored>();
    const differences: string[] = [],
      absent: Centre[] = [];
    let equal = 0;
    for (const c of official.centres) {
      const candidates =
        byNumber.get(c.numberPta) ??
        byNatural.get(`${c.postalCode}|${fold(c.name)}`) ??
        db.centres.filter(
          (d) => fold(d.name) === fold(c.name) && c.departmentsServed.includes(d.department),
        );
      if (!candidates.length) {
        absent.push(c);
        continue;
      }
      if (candidates.length > 1) {
        candidates.forEach((d) => matched.add(d));
        differences.push(
          `| ${cell(c.numberPta)} | ${cell(c.name)} | Rapprochement ambigu (${candidates.length} lignes) | — | ${cell(c.email)} |`,
        );
        continue;
      }
      // The empty and ambiguous cases above leave exactly one candidate.
      const d = candidates[0]!;
      matched.add(d);
      const changes: string[] = [];
      if (norm(d.numberPta) !== c.numberPta) changes.push('numéro PTA');
      if (email(d.email) !== email(c.email)) changes.push('email');
      if (fold(d.name) !== fold(c.name)) changes.push('nom');
      if (d.postalCode !== c.postalCode || fold(d.city) !== fold(c.city))
        changes.push('localisation');
      const currentCoverage = (d.departmentsServed ?? [])
        .filter((dep) => official.successes.includes(dep))
        .sort();
      if (JSON.stringify(currentCoverage) !== JSON.stringify(c.departmentsServed))
        changes.push(
          `couverture (base : ${currentCoverage.join('/') || 'vide'} ; officiel : ${c.departmentsServed.join('/') || 'vide'})`,
        );
      if (changes.length)
        differences.push(
          `| ${cell(c.numberPta)} | ${cell(c.name)} | ${changes.join(', ')} | ${cell(d.email) || 'absent'} | ${cell(c.email) || 'absent'} |`,
        );
      else equal++;
    }
    const unmatched = db.centres.filter((d) => !matched.has(d));
    report.push(
      '## État en base (production, transaction read-only confirmée)',
      '',
      `- Points enregistrés : ${db.centres.length}.`,
      `- Sans email : ${db.centres.filter((c) => !norm(c.email)).length}.`,
      `- Sans numéro PTA : ${db.centres.filter((c) => !norm(c.numberPta)).length}.`,
      `- Sans couverture départementale : ${db.centres.filter((c) => !c.departmentsServed?.length).length}.`,
      `- Numéros PTA en doublon : ${duplicates.length} groupes (${duplicates.reduce((n, [, r]) => n + r.length, 0)} lignes).`,
      `- Doublons nom normalisé + code postal : ${duplicatesNatural.length} groupes.`,
      `- Emails partagés entre plusieurs points : ${emailGroups.length} groupes (ne prouve pas un doublon).`,
      `- Profils AGEFICE : ${db.profiles.total} ; non rattachés : ${db.profiles.unattached} ; rattachés à un point sans email : ${db.profiles.attached_without_email}.`,
      '',
      '## Comparaison au snapshot officiel',
      '',
      `- Identiques sur les champs comparés : ${equal}.`,
      `- Points avec différences ou rapprochement ambigu : ${differences.length}.`,
      `- Points officiels non retrouvés en base : ${absent.length}.`,
      `- Points en base non retrouvés dans le snapshot : ${unmatched.length}. Leur absence ne justifie aucune suppression, particulièrement si collecte partielle.`,
      '',
      '| PTA officiel | Point | Différences | Email en base | Email officiel |',
      '|---|---|---|---|---|',
      ...differences,
      '',
      '### Points officiels à rapprocher ou ajouter',
      '',
      '| PTA | Point | Email officiel | Départements couverts |',
      '|---|---|---|---|',
      ...absent.map(
        (c) =>
          `| ${cell(c.numberPta)} | ${cell(c.name)} | ${cell(c.email)} | ${c.departmentsServed.join(', ')} |`,
      ),
      '',
      '### Points en base non rapprochés',
      '',
      '| PTA | Point | Email |',
      '|---|---|---|',
      ...unmatched.map((c) => `| ${cell(c.numberPta)} | ${cell(c.name)} | ${cell(c.email)} |`),
      '',
      '## Audit agrégé des rattachements (aucune identité exportée)',
      '',
      'Clés présentes dans paFields (noms de champs seulement) :',
      '',
      ...db.fieldKeys.map((key: string) => `- ${cell(key)}`),
      '',
      'Le code postal paFields est une donnée historique du formulaire : sa présence ne prouve pas une extraction vérifiée de la dernière attestation CFP. Le repli sur l’adresse entreprise sert au diagnostic et doit rester distingué de la CFP.',
      '',
      '| Indicateur | Nombre |',
      '|---|---|',
      ...Object.entries(db.routing).map(([key, value]) => `| ${key} | ${value} |`),
      '',
      `Conclusion de la simulation : ${db.routing.proposed_by_number_and_department + db.routing.proposed_by_name_and_department + db.routing.proposed_by_department_alone} rattachement automatique proposé par les règles conservatrices. ${db.routing.department_ambiguous} profils ont plusieurs candidats par département et ${db.routing.department_unresolved} n’ont pas de département calculable. Les clés historiques de PTA ne suffisent pas si leurs valeurs sont absentes ou ne correspondent pas exactement à l’annuaire.`,
      '',
      '### Proposition de correction en simulation uniquement',
      '',
      '1. Préserver les points historiques et toutes les sélections verrouillées manuellement. Corriger séparément la couverture officielle du PTA 83 (ajout du 51, maintien du 08).',
      '2. Pour un profil non verrouillé, proposer son numéro PTA exact uniquement s’il désigne un point unique avec email et couverture compatible avec son département vérifié. Un numéro présent mais invalide ne doit pas déclencher un repli silencieux.',
      '3. En l’absence de numéro, proposer un nom normalisé exact seulement si unique et compatible avec la couverture. Les rapprochements approximatifs restent à examiner.',
      '4. Sans numéro ni nom, ne proposer un point automatiquement que si la couverture départementale donne un candidat unique. Plusieurs candidats doivent être présentés pour choix ; ni ordre alphabétique ni proximité postale ne constituent une décision utilisateur.',
      '5. Avant toute écriture, produire un aperçu sécurisé dans QualiOF des propositions et conflits, distinguer la provenance CFP de l’adresse entreprise, puis appliquer seulement les décisions validées avec contrôle de concurrence. Cet audit ne crée aucun rattachement.',
      '',
      '## Suite recommandée',
      '',
      'Examiner les différences, rapprocher les lignes sans PTA et préserver les rattachements existants avant une éventuelle mise à jour. Ce script ne modifie jamais les données. Les domaines et adresses issus de la source officielle restent à vérifier au moment du dépôt ; une présence dans l’annuaire ne prouve pas la délivrabilité.',
      '',
    );
    console.log(
      JSON.stringify({
        databaseReadOnly: true,
        points: db.centres.length,
        missingEmail: db.centres.filter((c) => !norm(c.email)).length,
        officialPoints: official.centres.length,
        departments: official.successes.length,
        differences: differences.length,
        officialUnmatched: absent.length,
        storedUnmatched: unmatched.length,
        profiles: db.profiles,
        fieldKeys: db.fieldKeys,
        routing: db.routing,
      }),
    );
  } catch (error) {
    const rawCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const reason = /^[A-Z0-9_]{2,40}$/.test(rawCode)
      ? rawCode
      : 'CONNEXION_OU_CONFIGURATION_INDISPONIBLE';
    report.push(
      '## État en base non vérifié',
      '',
      `La connexion ou lecture a échoué (${reason}). Aucun résultat sur le contenu de la base ne peut être affirmé. La collecte officielle reste disponible pour reprise. Aucun détail de connexion n’est exposé.`,
      '',
    );
    console.log(
      JSON.stringify({
        databaseReadOnly: 'not_verified',
        reason,
        officialPoints: official.centres.length,
        departments: official.successes.length,
      }),
    );
  }
  await writeFile(resolve(outDir, 'agefice-annuaire-2026-09-18.md'), report.join('\n'));
}

main().catch(() => {
  console.error(
    'Audit interrompu avant rapport ; vérifier les chemins locaux et dépendances. Aucun détail de connexion affiché.',
  );
  process.exitCode = 1;
});
