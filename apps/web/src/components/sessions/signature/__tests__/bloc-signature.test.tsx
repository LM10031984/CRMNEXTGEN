/* @vitest-environment jsdom */

/**
 * Lot C.2b-2, tâche 2 — le bloc « Signature » à l'écran.
 *
 * QUATRE PROMESSES, et ce fichier est ce qui les tient :
 *
 *  (a) **Le bouton n'est pas dans le DOM** quand il n'y a rien à envoyer
 *      (décision Laurent n°3). Pas `disabled`, pas masqué en CSS : absent.
 *      La mutation qui le rend grisé doit faire rougir ce test.
 *  (b) **L'avertissement « régime incohérent » est LISIBLE et NOMMÉ.** Il est
 *      calculé depuis C.1 et n'était affiché nulle part : en l'état, un
 *      apprenant type Florent HAUSSWIRTH perdait la génération de son dossier
 *      AGEFICE sans qu'aucun message ne le dise.
 *  (c) **Une pièce partie propose son ANNULATION.** `annulerEnvoiSignature`
 *      existe depuis C.2b-bis mais aucun bouton ne l'appelait, alors que
 *      `messageEnvoiEnCours` promet « Annulez l'envoi en cours ». Un écran qui
 *      promet un geste inatteignable est pire qu'un écran muet.
 *  (d) **Une pièce signée ne propose plus AUCUN des deux gestes** (décision
 *      n°4) : ni l'envoi, ni le dépôt de scan — quelle que soit l'origine du
 *      signé.
 *
 * ⚠ `vitest` n'a pas `globals: true` ici : sans `beforeEach(cleanup)`, le DOM du
 * test précédent survit et rend tous les `queryBy*` menteurs (constaté en
 * C.2b-1). Aligné sur `avant-tab-actions.test.tsx`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// --- mocks ------------------------------------------------------------------
const annulerEnvoiSignature = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  signatureRequestId: 'req-9',
  sessionId: 'sess-1',
  pieces: [],
}));
const preparerEnvoiSignature = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  sessionId: 'sess-1',
  envois: [],
  blocages: [],
  avertissements: [],
}));
const sendForSignature = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const,
  envoyes: [],
  refus: [],
}));

// Module REMPLACÉ, jamais `importActual` : la chaîne @qualiof/shared/env valide
// l'environnement au chargement et ferait tomber la suite sur
// `DATABASE_URL: [ 'Required' ]` (écart n°7 du lot C.2a).
vi.mock('@/server/actions/signature-envoi', () => ({
  annulerEnvoiSignature: (...args: unknown[]) => annulerEnvoiSignature(...args),
  preparerEnvoiSignature: (...args: unknown[]) => preparerEnvoiSignature(...args),
  sendForSignature: (...args: unknown[]) => sendForSignature(...args),
}));

vi.mock('@/server/actions/qualiopi-matrix', () => ({
  // `<UploadSignedDocDialog>` importe la server action ; sans ce mock la chaîne
  // @/lib/rbac → @/lib/auth exécute `cache()` de React, indisponible en jsdom.
  uploadSignedDoc: vi.fn().mockResolvedValue({ ok: true }),
  uploadSignedScans: vi.fn().mockResolvedValue({ ok: true, saved: 0, failures: [] }),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { BlocSignature } from '../bloc-signature';
// Lot C.2b-3 : la phrase d'avertissement vient du composant de dépôt, jamais
// d'une recopie — les apostrophes typographiques y sont un piège à test vert.
import { AVERTISSEMENT_DEPOT_ANNULE_ENVOI } from '../../qualiopi-matrix/upload-signed-doc-dialog';
import type { LigneSignature, VueSignature } from '@/lib/sessions/bloc-signature-vue';

const SESSION_ID = 'sess-1';

function ligne(over: Partial<LigneSignature> = {}): LigneSignature {
  return {
    cle: 'ASSIDUITE:part-1',
    docType: 'ASSIDUITE',
    libelle: "Attestation d'assiduité — Jean DUPONT",
    participantIds: ['part-1'],
    participantIdUnique: 'part-1',
    etat: 'GENERE',
    documentId: 'doc-1',
    signatureRequestId: null,
    envoyable: true,
    ...over,
  };
}

function vue(over: Partial<VueSignature> = {}): VueSignature {
  const lignes = over.lignes ?? [];
  return {
    lignes,
    blocages: [],
    avertissements: [],
    canSign: true,
    boutonVisible: lignes.some((l) => l.envoyable),
    nbEnvoyables: lignes.filter((l) => l.envoyable).length,
    ...over,
  };
}

beforeEach(() => {
  cleanup();
  annulerEnvoiSignature.mockClear();
  preparerEnvoiSignature.mockClear();
  sendForSignature.mockClear();
  refresh.mockClear();
});

describe('PUISSANCE (a) — pas de bouton quand il n’y a rien à envoyer', () => {
  /**
   * ⚠ CE TEST A ÉTÉ RENFORCÉ APRÈS LA MUTATION. La première version prenait
   * une session 100 % OPCO côté APRÈS — plan vide, donc bloc entièrement MUET.
   * Elle restait verte sous la mutation « bouton grisé au lieu d'absent »,
   * parce que le bloc ne rendait rien du tout : elle gardait le silence du
   * bloc, pas l'absence du bouton. Le cas qui compte est celui où le bloc
   * S'AFFICHE — il a des lignes à montrer — et n'a pourtant rien à envoyer.
   */
  it('le bloc S’AFFICHE (ses lignes sont là) et n’a pourtant AUCUN bouton d’envoi', () => {
    const { container } = render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={{
          ...vue({ lignes: [ligne({ etat: 'SIGNE', envoyable: false })] }),
        }}
      />,
    );
    // Le bloc n'est PAS muet : la preuve que l'absence du bouton est bien une
    // décision de rendu, et non l'effet de bord d'une section entière masquée.
    expect(container.textContent).toContain('Signature électronique');
    // Ni actif, ni `disabled` : un bouton grisé laisse croire qu'il manque un
    // réglage (décision Laurent n°3). `queryAllByRole` voit AUSSI les boutons
    // désactivés — c'est ce qui fait échouer la mutation « disabled ».
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
  });

  it('session 100 % OPCO côté APRÈS : plan vide ⇒ bloc muet, donc rien à cliquer', () => {
    const { container } = render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [] })} />,
    );
    expect(container.textContent).toBe('');
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
  });

  it('toutes les pièces déjà parties : aucun bouton d’envoi non plus', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({
          lignes: [ligne({ etat: 'ENVOYE', envoyable: false, signatureRequestId: 'req-9' })],
        })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
  });

  it('`canSign` faux : rien à cliquer, même quand tout est prêt', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [ligne()], canSign: false, boutonVisible: false })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
  });

  it('une pièce prête AFFICHE bien le bouton — sans quoi le test (a) serait vide de sens', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe('Le bouton OUVRE quelque chose — il ne fait pas semblant', () => {
  /**
   * Le plan avertissait explicitement : « ne pas exposer le bouton en
   * production dans l'intervalle : sans la modale, il n'ouvre rien ». Ces deux
   * tests sont ce qui empêche cet intervalle de durer sans qu'on le voie.
   */
  it('le bouton du bloc ouvre le récapitulatif sur TOUT le plan du moment', async () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^envoyer pour signature \(\d+\)$/i }),
    );
    await waitFor(() => expect(preparerEnvoiSignature).toHaveBeenCalledTimes(1));
    const arg = preparerEnvoiSignature.mock.calls[0]![0] as { scope: string; cles?: string[] };
    expect(arg.scope).toBe('AFTER');
    // Pas de `cles` : le récapitulatif prépare tout ce qui peut partir.
    expect(arg.cles).toBeUndefined();
  });

  it('le bouton d’une LIGNE n’ouvre le récapitulatif que sur SA pièce', async () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /envoyer pour signature — attestation/i }),
    );
    await waitFor(() => expect(preparerEnvoiSignature).toHaveBeenCalledTimes(1));
    expect(
      (preparerEnvoiSignature.mock.calls[0]![0] as { cles?: string[] }).cles,
    ).toEqual(['ASSIDUITE:part-1']);
  });
});

describe('PUISSANCE (b) — l’avertissement « régime incohérent » se voit et se lit', () => {
  const avertissement = {
    participantId: 'part-3',
    nomAffiche: 'Florent HAUSSWIRTH',
    docType: 'AGEFICE' as const,
    message:
      'Florent HAUSSWIRTH : le financeur rattaché à « IMAGIMMO » n’ouvre pas le dossier ' +
      'AGEFICE, alors que le dossier de cet apprenant en porte les signaux. Corrigez le ' +
      'financeur de l’inscription : rien n’a été envoyé pour cette pièce.',
  };

  it('l’avertissement est dans un `role="alert"`, nomme l’apprenant et dit que rien n’est parti', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissement] })}
      />,
    );
    const alertes = screen.getAllByRole('alert');
    const texte = alertes.map((n) => n.textContent ?? '').join(' ');
    expect(texte).toContain('Florent HAUSSWIRTH');
    expect(texte).toContain('rien n’a été envoyé');
  });

  it('l’avertissement ne déclenche AUCUN envoi : pas de ligne, pas de bouton', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissement] })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
    expect(screen.queryByText(avertissement.nomAffiche + ' —')).toBeNull();
  });

  it('un blocage est rendu TEL QUEL lui aussi — il nomme déjà la personne et le geste', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({
          lignes: [],
          blocages: [
            {
              participantId: 'part-4',
              nomAffiche: 'Marie LEROY',
              docType: 'CONVENTION',
              message:
                'Marie LEROY : aucune organisation bénéficiaire rattachée à cette inscription.',
            },
          ],
        })}
      />,
    );
    const texte = screen
      .getAllByRole('alert')
      .map((n) => n.textContent ?? '')
      .join(' ');
    expect(texte).toContain('Marie LEROY');
    expect(texte).toContain('aucune organisation bénéficiaire');
  });
});

describe('PUISSANCE (c) — une pièce partie s’annule, et le dit', () => {
  const partie = ligne({
    etat: 'ENVOYE',
    envoyable: false,
    signatureRequestId: 'req-9',
  });

  it('la ligne dit « En attente de signature » et que personne n’a été prévenu (C.2c)', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [partie] })} />,
    );
    expect(screen.getByText(/en attente de signature/i)).toBeTruthy();
    expect(document.body.textContent).toContain('C.2c');
  });

  it('« Annuler l’envoi » appelle `annulerEnvoiSignature` avec l’identifiant de la DEMANDE', async () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [partie] })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /annuler l’envoi/i }));
    await waitFor(() => expect(annulerEnvoiSignature).toHaveBeenCalledTimes(1));
    expect(annulerEnvoiSignature.mock.calls[0]![0]).toEqual({ signatureRequestId: 'req-9' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('aucun lien « Relancer » n’existe — il n’a rien à relancer avant C.2c', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [partie] })} />,
    );
    expect(screen.queryAllByRole('button', { name: /relancer/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /relancer/i })).toHaveLength(0);
  });

  it('une demande partie SANS identifiant le dit, au lieu d’offrir un bouton qui échouerait', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [ligne({ etat: 'ENVOYE', envoyable: false, signatureRequestId: null })] })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /annuler l’envoi/i })).toHaveLength(0);
    expect(document.body.textContent).toContain('annulable');
  });
});

describe('PUISSANCE (d) — décision n°4 : coexistence, puis exclusion dès qu’un signé existe', () => {
  it('pièce nominative prête : « Envoyer pour signature » ET « Déposer le scan » côte à côte', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i }).length).toBeGreaterThan(0);
  });

  it('pièce SIGNÉE : plus AUCUN des deux gestes — mais « Ouvrir » reste', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [ligne({ etat: 'SIGNE', envoyable: false })] })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /envoyer pour signature/i })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /ouvrir/i }).length).toBeGreaterThan(0);
  });

  it('pièce COLLECTIVE (convention de groupe) : pas de dépôt de scan par apprenant', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({
          lignes: [
            ligne({
              cle: 'CONVENTION:org-1',
              docType: 'CONVENTION',
              libelle: 'Convention — AGENCE MARTIN (2 participants)',
              participantIds: ['part-1', 'part-2'],
              participantIdUnique: null,
            }),
          ],
        })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
  });
});

describe('Le bloc se tait quand il n’a rien à dire', () => {
  it('aucune ligne, aucun blocage, aucun avertissement ⇒ rien n’est rendu', () => {
    const { container } = render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [] })} />,
    );
    expect(container.textContent).toBe('');
  });
});

/**
 * Lot C.2b-3 — « Une pièce, un seul chemin ouvert » (Laurent, 11/09/2026).
 *
 * L'écart n°6 du SUMMARY-2 est TRANCHÉ : « Déposer le scan » reste offert sur
 * une ligne partie en signature, mais il n'ouvre plus un second chemin — il
 * ferme le premier. Le dépôt annule l'envoi chez le prestataire, après
 * confirmation explicite.
 *
 * CE QUE CE BLOC DOIT FAIRE, ET LUI SEUL : dire au dépôt qu'un envoi est en
 * cours. La ligne est la SEULE à le savoir (`etat === 'ENVOYE'`) ; le menu de
 * la matrice, lui, ne le sait pas — d'où le garde-fou serveur, qui refuse tout
 * dépôt non confirmé quel que soit le chemin d'entrée.
 */
describe('PUISSANCE (e) — le dépôt sur une pièce PARTIE prévient qu’il annulera l’envoi', () => {
  it('ligne ENVOYE : ouvrir « Déposer le scan » affiche l’avertissement d’annulation', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({
          lignes: [ligne({ etat: 'ENVOYE', envoyable: false, signatureRequestId: 'req-9' })],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /déposer le scan/i }));

    // Constante IMPORTÉE du composant de dépôt : si le bloc oubliait de passer
    // `envoiEnAttente`, le scan partirait sans confirmation et annulerait
    // l'envoi en silence — ou, pire, échouerait sans que rien ne l'explique.
    expect(screen.getByText(AVERTISSEMENT_DEPOT_ANNULE_ENVOI)).toBeDefined();
  });

  it('ligne GÉNÉRÉE (rien n’est parti) : aucun avertissement — on n’effraie pas pour rien', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /déposer le scan/i }));

    expect(screen.queryAllByText(AVERTISSEMENT_DEPOT_ANNULE_ENVOI)).toHaveLength(0);
  });
});

/**
 * Retour d'écran Laurent, 11/09/2026 — correction n°1, CONTRASTE.
 *
 * Les deux boutons d'envoi portaient `text-primary-foreground`, une classe qui
 * ne produisait AUCUNE règle CSS dans ce projet (le jeton manquait sous
 * `primary`). Ratio mesuré : 2,12:1, contre un seuil AA de 4,5:1.
 *
 * LE JETON EST RÉPARÉ EN CONFIG, ET `text-white` RESTE ÉCRIT ICI — exigence
 * explicite de Laurent, et ce n'est pas une redondance : la classe explicite
 * survit à une refonte future du jeton, et ce test garde le bouton
 * INDÉPENDAMMENT de `tailwind.config.ts`. La mutation « retirer `text-white` »
 * doit faire rougir ces deux tests.
 */
describe('Contraste — les boutons d’envoi écrivent leur couleur de texte', () => {
  it('le bouton du bloc : `bg-primary text-white`, et plus la classe fantôme', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    const bouton = screen.getByRole('button', { name: /^envoyer pour signature \(\d+\)$/i });
    expect(bouton.className).toContain('text-white');
    expect(bouton.className).toContain('bg-primary');
    expect(bouton.className).not.toContain('text-primary-foreground');
  });

  it('le bouton de LIGNE porte lui aussi `text-white` — même fond, même exigence', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    const bouton = screen.getByRole('button', { name: /envoyer pour signature — attestation/i });
    expect(bouton.className).toContain('text-white');
    expect(bouton.className).not.toContain('text-primary-foreground');
  });
});
