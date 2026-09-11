/**
 * La CLOCHE lit-elle vraiment `signature.completed` ? — défaut D-C3-2.
 *
 * POURQUOI EN REGEX DE SOURCE. `getNotifications()` ouvre Prisma et Lucia dans
 * ses premières lignes : elle n'est pas exécutable en test unitaire sans monter
 * une base. Or ce qui a manqué ici n'est pas un calcul — c'est un `where` :
 * `prevenirAdmins` écrivait ses lignes depuis le lot C.3, et la lecture filtrait
 * `type: 'lead.assigned'` en dur. La notification existait, personne ne la
 * voyait. Même forme que `fiche-session-cablage-signature.smoke.test.ts`.
 *
 * ⚠ LES DEUX SENS SONT GARDÉS. Que la cloche lise le nouveau type, et qu'elle
 * n'ait pas CESSÉ de lire l'ancien : un `type: 'signature.completed'` qui
 * remplacerait le filtre au lieu de l'élargir ferait disparaître les leads
 * assignés sans qu'aucun test ne bouge.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const actionSrc = readFileSync(path.join(__dirname, '..', 'notifications.ts'), 'utf-8');
const bellSrc = readFileSync(
  path.join(__dirname, '..', '..', '..', 'components', 'layout', 'notifications-bell.tsx'),
  'utf-8',
);

describe('getNotifications — la ligne écrite par le webhook est LUE', () => {
  it('le filtre porte les DEUX types persistés, jamais un seul en dur', () => {
    expect(actionSrc).toMatch(/type: \{ in: \[['"]lead\.assigned['"], ['"]signature\.completed['"]\] \}/);
    expect(actionSrc).not.toMatch(/type: 'lead\.assigned',\n/);
  });

  it('le payload est relu par le contrat partagé — pas de champ Json lu à l’aveugle', () => {
    expect(actionSrc).toMatch(/SignatureCompletedPayloadSchema/);
  });

  it('le libellé et la destination viennent du module pur, jamais d’une concaténation locale', () => {
    expect(actionSrc).toMatch(/libelleSignatureCompletee\(/);
    expect(actionSrc).toMatch(/lienSignatureCompletee\(/);
  });

  it('le `signature.completed` est un `NotificationKind` déclaré', () => {
    expect(actionSrc).toMatch(/\|\s*'signature\.completed'/);
  });
});

describe('la cloche — le nouveau type a son icône, sinon `tsc` refuse', () => {
  it('`ICONS` couvre `signature.completed`', () => {
    // `ICONS` est un `Record<NotificationKind, …>` : l'oubli est une erreur de
    // compilation. Ce test garde le fait que l'entrée n'a pas été « remplie »
    // par une icône vide pour faire taire le compilateur.
    expect(bellSrc).toMatch(/'signature\.completed':\s*\w+,/);
  });
});
