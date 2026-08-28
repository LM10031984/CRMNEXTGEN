import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * listObjects / deleteFile — primitives ajoutées pour la purge des brouillons
 * abandonnés du formulaire public (spec 2026-08-28).
 *
 * Le piège couvert ici : Supabase `list()` ne descend PAS dans les
 * sous-dossiers. Une entrée sans `id` EST un dossier. Sans parcours récursif,
 * une purge sur `sessions/` ne verrait strictement aucun fichier et
 * rapporterait « rien à supprimer » — un faux négatif silencieux.
 *
 * PROTOCOLE DE MUTATION (non commité) :
 *   Dans listObjects, supprimer le `aVisiter.push(chemin)` de la branche
 *   dossier → le test « descend dans les sous-dossiers » DOIT virer ROUGE.
 */

const { listMock, removeMock, fromMock } = vi.hoisted(() => {
  const listMock = vi.fn();
  const removeMock = vi.fn();
  const fromMock = vi.fn(() => ({ list: listMock, remove: removeMock }));
  return { listMock, removeMock, fromMock };
});

const mockEnv = vi.hoisted(() => ({
  STORAGE_PROVIDER: 'supabase' as 'supabase' | 'minio',
  SUPABASE_URL: 'https://sb.example.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: { from: fromMock } })),
}));

vi.mock('@qualiof/shared/env', () => ({
  sharedEnv: {
    get STORAGE_PROVIDER() {
      return mockEnv.STORAGE_PROVIDER;
    },
    get SUPABASE_URL() {
      return mockEnv.SUPABASE_URL;
    },
    get SUPABASE_SERVICE_ROLE_KEY() {
      return mockEnv.SUPABASE_SERVICE_ROLE_KEY;
    },
  },
}));

import { listObjects, deleteFile } from '../storage';

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.STORAGE_PROVIDER = 'supabase';
});

describe('listObjects (Supabase)', () => {
  it('descend dans les sous-dossiers', async () => {
    // sessions/ → un dossier ses-1 ; ses-1/ → un dossier draft-a ; draft-a/ → 2 fichiers.
    listMock
      .mockResolvedValueOnce({ data: [{ name: 'ses-1', id: null }], error: null })
      .mockResolvedValueOnce({ data: [{ name: 'draft-a', id: null }], error: null })
      .mockResolvedValueOnce({
        data: [
          {
            name: 'cni-1.pdf',
            id: 'obj-1',
            updated_at: '2026-07-01T10:00:00Z',
            metadata: { size: 1234 },
          },
          { name: 'rib-1.pdf', id: 'obj-2', updated_at: null, metadata: null },
        ],
        error: null,
      });

    const objets = await listObjects('preinscriptions', 'sessions');

    expect(objets.map((o) => o.key)).toEqual([
      'sessions/ses-1/draft-a/cni-1.pdf',
      'sessions/ses-1/draft-a/rib-1.pdf',
    ]);
    expect(objets[0]!.lastModified).toEqual(new Date('2026-07-01T10:00:00Z'));
    expect(objets[0]!.size).toBe(1234);
    // Un objet sans date reste exploitable, sans date inventée.
    expect(objets[1]!.lastModified).toBeNull();
  });

  it('remonte une erreur Supabase au lieu de renvoyer une liste vide', async () => {
    listMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(listObjects('preinscriptions', 'sessions')).rejects.toThrow(/boom/);
  });

  it('liste vide quand le préfixe ne contient rien', async () => {
    listMock.mockResolvedValueOnce({ data: [], error: null });
    expect(await listObjects('preinscriptions', 'sessions')).toEqual([]);
  });
});

describe('deleteFile (Supabase)', () => {
  it('supprime la clé demandée', async () => {
    removeMock.mockResolvedValue({ error: null });
    await deleteFile('preinscriptions', 'sessions/ses-1/draft-a/cni-1.pdf');
    expect(fromMock).toHaveBeenCalledWith('preinscriptions');
    expect(removeMock).toHaveBeenCalledWith(['sessions/ses-1/draft-a/cni-1.pdf']);
  });

  it('remonte l’erreur de suppression', async () => {
    removeMock.mockResolvedValue({ error: { message: 'refusé' } });
    await expect(deleteFile('preinscriptions', 'k')).rejects.toThrow(/refusé/);
  });
});
