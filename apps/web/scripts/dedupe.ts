/**
 * Détection + fusion des doublons Person / Organization.
 *
 * Stratégies :
 *  1. Organization par SIRET commun (Olivier Besset)
 *  2. Organization "EI personnelle" multi-rattachée à la même Person — i.e.
 *     pour une même Person, plusieurs Orgs sous LegalLink EI_SELF avec nom
 *     contenant les tokens nom/prénom de la Person (Marie-Jo Battesti)
 *  3. Person par nom+prénom normalisés stricts (avec inversion) — Vanessa
 *     Fontaine, Steve Noel
 *
 * Mécanique fusion (canonique = plus de dépendances, et ExternalIdentity SmartOF
 * prioritaire) :
 *  - Reassign : LegalLink, SessionParticipant (personId, sponsorOrgId),
 *    SessionTrainer, Document (where matching entityType), Invoice
 *    (payerOrgId), AgeficeProfile, SensitiveData, ExternalIdentity, Lead,
 *    InternalComment
 *  - Delete les doublons
 *
 * Usage :
 *   pnpm tsx scripts/dedupe.ts            # dry-run (defaut)
 *   pnpm tsx scripts/dedupe.ts --apply    # fusion réelle (transaction)
 *
 * Refacto 09.2 : extraction mergeOrgsTx/mergePersonsTx pour testabilité.
 * Le mécanisme de repointage FK est INCHANGÉ — seules l'extraction (un duplicate
 * par appel, dans un tx injecté), les exports nommés et la garde main() sont
 * ajoutés. Cf. RECONCILE-RULES section 0 / 7c. Permet à dedupe.merge.test.ts de
 * prouver l'invariant ExternalIdentity perdant→survivant en transaction réelle.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma, Prisma } from '@qualiof/db';

const APPLY = process.argv.includes('--apply');
const skipArg = process.argv.find((a) => a.startsWith('--skip='))?.split('=')[1] ?? '';
const SKIP_PATTERNS = skipArg
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function shouldSkip(labels: string[]): boolean {
  if (SKIP_PATTERNS.length === 0) return false;
  return SKIP_PATTERNS.some((p) => labels.some((l) => l.toLowerCase().includes(p)));
}

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ── Helpers pour scoring "canonique" ────────────────────────────

async function scoreOrg(id: string): Promise<number> {
  const [llCount, partCount, invCount, hasSmartof, hasAirtable, hasAgefice] = await Promise.all([
    prisma.legalLink.count({ where: { organizationId: id } }),
    prisma.sessionParticipant.count({ where: { sponsorOrgId: id } }),
    prisma.invoice.count({ where: { payerOrgId: id } }),
    prisma.externalIdentity.count({
      where: { source: 'smartof', entityType: 'Organization', entityId: id },
    }),
    prisma.externalIdentity.count({
      where: { source: 'airtable', entityType: 'Organization', entityId: id },
    }),
    prisma.ageficeProfile.count({ where: { organizationId: id } }),
  ]);
  return (
    hasSmartof * 1000 +
    hasAirtable * 100 +
    hasAgefice * 10 +
    invCount * 5 +
    partCount * 3 +
    llCount
  );
}

async function scorePerson(id: string): Promise<number> {
  const [llCount, partCount, trainCount, hasSmartof, hasAirtable, hasSensitive] = await Promise.all([
    prisma.legalLink.count({ where: { personId: id } }),
    prisma.sessionParticipant.count({ where: { personId: id } }),
    prisma.sessionTrainer.count({ where: { personId: id } }),
    prisma.externalIdentity.count({
      where: { source: 'smartof', entityType: 'Person', entityId: id },
    }),
    prisma.externalIdentity.count({
      where: { source: 'airtable', entityType: 'Person', entityId: id },
    }),
    prisma.sensitiveData.count({ where: { personId: id } }),
  ]);
  return (
    hasSmartof * 1000 +
    hasAirtable * 100 +
    hasSensitive * 50 +
    partCount * 5 +
    trainCount * 5 +
    llCount
  );
}

async function pickCanonical<T>(
  ids: string[],
  scorer: (id: string) => Promise<number>,
): Promise<{ canonical: string; duplicates: string[] }> {
  const scored = await Promise.all(ids.map(async (id) => ({ id, s: await scorer(id) })));
  scored.sort((a, b) => b.s - a.s);
  return { canonical: scored[0]!.id, duplicates: scored.slice(1).map((x) => x.id) };
}

// ── Fusion Organization ────────────────────────────────────────

// Fusion d'UN duplicate dans le tx fourni (injectable pour test). Mécanisme INCHANGÉ.
export async function mergeOrgsTx(
  tx: Prisma.TransactionClient,
  canonical: string,
  dup: string,
): Promise<void> {
  // 1. LegalLinks : update pointing-to-dup. Si conflit unique (personId, orgCanonical, role), on supprime le LL du dup.
  const lls = await tx.legalLink.findMany({ where: { organizationId: dup } });
  for (const ll of lls) {
    const existsCanon = await tx.legalLink.findFirst({
      where: { personId: ll.personId, organizationId: canonical, role: ll.role },
    });
    if (existsCanon) {
      await tx.legalLink.delete({ where: { id: ll.id } });
    } else {
      await tx.legalLink.update({
        where: { id: ll.id },
        data: { organizationId: canonical },
      });
    }
  }
  // 2. SessionParticipant.sponsorOrgId
  await tx.sessionParticipant.updateMany({
    where: { sponsorOrgId: dup },
    data: { sponsorOrgId: canonical },
  });
  // 3. Invoice.payerOrgId
  await tx.invoice.updateMany({
    where: { payerOrgId: dup },
    data: { payerOrgId: canonical },
  });
  // 4. AgeficeProfile (organizationId @unique) : si canonical en a un, on supprime celui du dup
  const dupProf = await tx.ageficeProfile.findUnique({
    where: { organizationId: dup },
  });
  if (dupProf) {
    const canonProf = await tx.ageficeProfile.findUnique({
      where: { organizationId: canonical },
    });
    if (canonProf) {
      await tx.ageficeProfile.delete({ where: { id: dupProf.id } });
    } else {
      await tx.ageficeProfile.update({
        where: { id: dupProf.id },
        data: { organizationId: canonical },
      });
    }
  }
  // 5. ExternalIdentity entityType='Organization'
  await tx.externalIdentity.updateMany({
    where: { entityType: 'Organization', entityId: dup },
    data: { entityId: canonical },
  });
  // 6. Document polymorphique
  await tx.document.updateMany({
    where: { entityType: 'organization', entityId: dup },
    data: { entityId: canonical },
  });
  // 7. Contact.organizationId
  await tx.contact.updateMany({
    where: { organizationId: dup },
    data: { organizationId: canonical },
  });
  // 8. Delete dup
  await tx.organization.delete({ where: { id: dup } });
}

export async function mergeOrgs(canonical: string, duplicates: string[]): Promise<void> {
  for (const dup of duplicates) {
    await prisma.$transaction((tx) => mergeOrgsTx(tx, canonical, dup));
  }
}

// ── Fusion Person ───────────────────────────────────────────────

// Fusion d'UNE Person duplicate dans le tx fourni (injectable pour test). Mécanisme INCHANGÉ.
export async function mergePersonsTx(
  tx: Prisma.TransactionClient,
  canonical: string,
  dup: string,
): Promise<void> {
  // 1. LegalLinks
  const lls = await tx.legalLink.findMany({ where: { personId: dup } });
  for (const ll of lls) {
    const existsCanon = await tx.legalLink.findFirst({
      where: { personId: canonical, organizationId: ll.organizationId, role: ll.role },
    });
    if (existsCanon) {
      await tx.legalLink.delete({ where: { id: ll.id } });
    } else {
      await tx.legalLink.update({
        where: { id: ll.id },
        data: { personId: canonical },
      });
    }
  }
  // 2. SessionParticipant.personId — unique(sessionId, personId)
  const sps = await tx.sessionParticipant.findMany({ where: { personId: dup } });
  for (const sp of sps) {
    const existsCanon = await tx.sessionParticipant.findFirst({
      where: { sessionId: sp.sessionId, personId: canonical },
    });
    if (existsCanon) {
      // On garde le canonical, on supprime le doublon
      await tx.sessionParticipant.delete({ where: { id: sp.id } });
    } else {
      await tx.sessionParticipant.update({
        where: { id: sp.id },
        data: { personId: canonical },
      });
    }
  }
  // 3. SessionTrainer.personId
  const sts = await tx.sessionTrainer.findMany({ where: { personId: dup } });
  for (const st of sts) {
    const existsCanon = await tx.sessionTrainer.findFirst({
      where: { sessionId: st.sessionId, personId: canonical },
    });
    if (existsCanon) {
      await tx.sessionTrainer.delete({ where: { id: st.id } });
    } else {
      await tx.sessionTrainer.update({
        where: { id: st.id },
        data: { personId: canonical },
      });
    }
  }
  // 4. SensitiveData (personId @unique 1:1)
  const dupSensit = await tx.sensitiveData.findUnique({ where: { personId: dup } });
  if (dupSensit) {
    const canonSensit = await tx.sensitiveData.findUnique({
      where: { personId: canonical },
    });
    if (canonSensit) {
      await tx.sensitiveData.delete({ where: { id: dupSensit.id } });
    } else {
      await tx.sensitiveData.update({
        where: { id: dupSensit.id },
        data: { personId: canonical },
      });
    }
  }
  // 5. ExternalIdentity entityType='Person'
  await tx.externalIdentity.updateMany({
    where: { entityType: 'Person', entityId: dup },
    data: { entityId: canonical },
  });
  // 6. Document polymorphique
  await tx.document.updateMany({
    where: { entityType: 'person', entityId: dup },
    data: { entityId: canonical },
  });
  // 7. Lead.personId
  await tx.lead.updateMany({
    where: { personId: dup },
    data: { personId: canonical },
  });
  // 8. InternalComment.personId
  await tx.internalComment.updateMany({
    where: { personId: dup },
    data: { personId: canonical },
  });
  // 9. Delete dup
  await tx.person.delete({ where: { id: dup } });
}

export async function mergePersons(canonical: string, duplicates: string[]): Promise<void> {
  for (const dup of duplicates) {
    await prisma.$transaction((tx) => mergePersonsTx(tx, canonical, dup));
  }
}

// ── Détection ──────────────────────────────────────────────────

export async function detectOrgsBySiret(tenantId: string): Promise<
  Array<{ siret: string; ids: string[]; names: string[] }>
> {
  const groups = await prisma.organization.groupBy({
    by: ['siret'],
    where: { tenantId, siret: { not: null } },
    _count: { _all: true },
    having: { siret: { _count: { gt: 1 } } },
  });
  const result: Array<{ siret: string; ids: string[]; names: string[] }> = [];
  for (const g of groups) {
    if (!g.siret) continue;
    const orgs = await prisma.organization.findMany({
      where: { tenantId, siret: g.siret },
      select: { id: true, legalName: true },
    });
    // Filtre : on ne dédupe que si les noms se ressemblent (sinon = SIRET partagé erroné)
    const nameSet = new Set(orgs.map((o) => normalize(o.legalName)));
    let similar = false;
    for (const a of nameSet) {
      for (const b of nameSet) {
        if (a === b) continue;
        if (a.includes(b) || b.includes(a)) {
          similar = true;
          break;
        }
        // tokens overlap
        const ta = new Set(a.split(' '));
        const tb = new Set(b.split(' '));
        let inter = 0;
        for (const t of ta) if (tb.has(t)) inter++;
        if (inter >= 2) similar = true;
        if (similar) break;
      }
      if (similar) break;
    }
    if (similar) {
      result.push({
        siret: g.siret,
        ids: orgs.map((o) => o.id),
        names: orgs.map((o) => o.legalName),
      });
    }
  }
  return result;
}

async function detectEiSelfOrgsPerPerson(tenantId: string): Promise<
  Array<{ personId: string; personName: string; orgIds: string[]; orgNames: string[] }>
> {
  // Pour chaque Person, lister ses LegalLinks EI_SELF
  const persons = await prisma.person.findMany({
    where: { tenantId, legalLinks: { some: { role: 'EI_SELF' } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      legalLinks: {
        where: { role: 'EI_SELF' },
        select: {
          organization: { select: { id: true, legalName: true } },
        },
      },
    },
  });
  const result: Array<{ personId: string; personName: string; orgIds: string[]; orgNames: string[] }> = [];
  for (const p of persons) {
    if (p.legalLinks.length < 2) continue;
    const nameTokens = new Set([
      ...normalize(p.firstName).split(' '),
      ...normalize(p.lastName).split(' '),
    ]);
    // garde les orgs dont le nom contient au moins 1 token nom/prénom (sinon = autre relation)
    const candidates = p.legalLinks.filter((ll) => {
      const orgTokens = new Set(normalize(ll.organization.legalName).split(' '));
      let hits = 0;
      for (const t of nameTokens) if (orgTokens.has(t)) hits++;
      return hits >= 1;
    });
    if (candidates.length >= 2) {
      result.push({
        personId: p.id,
        personName: `${p.firstName} ${p.lastName}`,
        orgIds: candidates.map((c) => c.organization.id),
        orgNames: candidates.map((c) => c.organization.legalName),
      });
    }
  }
  return result;
}

export async function detectPersonsByName(
  tenantId: string,
  // Client injectable (testabilité 09.2) : par défaut le singleton (CLI inchangé).
  // Le test passe un client lié à qualiof_test pour ne JAMAIS lire/écrire la prod-locale.
  client: Pick<typeof prisma, 'person'> = prisma,
): Promise<Array<{ key: string; ids: string[]; names: string[] }>> {
  const persons = await client.person.findMany({
    where: { tenantId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const buckets = new Map<string, typeof persons>();
  for (const p of persons) {
    const a = normalize(`${p.firstName} ${p.lastName}`);
    const b = normalize(`${p.lastName} ${p.firstName}`);
    const key = [a, b].sort().join('|');
    if (!key.trim() || key === '|') continue;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  const out: Array<{ key: string; ids: string[]; names: string[] }> = [];
  for (const [key, arr] of buckets) {
    if (arr.length < 2) continue;
    // Filtre : si les emails sont radicalement différents (et tous non-null) → possible 2 vraies personnes
    const emails = arr.map((x) => x.email).filter(Boolean) as string[];
    const uniqEmails = new Set(emails.map((e) => e.toLowerCase()));
    if (uniqEmails.size > 1 && emails.length === arr.length) continue; // tous différents → probable 2 personnes
    out.push({
      key,
      ids: arr.map((p) => p.id),
      names: arr.map((p) => `${p.firstName} ${p.lastName}${p.email ? ` <${p.email}>` : ''}`),
    });
  }
  return out;
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Mode : ${APPLY ? '🟢 APPLY (fusion réelle)' : '🟡 DRY-RUN'}`);
  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error('No tenant');

  // 1. Org doublons par SIRET
  const orgsBySiret = await detectOrgsBySiret(tenant.id);
  console.log(`\n[1] Org doublons par SIRET : ${orgsBySiret.length} groupes`);
  for (const g of orgsBySiret) {
    const { canonical, duplicates } = await pickCanonical(g.ids, scoreOrg);
    console.log(
      `  • SIRET ${g.siret} : ${g.names.join(' / ')} → canonique ${canonical.slice(0, 8)} (supprime ${duplicates.length})`,
    );
    if (APPLY) await mergeOrgs(canonical, duplicates);
  }

  // 2. Org EI multi-rattachées à la même Person
  const eiGroups = await detectEiSelfOrgsPerPerson(tenant.id);
  console.log(`\n[2] Person avec orgs EI multiples (probable doublon EI) : ${eiGroups.length}`);
  for (const g of eiGroups) {
    if (shouldSkip([g.personName, ...g.orgNames])) {
      console.log(`  ⏭️  SKIP ${g.personName} (--skip)`);
      continue;
    }
    const { canonical, duplicates } = await pickCanonical(g.orgIds, scoreOrg);
    console.log(`  • ${g.personName} : ${g.orgNames.join(' / ')} → canonique ${canonical.slice(0, 8)} (supprime ${duplicates.length})`);
    if (APPLY) await mergeOrgs(canonical, duplicates);
  }

  // 3. Person doublons par nom
  const personGroups = await detectPersonsByName(tenant.id);
  console.log(`\n[3] Person doublons par nom : ${personGroups.length} groupes`);
  for (const g of personGroups) {
    const { canonical, duplicates } = await pickCanonical(g.ids, scorePerson);
    console.log(`  • ${g.names.join(' / ')} → canonique ${canonical.slice(0, 8)} (supprime ${duplicates.length})`);
    if (APPLY) await mergePersons(canonical, duplicates);
  }

  console.log('\nDone.');
  process.exit(0);
}

// Garde : n'exécute la détection complète que lancé directement (jamais à l'import,
// que le test fait pour réutiliser mergeOrgsTx/mergePersonsTx/detectPersonsByName).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isMain) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}
