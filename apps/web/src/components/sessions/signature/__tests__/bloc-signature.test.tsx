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
import {
  composerAvertissementRegime,
  correctionAvertissement,
  type ContexteAvertissement,
  type LigneSignature,
  type VueSignature,
} from '@/lib/sessions/bloc-signature-vue';
import type { DocTypeSignable } from '@/lib/signature/regime';
import {
  LIBELLE_LIEN_CORRIGER_COMMANDITAIRE,
  lienCorrigerFinanceur,
} from '@/lib/sessions/lien-corriger-financeur';
import {
  libelleLienRenseignerFinanceur,
  lienRenseignerFinanceur,
  retourVersOnglet,
} from '@/lib/sessions/lien-renseigner-financeur';

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
    signataire: null,
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
  // ⚠ Forme MISE À JOUR le 11/09/2026 (corrections n°2 et n°3) : la vue rend un
  // avertissement PAR PARTICIPANT, avec la liste de ses pièces, et le message
  // vient de `composerAvertissementRegime` — jamais d'une recopie.
  // CAS B : le commanditaire IMAGIMMO a bien un financeur, mais il n'ouvre pas
  // cette pièce — c'est le rattachement de l'inscription qui est à revoir.
  const CONTEXTE_B: ContexteAvertissement = {
    sponsorOrgId: 'org-imagimmo',
    sponsorOrgLabel: 'IMAGIMMO',
    financeurSansRegime: false,
    financeursRattaches: ['AGEFICE'],
  };
  const avertissement = {
    participantId: 'part-3',
    nomAffiche: 'Florent HAUSSWIRTH',
    docTypes: ['AGEFICE'] as DocTypeSignable[],
    correction: correctionAvertissement(CONTEXTE_B),
    message: composerAvertissementRegime({
      nomAffiche: 'Florent HAUSSWIRTH',
      docTypes: ['AGEFICE'],
      contexte: CONTEXTE_B,
    }),
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
    expect(texte).toContain('Rien n’a été envoyé.');
  });

  it('CAS B — le lien mène au formulaire d’INSCRIPTION, et ramène sur l’onglet d’où l’on vient', () => {
    // Décision Laurent, 11/09/2026 (point 7) : « un avertissement qui dit
    // "corrigez" sans lien est un ticket, pas une aide. »
    // L'URL n'est PAS recopiée ici : elle est comparée à ce que produit le
    // contrat publié. Recopier la chaîne laisserait le test vert alors même que
    // le lien mènerait ailleurs — l'erreur commise sept fois sur ce chantier.
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissement] })}
      />,
    );
    const lien = screen.getByRole('link', { name: LIBELLE_LIEN_CORRIGER_COMMANDITAIRE });
    expect(lien.getAttribute('href')).toBe(
      lienCorrigerFinanceur({ sessionId: SESSION_ID, participantId: 'part-3', retour: 'avant' }),
    );
  });

  it('depuis l’onglet Après, le retour pointe sur Après — pas sur Avant', () => {
    // `retour` suit le scope du bloc : le figer renverrait l'admin sur un autre
    // onglet que celui qu'il a quitté.
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [], avertissements: [avertissement] })}
      />,
    );
    const lien = screen.getByRole('link', { name: LIBELLE_LIEN_CORRIGER_COMMANDITAIRE });
    expect(lien.getAttribute('href')).toContain('retour=apres');
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
  /**
   * ⚠ CE TEST A ÉTÉ RETOURNÉ le 11/09/2026 (correction n°6), et c'est un
   * changement de décision, pas un ajustement de test.
   *
   * Il exigeait la COEXISTENCE des deux gestes sur une pièce nominative non
   * signée. Laurent tranche : « Déposer le scan » n'apparaissait que sur la
   * ligne AGEFICE — incohérent — et il ne doit apparaître sur AUCUNE ligne. La
   * zone de dépôt en dessous suffit, et elle traite tous les stagiaires d'un
   * coup. Le geste d'envoi, lui, reste.
   */
  it('pièce nominative prête : « Envoyer pour signature », et AUCUN dépôt par ligne', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="AFTER" vue={vue({ lignes: [ligne()] })} />,
    );
    expect(
      screen.queryAllByRole('button', { name: /envoyer pour signature/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
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
describe('PUISSANCE (e) — plus AUCUN dépôt par ligne (correction n°6, 11/09/2026)', () => {
  /**
   * ⚠ CE QUE CES DEUX TESTS REMPLACENT, ET POURQUOI JE LE DIS.
   *
   * Le lot C.2b-3 avait posé ici deux tests — « ligne ENVOYE : ouvrir
   * "Déposer le scan" affiche l'avertissement d'annulation » et son pendant sur
   * une ligne générée. Ils ne tenaient QUE par le bouton que la correction n°6
   * retire : sans lui, `getByRole('button', { name: /déposer le scan/i })`
   * lève, et le test tombe pour la mauvaise raison.
   *
   * LA RÈGLE DE C.2b-3 N'EST PAS CASSÉE POUR AUTANT, et elle n'est pas gardée
   * ici : `persistSignedScan` reste le point de passage unique (fail-closed,
   * `signature-depot-scan.test.ts`, 12 tests inchangés), et l'ÉTAPE de
   * confirmation garde son propre fichier de test, sur le dialogue lui-même
   * (`upload-signed-doc-dialog.confirmation.test.tsx`, 10 tests inchangés).
   * Aucun des deux n'a été touché.
   *
   * CE QUI CHANGE RÉELLEMENT : le bloc n'a plus d'appelant qui passe
   * `envoiEnAttente`. Un dépôt fait depuis la matrice sur une pièce partie sera
   * donc REFUSÉ par le serveur au lieu de proposer la confirmation. Le recours
   * est le bouton « Annuler l'envoi », qui vit sur cette même ligne — c'est ce
   * que garde le second test.
   */
  it('aucune ligne ne propose de dépôt — ni générée, ni partie en signature', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({
          lignes: [
            ligne(),
            ligne({
              cle: 'AGEFICE:part-2',
              docType: 'AGEFICE',
              libelle: 'Dossier AGEFICE — Jean DUPONT',
              etat: 'ENVOYE',
              envoyable: false,
              signatureRequestId: 'req-9',
            }),
          ],
        })}
      />,
    );
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
    // La modale de dépôt n'est plus montée du tout : son avertissement — la
    // constante IMPORTÉE du lot C.2b-3 — n'existe nulle part dans ce bloc.
    expect(screen.queryAllByText(AVERTISSEMENT_DEPOT_ANNULE_ENVOI)).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Téléverser le PDF signé');
  });

  it('sur une pièce PARTIE, le recours reste « Annuler l’envoi » — il n’a pas disparu avec le dépôt', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({
          lignes: [ligne({ etat: 'ENVOYE', envoyable: false, signatureRequestId: 'req-9' })],
        })}
      />,
    );
    expect(
      screen.queryAllByRole('button', { name: /annuler l’envoi/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: /déposer le scan/i })).toHaveLength(0);
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

/**
 * Retour d'écran Laurent, 11/09/2026 — corrections n°2 et n°3.
 *
 * Camille ROUSSEL apparaissait DEUX FOIS : un encart pour la convention, un
 * autre pour le dossier AGEFICE. UNE anomalie — le financeur de son inscription
 * — mais deux encarts, donc deux fois la même chose à lire et à corriger.
 *
 * ⚠ LA MUTATION QUI COMPTE ICI : réintroduire un encart par pièce (rendre
 * `vue.avertissements` pièce par pièce au lieu du regroupement) doit faire
 * rougir le premier test. Le second garde le CONTENU : sans lui, un encart
 * unique qui ne nommerait pas les deux pièces passerait.
 */
describe('PUISSANCE (f) — UN SEUL encart par participant, qui liste ses pièces', () => {
  // CAS A : le commanditaire est le bon, il lui manque son code financeur.
  const CONTEXTE_A: ContexteAvertissement = {
    sponsorOrgId: 'org-roussel',
    sponsorOrgLabel: 'DEMO-SIG ROUSSEL Camille, EI',
    financeurSansRegime: true,
    financeursRattaches: ['AGEFICE'],
  };
  const avertissementRegroupe = {
    participantId: 'part-c',
    nomAffiche: 'Camille ROUSSEL',
    docTypes: ['CONVENTION', 'AGEFICE'] as DocTypeSignable[],
    correction: correctionAvertissement(CONTEXTE_A),
    message: composerAvertissementRegime({
      nomAffiche: 'Camille ROUSSEL',
      docTypes: ['CONVENTION', 'AGEFICE'],
      contexte: CONTEXTE_A,
    }),
  };

  it('deux pièces incohérentes pour la même personne : UNE alerte, pas deux', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [{ ...avertissementRegroupe, docTypes: ['CONVENTION', 'AGEFICE'] }] })}
      />,
    );
    // Le nom ne doit apparaître QU'UNE FOIS dans tout le bloc.
    const occurrences = (document.body.textContent ?? '').split('Camille ROUSSEL').length - 1;
    expect(occurrences).toBe(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('l’encart unique NOMME les deux pièces — sinon il perdrait ce que les deux encarts disaient', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [{ ...avertissementRegroupe, docTypes: ['CONVENTION', 'AGEFICE'] }] })}
      />,
    );
    const texte = screen.getByRole('alert').textContent ?? '';
    expect(texte).toContain('Pièces concernées : convention, dossier AGEFICE.');
    // Le message vient de la fonction IMPORTÉE, jamais d'une recopie : les
    // apostrophes typographiques en feraient sinon un test vert pour rien.
    expect(texte).toContain(avertissementRegroupe.message);
  });

  /**
   * CAS A — LE LIEN NE MÈNE PAS AU MÊME ENDROIT, et c'est tout l'objet de la
   * correction n°7 bis. Camille ROUSSEL n'a rien à corriger sur son
   * inscription : son organisation est la bonne, il lui manque son financeur.
   * L'envoyer sur le formulaire d'inscription, c'est l'envoyer changer un champ
   * qui est déjà juste.
   */
  it('CAS A — le lien mène à la FICHE ORGANISATION, champ financeur, et la NOMME', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissementRegroupe] })}
      />,
    );
    const lien = screen.getByRole('link', {
      name: libelleLienRenseignerFinanceur('DEMO-SIG ROUSSEL Camille, EI'),
    });
    expect(lien.getAttribute('href')).toBe(
      lienRenseignerFinanceur({
        organizationId: 'org-roussel',
        retourVers: retourVersOnglet(SESSION_ID, 'avant'),
      }),
    );
    // ⚠ L'ÉGALITÉ CI-DESSUS NE SUFFIT PAS : les deux côtés passent par la même
    // fonction, donc un constructeur qui cesserait de poser le retour les
    // ferait collapser ensemble — constaté en mutation. On exige donc AUSSI la
    // destination, littéralement, comme le fait le test du cas B.
    expect(lien.getAttribute('href')).toContain('/app/organisations/org-roussel');
    expect(lien.getAttribute('href')).toContain('champ=financeur');
    expect(lien.getAttribute('href')).toContain('from=%2Fapp%2Fsessions%2Fsess-1%3Ftab%3Davant');
  });

  it('PUISSANCE — le cas A ne propose PAS le lien du cas B (et réciproquement)', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [], avertissements: [avertissementRegroupe] })}
      />,
    );
    expect(screen.queryByRole('link', { name: LIBELLE_LIEN_CORRIGER_COMMANDITAIRE })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('CAS A depuis l’onglet Après : le retour ramène sur Après', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="AFTER"
        vue={vue({ lignes: [], avertissements: [avertissementRegroupe] })}
      />,
    );
    const lien = screen.getByRole('link', {
      name: libelleLienRenseignerFinanceur('DEMO-SIG ROUSSEL Camille, EI'),
    });
    expect(lien.getAttribute('href')).toBe(
      lienRenseignerFinanceur({
        organizationId: 'org-roussel',
        retourVers: retourVersOnglet(SESSION_ID, 'apres'),
      }),
    );
    expect(lien.getAttribute('href')).toContain('from=%2Fapp%2Fsessions%2Fsess-1%3Ftab%3Dapres');
  });
});

/**
 * Retour d'écran Laurent, 11/09/2026 — correction n°4.
 *
 * « Convention — Provence Immobilier (2 participants) · signataire : Paul
 * DURAND · paul.durand@… » — sur la LIGNE, avant même de cliquer. L'information
 * n'existait que dans la modale de confirmation ; Laurent la veut ici, parce
 * que « c'est ce qui permet de repérer une mauvaise adresse d'un coup d'œil ».
 *
 * L'adresse peut être TRONQUÉE à l'affichage, mais elle doit rester complète au
 * survol ou dans un attribut : une adresse coupée dans laquelle on ne peut plus
 * lire le domaine ne permet justement pas de repérer l'erreur.
 */
describe('PUISSANCE (g) — qui signe, et à quelle adresse, sur la LIGNE', () => {
  const SIGNEE = ligne({
    cle: 'CONVENTION:org-1',
    docType: 'CONVENTION',
    libelle: 'Convention — Provence Immobilier (2 participants)',
    participantIds: ['part-1', 'part-2'],
    participantIdUnique: null,
    signataire: { nom: 'Paul DURAND', email: 'paul.durand@provence-immobilier.fr' },
  });

  it('la ligne nomme le signataire ET son adresse, sans qu’on ait rien ouvert', () => {
    render(
      <BlocSignature sessionId={SESSION_ID} scope="BEFORE" vue={vue({ lignes: [SIGNEE] })} />,
    );
    expect(preparerEnvoiSignature).not.toHaveBeenCalled();
    const texte = document.body.textContent ?? '';
    expect(texte).toContain('Paul DURAND');
    expect(texte).toContain('paul.durand@provence-immobilier.fr');
  });

  it('l’adresse COMPLÈTE reste lisible en attribut, même tronquée à l’écran', () => {
    const { container } = render(
      <BlocSignature sessionId={SESSION_ID} scope="BEFORE" vue={vue({ lignes: [SIGNEE] })} />,
    );
    const porteur = container.querySelector('[title="paul.durand@provence-immobilier.fr"]');
    expect(porteur).not.toBeNull();
  });

  it('signataire non résolu : la ligne le DIT, elle n’invente pas un nom', () => {
    render(
      <BlocSignature
        sessionId={SESSION_ID}
        scope="BEFORE"
        vue={vue({ lignes: [ligne({ ...SIGNEE, signataire: null })] })}
      />,
    );
    const texte = document.body.textContent ?? '';
    expect(texte).not.toContain('Paul DURAND');
    expect(texte).toContain('signataire à déterminer');
  });
});
