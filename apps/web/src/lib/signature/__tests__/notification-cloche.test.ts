/**
 * La CLOCHE, pour une pièce signée par tous — défaut D-C3-2 de la recette C.3
 * (11/09/2026, étape 10).
 *
 * LE DÉFAUT. `prevenirAdmins` écrit bien une ligne `Notification` de type
 * `signature.completed` par ADMIN — vérifié en base sur l'aperçu. Mais
 * `getNotifications()` ne lisait QUE `type: 'lead.assigned'` : la cloche restait
 * muette. Une notification écrite que personne ne lit est pire qu'une
 * notification absente — elle donne l'illusion que le circuit est complet.
 *
 * POURQUOI CE MODULE EST À PART, ET PUR. Le libellé et la destination sont deux
 * DÉCISIONS (« quelle pièce », « quel onglet ») : dans la server action, elles
 * ne seraient vérifiables qu'en montant Prisma et Lucia. Ici elles se gardent
 * en une ligne — avec des valeurs LITTÉRALES, jamais le retour de la fonction
 * testée (règle n°2 du projet).
 */

import { describe, it, expect } from 'vitest';
import {
  libelleSignatureCompletee,
  lienSignatureCompletee,
} from '../notification-cloche';

describe('Le libellé — il nomme la PIÈCE et la SESSION, jamais un code technique', () => {
  it('convention : le nom de la pièce, puis le code de session', () => {
    expect(libelleSignatureCompletee({ docType: 'CONVENTION', sessionCode: 'SES-0048' })).toBe(
      'Convention signée par tous les signataires — SES-0048',
    );
  });

  it('dossier AGEFICE : son nom à lui, pas « Agefice » dérivé d’un enum', () => {
    expect(libelleSignatureCompletee({ docType: 'AGEFICE', sessionCode: 'SES-0048' })).toBe(
      'Dossier AGEFICE signé par tous les signataires — SES-0048',
    );
  });

  it('attestation d’assiduité : l’accord suit la pièce, il n’est pas concaténé', () => {
    expect(libelleSignatureCompletee({ docType: 'ASSIDUITE', sessionCode: 'SES-0002' })).toBe(
      "Attestation d'assiduité signée par tous les signataires — SES-0002",
    );
  });

  it('sans code de session : la phrase s’arrête, elle n’écrit pas « — null »', () => {
    expect(libelleSignatureCompletee({ docType: 'CONVENTION', sessionCode: null })).toBe(
      'Convention signée par tous les signataires',
    );
  });

  it('pièce inconnue : un libellé neutre et VRAI, jamais le code brut', () => {
    // Une ligne écrite par une version future, ou une pièce sortie du corpus :
    // la cloche doit rester lisible plutôt que d'afficher « EMARGEMENT ».
    expect(libelleSignatureCompletee({ docType: 'EMARGEMENT', sessionCode: 'SES-0048' })).toBe(
      'Document signé par tous les signataires — SES-0048',
    );
  });
});

describe('La destination — l’onglet où la pièce se trouve, pas la fiche au hasard', () => {
  it('convention : onglet « Avant la formation »', () => {
    expect(
      lienSignatureCompletee({ sessionId: 'ses-uuid-1', docType: 'CONVENTION' }),
    ).toBe('/app/sessions/ses-uuid-1?tab=avant');
  });

  it('dossier AGEFICE : « Avant » lui aussi — il se signe avant la formation', () => {
    expect(lienSignatureCompletee({ sessionId: 'ses-uuid-1', docType: 'AGEFICE' })).toBe(
      '/app/sessions/ses-uuid-1?tab=avant',
    );
  });

  it('attestation d’assiduité : onglet « Après la formation »', () => {
    // ⚠ LA PROMESSE : l'assiduité ne se signe qu'APRÈS. Mener à « Avant »
    // ferait chercher la pièce dans un onglet qui ne la porte pas — et les
    // panneaux d'onglet inactifs sont rendus `hidden` : elle serait invisible.
    expect(lienSignatureCompletee({ sessionId: 'ses-uuid-1', docType: 'ASSIDUITE' })).toBe(
      '/app/sessions/ses-uuid-1?tab=apres',
    );
  });

  it('pièce inconnue : la fiche session, sans onglet inventé', () => {
    expect(lienSignatureCompletee({ sessionId: 'ses-uuid-1', docType: 'EMARGEMENT' })).toBe(
      '/app/sessions/ses-uuid-1',
    );
  });
});
