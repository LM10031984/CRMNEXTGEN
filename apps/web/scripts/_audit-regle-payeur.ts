/**
 * Quick 260821-md8 — diagnostic « règle payeur personne morale ».
 *
 * ⚠ AUCUNE écriture. 100 % SELECT.
 *
 * POURQUOI :
 * la règle du 12/08 (payeur personne morale ⇒ UNE convention de groupe + UNE
 * analyse des besoins au nom de l'entreprise, jamais par stagiaire) est
 * désormais appliquée par l'application. Elle ne rattrape PAS le passé : les
 * documents produits avant — conventions nominatives, analyses par stagiaire,
 * et surtout les DOUBLONS de convention de groupe entre les deux formes de
 * stockage (`entityType='session'` côté scripts `_gen-*` et
 * `entityType='organization'` côté appli) — sont toujours en base.
 *
 * Ce script les LISTE. Il n'en supprime aucun : la remédiation est une étape
 * séparée, sur mot de Laurent (règle projet « destructif = étape séparée »).
 * Sa sortie EST la liste de remédiation à soumettre.
 *
 * ⚠ Le `.env` racine pointe la base CLOUD de production. C'est voulu : c'est
 * elle qu'on diagnostique. Le script est intégralement en lecture.
 *
 * USAGE (depuis apps/web — `tsx` n'est pas hoisté à la racine) :
 *   pnpm dotenv -e ../../.env -- tsx scripts/_audit-regle-payeur.ts
 */

import { prisma } from '@qualiof/db';
import { isPersonneMoralePayeur } from '../src/lib/sessions/payer-rule';
import { GROUP_CONVENTION_ENTITY_TYPE } from '../src/lib/docs/convention-coverage';

interface SessionAudit {
  tenantId: string;
  code: string;
  sessionName: string;
  commanditaires: { id: string; legalName: string; legalForm: string; representant: string | null; effectif: number }[];
  effectifTotal: number;
  conventionsFormeOrganization: { id: string }[];
  conventionsFormeSession: { id: string }[];
  conventionsIndividuelles: { id: string; nom: string }[];
  analysesParStagiaire: { id: string; nom: string }[];
  analyseEntreprise: boolean;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  console.log('');
  console.log('AUDIT « RÈGLE PAYEUR PERSONNE MORALE » — LECTURE SEULE');
  console.log('='.repeat(78));

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  const audits: SessionAudit[] = [];

  for (const tenant of tenants) {
    const sessions = await prisma.trainingSession.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        code: true,
        name: true,
        startDate: true,
        participants: {
          select: {
            id: true,
            sponsorOrgId: true,
            person: { select: { firstName: true, lastName: true } },
            sponsorOrg: {
              select: { id: true, legalName: true, legalForm: true, representative: true },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    for (const session of sessions) {
      // Ne retenir que les sessions portant au moins un commanditaire personne
      // morale : les sessions 100 % auto-payeurs ne sont pas concernées.
      const salaries = session.participants.filter((p) =>
        isPersonneMoralePayeur(p.sponsorOrg?.legalForm),
      );
      if (salaries.length === 0) continue;

      const parOrg = new Map<string, SessionAudit['commanditaires'][number]>();
      for (const p of salaries) {
        const org = p.sponsorOrg!;
        const found = parOrg.get(org.id);
        if (found) found.effectif += 1;
        else
          parOrg.set(org.id, {
            id: org.id,
            legalName: org.legalName,
            legalForm: org.legalForm,
            representant: org.representative?.trim() ? org.representative.trim() : null,
            effectif: 1,
          });
      }

      const participantIds = session.participants.map((p) => p.id);

      const conventions = await prisma.document.findMany({
        where: { tenantId: tenant.id, type: 'CONVENTION', sessionId: session.id },
        select: { id: true, entityType: true, entityId: true, participantId: true },
      });

      const analyses = await prisma.pedagogicalAsset.findMany({
        where: { tenantId: tenant.id, sessionId: session.id, kind: 'ANALYSE_BESOIN' },
        select: { id: true, participantId: true, pdfUrl: true },
      });

      const nomById = new Map(
        session.participants.map((p) => [
          p.id,
          `${p.person.firstName} ${p.person.lastName.toUpperCase()}`,
        ]),
      );
      const salariesIds = new Set(salaries.map((p) => p.id));

      audits.push({
        tenantId: tenant.id,
        code: session.code,
        sessionName: session.name ?? '',
        commanditaires: [...parOrg.values()],
        effectifTotal: participantIds.length,
        conventionsFormeOrganization: conventions
          .filter((d) => d.entityType === GROUP_CONVENTION_ENTITY_TYPE)
          .map((d) => ({ id: d.id })),
        conventionsFormeSession: conventions
          .filter((d) => d.entityType === 'session' && d.participantId === null)
          .map((d) => ({ id: d.id })),
        // Conventions nominatives portées par un SALARIÉ : elles ne devraient
        // plus exister (la convention de son employeur le couvre).
        conventionsIndividuelles: conventions
          .filter((d) => d.participantId !== null && salariesIds.has(d.participantId))
          .map((d) => ({ id: d.id, nom: nomById.get(d.participantId!) ?? d.participantId! })),
        analysesParStagiaire: analyses
          .filter((a) => a.participantId !== null && salariesIds.has(a.participantId))
          .map((a) => ({ id: a.id, nom: nomById.get(a.participantId!) ?? a.participantId! })),
        analyseEntreprise: analyses.some((a) => a.participantId === null && a.pdfUrl !== null),
      });
    }
  }

  if (audits.length === 0) {
    console.log('\nAucune session avec commanditaire personne morale.\n');
    await prisma.$disconnect();
    return;
  }

  let totalDoublons = 0;
  let totalConvIndividuelles = 0;
  let totalAnalysesParStagiaire = 0;
  let totalAnalysesEntrepriseAbsentes = 0;
  let totalRepresentantsAbsents = 0;

  for (const a of audits) {
    const nbOrg = a.conventionsFormeOrganization.length;
    const nbSession = a.conventionsFormeSession.length;
    const totalGroupe = nbOrg + nbSession;
    const doublon = totalGroupe > 1;
    if (doublon) totalDoublons += 1;
    totalConvIndividuelles += a.conventionsIndividuelles.length;
    totalAnalysesParStagiaire += a.analysesParStagiaire.length;
    if (!a.analyseEntreprise) totalAnalysesEntrepriseAbsentes += 1;

    const orgs = a.commanditaires
      .map((o) => `${o.legalName} (${o.legalForm}, ${o.effectif})`)
      .join(' + ');

    console.log('');
    console.log('-'.repeat(78));
    console.log(`${a.code}${a.sessionName ? ` — ${a.sessionName}` : ''}`);
    console.log(`  ${pad('commanditaire(s)', 26)} ${orgs} · ${a.effectifTotal} inscrit(s)`);
    console.log(
      `  ${pad('conventions groupe', 26)} organization=${nbOrg} · session=${nbSession}` +
        (doublon ? `   ⚠ DOUBLON (${totalGroupe} conventions d'entreprise)` : totalGroupe === 0 ? '   ⚠ AUCUNE' : ''),
    );
    if (doublon) {
      for (const d of a.conventionsFormeOrganization) {
        console.log(`  ${pad('', 26)}   Document ${d.id}  (forme organization — À CONSERVER)`);
      }
      for (const d of a.conventionsFormeSession) {
        console.log(`  ${pad('', 26)}   Document ${d.id}  (forme session — doublon)`);
      }
    }
    console.log(
      `  ${pad('conventions individuelles', 26)} ${
        a.conventionsIndividuelles.length === 0
          ? '—'
          : `⚠ ${a.conventionsIndividuelles.length} : ${a.conventionsIndividuelles
              .map((d) => `${d.nom} [Document ${d.id}]`)
              .join(', ')}`
      }`,
    );
    console.log(
      `  ${pad('analyses par stagiaire', 26)} ${
        a.analysesParStagiaire.length === 0
          ? '—'
          : `⚠ ${a.analysesParStagiaire.length} : ${a.analysesParStagiaire
              .map((x) => `${x.nom} [PedagogicalAsset ${x.id}]`)
              .join(', ')}`
      }`,
    );
    console.log(
      `  ${pad('analyse entreprise', 26)} ${a.analyseEntreprise ? 'présente' : '⚠ ABSENTE'}`,
    );
    for (const o of a.commanditaires) {
      if (!o.representant) totalRepresentantsAbsents += 1;
      console.log(
        `  ${pad('représentant', 26)} ${o.legalName} → ${o.representant ?? '⚠ ABSENT (convention sans signataire)'}`,
      );
    }
  }

  console.log('');
  console.log('='.repeat(78));
  console.log('TOTAUX');
  console.log(`  sessions intra-entreprise auditées ....... ${audits.length}`);
  console.log(`  sessions à DOUBLON de convention groupe .. ${totalDoublons}`);
  console.log(`  conventions individuelles résiduelles .... ${totalConvIndividuelles}`);
  console.log(`  analyses des besoins par stagiaire ....... ${totalAnalysesParStagiaire}`);
  console.log(`  analyses d'entreprise absentes ........... ${totalAnalysesEntrepriseAbsentes}`);
  console.log(`  représentants légaux non renseignés ...... ${totalRepresentantsAbsents}`);
  console.log('');
  console.log(
    'Aucune suppression effectuée. La remédiation est une étape séparée, sur validation.',
  );
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[audit-regle-payeur] échec', e);
  process.exit(1);
});
