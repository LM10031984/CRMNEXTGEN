import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Validation d'une demande publique → apprenant + inscription (spec 2026-08-28).
 *
 * Le chaînon qui manquait : `convertPreEnrollment` créait Person + Org +
 * LegalLink mais n'inscrivait PAS dans la session. Ici on enchaîne les deux,
 * en refusant de créer une organisation « enseigne » depuis un SIRET saisi
 * librement sur un formulaire ouvert.
 */

const m = vi.hoisted(() => ({
  validateRequest: vi.fn(),
  preEnrollmentFindFirst: vi.fn(),
  organizationFindFirst: vi.fn(),
  participantFindUnique: vi.fn(),
  participantCreate: vi.fn(),
  sessionFindFirst: vi.fn(),
  convertPreEnrollment: vi.fn(),
  prepareTrainingForSession: vi.fn(),
}));

vi.mock('@qualiof/db', () => ({
  prisma: {
    preEnrollment: { findFirst: m.preEnrollmentFindFirst },
    organization: { findFirst: m.organizationFindFirst },
    sessionParticipant: { findUnique: m.participantFindUnique, create: m.participantCreate },
    trainingSession: { findFirst: m.sessionFindFirst },
  },
  Prisma: { Decimal: Number },
}));
vi.mock('@/lib/auth', () => ({ validateRequest: m.validateRequest }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../preinscription-convert', () => ({ convertPreEnrollment: m.convertPreEnrollment }));
vi.mock('../prepare-training', () => ({ prepareTrainingForSession: m.prepareTrainingForSession }));

import { enrollFromRequest } from '../enroll-from-request';

const DEMANDE = {
  id: 'pe-1',
  tenantId: 'tenant-1',
  intendedSessionId: 'ses-1',
  status: 'EXTRACTED',
  firstName: 'Jean',
  lastName: 'Martin',
  email: 'jean@mail.com',
  phone: null,
  birthDate: null,
  birthPlace: null,
  birthName: null,
  address: null,
  city: null,
  postalCode: null,
  professionalStatus: 'Agent commercial',
  companyName: 'MARX IMMO',
  companySiret: '12345678900012',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.validateRequest.mockResolvedValue({ user: { id: 'u1', tenantId: 'tenant-1' } });
  m.preEnrollmentFindFirst.mockResolvedValue(DEMANDE);
  m.organizationFindFirst.mockResolvedValue(null);
  m.participantFindUnique.mockResolvedValue(null);
  m.participantCreate.mockResolvedValue({ id: 'part-1' });
  // Par défaut la session n'a pas de tarif propre → le participant naît à 0 €.
  m.sessionFindFirst.mockResolvedValue({ pricePerLearner: null });
  m.convertPreEnrollment.mockResolvedValue({ ok: true, personId: 'per-1', orgId: 'org-1' });
  m.prepareTrainingForSession.mockResolvedValue({ ok: true });
});

describe('enrollFromRequest', () => {
  it('convertit puis crée le participant, à 0 € quand la session n’a pas de tarif', async () => {
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toEqual({ ok: true, participantId: 'part-1' });
    const data = m.participantCreate.mock.calls[0]![0].data;
    expect(data.sessionId).toBe('ses-1');
    expect(data.personId).toBe('per-1');
    expect(data.sponsorOrgId).toBe('org-1');
    expect(Number(data.priceHT)).toBe(0);
    expect(data.enrollmentStatus).toBe('PRE_ENROLLED');
  });

  it('hérite du tarif de la session quand elle en porte un', async () => {
    m.sessionFindFirst.mockResolvedValue({ pricePerLearner: 850 });
    await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(Number(m.participantCreate.mock.calls[0]![0].data.priceHT)).toBe(850);
  });

  it('lit le tarif de la session en restant scopé au tenant', async () => {
    await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(m.sessionFindFirst.mock.calls[0]![0].where).toMatchObject({
      id: 'ses-1',
      tenantId: 'tenant-1',
    });
  });

  it('inscrit sans lancer de préparation documentaire', async () => {
    await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(m.participantCreate).toHaveBeenCalledTimes(1);
    expect(m.prepareTrainingForSession).not.toHaveBeenCalled();
  });

  it('refuse une demande sans session cible', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, intendedSessionId: null });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r.ok).toBe(false);
    expect(m.convertPreEnrollment).not.toHaveBeenCalled();
  });

  it('salarié dont l’entreprise est inconnue : demande le payeur, sans rien créer', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, professionalStatus: 'Salarié' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toMatchObject({ ok: false, needsSponsor: true });
    expect(m.convertPreEnrollment).not.toHaveBeenCalled();
    expect(m.participantCreate).not.toHaveBeenCalled();
  });

  it('salarié avec payeur choisi par l’admin : inscription faite sur cette organisation', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({ ...DEMANDE, professionalStatus: 'Salarié' });
    const r = await enrollFromRequest({
      preEnrollmentId: 'pe-1',
      overrideSponsorOrgId: 'org-enseigne',
    });
    expect(r.ok).toBe(true);
    expect(m.participantCreate.mock.calls[0]![0].data.sponsorOrgId).toBe('org-enseigne');
  });

  it('personne déjà inscrite : refus explicite, pas de doublon', async () => {
    m.participantFindUnique.mockResolvedValue({ id: 'part-existant' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r.ok).toBe(false);
    expect(m.participantCreate).not.toHaveBeenCalled();
  });

  it('remonte l’erreur de conversion sans créer de participant', async () => {
    m.convertPreEnrollment.mockResolvedValue({ ok: false, error: 'Email manquant' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toMatchObject({ ok: false, error: 'Email manquant' });
    expect(m.participantCreate).not.toHaveBeenCalled();
  });
});

/**
 * REPRISE D'UN DOSSIER DÉJÀ CONVERTI — l'impasse du 15/09/2026.
 *
 * Constaté en production sur SES-0114 : 3 demandes au statut CONVERTED, 0
 * inscrit. Convertir depuis /app/inscriptions crée bien Person + Organization,
 * mais AUCUN SessionParticipant. Et comme `convertPreEnrollment` refuse net un
 * dossier déjà converti (« Déjà convertie en apprenant »), repasser par
 * « Valider et inscrire » était impossible : l'apprenant existait, la session
 * restait vide, et plus rien ne pouvait les rapprocher.
 *
 * La conversion est donc désormais une ÉTAPE FRANCHIE, pas un verrou : quand
 * elle est déjà faite, on repart de `convertedToPersonId` / `convertedToOrgId`
 * au lieu de la refaire.
 */
const DEJA_CONVERTIE = {
  ...DEMANDE,
  status: 'CONVERTED',
  convertedToPersonId: 'per-deja',
  convertedToOrgId: 'org-deja',
};

describe('enrollFromRequest — dossier déjà converti', () => {
  beforeEach(() => {
    // FIDÉLITÉ AU RÉEL, et c'est tout l'intérêt de ce bloc : en production
    // `convertPreEnrollment` REFUSE un dossier déjà converti. Laisser le mock
    // répondre « ok » rendrait ces tests verts même si le code reconvertissait
    // bêtement — ils ne prouveraient plus rien.
    m.convertPreEnrollment.mockResolvedValue({
      ok: false,
      error: 'Déjà convertie en apprenant',
    });
  });

  it('inscrit sans reconvertir, en repartant de la personne déjà créée', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue(DEJA_CONVERTIE);
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toEqual({ ok: true, participantId: 'part-1' });
    expect(m.convertPreEnrollment).not.toHaveBeenCalled();
    const data = m.participantCreate.mock.calls[0]![0].data;
    expect(data.personId).toBe('per-deja');
    expect(data.sponsorOrgId).toBe('org-deja');
  });

  it('cherche le doublon sur la personne DÉJÀ convertie, pas sur une nouvelle', async () => {
    // Le test de puissance de la reprise : si le garde-fou anti-doublon
    // interrogeait encore `conv.personId`, il chercherait `undefined` et
    // laisserait créer une seconde inscription pour la même personne.
    m.preEnrollmentFindFirst.mockResolvedValue(DEJA_CONVERTIE);
    await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(m.participantFindUnique.mock.calls[0]![0].where).toEqual({
      sessionId_personId: { sessionId: 'ses-1', personId: 'per-deja' },
    });
  });

  it('refuse le doublon quand la personne convertie est déjà inscrite', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue(DEJA_CONVERTIE);
    m.participantFindUnique.mockResolvedValue({ id: 'part-existant' });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r.ok).toBe(false);
    expect(m.participantCreate).not.toHaveBeenCalled();
  });

  it('convertie sans organisation payeuse : demande le payeur, sans rien créer', async () => {
    // Cas réel Rúben Oliveira : agent commercial sans SIRET, converti depuis
    // /app/inscriptions, donc sans EI. On ne peut pas deviner qui paye.
    m.preEnrollmentFindFirst.mockResolvedValue({
      ...DEJA_CONVERTIE,
      convertedToOrgId: null,
      companySiret: null,
      companyName: null,
    });
    const r = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
    expect(r).toMatchObject({ ok: false, needsSponsor: true });
    expect(m.participantCreate).not.toHaveBeenCalled();
  });

  it('convertie sans payeur mais payeur choisi par l’admin : inscription faite', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue({
      ...DEJA_CONVERTIE,
      convertedToOrgId: null,
      companySiret: null,
      companyName: null,
    });
    const r = await enrollFromRequest({
      preEnrollmentId: 'pe-1',
      overrideSponsorOrgId: 'org-choisie',
    });
    expect(r.ok).toBe(true);
    expect(m.participantCreate.mock.calls[0]![0].data.sponsorOrgId).toBe('org-choisie');
  });

  it('le payeur choisi par l’admin l’emporte sur celui de la conversion', async () => {
    m.preEnrollmentFindFirst.mockResolvedValue(DEJA_CONVERTIE);
    await enrollFromRequest({ preEnrollmentId: 'pe-1', overrideSponsorOrgId: 'org-corrigee' });
    expect(m.participantCreate.mock.calls[0]![0].data.sponsorOrgId).toBe('org-corrigee');
  });
});

it('refuse une demande indépendante avant conversion lorsque la session est ENTREPRISE', async () => {
  m.sessionFindFirst.mockResolvedValue({ id: 'ses-1', tenantId: 'tenant-1', regime: 'ENTREPRISE', priceTotalHT: 240, startDate: new Date('2026-11-20'), endDate: new Date('2026-11-20') });
  const result = await enrollFromRequest({ preEnrollmentId: 'pe-1' });
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Jean Martin') });
  expect(m.convertPreEnrollment).not.toHaveBeenCalled();
  expect(m.participantCreate).not.toHaveBeenCalled();
});
