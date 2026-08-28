/**
 * Template HTML de la Convention de formation professionnelle.
 *
 * Structure alignée sur les 3 exemples DOCX fournis par Laurent (Convention
 * IA conseillers immobiliers, Convention recommandation, Convention
 * Optimiser l'immobilier). Articles 1-10 + signatures.
 *
 * Logique : 1 convention par "bénéficiaire" (= entreprise qui paye) :
 * - Si l'apprenant est auto-entrepreneur : son auto-entreprise est le
 *   benéficiaire. Représenté par lui-même. 1 convention = 1 stagiaire.
 * - Si l'apprenant est salarié : la structure employeur est le bénéficiaire.
 *   Représenté par le dirigeant. 1 convention peut grouper plusieurs
 *   stagiaires de la même structure sur la même session.
 */

import { marked } from 'marked';
import type { OfConfig } from './of-config';
import { loadLogoColorDataUrl, loadSignatureDataUrl } from './closure/shared-template';
import {
  OF_PAGED_FOOTER_STYLES,
  OF_PAGED_PAGE_RULE,
  renderOfPagedFooter,
} from './of-paged-footer';

export interface ConventionStagiaire {
  prenom: string;
  nom: string;
  email: string | null;
}

export interface ConventionData {
  // Bénéficiaire (entreprise qui signe & paye)
  beneficiaireRaisonSociale: string;
  beneficiaireSiret: string | null;
  /**
   * Numéro d'immatriculation au RCS = **SIREN** (9 chiffres), et non le SIRET
   * (14 chiffres, qui identifie l'établissement).
   *
   * Quick 260821-md8 : la convention EXPERTA destinée au portail OPCO EP
   * affichait le SIRET sur la ligne « … sous le numéro … ». Un numéro RCS faux
   * sur une pièce contractuelle envoyée à un financeur n'est pas cosmétique.
   * Absent ⇒ la ligne RCS entière disparaît (pas de « sous le numéro »
   * orphelin).
   */
  beneficiaireSiren?: string | null;
  beneficiaireRcsVille: string | null; // "Grasse", "Nice", etc.
  beneficiaireRepresentantNom: string;

  // Stagiaires concernés (1 si AE, N si entreprise avec salariés)
  stagiaires: ConventionStagiaire[];

  // Session
  sessionStartDate: Date;
  sessionEndDate: Date;
  // Date de signature = J-15 jours ouvrés avant le début de session,
  // calculée côté fournisseur (server action / script témoin) via
  // subtractBusinessDaysISO — NE PAS hardcoder. Garantit l'antériorité
  // (ind.9), le délai de rétractation 14j (Art.6) et le « solde la veille »
  // (Art.7). Cf. audit témoin SES-0087 (2026-06-18, COR-1).
  conventionDate: Date;
  sessionLieu: string;

  // Produit
  produitTitre: string;
  produitDureeHeures: number;
  produitObjectifs: string[];
  produitProgrammeMd: string;
  produitTrainerProfile: string | null;
  produitPriceHTPerStagiaire: number;
  /**
   * Prix GLOBAL HT négocié avec l'entreprise (quick 260817-mm0, correction
   * Laurent 18/08 : « pour les salariés il y a un prix total pour l'entreprise,
   * ce n'est pas par salarié »).
   *
   * Quand ce champ est fourni, il FAIT FOI : le document affiche ce montant tel
   * quel et ne décompose plus en « X € × N stagiaires ». Absent ⇒ comportement
   * historique (tarif unitaire × effectif), conservé pour l'auto-payeur.
   *
   * Aligné sur la facture groupée, qui somme déjà les `priceHT` des
   * participants (`createInvoiceForSponsorGroup`).
   */
  prixGlobalHT?: number | null;

  // Phase 7 (Plan 07-03) — tenantId optionnel pour résoudre le logo uploadé
  // dans `public/of-assets/{tenantId}/`. Si absent, fallback bundled
  // `src/assets/logo-start-academy.png`.
  tenantId?: string;
}

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Nettoie le markdown du programme avant rendu (COR-4, audit témoin SES-0087) :
 * calqué sur `normalizeMd` de programme-template.ts. Supprime les puces
 * orphelines (« • », « ● », « · », « ‣ », « * », « - » seules sur une ligne)
 * pour éviter les « • » vides dans le HTML rendu, et recolle les titres
 * markdown collés à leur dièse (« ##Titre » → « ## Titre »).
 */
function cleanProgrammeBullets(md: string): string {
  return md
    .replace(/(^|\n)(#{1,6})([^\s#])/g, '$1$2 $3') // titre collé au dièse
    .replace(/^\s*[●•·‣]+\s*$/gm, '') // ligne ne contenant qu'une puce unicode
    .replace(/^\s*\*+\s*$/gm, '') // ligne ne contenant que des astérisques
    .replace(/(^|\n)[*-]\s*$/g, '$1'); // tiret/astérisque de fin de ligne vide
}

// Phase 7 (Plan 07-03) — Le cache local logo a été supprimé au profit du
// cache central dans `closure/shared-template.ts` (loadLogoColorDataUrl).
// Cela permet à un upload de logo via Paramètres de prendre effet
// immédiatement sur les conventions via `invalidateAssetCache(tenantId)`.

const BRAND_BLUE = '#00B4E6';
const BRAND_DARK = '#00527A';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Déduit le SIREN (9 chiffres) — le numéro d'immatriculation au RCS.
 *
 * Le champ explicite `Organization.siren` gagne toujours ; à défaut on prend
 * les 9 premiers chiffres du SIRET, ce qui EST la définition du SIREN (SIRET =
 * SIREN + NIC sur 5 chiffres). Les espaces de saisie sont ignorés.
 *
 * Rend `null` plutôt qu'un numéro tronqué : mieux vaut pas de ligne RCS du tout
 * qu'une ligne RCS fausse sur une pièce contractuelle.
 */
export function deriveSiren(
  siren: string | null | undefined,
  siret: string | null | undefined,
): string | null {
  const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
  const fromSiren = digits(siren);
  if (fromSiren.length === 9) return fromSiren;
  const fromSiret = digits(siret);
  if (fromSiret.length >= 9) return fromSiret.slice(0, 9);
  return null;
}

function formatDuree(heures: number): string {
  if (heures <= 0) return '—';
  if (heures % 7 === 0) {
    const j = heures / 7;
    return `${heures} heures (${j} journée${j > 1 ? 's' : ''} de 7 heures)`;
  }
  if (heures % 8 === 0) {
    const j = heures / 8;
    return `${heures} heures (${j} journée${j > 1 ? 's' : ''} de 8 heures)`;
  }
  return `${heures} heures`;
}

const STYLES = `
<style>
  ${OF_PAGED_PAGE_RULE}
  ${OF_PAGED_FOOTER_STYLES}
  * { box-sizing: border-box; }
  body {
    font-family: 'Calibri', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #1F2937;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }
  header.cover { text-align: center; margin-bottom: 14px; }
  header.cover img.logo { height: 60px; }
  h1.title {
    font-size: 18pt;
    color: ${BRAND_DARK};
    text-align: center;
    margin: 8px 0 4px 0;
    font-weight: 700;
  }
  .subtitle {
    text-align: center;
    color: #475569;
    font-size: 10pt;
    margin-bottom: 22px;
    font-style: italic;
  }
  h2.article {
    font-size: 12pt;
    color: ${BRAND_DARK};
    margin: 18px 0 6px 0;
    font-weight: 700;
    border-bottom: 1.5px solid ${BRAND_BLUE};
    padding-bottom: 3px;
  }
  p { margin: 4px 0 8px 0; }
  ul { margin: 4px 0 10px 22px; padding: 0; list-style-type: disc; }
  li { margin-bottom: 3px; }
  .parties { margin: 14px 0 18px 0; }
  .parties .partie {
    margin-bottom: 12px;
    padding: 10px 14px;
    background: #F8FAFC;
    border-left: 3px solid ${BRAND_BLUE};
  }
  .parties .partie strong { color: ${BRAND_DARK}; }
  .signatures {
    margin-top: 30px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
  }
  .signatures .box {
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    padding: 14px;
    min-height: 130px;
  }
  .signatures .box .label {
    font-size: 9.5pt;
    color: #64748B;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .signatures .box .name { font-weight: 600; color: ${BRAND_DARK}; }
  .closing { margin-top: 24px; font-style: italic; }
  .programme-md { background: #FAFAFA; padding: 10px 14px; border-radius: 4px; }
  .programme-md p { margin: 4px 0; }
  .programme-md h2 { font-size: 11pt; color: ${BRAND_DARK}; margin: 10px 0 4px 0; border: none; padding: 0; }
  .programme-md h3 { font-size: 10.5pt; color: #334155; margin: 8px 0 3px 0; }
  .programme-md strong { color: ${BRAND_DARK}; }
  .tarif {
    margin-top: 8px;
    padding: 10px 14px;
    border-left: 3px solid ${BRAND_BLUE};
    background: #F0F9FF;
  }
  .tarif strong { color: ${BRAND_DARK}; font-size: 13pt; }
  section { page-break-inside: avoid; }
  .programme-md, section.programme-section { page-break-inside: auto; }
  h2.article { page-break-after: avoid; }
</style>`;

export function renderConventionHtml(data: ConventionData, of: OfConfig): string {
  // Phase 7 (Plan 07-03) — cherche d'abord dans `public/of-assets/{tenantId}/`
  // pour respecter l'upload UI Paramètres, fallback bundled `src/assets/`.
  const logoDataUrl = loadLogoColorDataUrl(data.tenantId);
  const respFullName = `${of.resp.prenom} ${of.resp.nom}`.trim();
  const programmeHtml = data.produitProgrammeMd
    ? (marked.parse(cleanProgrammeBullets(data.produitProgrammeMd), { async: false }) as string)
    : '<p><em>Programme à compléter dans la fiche produit (champ Programme détaillé).</em></p>';
  const objectifs = data.produitObjectifs.length > 0
    ? data.produitObjectifs
    : ['Objectifs à compléter dans la fiche produit.'];
  const nbStagiaires = data.stagiaires.length;
  const stagiaireListe = data.stagiaires
    .map((s) => `${escapeHtml(`${s.prenom} ${s.nom.toUpperCase()}`)}${s.email ? ` (${escapeHtml(s.email)})` : ''}`)
    .join('<br>');
  // Prix global entreprise s'il est fourni (forfait négocié), sinon tarif
  // unitaire × effectif (cas auto-payeur / historique).
  const hasPrixGlobal = data.prixGlobalHT != null && data.prixGlobalHT > 0;
  const totalHT = hasPrixGlobal
    ? (data.prixGlobalHT as number)
    : data.produitPriceHTPerStagiaire * nbStagiaires;
  // La décomposition « X € × N » n'a de sens que sur un tarif unitaire.
  const showUnitBreakdown = !hasPrixGlobal && nbStagiaires > 1;
  // Ligne RCS = SIREN. Le fournisseur passe normalement `beneficiaireSiren`
  // déjà dérivé ; on redérive ici par sécurité pour les appelants historiques
  // (scripts `_gen-*`) qui ne renseignent que le SIRET.
  const beneficiaireSiren = deriveSiren(data.beneficiaireSiren, data.beneficiaireSiret);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Convention — ${escapeHtml(data.produitTitre)}</title>
${STYLES}
</head>
<body>
${renderOfPagedFooter()}

<header class="cover">
  ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="${escapeHtml(of.name)}" />` : `<strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>`}
</header>

<h1 class="title">CONVENTION DE FORMATION PROFESSIONNELLE</h1>
<p class="subtitle">(Articles L.6353-1 et D.6353-1 du Code du travail)</p>

<p>Entre les soussignés :</p>

<div class="parties">
  <div class="partie">
    <strong>1) L'organisme de formation</strong><br>
    <strong>${escapeHtml(of.name)}</strong>, adresse siège social : ${escapeHtml(of.addressFull)}<br>
    N° SIRET : ${escapeHtml(of.siret)} — enregistré auprès de la Direction Régionale de l'Économie, de l'Emploi du Travail et des Solidarités sous le numéro ${escapeHtml(of.rnq)}.
  </div>
  <div class="partie">
    <strong>2) ${escapeHtml(data.beneficiaireRaisonSociale)}</strong><br>
    ${beneficiaireSiren ? `Immatriculée au Registre du Commerce et des Sociétés${data.beneficiaireRcsVille ? ' de ' + escapeHtml(data.beneficiaireRcsVille) : ''} sous le numéro ${escapeHtml(beneficiaireSiren)}<br>` : ''}
    ${data.beneficiaireSiret ? `N° SIRET : ${escapeHtml(data.beneficiaireSiret)}<br>` : ''}
    Représentée par <strong>${escapeHtml(data.beneficiaireRepresentantNom)}</strong>, ci-après désignée « l'entreprise bénéficiaire ».
  </div>
</div>

<p>Est conclue la convention suivante, en application des dispositions du Livre III de la sixième partie du Code du travail portant organisation de la formation professionnelle.</p>

<section>
  <h2 class="article">Article 1 — Objet</h2>
  <p>En exécution du présent contrat, l'organisme de formation s'engage à organiser l'action de formation : <strong>« ${escapeHtml(data.produitTitre)} »</strong>.</p>
  <p><em>Catégorie d'action de formation (article L.6313-1 du Code du travail)</em> : Actions de formation de développement des compétences.</p>
</section>

<section>
  <h2 class="article">Article 2 — Nature et caractéristiques de l'action</h2>
  <p>L'action de formation entre dans le champ d'application des dispositions relatives à la formation professionnelle tel qu'il est défini aux articles L.6353-1 et suivants du Code du travail. Elle a pour objectifs de :</p>
  <ul>${objectifs.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>
  <p>À l'issue de la formation, un certificat de réalisation sera délivré au stagiaire.</p>
  <p>Sa durée est fixée à <strong>${formatDuree(data.produitDureeHeures)}</strong>.</p>
</section>

<section class="programme-section">
  <h2 class="article">Article 3 — Programme de formation</h2>
  <div class="programme-md">${programmeHtml}</div>
</section>

<section>
  <h2 class="article">Article 4 — Organisation de l'action de formation</h2>
  <p>L'action de formation aura lieu du <strong>${fmtDate(data.sessionStartDate)} à 9h</strong> au <strong>${fmtDate(data.sessionEndDate)} à 18h</strong>, au ${escapeHtml(data.sessionLieu)}.</p>
  <p>Elle est organisée pour un effectif de <strong>${nbStagiaires} stagiaire${nbStagiaires > 1 ? 's' : ''}</strong>.</p>
  <p>L'organisme ${escapeHtml(of.name)} accueillera ${nbStagiaires > 1 ? 'les personnes suivantes' : 'la personne suivante'} :</p>
  <p style="padding-left: 14px;">${stagiaireListe}</p>
  ${data.produitTrainerProfile ? `<p>Profil du formateur : ${escapeHtml(data.produitTrainerProfile)}</p>` : ''}
</section>

<section>
  <h2 class="article">Article 5 — Modalités d'évaluation et de sanction</h2>
  <ul>
    <li>Une liste d'émargement est à signer à la demi-journée ;</li>
    <li>Un certificat de réalisation sera délivré à chaque participant à la fin de la formation ;</li>
    <li>Une évaluation sous forme de QCM aura lieu en fin de formation.</li>
  </ul>
</section>

<section>
  <h2 class="article">Article 6 — Délai de rétractation</h2>
  <p>À compter de la date de signature du présent contrat, l'entreprise bénéficiaire dispose d'un délai de <strong>14 jours</strong> pour se rétracter. Elle doit en informer l'organisme de formation par lettre recommandée avec accusé de réception.</p>
  <p>Dans ce cas, aucune somme ne peut être exigée de l'entreprise bénéficiaire.</p>
</section>

<section>
  <h2 class="article">Article 7 — Dispositions financières</h2>
  <p>Le prix de l'action de formation s'élève à <strong>${fmtEUR.format(totalHT)} HT</strong>${showUnitBreakdown ? ` (soit ${fmtEUR.format(data.produitPriceHTPerStagiaire)} HT × ${nbStagiaires} stagiaires)` : ''} (<em>TVA non applicable en vertu de l'article 261-4-4° du CGI</em>).</p>
  <p>À l'issue du délai de rétractation prévu à l'article 6, un acompte de <strong>${fmtEUR.format(totalHT * 0.3)}</strong> (30 % du prix indiqué ci-dessus) doit être versé par le commanditaire. Le solde devra être réglé au maximum la veille de la formation.</p>
  <p>En cas de subrogation de paiement par un OPCO ou financeur tiers, l'accord du financeur doit être communiqué à l'organisme avant le début de la formation.</p>
</section>

<section>
  <h2 class="article">Article 8 — Interruption du stage</h2>
  <p>En cas de cessation anticipée de la formation du fait de l'organisme de formation ou de l'abandon du stage par le stagiaire pour un autre motif que la force majeure dûment reconnue, le présent contrat est résilié selon les modalités financières suivantes :</p>
  <p>Si le stagiaire est empêché de suivre la formation par suite de force majeure dûment reconnue, la convention de formation professionnelle est résiliée. Dans ce cas, seules les prestations effectivement dispensées sont dues au prorata temporis de leur valeur prévue au présent contrat.</p>
</section>

<section>
  <h2 class="article">Article 9 — Collecte et traitement des données à caractère personnel</h2>
  <p>L'organisme de formation tient à rappeler au représentant de l'entreprise bénéficiaire de la présente convention que l'exécution du présent contrat rend nécessaire la collecte et le traitement de données à caractère personnel le concernant et ce, afin de respecter les finalités suivantes :</p>
  <ul>
    <li>Permettre à l'organisme de formation de satisfaire à ses obligations de justificatifs de la réalité des actions de formation dispensées, telles que précisées aux articles L.6362-6 et suivants du Code du travail et plus spécifiquement des feuilles d'émargement ;</li>
    <li>Permettre le suivi technique, administratif et pédagogique de l'action de formation dans le cadre de la réalisation de la formation, objet des présentes.</li>
  </ul>
  <p>L'organisme de formation tient à rappeler que le défaut de fourniture de ces données personnelles empêcherait la réalisation des objectifs ci-avant rappelés et que la collecte conditionne plus généralement la conclusion et l'exécution du présent contrat.</p>
  <p>Les données à caractère personnel seront adressées aux formateurs intervenants au sein de l'organisme de formation, aux organismes financeurs le cas échéant, aux autorités de contrôle, dûment habilitées par les dispositions légales et réglementaires en vigueur.</p>
  <p>En application de l'article 13 du règlement européen sur la protection des données à caractère personnel du 27 avril 2016, le représentant de l'entreprise bénéficiaire signataire de la présente convention est informé de ce qu'il dispose du droit de demander au responsable du traitement l'accès aux données à caractère personnel, la rectification ou l'effacement de celles-ci, ou une limitation du traitement relatif à la personne concernée, ou du droit de s'opposer au traitement ou du droit à la portabilité des données.</p>
  <p>Ces données seront conservées pendant toute la durée et l'exécution du présent contrat, ainsi que, le cas échéant, pour la durée de la prolongation éventuelle. Afin de permettre un suivi statistique et préserver les intérêts de l'organisme de formation du point de vue de l'engagement de sa responsabilité civile, elles seront également conservées pendant une durée de <strong>5 (cinq) ans</strong> à compter du terme du présent contrat, correspondant au délai de prescription de droit commun. Cette durée pourra être prolongée le cas échéant, en cas de survenance d'événements qui pourraient interrompre ou suspendre ce délai de prescription.</p>
  <p>Pendant cette durée, ces données feront l'objet d'un archivage, préalable à leur suppression définitive.</p>
  <p>Le représentant de l'entreprise bénéficiaire signataire de la présente convention est également informé de ce qu'il dispose du droit de saisir une autorité de contrôle afin d'introduire, le cas échéant, une réclamation, en saisissant plus spécifiquement la Commission Nationale Informatique et Libertés (CNIL).</p>
</section>

<section>
  <h2 class="article">Article 10 — Cas de différend</h2>
  <p>Si une contestation ou un différend n'ont pu être réglés à l'amiable, le <strong>tribunal judiciaire de Nice</strong> sera seul compétent pour régler le litige.</p>
</section>

<p class="closing">Fait en double exemplaire, à <strong>${escapeHtml(of.addressVille)}</strong> le <strong>${fmtDate(data.conventionDate)}</strong>.</p>

<div class="signatures">
  <div class="box">
    <div class="label">Pour l'entreprise bénéficiaire</div>
    <div class="name">${escapeHtml(data.beneficiaireRepresentantNom)}</div>
    <div style="font-size: 9.5pt; color: #475569;">${escapeHtml(data.beneficiaireRaisonSociale)}</div>
    <div style="margin-top: 10px; font-size: 9pt; color: #64748B;">Date et signature :</div>
  </div>
  <div class="box">
    <div class="label">Pour l'organisme de formation</div>
    <div class="name">${escapeHtml(respFullName)}${of.resp.titre ? ', ' + escapeHtml(of.resp.titre) : ''}</div>
    <div style="font-size: 9.5pt; color: #475569;">${escapeHtml(of.name)}</div>
    <div style="margin-top: 10px; font-size: 9pt; color: #64748B;">Date et signature :</div>
    ${(() => {
      // Laurent 2026-06-04 : "ajoute ma signature sur la convention tu l'as déjà".
      // Pose la signature dirigeant auto. Fallback sur signature-laurent.png
      // si pas de signature-dirigeant.png uploadée pour ce tenant.
      const sig = loadSignatureDataUrl(data.tenantId, 'dirigeant');
      return sig
        ? `<img src="${sig}" alt="Signature" style="max-height: 22mm; max-width: 60mm; margin-top: 4px;" />`
        : '';
    })()}
  </div>
</div>

</body>
</html>`;
}

// Footer désormais inclus dans le HTML (running element WeasyPrint) — cf
// renderOfPagedFooter ci-dessus. L'ancien footer Gotenberg natif (downscalé
// par Chromium → illisible) n'est plus utilisé pour la convention.
// Re-export inchangé pour compat (renvoie le footer Gotenberg vide pour les
// rares appelants qui passeraient encore l'option à renderHtmlToPdf).
export function renderConventionFooterHtml(): string {
  return '';
}
