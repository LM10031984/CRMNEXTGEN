/**
 * Le CÂBLAGE de l'alerte J-15 dans le cron — smoke source.
 *
 * `decideAlerteConventionNonEnvoyee` est pure et testée ; elle n'alerte
 * personne tant que le cron ne l'appelle pas, et cette route ouvre Prisma et le
 * mailer. C'est le trou du lot C.2b-8 transposé : le calcul gardé, le câblage
 * non.
 *
 * CE QUE CE FICHIER GARDE EN PLUS, et qui n'est pas cosmétique : que le
 * PRÉ-FILTRE SQL ne se substitue pas à la règle. Un `where` qui décide, c'est
 * une seconde règle — celle qui ne sera jamais testée, et qui divergera.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'api', 'cron', 'alerts', 'route.ts'),
  'utf-8',
);

describe('cron alertes — l’alerte J-15 est branchée', () => {
  it('la décision vient du module pur, jamais réécrite dans la route', () => {
    expect(src).toMatch(/decideAlerteConventionNonEnvoyee\(/);
    expect(src).toMatch(/from '@\/lib\/alertes\/convention-non-envoyee'/);
  });

  it('et l’alerte est RÉELLEMENT posée quand la décision est oui', () => {
    // La substitution qui compile et ne fait rien : décider, puis ne pas agir.
    expect(src).toMatch(/if \(!decision\.alerter\) continue;/);
    expect(src).toMatch(/await alerterConventionNonEnvoyee\(\{/);
  });

  it('les TROIS faits que la règle demande sont réellement chargés', () => {
    // Aucun ne se devine : les omettre ferait alerter sur des sessions déjà
    // traitées, et le premier faux positif tue l'alerte.
    expect(src).toMatch(/signatureRequests: \{ select: \{ id: true \}, take: 1 \}/);
    expect(src).toMatch(/type: 'CONVENTION', signedPdfUrl: \{ not: null \}/);
    expect(src).toMatch(/title: TITRE_TACHE_CONVENTION_NON_ENVOYEE/);
  });

  it('les trois sont PASSÉS à la règle — la substitution par `false` doit rougir', () => {
    expect(src).toMatch(/aUneDemandeDeSignature: s\.signatureRequests\.length > 0,/);
    expect(src).toMatch(/aUneConventionSignee: s\.documents\.length > 0,/);
    expect(src).toMatch(/dejaAlertee: s\.tasks\.length > 0,/);
    expect(src).not.toMatch(/aUneConventionSignee: false/);
    expect(src).not.toMatch(/dejaAlertee: false/);
  });

  it('le pré-filtre SQL RÉDUIT le volume, il ne DÉCIDE pas', () => {
    // La fenêtre SQL est plus large d'un jour que le seuil : c'est la fonction
    // pure qui tranche le bord, avec son test. Un `lte: now + 15j` en dur ferait
    // du `where` la règle, et le jour du seuil dépendrait alors de l'heure du
    // cron.
    expect(src).toMatch(/\(JOURS_AVANT_ALERTE_CONVENTION \+ 1\) \* 86_400_000/);
  });
});
