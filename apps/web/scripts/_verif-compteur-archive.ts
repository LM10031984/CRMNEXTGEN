/** Vérification sur données réelles : le compteur annoncé = les fichiers livrés. */
import { PED_KIND_TO_DOC_TYPE } from '../src/lib/doc-scope';
import { expandGroupConventions } from '../src/lib/docs/convention-coverage';
import { releveDeLaConvention } from '../src/lib/sessions/payer-rule';
import { buildParticipantPhaseGroups, resolveParticipantPhaseDocs } from '../src/lib/sessions/participant-phase-items';
import { buildSessionLearnerZipEntries, type LearnerDocRef } from '../src/lib/docs/session-learner-zip-entries';
import { DOC_PHASES, type DocPhase } from '../src/lib/docs/doc-phase';
import { downloadFile, DOCS_BUCKET } from '../src/lib/storage';

const { prisma } = await import('@qualiof/db');
const CODES = process.argv.slice(2).length ? process.argv.slice(2) : ['SES-0111', 'SES-0099'];
let ko = 0;

for (const code of CODES) {
  const s: any = await prisma.trainingSession.findFirst({
    where: { code },
    select: {
      id: true, code: true, tenantId: true, productId: true,
      participants: {
        select: {
          id: true, docStatus: true, sponsorOrgId: true,
          sponsorOrg: { select: { opcoCode: true, legalForm: true, brandName: true, legalName: true } },
          person: { select: { firstName: true, lastName: true, legalLinks: { select: { role: true, organizationId: true, organization: { select: { opcoCode: true } } } } } },
        },
      },
    },
  });
  if (!s) { console.log(`${code} introuvable`); continue; }
  console.log(`\n══════ ${s.code}`);
  const t = s.tenantId;

  for (const p of s.participants) {
    // ── maps, comme la route ZIP les construit
    const [pDocs, groupDocs, sDocs, prDocs, assets] = await Promise.all([
      prisma.document.findMany({ where: { tenantId: t, entityType: 'participant', entityId: p.id }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, pdfUrl: true } }),
      prisma.document.findMany({ where: { tenantId: t, type: 'CONVENTION' as any, OR: [{ entityType: 'organization', entityId: p.sponsorOrgId }, { entityType: 'session', entityId: s.id }] }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, entityType: true, entityId: true, pdfUrl: true } }),
      prisma.document.findMany({ where: { tenantId: t, entityType: 'session', entityId: s.id }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, pdfUrl: true } }),
      s.productId ? prisma.document.findMany({ where: { tenantId: t, entityType: 'product', entityId: s.productId }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, pdfUrl: true } }) : Promise.resolve([]),
      prisma.pedagogicalAsset.findMany({ where: { tenantId: t, sessionId: s.id, pdfUrl: { not: null }, OR: [{ participantId: p.id }, { participantId: null }] }, orderBy: { generatedAt: 'desc' }, select: { id: true, kind: true, participantId: true, pdfUrl: true } }),
    ]);
    const keys = new Map<string, string>();
    const first = (rows: any[]) => { const m = new Map<string, { id: string }>(); for (const d of rows) if (!m.has(d.type)) { m.set(d.type, { id: d.id }); if (d.pdfUrl) keys.set(`document:${d.id}`, d.pdfUrl); } return m; };
    const pMap = first(pDocs as any[]); const sMap = first(sDocs as any[]); const prMap = first(prDocs as any[]);
    const gc = expandGroupConventions(groupDocs as any, [{ id: p.id, sponsorOrgId: p.sponsorOrgId }]).get(p.id);
    if (gc && !pMap.has('CONVENTION')) { pMap.set('CONVENTION', { id: gc }); const r = (groupDocs as any[]).find((d) => d.id === gc); if (r?.pdfUrl) keys.set(`document:${gc}`, r.pdfUrl); }
    const releve = releveDeLaConvention({ sponsorLegalForm: p.sponsorOrg.legalForm, roleChezSponsor: p.person.legalLinks.find((l: any) => l.organizationId === p.sponsorOrgId)?.role ?? null });
    const aMap = new Map<string, { id: string }>();
    const prend = (a: any) => { const dt = PED_KIND_TO_DOC_TYPE[a.kind] ?? a.kind; if (aMap.has(dt)) return; aMap.set(dt, { id: a.id }); if (a.pdfUrl) keys.set(`asset:${a.id}`, a.pdfUrl); };
    for (const a of assets as any[]) if (a.participantId) prend(a);
    if (releve) for (const a of assets as any[]) if (!a.participantId && a.kind === 'ANALYSE_BESOIN') prend(a);

    const isAgefice = p.sponsorOrg.opcoCode === 'AGEFICE' || p.person.legalLinks.some((l: any) => l.role === 'EI_SELF' || l.organization?.opcoCode === 'AGEFICE');
    console.log(`\n  ${p.person.firstName} ${p.person.lastName}${isAgefice ? ' [AGEFICE]' : ''}`);

    for (const { id: phase, label } of DOC_PHASES) {
      // écran : compteur du bouton (maps de la page = celles-ci, projections comprises)
      const [g] = buildParticipantPhaseGroups({
        phase: phase as DocPhase,
        participants: [{ id: p.id, fullName: '', isAgefice, docStatus: p.docStatus, participantDocs: pMap, pedagogicalAssets: aMap }],
        productDocs: prMap, sessionDocs: sMap,
      });
      // archive : ce que la route livre vraiment, lecture du stockage comprise
      const refs: LearnerDocRef[] = resolveParticipantPhaseDocs({ phase: phase as DocPhase, isAgefice: true, docStatus: p.docStatus, participantDocs: pMap, productDocs: prMap, sessionDocs: sMap, pedagogicalAssets: aMap })
        .filter((d) => d.pdfRef).map((d) => ({ docType: d.docType, kind: (d.pdfRef!.kind === 'asset' ? 'asset' : 'document') as any, id: d.pdfRef!.id }));
      const entries = buildSessionLearnerZipEntries({ refs, phase: phase as DocPhase, firstName: p.person.firstName, lastName: p.person.lastName, sessionCode: s.code });
      const livres: string[] = [];
      for (const e of entries) {
        const k = keys.get(`${e.kind}:${e.id}`);
        if (!k) continue;
        try { await downloadFile(DOCS_BUCKET, k); livres.push(e.docType); } catch { /* illisible */ }
      }
      const ok = g!.readyCount === livres.length;
      if (!ok) ko++;
      console.log(`    ${ok ? '✅' : '❌'} ${label.padEnd(22)} bouton (${g!.readyCount}) · archive ${livres.length} fichier(s) : ${livres.join(', ') || '—'}`);
    }
  }
}
console.log(`\n${ko === 0 ? '✅ Aucun écart : le nombre annoncé est le nombre livré.' : `❌ ${ko} écart(s)`}`);
await prisma.$disconnect();
