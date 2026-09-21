/* @vitest-environment jsdom */

/**
 * Lot D — l'écran « Dossier prêt », à l'écran.
 *
 * TROIS PROMESSES, et ce fichier est ce qui les tient :
 *
 *  (a) **L'état de SIGNATURE de chaque pièce se lit sans cliquer.** Avant, la
 *      liste ne disait rien : un admin envoyait une convention vierge sans
 *      qu'aucun écran ne l'en avertisse, et le financeur le lui apprenait des
 *      semaines plus tard.
 *  (b) **Le blocage est NOMINATIF et présent AVANT le clic.** Le refus existait
 *      côté serveur depuis ce lot, mais le découvrir au clic fait refaire le
 *      chemin pour rien.
 *  (c) **Le forçage EXISTE ou n'existe pas** — jamais grisé. Ici ce n'est pas
 *      un réglage qui manque, c'est un rôle : un bouton grisé ferait chercher
 *      une case à cocher.
 *
 * ⚠ `beforeEach(cleanup)` : sans lui le DOM du test précédent survit et rend
 * tous les `queryBy*` menteurs (constaté en C.2b-1).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const sendOpcoSubmission = vi.fn(
  async (..._a: unknown[]): Promise<{ ok: boolean; dryRun?: boolean }> => ({ ok: true }),
);
const updateOpcoSubmissionDraft = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const markOpcoSubmissionStatus = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const refreshOpcoSubmissionDraft = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const confirmOpcoCfpPostalCode = vi.fn(
  async (..._a: unknown[]): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
);
const selectOpcoPointAccueil = vi.fn(
  async (..._a: unknown[]): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
);

vi.mock('@/server/actions/opco-upload-piece', () => ({ uploadOpcoPiece: vi.fn() }));
vi.mock('@/server/actions/opco-submission', () => ({
  sendOpcoSubmission: (...a: unknown[]) => sendOpcoSubmission(...a),
  updateOpcoSubmissionDraft: (...a: unknown[]) => updateOpcoSubmissionDraft(...a),
  markOpcoSubmissionStatus: (...a: unknown[]) => markOpcoSubmissionStatus(...a),
  refreshOpcoSubmissionDraft: (...a: unknown[]) => refreshOpcoSubmissionDraft(...a),
  selectOpcoPointAccueil: (...a: unknown[]) => selectOpcoPointAccueil(...a),
  confirmOpcoCfpPostalCode: (...a: unknown[]) => confirmOpcoCfpPostalCode(...a),
}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { SubmissionEditor } from '../submission-editor';
import type { SubmissionAttachment } from '@/server/actions/opco-submission';
import { toast } from 'sonner';

const PJ_SIGNEES: SubmissionAttachment[] = [
  {
    key: 'signed/c.pdf',
    filename: 'Convention.pdf',
    kind: 'CONVENTION',
    included: true,
    signe: true,
  },
  {
    key: 'signed/a.pdf',
    filename: 'Agefice.pdf',
    kind: 'AGEFICE_PA_FORM',
    included: true,
    signe: true,
  },
  {
    key: 'signed/c.audit-trail.pdf',
    filename: 'Certificat.pdf',
    kind: 'AUDIT_TRAIL',
    included: true,
    signe: false,
  },
];
const PJ_NON_SIGNEES: SubmissionAttachment[] = [
  {
    key: 'docs/c.pdf',
    filename: 'Convention.pdf',
    kind: 'CONVENTION',
    included: true,
    signe: false,
  },
  {
    key: 'signed/a.pdf',
    filename: 'Agefice.pdf',
    kind: 'AGEFICE_PA_FORM',
    included: true,
    signe: true,
  },
];

function editeur(
  over: {
    attachments?: SubmissionAttachment[];
    role?: string;
    recipientEmail?: string | null;
    sponsorOpcoCode?: string | null;
    sponsorName?: string;
    agefice?: boolean;
    deliveryState?: 'READY' | 'SENDING' | 'UNCERTAIN';
    stage?: 'PRISE_EN_CHARGE' | 'FIN_FORMATION';
    pointAccueilOptions?: Array<{ id: string; name: string; email: string | null }>;
    pointAccueilId?: string | null;
    department?: string | null;
  } = {},
) {
  return (
    <SubmissionEditor
      id="sub-1"
      role={over.role ?? 'ADMIN'}
      initial={{
        recipientEmail:
          over.recipientEmail === undefined ? 'formation@cci-nice.fr' : over.recipientEmail,
        subject: 'Dossier AGEFICE',
        bodyHtml: '<p>x</p>',
        attachments: over.attachments ?? PJ_SIGNEES,
        apprenantName: 'Jean DUPONT',
        sponsorName: over.sponsorName ?? 'DUPONT Jean',
        sessionLabel: 'IA immobilier · 01 oct. 2026',
        sponsorOpcoCode: over.sponsorOpcoCode === undefined ? 'AGEFICE' : over.sponsorOpcoCode,
        sponsorOrgId: 'org-1',
        agefice: over.agefice ?? false,
        deliveryState: over.deliveryState,
        stage: over.stage,
        pointAccueilOptions: over.pointAccueilOptions,
        pointAccueilId: over.pointAccueilId,
        department: over.department,
      }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  selectOpcoPointAccueil.mockResolvedValue({ ok: true });
  confirmOpcoCfpPostalCode.mockResolvedValue({ ok: true });
  cleanup();
});

describe('rattachement du point d’accueil AGEFICE', () => {
  const points = [
    { id: 'pa-1', name: 'CCI Nice', email: 'nice@example.test' },
    { id: 'pa-2', name: 'Autre point', email: 'autre@example.test' },
  ];
  it('montre le département et les adresses puis rattache le choix', async () => {
    render(editeur({ agefice: true, department: '06', pointAccueilOptions: points }));
    expect(screen.getByText(/Département de l’entreprise vérifié sur la CFP : 06/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'CCI Nice — nice@example.test' })).toBeTruthy();
    const button = screen.getByRole('button', {
      name: 'Rattacher ce point d’accueil',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Point d’accueil AGEFICE'), {
      target: { value: 'pa-2' },
    });
    fireEvent.click(button);
    await waitFor(() => expect(selectOpcoPointAccueil).toHaveBeenCalledWith('sub-1', 'pa-2'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('demande le code postal CFP quand le département manque', () => {
    render(editeur({ agefice: true }));
    expect(
      screen.getByText(/code postal de l’entreprise vérifié sur l’attestation CFP/),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Rattacher ce point d’accueil' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it.each(['SENDING', 'UNCERTAIN'] as const)(
    'empêche le rattachement pendant %s',
    (deliveryState) => {
      render(
        editeur({
          agefice: true,
          deliveryState,
          pointAccueilId: 'pa-1',
          pointAccueilOptions: points,
        }),
      );
      expect((screen.getByLabelText('Point d’accueil AGEFICE') as HTMLSelectElement).disabled).toBe(
        true,
      );
      expect(
        (screen.getByRole('button', { name: 'Rattacher ce point d’accueil' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    },
  );

  it('conserve une édition locale sur refresh identique et adopte le nouveau destinataire serveur', () => {
    const initial = {
      agefice: true,
      pointAccueilOptions: points,
      recipientEmail: 'old@example.test',
    };
    const { rerender } = render(editeur(initial));
    const email = screen.getByPlaceholderText('contact@agefice.fr') as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'local@example.test' } });
    rerender(editeur({ ...initial }));
    expect(email.value).toBe('local@example.test');
    rerender(editeur({ ...initial, recipientEmail: 'nice@example.test', pointAccueilId: 'pa-1' }));
    expect(email.value).toBe('nice@example.test');
    expect((screen.getByLabelText('Point d’accueil AGEFICE') as HTMLSelectElement).value).toBe(
      'pa-1',
    );
  });

  it('affiche le refus du serveur sans annoncer le rattachement', async () => {
    selectOpcoPointAccueil.mockResolvedValue({ ok: false, error: 'Point hors département' });
    render(editeur({ agefice: true, pointAccueilId: 'pa-1', pointAccueilOptions: points }));
    fireEvent.click(screen.getByRole('button', { name: 'Rattacher ce point d’accueil' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Point hors département'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ne propose pas ce sélecteur aux dossiers non AGEFICE', () => {
    render(editeur({ agefice: false, pointAccueilOptions: points }));
    expect(screen.queryByLabelText('Point d’accueil AGEFICE')).toBeNull();
  });
});

describe('AGEFICE : contrôles stricts et résultat du transport', () => {
  it('confirme cinq chiffres lus sur la CFP puis recharge les points', async () => {
    render(editeur({ agefice: true, department: null }));
    const input = screen.getByLabelText('Code postal de l’entreprise sur l’attestation CFP');
    const button = screen.getByRole('button', {
      name: 'Confirmer ce code postal',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    for (const invalid of ['0600', 'ABCDE', '06 00']) {
      fireEvent.change(input, { target: { value: invalid } });
      expect(button.disabled).toBe(true);
    }
    fireEvent.change(input, { target: { value: '06000' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(confirmOpcoCfpPostalCode).toHaveBeenCalledWith('sub-1', '06000'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(selectOpcoPointAccueil).not.toHaveBeenCalled();
  });

  it('ne redemande pas le code postal lorsque le département CFP est connu', () => {
    render(editeur({ agefice: true, department: '06' }));
    expect(screen.queryByLabelText('Code postal de l’entreprise sur l’attestation CFP')).toBeNull();
  });

  it.each(['SENDING', 'UNCERTAIN'] as const)(
    'verrouille la confirmation CFP pendant %s',
    (deliveryState) => {
      render(editeur({ agefice: true, deliveryState }));
      expect(
        (
          screen.getByLabelText(
            'Code postal de l’entreprise sur l’attestation CFP',
          ) as HTMLInputElement
        ).disabled,
      ).toBe(true);
      expect(
        (screen.getByRole('button', { name: 'Confirmer ce code postal' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    },
  );

  it('affiche le refus de confirmation CFP sans rafraîchir', async () => {
    confirmOpcoCfpPostalCode.mockResolvedValue({ ok: false, error: 'Profil introuvable' });
    render(editeur({ agefice: true }));
    fireEvent.change(screen.getByLabelText('Code postal de l’entreprise sur l’attestation CFP'), {
      target: { value: '75001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer ce code postal' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Profil introuvable'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reconnaît un dossier initial complet et bloque une pièce décochée', () => {
    render(
      editeur({
        agefice: true,
        attachments: [
          ...PJ_SIGNEES,
          ...(['CNI', 'CFP_ATTESTATION', 'RIB', 'PROGRAMME'] as const).map((kind) => ({
            key: `docs/${kind}.pdf`,
            filename: `${kind}.pdf`,
            kind,
            included: true,
          })),
        ],
      }),
    );
    expect(
      screen.getByRole('button', { name: /Envoyer maintenant/ }).hasAttribute('disabled'),
    ).toBe(false);
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(
      screen.getByRole('button', { name: /Envoyer maintenant/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('reconnaît les quatre pièces finales et affiche les signatures émargement et assiduité', () => {
    render(
      editeur({
        agefice: true,
        stage: 'FIN_FORMATION',
        attachments: (['RIB', 'EMARGEMENT', 'ASSIDUITE', 'FACTURE_ACQUITTEE'] as const).map(
          (kind) => ({
            key: `docs/${kind}.pdf`,
            filename: `${kind}.pdf`,
            kind,
            included: true,
            signe: kind === 'EMARGEMENT' || kind === 'ASSIDUITE',
          }),
        ),
      }),
    );
    expect(screen.getByText('Fin de formation')).toBeTruthy();
    expect(screen.getAllByText('Signée')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /Envoyer maintenant/ }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('actualise les pièces sans déclencher un envoi', async () => {
    render(editeur({ agefice: true }));
    fireEvent.click(screen.getByRole('button', { name: /Actualiser les pièces/ }));
    await waitFor(() => expect(refreshOpcoSubmissionDraft).toHaveBeenCalledWith('sub-1'));
    expect(sendOpcoSubmission).not.toHaveBeenCalled();
  });
  it('ne propose ni forçage ni marquage manuel lorsque des pièces AGEFICE manquent', () => {
    render(editeur({ agefice: true }));
    expect(
      screen.getByRole('button', { name: /Envoyer maintenant/ }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: /Envoyer quand même/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Marquer envoyé/ })).toBeNull();
    expect(screen.queryByText(/Dossier prêt/)).toBeNull();
  });

  it.each(['SENDING', 'UNCERTAIN'] as const)(
    'bloque tout nouvel envoi pendant %s',
    (deliveryState) => {
      render(editeur({ deliveryState }));
      expect(
        screen.getByRole('button', { name: /Envoyer maintenant/ }).hasAttribute('disabled'),
      ).toBe(true);
      expect(
        screen.getByRole('button', { name: /Sauvegarder brouillon/ }).hasAttribute('disabled'),
      ).toBe(true);
      expect(screen.getByRole('alert')).toBeTruthy();
    },
  );

  it('annonce explicitement une simulation sans succès envoyé ni redirection', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    sendOpcoSubmission.mockResolvedValueOnce({ ok: true, dryRun: true });
    render(editeur());
    fireEvent.click(screen.getByRole('button', { name: /Envoyer maintenant/ }));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('Aucun email envoyé')),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('(a) l’état de signature se lit sur chaque pièce', () => {
  it('une pièce signée le dit', () => {
    render(editeur());
    expect(screen.getAllByText('Signée').length).toBe(2);
  });

  it('une pièce exigée non signée le dit aussi, et pas en silence', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES }));
    expect(screen.getByText('Non signée')).not.toBeNull();
  });

  it('le certificat de signature n’est ni « signé » ni « non signé » — il EST la preuve', () => {
    render(editeur());
    // 3 pièces, 2 mentions : le certificat n'en porte aucune.
    expect(screen.queryAllByText('Non signée')).toHaveLength(0);
    expect(screen.getAllByText('Signée')).toHaveLength(2);
  });
});

describe('(b) le blocage, nominatif et AVANT le clic', () => {
  it('annonce « Dossier prêt » quand tout est signé', () => {
    render(editeur());
    expect(screen.getByText(/Dossier prêt/)).not.toBeNull();
  });

  it('nomme la pièce qui retient le dossier', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES }));
    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toContain('Convention de formation non signée');
  });

  it('le bouton d’envoi ordinaire n’envoie pas un dossier incomplet', async () => {
    render(editeur({ attachments: PJ_NON_SIGNEES }));
    const bouton = screen.getByRole('button', { name: /Envoyer maintenant/ });
    expect(bouton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(bouton);
    await waitFor(() => expect(sendOpcoSubmission).not.toHaveBeenCalled());
  });

  it('sans destinataire, c’est l’adresse qui est nommée, pas les signatures', () => {
    render(editeur({ recipientEmail: null }));
    expect(screen.getByRole('alert').textContent).toContain('Aucune adresse destinataire');
  });
});

describe('(c) le forçage — il existe, ou il n’existe pas', () => {
  it('offert à un ADMIN devant un dossier incomplet', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES, role: 'ADMIN' }));
    expect(screen.getByRole('button', { name: /Envoyer quand même/ })).not.toBeNull();
  });

  it('ABSENT du DOM pour un MANAGER — pas grisé, absent', () => {
    render(editeur({ attachments: PJ_NON_SIGNEES, role: 'MANAGER' }));
    expect(screen.queryByRole('button', { name: /Envoyer quand même/ })).toBeNull();
  });

  it('absent quand le dossier est complet : il n’y a rien à forcer', () => {
    render(editeur({ role: 'ADMIN' }));
    expect(screen.queryByRole('button', { name: /Envoyer quand même/ })).toBeNull();
  });

  it('forcer appelle bien l’envoi AVEC `force`, jamais l’envoi ordinaire', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(editeur({ attachments: PJ_NON_SIGNEES, role: 'ADMIN' }));
    fireEvent.click(screen.getByRole('button', { name: /Envoyer quand même/ }));
    await waitFor(() => expect(sendOpcoSubmission).toHaveBeenCalledWith('sub-1', { force: true }));
  });

  it('un envoi ordinaire ne passe JAMAIS `force`', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(editeur());
    fireEvent.click(screen.getByRole('button', { name: /Envoyer maintenant/ }));
    await waitFor(() => expect(sendOpcoSubmission).toHaveBeenCalledWith('sub-1'));
  });
});

/* ── D-D-1 — l'aide sous un champ destinataire vide ──────────────────────── */

/**
 * L'ÉCRAN DE LA RECETTE (12/09/2026) disait encore « À renseigner — vérifie
 * l'organisation sponsor (champ emailBilling) » : périmé depuis le lot D (un
 * dossier AGEFICE part au point d'accueil, pas au commanditaire) et formulé
 * avec un nom de colonne.
 */
describe('D-D-1 — ce qu’on lit sous un destinataire vide', () => {
  beforeEach(() => cleanup());

  it('AGEFICE : le point d’accueil à rattacher, avec le nom de l’organisation', () => {
    render(
      editeur({ recipientEmail: null, sponsorOpcoCode: 'AGEFICE', sponsorName: 'DUPONT Jean' }),
    );
    expect(screen.getByText(/Point d’accueil AGEFICE non rattaché à DUPONT Jean/)).toBeTruthy();
  });

  it('OPCO de branche : l’adresse de facturation, en français', () => {
    render(
      editeur({ recipientEmail: null, sponsorOpcoCode: 'OPCO_EP', sponsorName: 'AGENCE MARTIN' }),
    );
    expect(screen.getByText(/Aucune adresse de facturation pour AGENCE MARTIN/)).toBeTruthy();
  });

  it('l’ancienne phrase, et le nom de colonne, ont disparu', () => {
    const { container } = render(editeur({ recipientEmail: null }));
    expect(container.textContent ?? '').not.toContain('emailBilling');
    expect(container.textContent ?? '').not.toContain('organisation sponsor');
  });

  it('le lien mène à la fiche organisation — c’est là qu’on corrige', () => {
    render(editeur({ recipientEmail: null }));
    expect(
      screen.getByRole('link', { name: 'Ouvrir la fiche organisation' }).getAttribute('href'),
    ).toBe('/app/organisations/org-1');
  });

  it('rien de tout cela quand l’adresse est renseignée', () => {
    render(editeur({ recipientEmail: 'formation@cci-nice.fr' }));
    expect(screen.queryByRole('link', { name: 'Ouvrir la fiche organisation' })).toBeNull();
  });
});

it('affiche les cinq exigences et les boutons de dépôt même sans destinataire', () => {
  render(editeur({ agefice: true, recipientEmail: '', attachments: [] }));
  expect(screen.getByText('Dossier : 0/5 pièces prêtes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ajouter Carte d’identité' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Ajouter RIB' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Ajouter Attestation CFP URSSAF' })).toBeTruthy();
});
