import { describe, it, expect } from 'vitest';

/**
 * Règle métier n°2 gravée du chantier signature : **le PDF signé fait foi**.
 * `/api/documents/[id]` doit servir `signedPdfUrl ?? pdfUrl`, avec un
 * `?original=1` pour retrouver la version non signée (re-génération, renvoi).
 *
 * Le lot A a commencé à écrire `Document.signedPdfUrl` (scans d'émargement)
 * sans que la route ne le serve : ouvrir un document depuis la matrice
 * rendait encore le PDF vierge. Le lot B ferme cette boucle, puisqu'il pose le
 * modèle. La décision est isolée dans une fonction pure pour être testable
 * sans monter une requête Next.
 */

import { resolveServedDocumentKey } from '../document-served-key';

describe('resolveServedDocumentKey', () => {
  const signe = { pdfUrl: 'sessions/t1/SES-1/convention.pdf', signedPdfUrl: 'sessions/t1/SES-1/signed/CONVENTION-p1-ab12.pdf' };
  const nonSigne = { pdfUrl: 'sessions/t1/SES-1/convention.pdf', signedPdfUrl: null };

  it('sert le signé dès qu’il existe', () => {
    expect(resolveServedDocumentKey(signe, {})).toMatchObject({
      key: signe.signedPdfUrl,
      isSigned: true,
    });
  });

  it('sert l’original quand rien n’est signé', () => {
    expect(resolveServedDocumentKey(nonSigne, {})).toMatchObject({
      key: nonSigne.pdfUrl,
      isSigned: false,
    });
  });

  it('`?original=1` force la version non signée', () => {
    expect(resolveServedDocumentKey(signe, { original: true })).toMatchObject({
      key: signe.pdfUrl,
      isSigned: false,
    });
  });

  it('un signedPdfUrl vide ou blanc ne masque pas l’original', () => {
    expect(resolveServedDocumentKey({ ...nonSigne, signedPdfUrl: '' }, {}).key).toBe(nonSigne.pdfUrl);
    expect(resolveServedDocumentKey({ ...nonSigne, signedPdfUrl: '   ' }, {}).key).toBe(nonSigne.pdfUrl);
  });

  it('signale la version servie pour que la route sache nommer le fichier', () => {
    // `/api/documents/[id]` en fait un suffixe « -signe » via
    // buildDownloadFilename : signé et original se retrouvent côte à côte
    // dans le dossier de téléchargement de l'admin.
    expect(resolveServedDocumentKey(signe, {}).isSigned).toBe(true);
    expect(resolveServedDocumentKey(nonSigne, {}).isSigned).toBe(false);
    expect(resolveServedDocumentKey(signe, { original: true }).isSigned).toBe(false);
  });
});
