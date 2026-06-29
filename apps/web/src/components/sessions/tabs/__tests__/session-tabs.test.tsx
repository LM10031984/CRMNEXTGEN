/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/**
 * Phase 15 Lot 1 (15-01) Task 1 — TDD RED.
 *
 * Test comportemental (pas source-grep) du conteneur client `<SessionTabs>` :
 * coquille à 5 onglets `?tab=` (Session · Avant · Après · Tous les documents ·
 * Agenda) lisant l'onglet actif dans l'URL via `useSearchParams`, navigant par
 * `window.history.pushState` (0 round-trip), panneaux pré-rendus en props,
 * montés mais `hidden` pour les inactifs (switch instantané).
 *
 * On rend `<SessionTabs>` avec 5 sections marquées par un texte distinct et on
 * interroge le DOM réel (visibilité via attribut `hidden`, a11y role=tab/tablist,
 * aria-selected) + on espionne `window.history.pushState`.
 *
 * `useSearchParams` est mocké par `vi.mock('next/navigation', ...)` ; chaque test
 * fixe la valeur courante de l'URL via `setSearchParams(...)`.
 */

// --- mock next/navigation ---------------------------------------------------
let currentParams = new URLSearchParams('');
function setSearchParams(qs: string) {
  currentParams = new URLSearchParams(qs);
}
vi.mock('next/navigation', () => ({
  useSearchParams: () => currentParams,
}));

import { SessionTabs, coerceTab } from '../session-tabs';

const panels = {
  session: <div>PANEL_SESSION</div>,
  avant: <div>PANEL_AVANT</div>,
  apres: <div>PANEL_APRES</div>,
  docs: <div>PANEL_DOCS</div>,
  agenda: <div>PANEL_AGENDA</div>,
};

/** Le panneau dont le texte est visible = celui dont l'ancêtre [role=tabpanel] n'est pas hidden. */
function isPanelVisible(text: string): boolean {
  const node = screen.getByText(text);
  const panel = node.closest('[role="tabpanel"]') as HTMLElement | null;
  expect(panel).not.toBeNull();
  // jsdom reflète l'attribut booléen `hidden` sur la propriété.
  return panel!.hidden === false;
}

beforeEach(() => {
  // environment=node par défaut : pas de cleanup auto entre tests → on démonte
  // explicitement le DOM précédent pour éviter les "multiple elements".
  cleanup();
  setSearchParams('');
  vi.restoreAllMocks();
});

describe('coerceTab (fonction pure)', () => {
  it('undefined → "session" (onglet par défaut)', () => {
    expect(coerceTab(undefined)).toBe('session');
  });
  it('"apres" → "apres" (id valide conservé)', () => {
    expect(coerceTab('apres')).toBe('apres');
  });
  it('"zzz-inconnu" → "session" (coerce fallback)', () => {
    expect(coerceTab('zzz-inconnu')).toBe('session');
  });
});

describe('SessionTabs — routage onglet via ?tab=', () => {
  it('searchParams vide → PANEL_SESSION visible, les autres hidden', () => {
    setSearchParams('');
    render(<SessionTabs defaultTab="session" {...panels} />);
    expect(isPanelVisible('PANEL_SESSION')).toBe(true);
    expect(isPanelVisible('PANEL_AVANT')).toBe(false);
    expect(isPanelVisible('PANEL_APRES')).toBe(false);
  });

  it('?tab=apres → PANEL_APRES visible, PANEL_SESSION masqué', () => {
    // defaultTab="session" VOLONTAIREMENT divergent de l'URL : seul un composant
    // qui LIT réellement `?tab=` (et pas la prop defaultTab) peut afficher Après.
    // C'est le test de puissance — il vire ROUGE si on renvoie defaultTab.
    setSearchParams('tab=apres');
    render(<SessionTabs defaultTab="session" {...panels} />);
    expect(isPanelVisible('PANEL_APRES')).toBe(true);
    expect(isPanelVisible('PANEL_SESSION')).toBe(false);
  });

  it('?tab=zzz inconnu → fallback PANEL_SESSION visible (coerce)', () => {
    setSearchParams('tab=zzz');
    render(<SessionTabs defaultTab="session" {...panels} />);
    expect(isPanelVisible('PANEL_SESSION')).toBe(true);
    expect(isPanelVisible('PANEL_APRES')).toBe(false);
  });
});

describe('SessionTabs — a11y (tablist / tab / aria-selected)', () => {
  it('le <nav> a role="tablist" et expose exactement 5 role="tab"', () => {
    setSearchParams('');
    render(<SessionTabs defaultTab="session" {...panels} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('l’onglet actif a aria-selected="true", les autres "false"', () => {
    // defaultTab divergent : aria-selected doit suivre l'URL, pas la prop.
    setSearchParams('tab=apres');
    render(<SessionTabs defaultTab="session" {...panels} />);
    const tabs = screen.getAllByRole('tab');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    const unselected = tabs.filter((t) => t.getAttribute('aria-selected') === 'false');
    expect(selected).toHaveLength(1);
    expect(unselected).toHaveLength(4);
    expect(selected[0]!.textContent).toContain('Après');
  });
});

describe('SessionTabs — navigation via window.history.pushState', () => {
  it('cliquer « Avant la formation » appelle pushState avec une URL contenant tab=avant', () => {
    setSearchParams('');
    const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    render(<SessionTabs defaultTab="session" {...panels} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Avant la formation' }));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const url = String(pushSpy.mock.calls[0]![2]);
    expect(url).toContain('tab=avant');
  });

  it('cliquer « Session » (défaut) appelle pushState SANS tab=', () => {
    setSearchParams('tab=apres');
    const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    render(<SessionTabs defaultTab="apres" {...panels} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Session' }));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    const url = String(pushSpy.mock.calls[0]![2]);
    expect(url).not.toContain('tab=');
  });
});
