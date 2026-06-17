/**
 * Module partagé pour les 5 templates HTML du pack fin de formation.
 *
 * Reproduit l'identité visuelle de Qualiopi Gen (cf pdf-generator.ts) :
 *   - Bandeau bleu foncé plein `#00527A` (35mm) avec logo Start Academy BLANC centré
 *   - Encart info formation (table 2 colonnes, fond bleu clair `#F0F9FF`, rounded)
 *   - Sections titrées en bleu Word `#4472C4` (pour analyse besoin) ou bleu foncé
 *   - Footer corporate fixe bas de page (siège social + RNQ + contact)
 *
 * Le rendu PDF passe par Gotenberg (cohérent avec programme-template.ts).
 */

import path from 'node:path';
import fs from 'node:fs';
import { getOfConfig, type OfConfig } from '@/lib/of-config';

export const BRAND_BLUE = '#00B4E6';
export const BRAND_DARK = '#00527A';
export const BRAND_LIGHT_BG = '#F0F9FF';
export const SECTION_BLUE = '#4472C4'; // bleu Word — utilisé pour titres section (analyse besoin)
export const TEXT = '#1E293B';
export const MUTED = '#64748B';

/**
 * Cache module-scope pour les data-URLs des assets.
 *
 * Phase 7 (Plan 07-03) — la clé inclut désormais le préfixe `tenantId` (ou
 * `_default` si aucun) pour permettre de garder en cache simultanément les
 * variantes par tenant. `invalidateAssetCache(tenantId)` ci-dessous purge
 * toutes les entrées qui commencent par `${tenantId}::` (appelé par les
 * server actions upload/reset après écriture/suppression disque).
 */
const fileCache = new Map<string, string>();

/**
 * Charge un fichier image et retourne une data-URL.
 *
 * Phase 7 (Plan 07-03) — Stratégie de résolution :
 *  - **Priority 1** : si `tenantId` fourni, cherche dans
 *    `apps/web/public/of-assets/{tenantId}/{filename}` (assets uploadés via UI)
 *  - **Priority 2** : fallback `apps/web/src/assets/{filename}` (bundled assets)
 *
 * Retourne '' si aucun fichier trouvé (le template doit gracefully fallback).
 *
 * Cache key : `${tenantId ?? '_default'}::${filenames.join('|')}` — permet
 * d'avoir simultanément les variantes par tenant et fallback.
 */
function loadAssetDataUrl(filenames: string[], tenantId?: string): string {
  const cacheKey = `${tenantId ?? '_default'}::${filenames.join('|')}`;
  const cached = fileCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Priority 1 : tenant uploaded assets (public/of-assets/{tenantId}/)
  if (tenantId) {
    for (const name of filenames) {
      try {
        const p = path.join(process.cwd(), 'public', 'of-assets', tenantId, name);
        const buf = fs.readFileSync(p);
        const ext = path.extname(name).slice(1) || 'png';
        // SVG content-type quirk : doit être `image/svg+xml` (pas `image/svg`)
        const mime = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext;
        const url = `data:image/${mime};base64,${buf.toString('base64')}`;
        fileCache.set(cacheKey, url);
        return url;
      } catch {
        /* try next filename, then bundled fallback */
      }
    }
  }

  // Priority 2 : bundled assets (src/assets/)
  for (const name of filenames) {
    try {
      const p = path.join(process.cwd(), 'src', 'assets', name);
      const buf = fs.readFileSync(p);
      const ext = path.extname(name).slice(1) || 'png';
      const mime = ext === 'svg' ? 'svg+xml' : ext;
      const url = `data:image/${mime};base64,${buf.toString('base64')}`;
      fileCache.set(cacheKey, url);
      return url;
    } catch {
      /* try next */
    }
  }
  fileCache.set(cacheKey, '');
  return '';
}

/**
 * Phase 7 (Plan 07-03) — purge le cache `fileCache` pour un tenant donné.
 *
 * Appelé par les server actions `uploadTenantLogo`, `uploadTenantSignature`,
 * `resetTenantLogo`, `resetTenantSignature` après mutation du disque pour
 * que la prochaine lecture relise le nouveau fichier (ou détecte sa
 * disparition après reset).
 *
 * Supprime toutes les entrées de `fileCache` dont la clé commence par
 * `${tenantId}::` (toutes les variantes de filenames cachées pour ce tenant).
 */
export function invalidateAssetCache(tenantId: string): void {
  const prefix = `${tenantId}::`;
  for (const key of Array.from(fileCache.keys())) {
    if (key.startsWith(prefix)) fileCache.delete(key);
  }
}

/**
 * Logo couleur de l'OF (en-tête programme/convention, signature attestation).
 *
 * Phase 7 (Plan 07-03) — cherche d'abord dans `public/of-assets/{tenantId}/`
 * (variantes `logo.png|jpg|svg`), fallback bundled `logo-start-academy.png`.
 */
export function loadLogoColorDataUrl(tenantId?: string): string {
  return loadAssetDataUrl(
    ['logo.png', 'logo.jpg', 'logo.svg', 'logo-start-academy.png'],
    tenantId,
  );
}

/**
 * Logo blanc transparent pour bandeau bleu foncé (style Qualiopi Gen).
 *
 * Phase 7 (Plan 07-03) — cherche d'abord `logo-white.png` dans
 * `public/of-assets/{tenantId}/`, fallback bundled `logo-start-academy-white.png`.
 * (Si seul `logo.png` couleur a été uploadé, le bandeau bleu retombe sur
 * le logo blanc bundled — comportement acceptable.)
 */
export function loadLogoWhiteDataUrl(tenantId?: string): string {
  return loadAssetDataUrl(['logo-white.png', 'logo-start-academy-white.png'], tenantId);
}

/** Logo officiel Ministère du Travail (haut gauche docs Qualiopi). */
export function loadLogoMinistereDataUrl(): string {
  return loadAssetDataUrl(['logo-ministere-travail.png']);
}

/**
 * Cachet/tampon de l'OF (sans signature dessus — à superposer avec signature
 * séparée dans le HTML). Utilisé par l'attestation d'assiduité AGEFICE.
 *
 * Cherche d'abord `tampon.png` dans `public/of-assets/{tenantId}/`,
 * fallback bundled `tampon-start-academy.png`.
 */
export function loadStampDataUrl(tenantId?: string): string {
  return loadAssetDataUrl(['tampon.png', 'tampon-start-academy.png'], tenantId);
}

/** Logo officiel Qualiopi processus certifié (haut droite docs Qualiopi). */
export function loadLogoQualiopiDataUrl(): string {
  return loadAssetDataUrl(['logo-qualiopi.png']);
}

/**
 * Signature à apposer en bas de doc Qualiopi (certificat, attestation).
 *
 * Phase 7 (Plan 07-03) — `role` détermine la cible :
 *  - 'pedago' (défaut) : signature responsable pédagogique
 *    → cherche `signature-pedago.png` dans public/of-assets/{tenantId}/,
 *      fallback bundled `signature-laurent.png` puis `tampon-signature-fusion.png`
 *  - 'dirigeant' : signature dirigeant (pour conventions, attestations dirigeant)
 *    → cherche `signature-dirigeant.png` dans public/of-assets/{tenantId}/,
 *      fallback bundled `tampon-signature-fusion.png` puis `tampon-signature.png`
 */
export function loadSignatureDataUrl(
  tenantId?: string,
  role: 'pedago' | 'dirigeant' = 'pedago',
): string {
  const filename = role === 'pedago' ? 'signature-pedago.png' : 'signature-dirigeant.png';
  // Laurent 2026-06-04 : "sur le certificat il y a la signature de Julien il
  // faut la mienne". Le tampon-signature-fusion contenait Julien — on le
  // retire des fallbacks. signature-laurent.png devient la source unique
  // de vérité tant qu'un tenant n'a pas uploadé son signature-{role}.png.
  const fallbacks =
    role === 'pedago'
      ? [filename, 'signature-laurent.png']
      : [filename, 'signature-laurent.png'];
  return loadAssetDataUrl(fallbacks, tenantId);
}

/**
 * Signature à embarquer selon le FORMATEUR (Laurent 2026-06-16) :
 *  - Laurent Marx → signature pédago (signature-laurent.png).
 *  - Jean-Guy → `signature-jean-guy.png` (à déposer dans
 *    public/of-assets/{tenantId}/ OU bundlé dans src/assets/).
 * Retourne '' si formateur non reconnu (pas de signature auto → emplacement vide).
 */
export function loadTrainerSignatureDataUrl(tenantId?: string, trainerName?: string | null): string {
  const n = (trainerName ?? '').toLowerCase();
  if (n.includes('jean') && n.includes('guy')) {
    return loadAssetDataUrl(['signature-jean-guy.jpg', 'signature-jean-guy.png'], tenantId);
  }
  if (n.includes('laurent') && n.includes('marx')) {
    return loadSignatureDataUrl(tenantId, 'pedago');
  }
  return '';
}

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type Gender = 'F' | 'M' | null;

/**
 * Normalise la civility (très libre en base : "Madame", "Mme", "MME", "M.",
 * "Monsieur"…) vers `'F' | 'M' | null`. Source unique de vérité utilisée par
 * les 5 templates pour ne pas multiplier les variantes orthographiques.
 */
export function normalizeGender(civility: string | null | undefined): Gender {
  if (!civility) return null;
  const c = civility.trim().toUpperCase().replace(/\./g, '');
  if (['MME', 'MRS', 'MS', 'MADAME'].includes(c)) return 'F';
  if (['M', 'MR', 'MONSIEUR'].includes(c)) return 'M';
  return null;
}

/** "Madame" / "Monsieur" / null — utilisable comme préfixe nom complet. */
export function civilityLabel(civility: string | null | undefined): string | null {
  const g = normalizeGender(civility);
  if (g === 'F') return 'Madame';
  if (g === 'M') return 'Monsieur';
  return null;
}

/** "La stagiaire" / "Le stagiaire" / "Le/La stagiaire". */
export function stagiaireLabel(civility: string | null | undefined): string {
  const g = normalizeGender(civility);
  if (g === 'F') return 'La stagiaire';
  if (g === 'M') return 'Le stagiaire';
  return 'Le/La stagiaire';
}

/** "La soussignée" / "Le soussigné" / "Le/La soussigné(e)". */
export function soussigneLabel(civility: string | null | undefined): string {
  const g = normalizeGender(civility);
  if (g === 'F') return 'La soussignée';
  if (g === 'M') return 'Le soussigné';
  return 'Le/La soussigné(e)';
}

export function formatDateFr(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatHours(hours: number): string {
  if (hours <= 0) return '—';
  if (hours % 7 === 0) {
    const days = hours / 7;
    return `${hours} heures (${days} journée${days > 1 ? 's' : ''} de 7 heures)`;
  }
  return `${hours} heures`;
}

/** Données métier additionnelles consommées par les generators Ollama
 *  (cf ollama-generators.ts). Optionnel pour les templates statiques. */
export interface ClosureFormationMeta {
  programmeMd: string;
}
export interface ClosureStagiaireMeta {
  entreprise: string | null;
  fonction: string | null;
  anciennete: string | null;
  diplomes: string | null;
  professionalStatus: string | null;
}

export interface ClosureContext {
  // Apprenant
  apprenantPrenom: string;
  apprenantNom: string;
  apprenantCivility: string | null;
  // Session / produit
  sessionId: string; // pour partager le QCM entre stagiaires d'une même session
  sessionCode: string;
  sessionTitle: string;
  sessionStartDate: Date;
  sessionEndDate: Date;
  sessionLocation: string | null;
  sessionTrainers: string[];
  durationHours: number;
  // Métadonnées pour les generators IA (optionnelles — templates statiques les ignorent)
  formationMeta?: ClosureFormationMeta;
  stagiaireMeta?: ClosureStagiaireMeta;
  // Pour AIGenerationJob logging
  tenantId?: string;
  // Phase 7 — OF config pre-résolue (BDD fallback ENV). Si absent, les templates
  // utilisent `getOfConfig()` legacy (ENV-only). Le worker closure peuple ce champ
  // après `loadOfConfig(job.tenantId)` pour activer le BDD-first.
  of?: OfConfig;
}

/**
 * Bloc styles commun. Importé tel quel par les 5 templates.
 */
export const SHARED_STYLES = `
<style>
  /* CSS Paged Media (WeasyPrint) — footer répété nativement sur chaque page
   * via running element. Marges @page : 25mm haut (pages 2+), 0 page 1
   * (bandeau brand pleine largeur), 22mm bas réservés pour le footer running. */
  @page { size: A4; margin: 25mm 0 22mm 0; @bottom-center { content: element(corpfooter); } }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Calibri', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: ${TEXT};
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  /* Bandeau header (fond bleu foncé plein + logo BLANC centré) — style Qualiopi Gen */
  header.brand {
    background: ${BRAND_DARK};
    height: 35mm;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
  }
  header.brand img.logo { height: 25mm; width: auto; }
  header.brand .of-name {
    color: white;
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: 1px;
  }

  /* Wrapper contenu (marges latérales). Padding-bottom 8mm de respiration —
   * le footer est déjà géré par la marge @page (running element). */
  main.body { padding: 12mm 18mm 8mm 18mm; }

  /* Footer corporate — running element WeasyPrint (CSS Paged Media).
   * Devient le contenu de @bottom-center de chaque page automatiquement.
   * Taille 11pt RÉELLE (pas downscalée comme avec Gotenberg/Chromium). */
  footer.corp {
    position: running(corpfooter);
    padding: 4px 18mm 0 18mm;
    border-top: 1px solid #94A3B8;
    font-size: 11pt;
    line-height: 1.4;
    color: #1F2937;
    text-align: center;
  }
  footer.corp strong { color: ${BRAND_DARK}; }

  /* Bandeau "logos officiels" (Ministère du Travail à gauche, Qualiopi à droite)
   * — conforme au modèle DOCX C3_i11 du certificat de réalisation. */
  .official-badges {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6mm 18mm 0 18mm;
    margin-bottom: 4mm;
  }
  .official-badges .badge-left { height: 22mm; width: auto; }
  .official-badges .badge-right { height: 18mm; width: auto; }

  /* Titre du document (sous le bandeau) */
  h1.doc-title {
    color: ${BRAND_DARK};
    font-size: 18pt;
    font-weight: 700;
    margin: 0 0 6px 0;
    text-transform: none;
  }
  h1.doc-title.center { text-align: center; }
  .doc-subtitle { color: ${MUTED}; font-size: 10pt; margin: 0 0 8px 0; font-style: italic; }
  .doc-subtitle.center { text-align: center; }
  hr.doc-rule {
    border: none;
    border-top: 1.5px solid ${BRAND_DARK};
    margin: 0 0 12px 0;
  }

  /* Encart info formation (rounded, fond bleu clair, table 2x2 — style QG) */
  .info-box {
    background: ${BRAND_LIGHT_BG};
    border-radius: 4px;
    padding: 10px 14px;
    margin: 0 0 14px 0;
    font-size: 11pt;
  }
  .info-box table { width: 100%; border-collapse: collapse; }
  .info-box td { padding: 3px 8px 3px 0; vertical-align: baseline; }
  .info-box td.label { color: ${TEXT}; font-weight: 700; width: 28mm; }
  .info-box td.value { color: ${TEXT}; }

  /* Bloc stagiaire compact (titre "Stagiaire" + nom + entreprise/fonction muted) */
  .stagiaire-block {
    margin: 0 0 16px 0;
  }
  .stagiaire-block .title {
    font-size: 12pt;
    font-weight: 700;
    color: ${TEXT};
    margin-bottom: 4px;
  }
  .stagiaire-block .name { font-size: 10.5pt; color: ${TEXT}; }
  .stagiaire-block .meta { font-size: 10pt; color: ${MUTED}; margin-top: 2px; }

  /* Sections titrées (style QG : pas de bordure, titre simple) */
  h2.section {
    font-size: 12pt;
    color: ${SECTION_BLUE};
    margin: 14px 0 6px 0;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
  }
  h2.section.dark { color: ${BRAND_DARK}; }
  h2.section.upper { text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1.5px solid ${BRAND_BLUE}; padding-bottom: 3px; }

  ul.bullets { margin: 4px 0 12px 22px; padding: 0; page-break-inside: avoid; }
  ul.bullets li { margin-bottom: 4px; font-size: 10.5pt; }

  p.paragraph { margin: 4px 0 10px 0; font-size: 10.5pt; line-height: 1.55; orphans: 3; widows: 3; }

  /* Une section + son contenu immédiat ne se coupent pas en bas de page :
   * si elle ne tient pas, elle passe en page suivante (évite le titre seul
   * en bas qui colle au footer). */
  h2.section { page-break-after: avoid; }
  h2.section + p, h2.section + ul, h2.section + table { page-break-before: avoid; }

  /* Tables (grille observation, déroulé) */
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px 0;
    font-size: 9.5pt;
  }
  table.data thead th {
    background: ${BRAND_DARK};
    color: white;
    text-align: left;
    padding: 6px 8px;
    font-weight: 700;
    font-size: 9pt;
  }
  table.data tbody td {
    border: 1px solid #E2E8F0;
    padding: 6px 8px;
    vertical-align: top;
  }
  table.data tbody tr:nth-child(even) td { background: #F8FAFC; }

  .badge-niveau {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 3px;
    color: white;
    font-weight: 700;
    font-size: 9pt;
    min-width: 16px;
    text-align: center;
  }
  .badge-niveau.A { background: #16A34A; }
  .badge-niveau.B { background: #3B82F6; }
  .badge-niveau.C { background: #F59E0B; }
  .badge-niveau.D { background: #DC2626; }

  /* Signature & cachet */
  .signature-block {
    margin-top: 28px;
    display: flex;
    flex-wrap: wrap;
    gap: 40px;
    align-items: flex-start;
  }
  .signature-block .col {
    min-width: 220px;
  }
  .signature-block .label { font-weight: 600; color: ${BRAND_DARK}; font-size: 10pt; }
  .signature-block .role { font-size: 9pt; color: ${MUTED}; margin-top: 2px; }
  .signature-block img.tampon { height: 25mm; margin-top: 6px; }

  /* QCM specific (style Qualiopi Gen : numéro + énoncé sur même ligne, bleu cyan) */
  .qcm-question {
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .qcm-question .q-num {
    color: #0E7490;
    font-weight: 700;
    font-size: 10.5pt;
    display: inline;
  }
  .qcm-question .q-text {
    color: #0E7490;
    font-weight: 700;
    font-size: 10.5pt;
    margin: 0 0 6px 0;
    display: block;
  }
  .qcm-question ul.options { list-style: none; padding-left: 0; margin: 0; }
  .qcm-question ul.options li {
    margin: 3px 0;
    font-size: 10pt;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .qcm-question ul.options .checkbox {
    width: 11px;
    height: 11px;
    border: 1.2px solid #94A3B8;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .legend-box {
    background: ${BRAND_LIGHT_BG};
    border-radius: 4px;
    padding: 6px 10px;
    margin: 0 0 10px 0;
    font-size: 9pt;
    color: ${MUTED};
  }

  section.attestation-body {
    margin-top: 14px;
    text-align: left;
    font-size: 11pt;
    line-height: 1.7;
  }
  section.attestation-body strong { color: ${BRAND_DARK}; }
  section.attestation-body p { margin: 8px 0; }
</style>
`;

/**
 * Bandeau brand en haut de chaque doc — fond bleu foncé plein avec logo BLANC
 * centré (style Qualiopi Gen). Hauteur 35mm pour reproduire le rendu jsPDF
 * d'origine.
 */
export function renderBrandHeader(of?: OfConfig, tenantId?: string): string {
  // Phase 7 — `of` optionnel : si passé par l'appelant (loadOfConfig(tenantId)),
  // utilise BDD-first. Sinon fallback `getOfConfig()` sync legacy (ENV-only).
  // `tenantId` (Plan 07-03) permet de lire d'abord le logo blanc uploadé dans
  // public/of-assets/{tenantId}/, fallback bundled.
  const cfg = of ?? getOfConfig();
  const dataUrl = loadLogoWhiteDataUrl(tenantId);
  const inner = dataUrl
    ? `<img class="logo" src="${dataUrl}" alt="${escapeHtml(cfg.name)}" />`
    : `<div class="of-name">${escapeHtml(cfg.name).toUpperCase()}</div>`;
  return `<header class="brand">${inner}</header>`;
}

/**
 * Bandeau "officiel" pour les documents Qualiopi : logo Ministère du Travail
 * en haut à gauche, logo Qualiopi processus certifié en haut à droite.
 * Conforme au modèle DOCX C3_i11 fourni par Laurent (cert. de réalisation).
 * Apparaît sur la PAGE 1 uniquement (en flow normal après le bandeau brand).
 */
export function renderOfficialBadges(opts: { qualiopi?: boolean } = {}): string {
  // qualiopi=false : retire le logo « Qualiopi processus certifié » (Kaïna 2026-06-16,
  // pour le certificat de réalisation). Le logo Ministère est conservé.
  const showQualiopi = opts.qualiopi !== false;
  const ministere = loadLogoMinistereDataUrl();
  const qualiopi = showQualiopi ? loadLogoQualiopiDataUrl() : null;
  return `
<div class="official-badges">
  ${ministere ? `<img class="badge-left" src="${ministere}" alt="Ministère du Travail" />` : '<span></span>'}
  ${qualiopi ? `<img class="badge-right" src="${qualiopi}" alt="Qualiopi processus certifié" />` : '<span></span>'}
</div>
`.trim();
}

/**
 * Encart "info formation" affiché sous le titre — style Qualiopi Gen :
 * encart bleu clair rounded, table 2 lignes (Formation/Date(s) puis Lieu/Durée).
 */
export function renderInfoBox(ctx: ClosureContext): string {
  // Qualiopi Gen affiche toujours la date de fin (ou de début si pas de fin)
  const sameDay = ctx.sessionStartDate.toDateString() === ctx.sessionEndDate.toDateString();
  const dateStr = sameDay
    ? formatDateFr(ctx.sessionStartDate)
    : `Du ${formatDateFr(ctx.sessionStartDate)} au ${formatDateFr(ctx.sessionEndDate)}`;
  return `
<div class="info-box">
  <table>
    <tbody>
      <tr>
        <td class="label">Formation :</td>
        <td class="value" colspan="3">${escapeHtml(ctx.sessionTitle)}</td>
      </tr>
      <tr>
        <td class="label">Date(s) :</td>
        <td class="value">${escapeHtml(dateStr)}</td>
        <td class="label" style="width:18mm;">Durée :</td>
        <td class="value">${escapeHtml(formatHours(ctx.durationHours))}</td>
      </tr>
      <tr>
        <td class="label">Lieu :</td>
        <td class="value" colspan="3">${escapeHtml(ctx.sessionLocation ?? 'À confirmer')}</td>
      </tr>
    </tbody>
  </table>
</div>
`.trim();
}

/**
 * Bloc "Stagiaire" — style Qualiopi Gen : titre "Stagiaire" puis nom + entreprise/fonction.
 */
export function renderStagiaireBlock(ctx: ClosureContext): string {
  const fullName = `${ctx.apprenantPrenom} ${ctx.apprenantNom}`.trim();
  const meta = ctx.stagiaireMeta;
  const metaLine =
    meta?.entreprise || meta?.fonction
      ? `<div class="meta">${escapeHtml(meta?.entreprise ?? '')}${meta?.entreprise && meta?.fonction ? ' — ' : ''}${escapeHtml(meta?.fonction ?? '')}</div>`
      : '';
  return `
<div class="stagiaire-block">
  <div class="title">Stagiaire</div>
  <div class="name">${escapeHtml(fullName)}</div>
  ${metaLine}
</div>
`.trim();
}

/**
 * Footer corporate inclus directement dans le body HTML — `position: fixed`
 * bottom: 0 pour rester collé au bas de la zone imprimable. Taille 11pt
 * RÉELLE (pas downscalée comme dans le footer.html Gotenberg qui était
 * illisible). Sur les docs multi-pages, Chromium n'affiche pas position
 * fixed sur les pages 2+ — limitation acceptée.
 */
export function renderCorpFooter(of?: OfConfig): string {
  // Phase 7 — `of` optionnel (cf. renderBrandHeader)
  const cfg = of ?? getOfConfig();
  const contactNom = `${cfg.contact.prenom} ${cfg.contact.nom}`.trim();
  return `
<footer class="corp">
  <strong>${escapeHtml(cfg.name)}</strong> – Siège social : ${escapeHtml(cfg.addressFull)} - SIRET : ${escapeHtml(cfg.siret)} – NDA ${escapeHtml(cfg.rnq)}<br>
  Coordonnées de contact : ${escapeHtml(contactNom)} - ${escapeHtml(cfg.contact.email)} - ${escapeHtml(cfg.contact.phone)}
</footer>
`.trim();
}

/**
 * Wrapper : produit un document HTML complet à partir d'un body interne.
 *
 * IMPORTANT WeasyPrint : le footer en `position: running(corpfooter)` DOIT
 * être placé en TÊTE du body, sinon il n'est pas disponible pour le
 * `@bottom-center` de la page 1 (WeasyPrint le découvre seulement quand
 * la pagination atteint son emplacement dans le flux).
 */
export function wrapHtml(opts: {
  title: string;
  bodyHtml: string;
  of?: OfConfig;
  /** Force l'orientation paysage (déroulé 6 colonnes). Override le @page A4 portrait. */
  landscape?: boolean;
}): string {
  const orientation = opts.landscape ? '\n  <style>@page { size: A4 landscape; }</style>' : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(opts.title)}</title>
  ${SHARED_STYLES}${orientation}
</head>
<body>
${renderCorpFooter(opts.of)}
${opts.bodyHtml}
</body>
</html>`;
}
