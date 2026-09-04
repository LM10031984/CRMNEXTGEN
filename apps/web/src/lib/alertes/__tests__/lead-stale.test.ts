import { describe, expect, it } from 'vitest';

import {
  decideLeadStaleAlert,
  leadStaleRecipients,
  newLeadRecipients,
  LEAD_STALE_HOURS,
} from '../lead-stale';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const IL_Y_A_30H = new Date('2026-09-09T06:00:00.000Z');
const IL_Y_A_2H = new Date('2026-09-10T10:00:00.000Z');

const base = {
  status: 'NEW',
  createdAt: IL_Y_A_30H,
  lastActionAt: null,
  actionCount: 0,
  staleAlertedAt: null,
};

describe('A-2 — « ce lead dort depuis 24 h »', () => {
  it('alerte sur un lead neuf, jamais touché, au-delà du seuil', () => {
    const d = decideLeadStaleAlert(base, NOW);
    expect(d.alert).toBe(true);
    if (d.alert) expect(d.hoursIdle).toBe(30);
  });

  it('n’alerte pas avant le seuil', () => {
    expect(decideLeadStaleAlert({ ...base, createdAt: IL_Y_A_2H }, NOW)).toEqual({
      alert: false,
      reason: 'trop_recent',
    });
  });

  it('ne réveille personne pour un lead déjà pris en main', () => {
    expect(decideLeadStaleAlert({ ...base, actionCount: 1 }, NOW)).toEqual({
      alert: false,
      reason: 'deja_traite',
    });
    expect(decideLeadStaleAlert({ ...base, lastActionAt: IL_Y_A_2H }, NOW)).toEqual({
      alert: false,
      reason: 'deja_traite',
    });
    // Un lead mis en attente est suivi, pas oublié.
    expect(decideLeadStaleAlert({ ...base, status: 'ON_HOLD' }, NOW)).toEqual({
      alert: false,
      reason: 'pas_nouveau',
    });
  });

  it('n’alerte QU’UNE fois — un cron horaire ne mitraille pas', () => {
    const apres = { ...base, staleAlertedAt: IL_Y_A_2H };
    expect(decideLeadStaleAlert(apres, NOW)).toEqual({ alert: false, reason: 'deja_alerte' });
    // …et dix heures plus tard, toujours rien.
    expect(
      decideLeadStaleAlert(apres, new Date('2026-09-10T22:00:00.000Z')),
    ).toEqual({ alert: false, reason: 'deja_alerte' });
  });

  it('ré-alerte un lead re-délaissé, une fois le marqueur remis à zéro', () => {
    // C'est le rôle de la remise à null à l'enregistrement d'une action :
    // la deuxième négligence ne doit pas passer inaperçue.
    expect(decideLeadStaleAlert({ ...base, staleAlertedAt: null }, NOW).alert).toBe(true);
  });

  it('respecte un seuil paramétré', () => {
    expect(decideLeadStaleAlert(base, NOW, 48)).toEqual({ alert: false, reason: 'trop_recent' });
    expect(LEAD_STALE_HOURS).toBe(24);
  });
});

describe('Qui reçoit quoi', () => {
  const users = [
    { id: 'com1', role: 'COMMERCIAL', email: 'c1@x.test' },
    { id: 'com2', role: 'COMMERCIAL', email: 'c2@x.test' },
    { id: 'man1', role: 'MANAGER', email: 'm@x.test' },
    { id: 'adm1', role: 'ADMIN', email: 'a@x.test' },
    { id: 'form1', role: 'FORMATEUR', email: 'f@x.test' },
  ];

  it('A-1 assigné : le commercial, et lui seul', () => {
    expect(newLeadRecipients({ ownerUserId: 'com1', users })).toEqual(['com1']);
  });

  it('A-1 non assigné : tous les commerciaux et les managers', () => {
    expect(newLeadRecipients({ ownerUserId: null, users })).toEqual(['com1', 'com2', 'man1']);
  });

  it('A-2 escalade toujours vers un responsable', () => {
    // Une alerte de négligence qui n'arrive qu'à celui qui a négligé ne sert à rien.
    const r = leadStaleRecipients({ ownerUserId: 'com1', users });
    expect(r).toContain('com1');
    expect(r).toContain('man1');
    expect(r).toContain('adm1');
    expect(r).not.toContain('form1');
  });

  it('A-2 sans propriétaire : personne ne peut se croire hors de cause', () => {
    const r = leadStaleRecipients({ ownerUserId: null, users });
    expect(r).toEqual(expect.arrayContaining(['com1', 'com2', 'man1', 'adm1']));
    expect(r).not.toContain('form1');
  });

  it('ne prévient jamais deux fois la même personne', () => {
    const r = leadStaleRecipients({ ownerUserId: 'man1', users });
    expect(new Set(r).size).toBe(r.length);
  });
});
