/**
 * Les relances J+4 / J+10 et le script d'appel J+1.
 *
 * Ce sont des textes qui partent chez des prospects : les mêmes règles que
 * l'email de programme s'appliquent, et rien ne les rappelle au moment de les
 * écrire. Aucun prix, aucun chiffre de satisfaction, le mot « pige » interdit,
 * un ton qui ne sent pas le gabarit.
 */

import { describe, it, expect } from 'vitest';
import { composerRelance, scriptAppel, ETAPE_LIBELLE, type EtapeRelance } from '../relances';
import { lireSuiviCrm, ligneSuiviCrm, estARappelerMaintenant, type NiveauPriorite } from '../priorite';
import { PROBLEMATIQUES, RAPPEL_CHOIX, type ProblematiqueKey } from '../questions';

const AXES = Object.keys(PROBLEMATIQUES) as ProblematiqueKey[];
const ETAPES: EtapeRelance[] = ['J4', 'J10'];

const CTX = {
  prenom: 'Camille',
  dominante: 'PROSPECTION_MANDATS' as ProblematiqueKey,
  signataire: 'Laurent MARX',
  evenement: '25 ans du MLS',
};

describe('relances J+4 et J+10', () => {
  it('nomme le prospect et l’événement dans les deux', () => {
    for (const etape of ETAPES) {
      const { text } = composerRelance(etape, CTX);
      expect(text, etape).toContain('Camille');
      expect(text, etape).toContain('25 ans du MLS');
    }
  });

  it('signe par un humain, jamais par une marque', () => {
    // Contrairement à l'email de programme (signé « L'équipe »), une relance
    // écrite à la main est signée par celui qui la signerait vraiment.
    for (const etape of ETAPES) {
      const { text } = composerRelance(etape, CTX);
      expect(text, etape).toContain('Laurent MARX');
      expect(text, etape).not.toMatch(/L['’]équipe/);
    }
  });

  it('ne contient AUCUN prix ni montant en euros', () => {
    for (const etape of ETAPES) {
      const { subject, text } = composerRelance(etape, CTX);
      for (const contenu of [subject, text]) {
        expect(contenu, `${etape} : un montant a fuité`).not.toMatch(/\d\s*(€|euros?)/i);
        expect(contenu, `${etape} : un tarif a fuité`).not.toMatch(/\bHT\b|\btarif\b|\bprix\b/i);
      }
    }
  });

  it('n’emploie jamais le mot interdit', () => {
    for (const etape of ETAPES) {
      const { subject, text } = composerRelance(etape, CTX);
      expect(`${subject}\n${text}`, etape).not.toMatch(/\bpige\w*\b/i);
    }
  });

  it('ne contient aucun lien : ces mails doivent avoir l’air écrits à la main', () => {
    for (const etape of ETAPES) {
      const { text } = composerRelance(etape, CTX);
      expect(text, etape).not.toMatch(/https?:\/\//);
      expect(text, etape).not.toMatch(/<[a-z]/i);
    }
  });

  it('reste court — au-delà, ça se lit comme une newsletter', () => {
    for (const etape of ETAPES) {
      const { text } = composerRelance(etape, CTX);
      expect(text.split(/\s+/).length, `${etape} est trop long`).toBeLessThan(130);
    }
  });

  it('J+4 pose une question fermée à deux options, pas un « n’hésitez pas »', () => {
    const { text } = composerRelance('J4', CTX);
    expect(text).toContain('avant fin octobre');
    expect(text).toContain('novembre');
    expect(text).toMatch(/\?/);
    expect(text).not.toMatch(/n['’]hésitez pas/i);
  });

  it('J+4 nomme l’axe réel du diagnostic', () => {
    for (const axe of AXES) {
      const { text } = composerRelance('J4', { ...CTX, dominante: axe });
      expect(text, axe).toContain(PROBLEMATIQUES[axe].titre);
    }
  });

  it('J+10 donne la contrainte AGEFICE ET une porte de sortie', () => {
    const { text } = composerRelance('J10', CTX);
    expect(text).toMatch(/15 jours/);
    expect(text).toMatch(/31 décembre/);
    expect(text).toMatch(/recontacte en janvier/);
  });

  it('a un libellé lisible pour chaque étape', () => {
    for (const etape of ETAPES) expect(ETAPE_LIBELLE[etape].length).toBeGreaterThan(5);
  });
});

describe('script d’appel J+1', () => {
  it('ouvre sur l’engagement pris par le prospect, pas sur du démarchage', () => {
    const s = scriptAppel({ ...CTX, droitsIntacts: true });
    expect(s).toContain('vous m’aviez dit'.replace('’', "'"));
    expect(s).not.toMatch(/je me permets/i);
  });

  it('n’affirme « vous n’avez rien fait cette année » QUE si c’est vrai', () => {
    const intacts = scriptAppel({ ...CTX, droitsIntacts: true });
    const consommes = scriptAppel({ ...CTX, droitsIntacts: false });
    expect(intacts).toMatch(/n['’]aviez rien fait cette année/);
    expect(consommes).not.toMatch(/n['’]aviez rien fait cette année/);
    expect(consommes).toMatch(/à vérifier/i);
  });

  it('rappelle de ne pas annoncer de prix au téléphone', () => {
    const s = scriptAppel({ ...CTX, droitsIntacts: true });
    expect(s).toMatch(/pas annoncer de prix/i);
  });
});

describe('ligne de suivi CRM — aller-retour', () => {
  it('se relit exactement comme elle s’écrit, pour toutes les combinaisons', () => {
    const niveaux: NiveauPriorite[] = ['A', 'B', 'C'];
    for (const niveau of niveaux) {
      for (const axe of AXES) {
        for (const choix of [...RAPPEL_CHOIX.map((c) => c.value), null]) {
          const ligne = ligneSuiviCrm({ niveau, dominante: axe, rappel: choix });
          const relu = lireSuiviCrm(ligne);
          expect(relu, ligne).not.toBeNull();
          expect(relu!.niveau, ligne).toBe(niveau);
          expect(relu!.rappel, ligne).toBe(choix);
        }
      }
    }
  });

  it('ignore ce qui n’a pas été écrit par le diagnostic', () => {
    expect(lireSuiviCrm(null)).toBeNull();
    expect(lireSuiviCrm('')).toBeNull();
    expect(lireSuiviCrm('Appel sortant — pas de réponse')).toBeNull();
    expect(lireSuiviCrm('Relance J+4 — deux options de dates envoyée')).toBeNull();
  });

  it('ne retient pour le rappel du jour que les A qui ont demandé cette semaine', () => {
    const a = (r: 'CETTE_SEMAINE' | 'SEMAINE_PROCHAINE' | 'PLUS_TARD', n: NiveauPriorite) =>
      ligneSuiviCrm({ niveau: n, dominante: 'PROSPECTION_MANDATS', rappel: r });

    expect(estARappelerMaintenant(a('CETTE_SEMAINE', 'A'))).toBe(true);
    expect(estARappelerMaintenant(a('SEMAINE_PROCHAINE', 'A'))).toBe(false);
    expect(estARappelerMaintenant(a('CETTE_SEMAINE', 'B'))).toBe(false);
    expect(estARappelerMaintenant(a('PLUS_TARD', 'C'))).toBe(false);
    // Une fois relancé, la ligne change : il sort de la liste du jour.
    expect(estARappelerMaintenant('Relance J+4 — deux options de dates envoyée')).toBe(false);
  });
});
