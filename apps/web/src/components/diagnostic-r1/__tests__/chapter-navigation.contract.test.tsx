/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Contrat de navigation du R1 — le défaut du 14/09/2026.
 *
 * Vécu par Laurent en rendez-vous réel : arrivé au chapitre 4, ni le 5 ni le
 * retour au 3 ne répondaient. Aucun message. Le contournement était de changer
 * le numéro de chapitre dans l'URL.
 *
 * La cause tenait en une ligne : `goTo` faisait `await flushNow()` AVANT
 * `router.push`, et `flushNow` attendait `write.run()` SANS AUCUNE BORNE. Une
 * action serveur lente — ou qui ne se règle jamais — suspendait la navigation
 * dans les deux sens, en silence.
 *
 * La règle que ces tests figent : **une navigation ne dépend JAMAIS d'un
 * enregistrement qui peut ne pas revenir.** On borne l'attente, on navigue, et
 * on DIT ce qui n'est pas parti — on ne le perd pas.
 *
 * ⚠ Test de contrat : il doit rougir contre le code d'origine (§4 ter). La
 * mutation est fournie par `saveDiagnosticAnswer` ci-dessous, qui rend une
 * promesse qui ne se règle JAMAIS.
 */

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn(), info: vi.fn() },
}));

/** LA MUTATION : une écriture qui ne se règle jamais. */
const neverSettles = () => new Promise<never>(() => {});

vi.mock('@/server/actions/diagnostics', () => ({
  saveDiagnosticAnswer: vi.fn(neverSettles),
  recomputeDiagnosticSnapshot: vi.fn(async () => ({ ok: true as const })),
  completeDiagnostic: vi.fn(async () => ({ ok: true as const })),
  upsertDiagnosticParticipant: vi.fn(async () => ({ ok: true as const })),
  deleteDiagnosticParticipant: vi.fn(async () => ({ ok: true as const })),
}));

const { ChapterWorkspace } = await import('../chapter-workspace');
const { resetAutosaveShared } = await import('../use-autosave');

const RULES = {
  AGEFICE_THRESHOLD_CA_N1: 7000,
  AGEFICE_ANNUAL_CAP: 3000,
  AGEFICE_ANNUAL_CAP_REDUCED: 600,
  AGEFICE_HOURLY_PRESENTIEL: 42,
  AGEFICE_HOURLY_DISTANCIEL: 35,
  AGEFICE_LEAD_DAYS_MIN: 15,
  AGEFICE_INDEMNITY_MIN: 700,
  AGEFICE_INDEMNITY_MAX: 800,
  OPCO_EP_ENVELOPE_LT_11: 2500,
  OPCO_EP_ENVELOPE_11_TO_50: 4500,
  OPCO_EP_RATE_REGLEMENTAIRE: 40,
  OPCO_EP_RATE_COEUR_METIER: 30,
  PRICE_PER_HOUR_PER_PARTICIPANT: 84,
  HALF_DAY_ONSITE_HOURS: 4,
  TRAINER_COUNT_DEFAULT: 2,
  CONSUMPTION_LEVER_PERCENT: 30,
  DISCOUNT_WARNING_PERCENT: 15,
  PROPOSAL_VALIDITY_DAYS: 30,
};

function renderChapitre4() {
  return render(
    <ChapterWorkspace
      diagnosticId="diag-1"
      reference="DIAG-0001"
      variant="COMPLET"
      chapter={4}
      readOnly={false}
      initialAnswers={[]}
      initialParticipants={[]}
      rules={RULES}
    />,
  );
}

/** Met une réponse en attente d'enregistrement : premier champ du chapitre. */
async function saisirUneReponse() {
  const champs = document.querySelectorAll<HTMLElement>('[data-diag-field="true"]');
  expect(champs.length, 'le chapitre 4 doit rendre au moins un champ').toBeGreaterThan(0);
  await act(async () => {
    fireEvent.change(champs[0]!, { target: { value: '12' } });
  });
}


/**
 * Les deux surfaces de navigation portent le MÊME libellé (« 5. Mandats… ») :
 * le sommaire de gauche et la barre du bas. Les distinguer est nécessaire —
 * et utile, parce que le défaut vécu atteignait les deux.
 */
function sommaire() {
  return screen.getByRole('navigation', { name: 'Chapitres' });
}
function barreDuBas() {
  const navs = screen.getAllByRole('navigation');
  const bas = navs.find((n) => n !== sommaire());
  expect(bas, 'la barre de navigation du bas doit exister').toBeTruthy();
  return bas!;
}

describe('Navigation de chapitre — une navigation ne dépend jamais d’un enregistrement', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  // `globals` n'est pas activé dans vitest.config : l'auto-cleanup de
  // testing-library ne tourne pas, et deux rendus cohabiteraient dans le DOM.
  afterEach(() => {
    cleanup();
    // La file vit au niveau du module : sans cette remise à zéro, une écriture
    // bloquée d'un cas fuirait dans le suivant.
    resetAutosaveShared();
    vi.useRealTimers();
  });

  it('bascule au chapitre suivant même si l’enregistrement ne se règle JAMAIS', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChapitre4();
    await saisirUneReponse();

    const suivant = within(barreDuBas()).getByRole('button', { name: /5\./ });
    await act(async () => {
      fireEvent.click(suivant);
    });

    // On laisse passer la borne : largement plus que le débounce, largement
    // moins que « l'infini » de la promesse en vol.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(push, 'le changement de chapitre doit aboutir malgré l’écriture bloquée').toHaveBeenCalledWith(
      '/app/diagnostics/diag-1/chapitre/5',
    );
    vi.useRealTimers();
  });

  it('revient au chapitre précédent dans les mêmes conditions', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChapitre4();
    await saisirUneReponse();

    // Celui-ci passe par le SOMMAIRE — l'autre chemin de navigation.
    const precedent = within(sommaire()).getByRole('button', { name: /3\./ });
    await act(async () => {
      fireEvent.click(precedent);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(push, 'le retour arrière est atteint par le même défaut').toHaveBeenCalledWith(
      '/app/diagnostics/diag-1/chapitre/3',
    );
    vi.useRealTimers();
  });

  it('donne un retour visuel immédiat au clic — le bouton ne reste pas muet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChapitre4();
    await saisirUneReponse();

    const suivant = within(barreDuBas()).getByRole('button', { name: /5\./ });
    await act(async () => {
      fireEvent.click(suivant);
    });

    // Sans attendre la borne : l'écran doit DÉJÀ dire que le clic a été pris.
    expect(
      suivant.getAttribute('aria-busy'),
      'le bouton cliqué doit s’annoncer occupé dès le clic',
    ).toBe('true');
    vi.useRealTimers();
  });

  it('ne lance pas deux navigations si on clique deux fois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderChapitre4();
    await saisirUneReponse();

    const suivant = within(barreDuBas()).getByRole('button', { name: /5\./ });
    await act(async () => {
      fireEvent.click(suivant);
      fireEvent.click(suivant);
      fireEvent.click(suivant);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(push, 'trois clics ne doivent produire qu’une navigation').toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
