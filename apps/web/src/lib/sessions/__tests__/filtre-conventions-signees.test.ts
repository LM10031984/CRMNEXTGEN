/**
 * Lot D — LE FILTRE « Conventions signées » DE LA LISTE DES SESSIONS (D-2).
 *
 * CE QU'IL FAISAIT. `sessions/page.tsx` portait un filtre `signed` dont le
 * critère était `TrainingSession.status IN (VALIDATED, IN_PROGRESS, COMPLETED)`
 * — AUCUN rapport avec une signature. Lu le 04/09 en répondant à la décision
 * ouverte D-2 : « le libellé ment ». Il ment d'autant plus tranquillement
 * qu'aucune puce ne l'exposait : le filtre n'était atteignable qu'en tapant
 * l'URL, donc personne ne pouvait constater qu'il répondait autre chose.
 *
 * ⚠ VALEUR LITTÉRALE (règle n°2) : c'est le CRITÈRE qu'on garde. Le comparer au
 * retour du constructeur laisserait les deux côtés bouger ensemble — exactement
 * l'incident du lot C.2b-6.
 */

import { describe, it, expect } from 'vitest';
import {
  LIBELLE_FILTRE_CONVENTIONS_SIGNEES,
  WHERE_CONVENTIONS_SIGNEES,
} from '../filtre-conventions-signees';

describe('WHERE_CONVENTIONS_SIGNEES — ce que le filtre demande vraiment', () => {
  it('porte sur les DOCUMENTS de la session, jamais sur son statut', () => {
    expect(WHERE_CONVENTIONS_SIGNEES).toEqual({
      documents: {
        some: {
          type: 'CONVENTION',
          OR: [{ signedPdfUrl: { not: null } }, { status: 'signed' }],
        },
      },
    });
  });

  it('lit les DEUX origines d’un signé — l’e-signature et le scan déposé', () => {
    // `signedPdfUrl` est posé par le webhook (C.3) ET par le dépôt manuel
    // (lot A) ; `status: 'signed'` couvre les lignes plus anciennes. N'en lire
    // qu'une ferait disparaître de la liste des sessions réellement signées.
    const or = (WHERE_CONVENTIONS_SIGNEES.documents as { some: { OR: unknown[] } }).some.OR;
    expect(or).toHaveLength(2);
  });

  it('le libellé DIT ce que le filtre fait', () => {
    expect(LIBELLE_FILTRE_CONVENTIONS_SIGNEES).toBe('Conventions signées');
  });
});

/* ── Le câblage : le critère arrive-t-il jusqu'à la requête ? ─────────────── */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const pageSrc = readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'app', 'sessions', 'page.tsx'),
  'utf-8',
);

describe('liste des sessions — le filtre branché sur le bon critère', () => {
  it('l’ANCIEN critère a disparu : il ne parlait pas de signature', () => {
    expect(pageSrc).not.toMatch(/where\.status = \{ in: \['VALIDATED', 'IN_PROGRESS', 'COMPLETED'\] \}/);
  });

  it('le nouveau vient du module, jamais recopié dans la page', () => {
    expect(pageSrc).toMatch(/Object\.assign\(where, WHERE_CONVENTIONS_SIGNEES\)/);
    expect(pageSrc).toMatch(/from '@\/lib\/sessions\/filtre-conventions-signees'/);
  });

  it('la puce EXISTE — sans elle, personne ne peut constater ce que le filtre répond', () => {
    expect(pageSrc).toMatch(/label: LIBELLE_FILTRE_CONVENTIONS_SIGNEES,/);
    expect(pageSrc).toMatch(/href: hrefWith\(\{ q, filter: 'signed' \}\)/);
  });

  it('le COMPTE de la puce utilise le MÊME critère que le filtre', () => {
    // Une puce qui annonce un nombre et en affiche un autre est pire qu'une
    // puce absente : elle fait douter du reste de l'écran.
    expect(pageSrc).toMatch(/where: \{ tenantId: user\.tenantId, \.\.\.WHERE_CONVENTIONS_SIGNEES \}/);
  });
});
