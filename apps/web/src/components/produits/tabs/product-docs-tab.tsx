import Link from 'next/link';
import { prisma } from '@qualiof/db';
import { getDocsForProduct } from '@/lib/docs/get-docs-for';
import { UnifiedDocsList } from '@/components/docs/unified-docs-list';
import type { UnifiedDoc } from '@/lib/docs/resolve-docs';

/**
 * Phase 9.3 Plan 09.3-03 Task 3 — Tab « Documents » de la fiche produit
 * (NAV-02(b)(c), Server Component).
 *
 * Agrège via `getDocsForProduct` (resolveDocs sur les 6 sources) :
 *  - docs product-level (PROGRAMME, déroulé…) ;
 *  - docs des sessions/apprenants du produit (NAV-02b) ;
 *  - liens docs tenant (CGV/RI) croisés (NAV-02c).
 *
 * 09.3-03-fix CORRECTION 3 — GROUPAGE hiérarchique (lisibilité audit) :
 *   (a) en tête, les documents du PRODUIT (programme, déroulé — version courante) ;
 *   (b) puis une SECTION PAR SESSION triée par date décroissante (code SES + dates),
 *       avec ses docs partagés ;
 *   (c) dans chaque session, un SOUS-BLOC PAR APPRENANT regroupant ses docs, avec
 *       un lien « Voir ses documents » → /app/apprenants/{personId}?tab=documents
 *       (cohérent avec l'onglet apprenant déjà livré). « Je clique sur l'apprenant,
 *       j'ai tout. »
 *   C'est du tri/groupage CÔTÉ RENDU — le résolveur reste inchangé.
 *
 * 09.3-03-fix CORRECTION 2 — le compteur ne compte QUE les docs courants
 * (`isCurrent`), il redevient honnête.
 *
 * D-09.3-06 — ≤2 clics : chaque doc porte sa cross-nav via `<UnifiedDocsList>`.
 * Scope tenantId garanti par le wrapper.
 */

interface Props {
  productId: string;
  tenantId: string;
}

export async function ProductDocsTab({ productId, tenantId }: Props) {
  const docs = await getDocsForProduct(productId, tenantId);

  // CORRECTION 2 — compteur honnête : versions courantes uniquement.
  const currentDocs = docs.filter((d) => d.isCurrent);

  // Partition par niveau d'ancrage.
  const productDocs: UnifiedDoc[] = [];
  const sessionDocs: UnifiedDoc[] = []; // anchor.level === 'session'
  const tenantDocs: UnifiedDoc[] = [];
  // participantDocs groupés par sessionId puis participantId.
  const perSessionParticipant = new Map<string, Map<string, UnifiedDoc[]>>();
  const sessionIdsSet = new Set<string>();
  const participantIdsSet = new Set<string>();

  for (const d of currentDocs) {
    switch (d.anchor.level) {
      case 'product':
        productDocs.push(d);
        break;
      case 'tenant':
        tenantDocs.push(d);
        break;
      case 'session':
        sessionDocs.push(d);
        sessionIdsSet.add(d.anchor.sessionId);
        break;
      case 'participant': {
        const sid = d.anchor.sessionId;
        const pid = d.anchor.participantId;
        sessionIdsSet.add(sid);
        participantIdsSet.add(pid);
        let bySession = perSessionParticipant.get(sid);
        if (!bySession) {
          bySession = new Map();
          perSessionParticipant.set(sid, bySession);
        }
        const arr = bySession.get(pid);
        if (arr) arr.push(d);
        else bySession.set(pid, [d]);
        break;
      }
    }
  }

  const sessionIds = Array.from(sessionIdsSet);
  const participantIds = Array.from(participantIdsSet);

  // Métadonnées sessions (code + dates) et participants (personId + nom) pour les titres.
  const [sessions, participants] = await Promise.all([
    sessionIds.length
      ? prisma.trainingSession.findMany({
          where: { id: { in: sessionIds }, tenantId },
          select: { id: true, code: true, name: true, startDate: true, endDate: true },
        })
      : Promise.resolve([]),
    participantIds.length
      ? prisma.sessionParticipant.findMany({
          // SessionParticipant n'a pas de tenantId direct ; le scope est assuré en
          // amont : les participantIds proviennent de docs déjà scopés tenantId par
          // `getDocsForProduct`, et on re-filtre sur les sessions scopées tenant.
          where: { id: { in: participantIds }, session: { tenantId } },
          select: {
            id: true,
            person: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const sessionMetaById = new Map(sessions.map((s) => [s.id, s]));
  const participantMetaById = new Map(participants.map((p) => [p.id, p]));

  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtRange = (start?: Date | null, end?: Date | null) => {
    if (!start) return '';
    const s = dateFmt.format(new Date(start));
    if (!end) return s;
    const e = dateFmt.format(new Date(end));
    return s === e ? s : `${s} → ${e}`;
  };

  // Tri sessions par date décroissante (les sans-date en fin).
  const orderedSessionIds = [...sessionIds].sort((a, b) => {
    const da = sessionMetaById.get(a)?.startDate?.getTime() ?? 0;
    const db = sessionMetaById.get(b)?.startDate?.getTime() ?? 0;
    return db - da;
  });

  return (
    <section className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          Documents du produit ({currentDocs.length})
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Programme et déroulé du produit, puis preuves regroupées par session et par
          apprenant, plus les documents organisme (CGV/RI). Un document en mode stub est
          signalé « non conforme ».
        </p>
      </div>

      {/* (a) Documents du produit */}
      {productDocs.length > 0 && (
        <div className="border-b border-border">
          <div className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Documents du produit
          </div>
          <UnifiedDocsList docs={productDocs} />
        </div>
      )}

      {/* (b) Sections par session, date décroissante */}
      {orderedSessionIds.map((sid) => {
        const meta = sessionMetaById.get(sid);
        const shared = sessionDocs.filter(
          (d) => d.anchor.level === 'session' && d.anchor.sessionId === sid,
        );
        const byParticipant = perSessionParticipant.get(sid) ?? new Map<string, UnifiedDoc[]>();

        return (
          <div key={sid} className="border-b border-border">
            <div className="px-5 pt-4 pb-2 flex items-center gap-2 flex-wrap">
              <Link
                href={`/app/sessions/${sid}`}
                className="font-mono text-[11px] bg-muted/60 px-2 py-0.5 rounded hover:bg-muted"
              >
                {meta?.code ?? sid}
              </Link>
              <span className="text-sm font-medium text-foreground">{meta?.name ?? ''}</span>
              {meta && (
                <span className="text-xs text-muted-foreground">
                  {fmtRange(meta.startDate, meta.endDate)}
                </span>
              )}
            </div>

            {/* docs partagés de la session */}
            {shared.length > 0 && <UnifiedDocsList docs={shared} />}

            {/* (c) sous-bloc par apprenant */}
            {Array.from(byParticipant.entries()).map(([pid, pdocs]) => {
              const pmeta = participantMetaById.get(pid);
              const personId = pmeta?.person?.id;
              const fullName = pmeta
                ? `${pmeta.person.lastName.toUpperCase()} ${pmeta.person.firstName}`
                : 'Apprenant';
              return (
                <div key={pid} className="px-5 py-2 ml-2 border-l border-border">
                  <div className="flex items-center justify-between gap-2 flex-wrap py-1">
                    <span className="text-xs font-semibold text-foreground">{fullName}</span>
                    {personId && (
                      <Link
                        href={`/app/apprenants/${personId}?tab=documents`}
                        className="text-xs text-primary hover:underline"
                      >
                        Voir ses documents
                      </Link>
                    )}
                  </div>
                  <UnifiedDocsList docs={pdocs} />
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Documents organisme (tenant) */}
      {tenantDocs.length > 0 && (
        <div>
          <div className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Documents organisme
          </div>
          <UnifiedDocsList docs={tenantDocs} />
        </div>
      )}

      {currentDocs.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground italic">
          Aucun document. Les preuves Qualiopi du produit, de ses sessions et de ses
          apprenants apparaîtront ici dès qu'elles seront produites.
        </p>
      )}
    </section>
  );
}
