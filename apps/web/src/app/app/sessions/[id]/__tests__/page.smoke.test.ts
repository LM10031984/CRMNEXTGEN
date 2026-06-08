import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Smoke test page fiche session — filet de sécurité refactor ui-e.
 *
 * Origine : BUG-01 (audit 2026-05-12, "FileText is not defined"). Évolué
 * Phase 9.1 (matrice + bug P0). Réécrit ui-e1 (2026-06-06) pour refléter
 * la nouvelle structure post-(d) : SessionOnlyDocsBlock supprimé,
 * DocDockDrawer + DocsButton dans le SessionHeaderBar, matrice repliable
 * dans `<details id="section-doc-matrix">` (cible du lien "Vue tableau"
 * du drawer footer).
 *
 * Ce test doit attraper : un composant clé retiré sans intention, un
 * symbole lucide-react utilisé sans import, l'oubli d'une query Prisma
 * critique.
 */

/** Strippe les commentaires JSDoc + // pour éviter les faux positifs sur
 *  des termes documentés dans des commentaires (ex: "<details> 'Paramètres
 *  avancés' supprimé"). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const pageSrc = stripComments(
  readFileSync(path.join(__dirname, '..', 'page.tsx'), 'utf8'),
);

describe('sessions/[id] page — smoke (BUG-01 + ui-e1)', () => {
  it('imports FileText from lucide-react', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(importMatch, 'page.tsx must import from lucide-react').toBeTruthy();
    const importedNames = new Set(
      (importMatch![1] ?? '').split(',').map((s) => s.trim()),
    );
    expect(importedNames.has('FileText')).toBe(true);
  });

  // ─── Architecture refonte (e) — composants pivots ──────────────────────

  it('header zone : <SessionHeaderBar> + <NextActionHero> (refonte (b))', () => {
    expect(pageSrc).toMatch(/<SessionHeaderBar/);
    expect(pageSrc).toMatch(/<NextActionHero/);
  });

  it('hub documents : <DocsButton> dans la barre actions (refonte (d))', () => {
    // DocsButton ouvre <DocDockDrawer>. Sans ce composant en haut, plus
    // aucun accès au drawer depuis la fiche.
    expect(pageSrc).toMatch(/<DocsButton/);
  });

  it('hub paramètres : <SettingsButton> dans la barre actions (ui-e3)', () => {
    // SettingsButton ouvre <SettingsDrawer> qui contient les 6 sections
    // (Tâches, Formateurs, Lieu, Logistique, Notes, Satisfaction).
    expect(pageSrc).toMatch(/<SettingsButton/);
    // Et les sections sont passées en children via <SettingsDrawerSection>.
    expect(pageSrc).toMatch(/<SettingsDrawerSection/);
  });

  it('timeline 5 étapes : <SessionWorkflowTimeline> + step blocks', () => {
    expect(pageSrc).toMatch(/<SessionWorkflowTimeline/);
    expect(pageSrc).toMatch(/<PreparationPedagogiqueBlock/);
    expect(pageSrc).toMatch(/<ClosureFormationBlock/);
    expect(pageSrc).toMatch(/<StepCreation/);
    expect(pageSrc).toMatch(/<StepPendantFormation/);
    expect(pageSrc).toMatch(/<StepFacturation/);
  });

  it('matrice repliable : <ParticipantDocMatrix> sous anchor #section-doc-matrix', () => {
    // Anchor obligatoire : c'est la cible du lien "Vue tableau" du
    // <DocDockDrawer> footer. Si l'anchor disparaît, le lien casse.
    expect(pageSrc).toMatch(/id=["']section-doc-matrix["']/);
    expect(pageSrc).toMatch(/<ParticipantDocMatrix/);
  });

  it('cards apprenant : <ParticipantDocsCards> sous anchor #section-participants', () => {
    // Anchor obligatoire : cible de la sessionStage CTA "Ajouter un
    // apprenant" quand participantsCount === 0.
    expect(pageSrc).toMatch(/id=["']section-participants["']/);
    expect(pageSrc).toMatch(/<ParticipantDocsCards/);
  });

  it('plus de DocDock floating (supprimé en (d))', () => {
    // Anti-régression : si quelqu'un remonte <DocDock> sans <DocsButton>,
    // on a deux hubs concurrents. Le drawer est la seule porte d'entrée.
    expect(pageSrc).not.toMatch(/<DocDock\s/);
    expect(pageSrc).not.toMatch(/<DocDock>/);
  });

  it('plus de SessionOnlyDocsBlock (supprimé en (d), remplacé par timeline)', () => {
    expect(pageSrc).not.toMatch(/<SessionOnlyDocsBlock/);
  });

  it('plus de <details> "Paramètres avancés" (migré en SettingsDrawer ui-e3)', () => {
    // Anti-régression : si quelqu'un ré-ajoute ce <details>, on a deux
    // hubs paramètres concurrents (drawer + accordeon). Le drawer est la
    // seule porte d'entrée maintenant.
    expect(pageSrc).not.toMatch(/Paramètres avancés/);
  });

  // ─── Paramètres session (zone qui sera migrée vers SettingsDrawer en ui-e3) ──
  // Assertions posées AVANT la transformation pour préserver le filet.
  // Discipline Laurent ui-e3 : "le smoke doit rester vert avant la première
  // suppression, pas après". Ces 5 composants doivent rester MONTÉS — qu'ils
  // soient sous <details> ou dans <SettingsDrawer>, peu importe pour le filet.

  it('monte <SessionTrainerPicker> (gestion formateurs)', () => {
    expect(pageSrc).toMatch(/<SessionTrainerPicker/);
  });

  it('monte <SessionLocationPicker> (gestion lieu)', () => {
    expect(pageSrc).toMatch(/<SessionLocationPicker/);
  });

  it('monte <SessionLogisticsEditor> (PSH + hébergement)', () => {
    expect(pageSrc).toMatch(/<SessionLogisticsEditor/);
  });

  it('monte <SessionSatisfactionPanel> (post-formation)', () => {
    expect(pageSrc).toMatch(/<SessionSatisfactionPanel/);
  });

  it('monte <SessionTasksPanel> (tâches signalées sur la session)', () => {
    expect(pageSrc).toMatch(/<SessionTasksPanel/);
  });

  it('monte <SessionNotesInline> (notes internes éditables — ui-e2)', () => {
    expect(pageSrc).toMatch(/<SessionNotesInline/);
  });

  it('anchors préservés #section-formateurs + #section-lieu + #section-logistique', () => {
    // Ces anchors sont des cibles potentielles de liens hash (CTAs sessionStage,
    // erreurs SessionCompleteness). Ils doivent survivre à toute migration UI —
    // que ce soit un `id="..."` direct OU `anchorId="..."` propagé au runtime
    // par <SettingsDrawerSection>.
    for (const anchor of ['section-formateurs', 'section-lieu', 'section-logistique']) {
      const idMatch = new RegExp(`id=["']${anchor}["']`).test(pageSrc);
      const anchorIdMatch = new RegExp(`anchorId=["']${anchor}["']`).test(pageSrc);
      expect(
        idMatch || anchorIdMatch,
        `anchor #${anchor} doit exister via id="${anchor}" ou anchorId="${anchor}"`,
      ).toBe(true);
    }
  });

  // ─── Bug P0 anti-régression — Phase 9.1 ────────────────────────────────

  it("loads Document entityType='product' (Bug P0 — 1 PDF / N statuts)", () => {
    expect(pageSrc).toMatch(/entityType:\s*['"]product['"]/);
  });

  it('detects hasAgeficeParticipant for conditional AGEFICE column', () => {
    expect(pageSrc).toMatch(/hasAgeficeParticipant/);
  });

  it('loads pedagogical assets via prisma.pedagogicalAsset.findMany', () => {
    expect(pageSrc).toMatch(/pedagogicalAsset\.findMany/);
  });

  // ─── Étape courante : sessionStage() source unique (commit (a)) ────────

  it('uses sessionStage() helper as single source of truth', () => {
    expect(pageSrc).toMatch(/sessionStage\(/);
    // Le CTA primaire doit dériver de stage.cta.kind, pas d'un switch
    // sur status === 'COMPLETED'. Anti-régression (c) cta.kind fix.
    expect(pageSrc).toMatch(/stage\.cta\.kind/);
  });

  // ─── Hygiène imports lucide-react (BUG-01 d'origine) ────────────────────

  it('uses no lucide-react symbol that is not imported', () => {
    const importMatch = pageSrc.match(
      /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/,
    );
    const imported = new Set(
      (importMatch?.[1] ?? '').split(',').map((s) => s.trim()),
    );
    // Liste des candidats lucide-react potentiellement utilisés ici. Si
    // tu importes un nouveau symbole lucide qui n'est pas listé, ajoute-le
    // pour bénéficier de l'anti-régression.
    const lucideCandidates = new Set([
      'ArrowLeft',
      'Calendar',
      'Clock',
      'Euro',
      'Users',
      'Briefcase',
      'ClipboardCheck',
      'Check',
      'Minus',
      'Package',
      'ChevronRight',
      'FileText',
      'AlertCircle',
      'Plus',
      'ExternalLink',
    ]);
    const jsxOpeningTags = [
      ...pageSrc.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g),
    ].map((m) => m[1]!);
    const usedFromLucide = jsxOpeningTags.filter((t) => lucideCandidates.has(t));
    const missing = usedFromLucide.filter((t) => !imported.has(t));
    expect(
      missing,
      `lucide-react symbols used in JSX but not imported: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
