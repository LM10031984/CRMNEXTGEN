import { describe, it, expect } from 'vitest';
import {
  classifyDocumentEngagement,
  engagementWarning,
  EMAIL_TRACKING_SINCE,
  type EngagementFacts,
} from '../document-engagement';

/**
 * Lot 0 · 0.2 — le trou « envoyé mais pas encore signé ».
 *
 * Ce qui compte ici n'est pas le classement en lui-même : c'est le refus de
 * dire « libre » quand on ne sait pas. Un document produit avant que
 * l'application ne trace les envois doit rester un doute affiché, jamais une
 * autorisation implicite.
 */

const APRES = new Date('2026-09-15T10:00:00.000Z');
const AVANT = new Date('2026-06-01T10:00:00.000Z');

function facts(o: Partial<EngagementFacts> = {}): EngagementFacts {
  return {
    docType: 'CONVENTION',
    createdAt: APRES,
    emailSends: [],
    submissionsWithDoc: [],
    conventionSigned: false,
    manuallyValidated: false,
    ...o,
  };
}

describe('preuves qu’un document est sorti', () => {
  it('un envoi tracé engage le document', () => {
    const r = classifyDocumentEngagement(
      facts({ emailSends: [{ sentAt: new Date('2026-09-16T09:00:00.000Z') }] }),
    );
    expect(r.level).toBe('ENGAGED');
    expect(r.reasons[0]).toContain('envoyé par email');
    expect(r.reasons[0]).toContain('16 septembre 2026');
  });

  it('un dossier financeur parti engage le document', () => {
    const r = classifyDocumentEngagement(
      facts({ submissionsWithDoc: [{ status: 'APPROVED', sentAt: new Date('2026-09-10T09:00:00.000Z') }] }),
    );
    expect(r.level).toBe('ENGAGED');
    expect(r.reasons[0]).toContain('dossier financeur');
    expect(r.reasons[0]).toContain('APPROVED');
  });

  it('une convention marquée signée engage la CONVENTION', () => {
    expect(classifyDocumentEngagement(facts({ conventionSigned: true })).level).toBe('ENGAGED');
  });

  it('mais `conventionSigned` n’engage pas les autres types de documents', () => {
    const r = classifyDocumentEngagement(facts({ docType: 'CONVOCATION', conventionSigned: true }));
    expect(r.level).toBe('FREE');
  });

  it('une preuve signée téléversée engage n’importe quel type', () => {
    const r = classifyDocumentEngagement(facts({ docType: 'ASSIDUITE', manuallyValidated: true }));
    expect(r.level).toBe('ENGAGED');
  });

  it('plusieurs preuves sont toutes rendues, dans l’ordre de gravité', () => {
    const r = classifyDocumentEngagement(
      facts({
        emailSends: [{ sentAt: null }],
        submissionsWithDoc: [{ status: 'SENT', sentAt: null }],
        conventionSigned: true,
      }),
    );
    expect(r.reasons).toHaveLength(3);
    expect(r.reasons[0]).toContain('email');
  });
});

describe('le passé non tracé reste un doute, pas une autorisation', () => {
  it('un document produit avant le suivi des envois ne peut pas être déclaré libre', () => {
    const r = classifyDocumentEngagement(facts({ createdAt: AVANT }));
    expect(r.level).toBe('MAYBE_SENT');
    expect(r.reasons[0]).toContain('avant le suivi des envois');
  });

  it('un document produit après, sans aucune trace, est libre', () => {
    expect(classifyDocumentEngagement(facts()).level).toBe('FREE');
  });

  it('la bascule est la date de la migration, pas une valeur en dur ailleurs', () => {
    const juste_avant = new Date(EMAIL_TRACKING_SINCE.getTime() - 1);
    const juste_apres = new Date(EMAIL_TRACKING_SINCE.getTime() + 1);
    expect(classifyDocumentEngagement(facts({ createdAt: juste_avant })).level).toBe('MAYBE_SENT');
    expect(classifyDocumentEngagement(facts({ createdAt: juste_apres })).level).toBe('FREE');
  });
});

describe('ce que l’utilisateur lit avant de trancher', () => {
  it('rien à signaler → aucune confirmation demandée', () => {
    expect(engagementWarning(classifyDocumentEngagement(facts()), 'regenerate')).toBeNull();
  });

  it('document engagé : on annonce l’avenant, pas une réussite silencieuse', () => {
    const w = engagementWarning(
      classifyDocumentEngagement(facts({ emailSends: [{ sentAt: null }] })),
      'regenerate',
    );
    expect(w).toContain('engagé');
    expect(w).toContain('avenant');
  });

  it('document peut-être envoyé : on demande de vérifier', () => {
    const w = engagementWarning(classifyDocumentEngagement(facts({ createdAt: AVANT })), 'delete');
    expect(w).toContain('a pu être envoyé');
    expect(w).toContain('Vérifiez');
  });

  it('la suppression et la régénération ne disent pas la même chose', () => {
    const engage = classifyDocumentEngagement(facts({ conventionSigned: true }));
    expect(engagementWarning(engage, 'delete')).not.toBe(engagementWarning(engage, 'regenerate'));
  });
});
