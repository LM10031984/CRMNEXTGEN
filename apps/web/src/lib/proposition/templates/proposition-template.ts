/**
 * La proposition d'accompagnement chiffrée.
 *
 * Implémentation de la maquette `.planning/specs/2026-09-01-maquette-proposition.html`.
 * On ne s'en inspire pas, on l'implémente : sections, ordre et mentions sont
 * ceux de la maquette, et des tests de contrat le vérifient.
 *
 * L'ordre porte la démonstration commerciale : ce qu'on a entendu → ce qu'on
 * propose → quand → **ce que ça ne vous coûtera pas** → le détail chiffré →
 * les prochaines étapes. Le budget mobilisable arrive AVANT le prix : c'est la
 * différence entre « voici une facture » et « voici vos droits, et voilà ce
 * qu'ils financent ».
 *
 * Deux interdits absolus dans ce fichier :
 *   • **aucun nom de participant** — les fiches équipe sont des données
 *     sensibles (§5 L-10) et ce document peut partir en lien public. Les
 *     payeurs y apparaissent par bandeau et par nombre, jamais par nom ;
 *   • **aucun calcul** — les montants arrivent arrêtés par `computePricing`.
 */

import { plural } from '../plural';
import type { PricingPayerResult, PricingSynthesis } from '../pricing';
import { COVERAGE_STATE_LABEL } from '../pricing';
import { PROPOSITION_STYLES } from './proposition-styles';
import { renderDocumentPageRule } from '@/lib/docs/weasyprint-base';
import type { PropositionData } from './proposition-data';

/** Nombre de sections numérotées de la proposition — invariant. */
export const PROPOSITION_SECTION_COUNT = 6;

const eurWhole = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const eurCents = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

/**
 * Un montant.
 *
 * Les centimes ne s'affichent que s'il y en a : « 12 096 € » se lit mieux que
 * « 12 096,00 € », mais « 3 024,50 € » ne peut pas s'arrondir — un devis et
 * une proposition doivent tomber au centime.
 */
function money(n: number): string {
  return Number.isInteger(n) ? eurWhole.format(n) : eurCents.format(n);
}

/** Échappement HTML — tout ce qui vient d'une saisie humaine passe par là. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const nn = (n: number) => String(n).padStart(2, '0');



function sectionTitle(no: number, title: string): string {
  return `<h2><span class="no">${nn(no)}</span>${esc(title)}</h2>`;
}

// ── Page 1 — garde, constats, axes ──────────────────────────────────────────

function pageCover(data: PropositionData): string {
  const meta: string[] = [];
  if (data.content.recipientLabel) {
    meta.push(`<div><span>À l’attention de</span><b>${esc(data.content.recipientLabel)}</b></div>`);
  }
  meta.push(
    `<div><span>Référence</span><b>${esc(data.reference)} · v${data.version}</b></div>`,
    `<div><span>Date</span><b>${dateFmt.format(data.generatedAt)}</b></div>`,
  );
  if (data.validUntil) {
    meta.push(`<div><span>Validité</span><b>${dateFmt.format(data.validUntil)}</b></div>`);
  }
  if (data.content.contactLabel || data.ownerLabel) {
    meta.push(
      `<div><span>Votre interlocuteur</span><b>${esc(data.content.contactLabel || data.ownerLabel)}</b></div>`,
    );
  }

  const heard =
    data.content.heard.length > 0
      ? `<ul class="dash">${data.content.heard.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`
      : `<p class="notice">Les constats du diagnostic n’ont pas encore été repris ici. Une proposition sans constat n’est qu’un tarif : complétez « ce que nous avons entendu » avant de l’envoyer.</p>`;

  return `<section class="page">
  <div class="band">
    <div class="kicker">${esc(data.of.name)} · Proposition d’accompagnement</div>
    <h1>${esc(data.content.subtitle || data.agencyName)}</h1>${
      data.content.subtitle && data.content.subtitle !== data.agencyName
        ? `\n    <div class="sub">${esc(data.agencyName)}</div>`
        : ''
    }
    <div class="band-meta">${meta.join('')}</div>
  </div>

  <div class="sec">
    ${sectionTitle(1, 'Ce que nous avons entendu')}
    ${data.content.heardIntro ? `<p class="lead">${esc(data.content.heardIntro)}</p>` : ''}
    ${heard}
  </div>

  <div class="sec">
    ${sectionTitle(2, `Notre proposition — ${plural(data.funding.halfDays, 'demi-journée')} chez vous`)}
    ${data.content.axesIntro ? `<p class="lead">${esc(data.content.axesIntro)}</p>` : ''}
    ${renderAxes(data)}
  </div>
</section>`;
}

function renderAxes(data: PropositionData): string {
  if (data.content.axes.length === 0) {
    return `<p class="notice">Aucun axe n’est encore composé. Le parcours se compose depuis le catalogue actif : un point de douleur métier reçoit un programme métier.</p>`;
  }
  return data.content.axes
    .map(
      (axe) => `<div class="phase">
      <div class="tag">${esc(axe.label)}<small>${plural(axe.halfDays, 'demi-journée')}${axe.periodLabel ? ` · ${esc(axe.periodLabel)}` : ''}</small></div>
      <div class="body">
        <h3>${esc(axe.title)}</h3>
        ${axe.description ? `<p>${esc(axe.description)}</p>` : ''}
        <div class="why">Pourquoi : ${esc(axe.why)}</div>
      </div>
    </div>`,
    )
    .join('');
}

// ── Page 2 — planning et budget mobilisable ─────────────────────────────────

function pagePlanningAndBudget(data: PropositionData): string {
  return `<section class="page">
  <div class="sec" style="margin-top:0">
    ${sectionTitle(3, 'Planning proposé')}
    ${renderPlanning(data)}
    ${data.content.piecesDeadlineNote ? `<p class="muted" style="margin-top:2mm">${esc(data.content.piecesDeadlineNote)}</p>` : ''}
  </div>

  <div class="sec">
    ${sectionTitle(4, `Budget mobilisable : ${money(data.funding.total)}, dossiers montés par nos soins`)}
    <p class="lead">L’accompagnement est dimensionné sur vos droits réellement disponibles — des droits qui, s’ils ne sont pas consommés, sont définitivement perdus au 31 décembre.</p>
    ${renderFundingTable(data)}
    ${renderBudgetBar(data)}
    ${data.funding.potentialNote ? `<p class="muted" style="margin-top:2mm">${esc(data.funding.potentialNote)}</p>` : ''}
    ${renderKeyPoints(data)}
    ${renderClientAlerts(data)}
  </div>
</section>`;
}

function renderPlanning(data: PropositionData): string {
  if (data.content.planning.length === 0) {
    return `<p class="notice">Les dates restent à arrêter ensemble. Elles seront confirmées avec le lien de pré-inscription transmis à votre équipe.</p>`;
  }
  return `<table class="planning">
      <thead><tr><th>Date</th><th>Session</th><th>Participants</th></tr></thead>
      <tbody>${data.content.planning
        .map(
          (r) =>
            `<tr><td><b>${esc(r.dateLabel)}</b></td><td>${esc(r.sessionLabel)}</td><td>${esc(r.participantsLabel)}</td></tr>`,
        )
        .join('')}</tbody>
    </table>`;
}

function renderFundingTable(data: PropositionData): string {
  const rows = data.funding.rows
    .map(
      (r) =>
        `<tr><td><b>${esc(r.funder)}</b></td><td>${esc(r.beneficiaries)}</td><td>${esc(r.basis)}</td><td class="num">${
          r.isDeduction ? `&#8722; ${money(r.amount)}` : money(r.amount)
        }</td></tr>`,
    )
    .join('');
  return `<table class="funding">
      <thead><tr><th>Financeur</th><th>Bénéficiaires</th><th>Base</th><th class="num">Montant</th></tr></thead>
      <tbody>${rows}
      <tr class="total"><td colspan="3">ENVELOPPE MOBILISABLE ESTIMÉE</td><td class="num">${money(data.funding.total)}</td></tr></tbody>
    </table>`;
}

/**
 * La barre de répartition — deux segments proportionnels.
 *
 * Les pourcentages sont calculés ici et posés en largeur de cellule : le
 * moteur d'impression n'honore pas `flex-grow`, il honore une table.
 */
function renderBudgetBar(data: PropositionData): string {
  // Avec un seul financeur, la barre est un bandeau plein qui n'apprend rien :
  // elle ne sert qu'à comparer deux enveloppes.
  const funders = data.funding.rows.filter((r) => !r.isDeduction && r.amount > 0);
  if (funders.length < 2) return '';
  const total = funders.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return '';

  const colors: Record<string, string> = { AGEFICE: '#00527A', 'OPCO EP': '#3EA9FF' };
  const cells = funders
    .map((r) => {
      const pct = Math.round((r.amount / total) * 1000) / 10;
      const cls = r.funder === 'AGEFICE' ? 'agefice' : 'opco';
      return `<div class="${cls}" style="width:${pct}%"></div>`;
    })
    .join('');
  const legend = funders
    .map(
      (r) =>
        `<span><span class="dot" style="background:${colors[r.funder] ?? '#3EA9FF'}"></span>${esc(r.funder)} · <b>${money(r.amount)}</b></span>`,
    )
    .join('');
  return `<div class="budgetbar">${cells}</div><div class="budgetlegend">${legend}</div>`;
}

function renderKeyPoints(data: PropositionData): string {
  if (data.content.keyPoints.length === 0) return '';
  return `<div class="callout">
      <h3>Points clés pour votre équipe</h3>
      <ul>${data.content.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
    </div>`;
}

/**
 * Les réserves présentables au dirigeant.
 *
 * Elles ne sont pas décoratives : « estimation, pas droit acquis », « deux
 * dossiers distincts », « plafond atteint » sont exactement ce qui distingue
 * une proposition honnête d'une mention trompeuse de financement.
 */
function renderClientAlerts(data: PropositionData): string {
  if (data.funding.clientAlerts.length === 0) return '';
  return `<div class="notice">${data.funding.clientAlerts.map((a) => `<div>${esc(a)}</div>`).join('')}</div>`;
}

// ── Page 3 — détail chiffré, étapes, mentions ───────────────────────────────

function pageDetailAndSteps(data: PropositionData): string {
  return `<section class="page">
  <div class="sec" style="margin-top:0">
    ${sectionTitle(5, 'Le détail chiffré — par payeur')}
    ${renderPricingTable(data)}
    ${renderOffert(data)}
    <p class="muted" style="margin-top:2.5mm">Les ${data.funding.conventionedHoursPerParticipant} heures conventionnées par participant (${plural(data.funding.halfDays, 'demi-journée')} de ${data.onsiteHoursPerHalfDay} h sur site, co-animées par ${plural(data.trainerCount, 'formateur')}) figurent à l’identique sur la convention, les feuilles d’émargement, l’attestation d’assiduité et les dossiers financeurs.</p>
    ${renderQuoteNote(data)}
  </div>

  <div class="sec">
    ${sectionTitle(6, 'Prochaines étapes')}
    ${renderSteps(data)}
  </div>

  <div class="sign">
    <div class="signcell"><div class="box">Pour ${esc(data.agencyName)}<br><span class="muted">« Bon pour accord » · date · signature</span></div></div>
    <div class="signcell"><div class="box">Pour ${esc(data.of.name)}<br><span class="muted">${esc(data.ownerLabel)} · date · signature</span></div></div>
  </div>

  <p class="legal">${esc(data.content.legalMention)}</p>
</section>`;
}

/**
 * Le tableau qui fait signer.
 *
 * Un bandeau par groupe de payeurs — jamais un nom de personne : ce document
 * part aussi en lien public. Sous chaque bandeau, la ligne de vente puis la
 * prise en charge estimée en négatif, exactement comme la maquette.
 */
function renderPricingTable(data: PropositionData): string {
  const { pricing } = data;
  if (pricing.payers.length === 0) {
    return `<p class="notice">Aucune ligne de vente n’est encore posée : il n’y a rien à chiffrer.</p>`;
  }

  const byId = new Map<string, PricingPayerResult>(pricing.payers.map((p) => [p.payer.id, p]));
  const blocks = pricing.groups
    .map((group) => {
      const payers = group.payerIds.map((id) => byId.get(id)!).filter(Boolean);
      const participants = payers.reduce((s, p) => s + p.payer.participantCount, 0);
      const totalHt = payers.reduce((s, p) => s + p.totalHt, 0);
      const coverage = payers.reduce((s, p) => s + p.coverage, 0);
      const first = payers[0];
      if (!first) return '';

      // Les payeurs d'un même bandeau portent le même parcours : on rend la
      // ligne une fois, avec le nombre de participants du bandeau.
      const lines = first.lines
        .map(
          (l) =>
            `<tr><td>${esc(l.description)}</td><td class="num">${participants}</td><td class="num">${l.halfDays}</td><td class="num">${l.conventionedHours} h</td><td class="num">${money(l.unitPriceHt)}</td><td class="num">${money(
              payers.reduce(
                (s, p) => s + (p.lines.find((x) => x.id === l.id)?.totalHt ?? 0),
                0,
              ),
            )}</td></tr>`,
        )
        .join('');

      const coverageRow =
        coverage > 0
          ? `<tr class="subtotal"><td colspan="4">${esc(
              first.coverages.map((c) => c.label).join(' · ') || 'Prise en charge estimée',
            )}</td><td class="num"></td><td class="num">&#8722; ${money(coverage)}</td></tr>`
          : '';

      return `<tr><td colspan="6" class="grouphead">${esc(group.label)}${group.note ? ` <span class="muted">— ${esc(group.note)}</span>` : ''}</td></tr>
        ${lines}
        ${coverageRow}`;
    })
    .join('');

  const rows: string[] = [blocks];
  rows.push(
    `<tr><td colspan="5"><b>Coût pédagogique total</b> <span class="muted">(TVA non applicable — article 261-4-4° a du CGI, activité de formation exonérée)</span></td><td class="num"><b>${money(pricing.totalHt)}</b></td></tr>`,
  );
  if (pricing.totalCoverage > 0) {
    rows.push(
      `<tr><td colspan="5">Financements mobilisés</td><td class="num">&#8722; ${money(pricing.totalCoverage)}</td></tr>`,
    );
  }
  if (pricing.discount) {
    rows.push(
      `<tr><td colspan="5">Reste à charge avant geste commercial</td><td class="num">${money(pricing.remainderBeforeDiscount)}</td></tr>`,
      `<tr><td colspan="5">Remise commerciale <span class="muted">(motif : ${esc(pricing.discount.reason)})</span></td><td class="num">&#8722; ${money(pricing.discount.amount)}</td></tr>`,
    );
  }
  rows.push(
    `<tr class="total"><td colspan="5">RESTE À VOTRE CHARGE</td><td class="num">${money(pricing.finalRemainder)}</td></tr>`,
  );

  return `<table class="pricing">
      <thead><tr><th>Désignation</th><th class="num">Particip.</th><th class="num">Demi-journées</th><th class="num">Heures conv.</th><th class="num">PU HT</th><th class="num">Total HT</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

/**
 * Le tampon OFFERT.
 *
 * Il ne s'affiche QUE lorsque le reste à charge est ramené à zéro par un geste
 * commercial. « Offert » et « pris en charge à 100 % » disent deux choses
 * différentes, et confondre les deux est la mention trompeuse de financement
 * que le référentiel Qualiopi sanctionne — d'où le texte explicite du bloc.
 */
function renderOffert(data: PropositionData): string {
  if (data.pricing.coverageState !== 'offered_via_discount') {
    if (data.pricing.coverageState === 'fully_covered_by_funding') {
      return `<div class="notice"><b>${esc(COVERAGE_STATE_LABEL.fully_covered_by_funding)}.</b> Vos droits couvrent l’intégralité du coût pédagogique : il ne reste rien à votre charge, sans geste commercial.</div>`;
    }
    return '';
  }
  return `<div class="offert">
      <div class="stampcell"><span class="stamp">OFFERT</span></div>
      <p><b>Le reste à charge vous est offert.</b> Précision importante : ce geste commercial ne modifie ni le coût pédagogique déclaré ni vos droits — les prises en charge sont calculées sur le coût réel. Il ne s’agit pas d’une prise en charge supplémentaire par un financeur.</p>
    </div>`;
}

function renderQuoteNote(data: PropositionData): string {
  if (data.quoteNumbers.length === 0) {
    return `<p class="muted" style="margin-top:2mm">Les devis correspondants reprendront exactement ces montants, un par payeur. Aucune facturation avant accord de prise en charge.</p>`;
  }
  const n = data.quoteNumbers.length;
  return `<p class="muted" style="margin-top:2mm">${plural(n, 'devis joint', 'devis joints')} ${
    n >= 2 ? 'reprennent' : 'reprend'
  } exactement ces montants : ${esc(
    data.quoteNumbers.join(', '),
  )}. Aucune facturation avant accord de prise en charge.</p>`;
}

function renderSteps(data: PropositionData): string {
  if (data.content.nextSteps.length === 0) return '';
  return `<table class="steps">
      <thead><tr><th>Action</th><th>Qui</th><th>Échéance</th></tr></thead>
      <tbody>${data.content.nextSteps
        .map(
          (s) =>
            `<tr><td>${esc(s.action)}</td><td>${esc(s.who)}</td><td><b>${esc(s.when)}</b></td></tr>`,
        )
        .join('')}</tbody>
    </table>`;
}

export function renderPropositionHtml(data: PropositionData): string {
  const pageRule = renderDocumentPageRule({
    brand: data.of.name.toUpperCase(),
    documentLine: `${data.reference} · ${data.agencyName}`,
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Proposition d’accompagnement — ${esc(data.agencyName)} · ${esc(data.reference)}</title>
<style>${PROPOSITION_STYLES}</style>
<style>${pageRule}</style>
</head>
<body>
${pageCover(data)}
${pagePlanningAndBudget(data)}
${pageDetailAndSteps(data)}
</body>
</html>`;
}

export type { PropositionData };
