/**
 * Anti-péremption de la proposition (spec §9.3, leçon E-1) — fonction pure.
 *
 * Une proposition est un document qui engage : elle porte un prix, des droits
 * et des dates. Si le diagnostic est corrigé, si un plafond de financement est
 * révisé ou si le commercial change une ligne après avoir édité le PDF, le
 * document déjà remis raconte autre chose que l'écran. L'empreinte le détecte
 * avant que le client ne le remarque en rendez-vous.
 *
 * Elle réutilise l'empreinte du diagnostic (réponses, fiches équipe, règles,
 * barème, version du référentiel) et lui ajoute ce qui appartient en propre à
 * la proposition : les lignes de prix, la remise, les programmes retenus et la
 * validité. Deux générations du même contenu donnent la même empreinte —
 * l'horodatage n'y entre pas.
 *
 * ── Pourquoi la MATIÈRE des modules en fait partie (lot 1 bis, 11/09/2026) ───
 *
 * Le trou était étroit et réel. `Proposal.contentJson` (les axes) et
 * `pricingJson` sont PERSISTÉS, et le chemin de lecture les respecte : il ne
 * recompose jamais depuis la bibliothèque. Mais le **TEXTE du déroulé** de chaque
 * module, lui, est relu EN DIRECT à chaque rendu (`buildWorkspace` charge
 * `modules: { select: { contentMd, needIdentification } }` et le passe en
 * `moduleContent`). L'empreinte ne le couvrait pas : elle voyait l'axe
 * (`id | productId | title | halfDays`), pas la matière affichée sous l'axe.
 *
 * Un import pouvait donc changer ce que l'écran affiche — et ce qu'un PDF
 * réimprimé dirait — sans lever le bandeau « Régénérer ». Ce n'est pas une
 * hypothèse : le lot 1 a changé `contentMd` sur 52 modules le 11/09/2026.
 *
 * ⛔ **Ligne rouge : l'empreinte PRÉVIENT, elle ne régénère JAMAIS rien.** Son
 * seul effet est de faire passer `isStale` à vrai pour que le bandeau existant se
 * lève, et que l'humain décide. Aucun chemin de régénération ne la consulte.
 */

import { createHash } from 'node:crypto';

import {
  computeSourceFingerprint,
  type FingerprintInput,
} from '@/lib/diagnostic-r1/fingerprint';
import type { ProposalContent, ProposalPricing } from '@qualiof/shared';

export { compareSourceFingerprint, type FingerprintComparison } from '@/lib/diagnostic-r1/fingerprint';

/** La matière vivante d'un module, telle que l'écran la relit au catalogue. */
export interface ModuleMaterial {
  title: string;
  durationMin: number;
  contentMd: string | null;
}

export interface ProposalFingerprintInput {
  /** L'état du diagnostic source, tel qu'il alimente déjà le rapport d'audit. */
  diagnostic: FingerprintInput;
  pricing: ProposalPricing;
  content: ProposalContent;
  validUntil: Date | null;
  /**
   * Ce que l'écran affiche VRAIMENT : la matière vivante des modules, par
   * `moduleId`.
   *
   * Champ **REQUIS**, et c'est délibéré : un champ optionnel serait un garde-fou
   * qui ne garde pas — le premier appel qui l'oublierait retomberait en silence
   * dans le défaut qu'on vient de corriger. Ici, c'est `tsc` qui force les trois
   * appels à fournir la matière.
   */
  moduleMaterial: ReadonlyMap<string, ModuleMaterial>;
}

/**
 * La fabrique de `moduleMaterial` depuis la bibliothèque de composition.
 *
 * Elle existe pour que les trois appels de `computeProposalFingerprint` ne
 * dupliquent pas ce mapping : une duplication dans un coin non vérifié est
 * exactement ce qui a fait décrocher deux sondes sur `contentMd` (cf.
 * `proposition-library.ts`).
 */
export function moduleMaterialOf(
  library: readonly {
    moduleId: string;
    title: string;
    durationMin: number;
    contentMd: string | null;
  }[],
): ReadonlyMap<string, ModuleMaterial> {
  return new Map(
    library.map((m) => [
      m.moduleId,
      { title: m.title, durationMin: m.durationMin, contentMd: m.contentMd },
    ]),
  );
}

export function computeProposalFingerprint(input: ProposalFingerprintInput): string {
  const diagnosticPart = computeSourceFingerprint(input.diagnostic);

  const lines = input.pricing.payers
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((p) => [
      `payeur:${p.id}|${p.kind}|${p.name}|${p.participantCount}`,
      ...p.lines
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((l) => `ligne:${p.id}:${l.id}|${l.description}|${l.halfDays}|${l.unitPriceHt}`),
      ...p.coverages
        .slice()
        .sort((a, b) => a.funder.localeCompare(b.funder))
        .map((c) => `pec:${p.id}|${c.funder}|${c.amount}`),
    ]);

  const discount = input.pricing.discount
    ? `remise:${input.pricing.discount.amount}|${input.pricing.discount.kind}|${input.pricing.discount.reason}`
    : 'remise:aucune';

  // Les programmes retenus font partie de ce qui est promis : changer un axe
  // change le document, même à prix constant.
  const axes = input.content.axes.map(
    (a) => `axe:${a.id}|${a.productId ?? ''}|${a.title}|${a.halfDays}`,
  );

  // La MATIÈRE des modules, axe par axe.
  //
  // On prend les titre et durée LIVE (depuis `moduleMaterial`), pas ceux recopiés
  // dans l'axe : les valeurs persistées ne bougent jamais seules, ce sont les
  // valeurs live qui dérivent. Comparer les persistées à elles-mêmes ne
  // détecterait rien.
  //
  // La clé porte l'identifiant de l'AXE : l'empreinte est donc insensible à une
  // permutation de modules DANS un axe (les chaînes sont triées avant d'être
  // jointes, comme les lignes de prix) mais sensible à un DÉPLACEMENT d'un axe à
  // l'autre — qui est un autre document.
  //
  // Le `contentMd` est HACHÉ, pas recopié : l'empreinte reste courte quoi qu'il
  // arrive, et un déroulé de 855 lignes ne fait pas enfler le payload.
  const material = input.content.axes
    .flatMap((a) =>
      a.modules.map((m) => {
        const live = input.moduleMaterial.get(m.moduleId);
        if (!live) return `module:${a.id}:${m.moduleId}|absent`;
        const contenu = createHash('sha256')
          .update(live.contentMd ?? '')
          .digest('hex');
        return `module:${a.id}:${m.moduleId}|${live.title}|${live.durationMin}|${contenu}`;
      }),
    )
    .sort();

  const payload = [
    `diagnostic:${diagnosticPart}`,
    `modalite:${input.pricing.modality}|${input.pricing.fundingType}`,
    `validite:${input.validUntil ? input.validUntil.toISOString().slice(0, 10) : 'aucune'}`,
    discount,
    ...lines,
    ...axes,
    ...material,
  ].join('\n');

  return createHash('sha256').update(payload).digest('hex');
}
