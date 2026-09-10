/**
 * Rapport d'audit de performance.
 *
 * Implémentation de la maquette `.planning/specs/2026-09-01-maquette-audit.html`.
 * On ne s'en inspire pas, on l'implémente : structure, sections et ordre des
 * pages sont ceux de la maquette, et un test de contrat le vérifie.
 *
 * L'ordre n'est pas décoratif. Le financement est en DERNIÈRE page parce que
 * l'audit se lit comme une démonstration : d'abord ce qu'on a entendu, puis ce
 * qu'on en lit, puis ce que ça coûte, et seulement à la fin comment on le
 * finance. Mettre l'argent en tête transformerait un diagnostic en plaquette.
 *
 * DEUX FORMATS, une seule structure (décision Laurent du 03/09/2026) :
 *   • COMPLET → 17 pages, un chapitre par page, comme la maquette ;
 *   • LÉGER → format CONDENSÉ. Les chapitres d'un diagnostic léger tiennent en
 *     quelques lignes chacun ; leur donner une page pleine produisait neuf
 *     pages à moitié vides. Ils s'enchaînent donc au fil de l'eau, sans jamais
 *     être coupés en deux (`break-inside:avoid`), et c'est le moteur qui décide
 *     combien tiennent par page — on n'estime aucune hauteur, donc on ne
 *     tronque rien.
 *
 * Les DIX-SEPT SECTIONS existent dans les deux formats et gardent leur numéro :
 * c'est le numéro de SECTION qu'affichent les titres, pas le numéro de page.
 * En condensé les deux divergent — le sommaire, lui, donne la vraie page, que
 * le moteur d'impression résout seul (`target-counter`).
 *
 * Aucun calcul ici : tout arrive déjà arrêté par les moteurs purs.
 */

import { DIAGNOSTIC_CHAPTERS } from '@qualiof/shared/diagnostic';

import type { AuditChapter, AuditData } from './audit-data';
import { AUDIT_STYLES, renderAuditPageRule } from './audit-styles';

/** Nombre de sections du rapport — invariant, quel que soit le format. */
export const AUDIT_SECTION_COUNT = 17;

/** Les chapitres 3 à 11 occupent les sections 6 à 14. */
const FIRST_CHAPTER_SECTION = 6;

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

/** Échappement HTML — les réponses sont saisies à la main, tout peut arriver. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : eur.format(n);
}

/** Deux chiffres — « 06 », « 17 ». */
const nn = (n: number) => String(n).padStart(2, '0');

type ScoreLevel = 'ok' | 'warn' | 'alert' | 'none';

/**
 * Le niveau d'un score, source unique de la pastille ET de la couleur du
 * chiffre. Les deux disaient des choses différentes sur le premier audit réel :
 * un chapitre noté 14 s'affichait « prioritaire » en rouge à côté d'un « 14 »
 * du bleu de la marque, exactement comme un chapitre noté 81.
 */
function scoreLevel(score: number | null): ScoreLevel {
  if (score === null) return 'none';
  if (score >= 70) return 'ok';
  if (score >= 45) return 'warn';
  return 'alert';
}

const LEVEL_LABEL: Record<ScoreLevel, string> = {
  ok: 'au niveau',
  warn: 'à travailler',
  alert: 'prioritaire',
  none: 'non noté',
};

function scoreChip(score: number | null): string {
  const level = scoreLevel(score);
  const cls = level === 'none' ? '' : ` ${level}`;
  return `<span class="chip${cls}">${LEVEL_LABEL[level]}</span>`;
}

/**
 * Le score d'un chapitre, tel qu'il s'affiche en tête de chapitre.
 *
 * Deux détails qui se voyaient à l'œil nu sur le premier audit réel :
 *   • l'espace ouvrant de « <small> / 100</small> » était mangé par le moteur
 *     (« 81/ 100 ») : il est rendu insécable, et une marge le double en CSS ;
 *   • un chapitre non noté affichait « — / 100 », et un tiret cadratin à 20pt
 *     ressemble à une barre pleine. Il dit maintenant « non noté », comme la
 *     liste des chapitres de la synthèse dirigeant.
 */
function scoreBlock(score: number | null): string {
  const level = scoreLevel(score);
  if (level === 'none') return '<div class="score is-none">non noté</div>';
  return `<div class="score is-${level}">${score}<small>&#160;/ 100</small></div>`;
}

/**
 * Une barre proportionnelle avec son libellé.
 *
 * Le libellé n'est pas un enfant de la barre : en flex il ne s'affichait pas du
 * tout — les chiffres des barres de score étaient purement et simplement
 * absents du PDF. Il est posé dans la piste, à l'intérieur de la barre quand
 * elle est assez large pour l'accueillir, à l'extérieur sinon : c'est le
 * mécanisme `.outlbl` de la maquette, appliqué aux deux familles de barres.
 */
function bar(args: {
  wrapClass: 'sbarwrap' | 'barwrap';
  barClass: 'sbar' | 'bar';
  /** 0 → 100. */
  widthPercent: number;
  label: string;
  alert?: boolean;
}): string {
  const w = Math.max(0, Math.min(100, args.widthPercent));
  // Une barre à zéro reste visible : sinon un chapitre noté 0 n'a pas de piste
  // et la ligne semble vide plutôt que mauvaise.
  const drawn = Math.max(2, w);
  const background = args.alert ? '; background:#b42318' : '';
  // En dessous de 30 % la barre est trop courte pour contenir son libellé :
  // on le sort à droite, en encre foncée.
  const inside = drawn >= 30;
  const label = inside
    ? `<span class="inlbl" style="right:${(100 - drawn + 1.5).toFixed(1)}%">${esc(args.label)}</span>`
    : `<span class="outlbl" style="left:${(drawn + 1.5).toFixed(1)}%">${esc(args.label)}</span>`;
  return `<div class="${args.wrapClass}"><div class="${args.barClass}" style="width:${drawn.toFixed(1)}%${background}"></div>${label}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

/** Une section qui occupe sa propre page. */
function page(section: number, body: string): string {
  return `<section class="page" id="s-${nn(section)}">${body}</section>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — couverture
// ─────────────────────────────────────────────────────────────────────────────

function pageCover(data: AuditData): string {
  const restituees = data.chapters.reduce((s, c) => s + c.answers.length, 0);
  const ratios = data.pipeline.stages.filter((s) => s.conversionPercent !== null).length;
  const team = data.teamObjectives.lines;
  return page(
    1,
    `<div class="cover-band">
      <div class="kicker">${esc(data.of.name)} · Diagnostic d'agence immobilière</div>
      <h1>Audit de performance<br>commerciale &amp; organisation</h1>
      <div class="agency">${esc(data.agencyName)}</div>
      <div class="cover-meta">
        <div><span>Restitué le</span><b>${esc(dateFmt.format(data.generatedAt))}</b></div>
        <div><span>Référence</span><b>${esc(data.reference)}</b></div>
        <div><span>Score global</span><b>${data.globalScore === null ? 'non calculé' : `${data.globalScore} / 100`}</b></div>
        <div><span>Barème</span><b>${esc(data.scoringVersion)}</b></div>
      </div>
    </div>

    <div class="valuecard">
      <div class="v">${money(data.valueEuros)} HT</div>
      <p><b>Valeur de la prestation d'audit</b> — entretien structuré, analyse de votre chaîne
      commerciale complète, de vos actifs et de votre potentiel de financement, restitution écrite
      et plan de priorités. <b>Offerte dans le cadre de votre accompagnement ${esc(data.of.name)}.</b></p>
    </div>

    <div class="cover-badges">
      <span class="cbadge">${restituees} réponses · ${data.chapters.length} chapitres</span>
      <span class="cbadge">${team.length} personne${team.length > 1 ? 's' : ''} cartographiée${team.length > 1 ? 's' : ''}</span>
      <span class="cbadge">${ratios} ratios mesurés face aux repères</span>
      <span class="cbadge">Potentiel de financement chiffré</span>
      <span class="cbadge">3 priorités + plan 90 jours</span>
    </div>

    <div class="sec">
      <p class="lead" style="font-size:10.5pt">Ce document restitue, mot pour mot quand ils comptent,
      ce que vous nous avez dit — puis ce que vos chiffres disent de votre agence quand on les met
      face aux repères du métier. Il se termine par les trois priorités qui, à volume de travail
      constant, changent votre résultat — et par le plan pour les traiter dans les 90 jours.</p>
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — comment lire cet audit
// ─────────────────────────────────────────────────────────────────────────────

function pageHowToRead(data: AuditData): string {
  const chapterEntries = DIAGNOSTIC_CHAPTERS.filter((c) => c.chapter >= 3)
    .map((meta, i) => {
      const chapter = data.chapters.find((c) => c.chapter === meta.chapter);
      return chapter ? ([FIRST_CHAPTER_SECTION + i, chapter.title] as const) : null;
    })
    .filter((x): x is readonly [number, string] => x !== null);

  const toc: (readonly [number, string])[] = [
    [3, 'Votre agence en un coup d’œil'],
    [4, 'Synthèse dirigeant'],
    [5, 'Votre chaîne commerciale'],
    ...chapterEntries,
    [15, 'La performance de votre équipe'],
    [16, 'Un objectif, trois priorités, 90 jours'],
    [17, 'Votre potentiel de financement'],
  ];

  return page(
    2,
    `<div class="sec"><h2><span class="no">02</span> Pourquoi cet audit — et comment le lire</h2>
      <p class="lead">Une agence immobilière est une chaîne : des contacts entrent, des actes
      sortent, et entre les deux chaque maillon retient ou laisse filer. Cet audit mesure chaque
      maillon, le compare à ce qu'on observe ailleurs, et chiffre ce que les écarts coûtent.</p>
      <div class="grid3" style="margin-top:5mm">
        <div class="tile"><div class="lbl">Ce que vous nous avez dit</div>
          <p>Vos réponses, restituées telles quelles. Vous devez pouvoir vous y reconnaître —
          si un chiffre vous surprend, c'est qu'il mérite d'être revérifié ensemble.</p></div>
        <div class="tile"><div class="lbl">Notre lecture</div>
          <p>Ce que ces réponses disent de votre organisation, et ce qu'elles vous coûtent.
          C'est notre analyse, pas une vérité : elle se discute.</p></div>
        <div class="tile"><div class="lbl">Le premier levier</div>
          <p>L'action qui rapporte le plus vite sur ce chapitre. Une seule, volontairement :
          un plan de vingt actions ne se met jamais en œuvre.</p></div>
      </div>
      <h4 style="margin-top:6mm">Comment lire les scores</h4>
      <p class="lead">Chaque chapitre est noté sur 100 selon un barème versionné
      (<b>${esc(data.scoringVersion)}</b>). Une question restée sans réponse ne compte ni en votre
      faveur ni en votre défaveur : elle réduit la couverture du chapitre, affichée à côté du
      score. Un chapitre noté 70 sur une couverture de 40 % vaut moins qu'un 65 sur 100 %.</p>
      <h4 style="margin-top:5mm">Sommaire</h4>
      <div class="toc">
        ${toc
          .map(
            ([n, t]) =>
              `<div><span><b>${nn(n)}</b>${esc(t)}</span><a class="pno" href="#s-${nn(n)}"></a></div>`,
          )
          .join('')}
      </div>
      <p class="muted" style="margin-top:3mm">À gauche le numéro de section, à droite la page.</p>
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — l'agence en un coup d'œil
// ─────────────────────────────────────────────────────────────────────────────

function pageIdentity(data: AuditData): string {
  const ch1 = data.chapters.find((c) => c.chapter === 1);
  const ch2 = data.chapters.find((c) => c.chapter === 2);
  return page(
    3,
    `<div class="sec"><h2><span class="no">03</span> Votre agence en un coup d'œil</h2>
      <h4>Identité &amp; contexte</h4>
      <div class="idgrid">
        ${data.agencyContext.map((r) => `<div><span>${esc(r.label)}</span><span>${esc(r.value)}</span></div>`).join('')}
      </div>
      <div class="grid3" style="margin-top:6mm">
        <div class="tile"><div class="lbl">Chiffre d'affaires N-1</div>
          <div class="display">${money(data.revenueN1)}</div></div>
        <div class="tile"><div class="lbl">Objectif déclaré</div>
          <div class="display">${money(data.revenueGoal)}</div></div>
        <div class="tile"><div class="lbl">Collaborateurs</div>
          <div class="display">${data.teamObjectives.lines.length}<small>&#160;fiches</small></div></div>
      </div>
      ${ch1 ? renderAnswerTable(ch1, 'Ce que vous nous avez dit — contexte') : ''}
      ${ch2 ? renderAnswerTable(ch2, 'Équipe &amp; historique de financement') : ''}
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — synthèse dirigeant
// ─────────────────────────────────────────────────────────────────────────────

function scoreRow(
  c: { title: string; coverage: number; score: number | null },
  prefix = '',
): string {
  const level = scoreLevel(c.score);
  return `<div class="srow">
    <div class="slabel">${prefix}${esc(c.title)}<small>couverture ${c.coverage} %</small></div>
    ${bar({
      wrapClass: 'sbarwrap',
      barClass: 'sbar',
      widthPercent: c.score ?? 0,
      label: c.score === null ? 'non noté' : String(c.score),
      alert: level === 'alert',
    })}
    <div class="schip">${scoreChip(c.score)}</div>
  </div>`;
}

function pageExecutiveSummary(data: AuditData): string {
  const weakest = [...data.chapterScores]
    .filter((c) => c.score !== null)
    .sort((a, b) => a.score! - b.score!)
    .slice(0, 3);

  return page(
    4,
    `<div class="sec"><h2><span class="no">04</span> Synthèse dirigeant</h2>
      ${data.directorQuotes
        .map(
          (q) =>
            `<blockquote>« ${esc(q)} »<footer>Vos mots, notés pendant le rendez-vous</footer></blockquote>`,
        )
        .join('')}
      <div class="scorehero" style="margin-top:5mm">
        <div class="big">${data.globalScore === null ? '—' : data.globalScore}<small>&#160;/ 100</small></div>
        <p>Score global de performance commerciale et d'organisation, calculé sur
        ${data.chapters.reduce((s, c) => s + c.answeredCount, 0)} réponses.
        Il n'a de sens que comparé à lui-même dans six mois : c'est un point de départ,
        pas un jugement.</p>
      </div>
      <h4 style="margin-top:4mm">Vos trois chapitres les plus fragiles</h4>
      <div class="scorebars">
        ${weakest.map((c) => scoreRow(c)).join('')}
      </div>
      <h4 style="margin-top:4mm">Tous les chapitres</h4>
      <div class="scorebars">
        ${data.chapterScores.map((c) => scoreRow(c, `${c.chapter}. `)).join('')}
      </div>
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — la chaîne commerciale
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'entonnoir de la maquette : une barre par étape, proportionnelle au volume
 * mensuel, et le taux de passage à droite. Il était rendu en tableau simple —
 * on perdait ce que la maquette apporte de plus utile en rendez-vous : voir
 * d'un coup d'œil où la chaîne se rétrécit.
 */
function funnel(data: AuditData): string {
  const stages = data.pipeline.stages;
  const max = Math.max(...stages.map((s) => s.value ?? 0), 1);

  return `<div class="funnel">
    ${stages
      .map((s) => {
        const measured = s.conversionPercent !== null && s.benchmark !== null;
        // Pas de ✓ ni de ✗ : le conteneur ne porte que les fontes Liberation,
        // qui n'ont pas ces glyphes — ils sortaient en blanc dans le PDF. La
        // couleur de la pastille dit déjà la même chose.
        const chip = measured
          ? s.status === 'faible'
            ? `<span class="chip alert">${s.conversionPercent} %</span>`
            : `<span class="chip ok">${s.conversionPercent} %</span>`
          : // Une étape d'entrée n'a rien à quoi se comparer. Elle affichait
            // « conforme » : un audit ne déclare pas conforme ce qu'il n'a pas
            // mesuré.
            '<span class="muted">non comparé</span>';
        return `<div class="frow">
          <div class="stage">${esc(s.label)}</div>
          ${bar({
            wrapClass: 'barwrap',
            barClass: 'bar',
            widthPercent: s.value === null ? 0 : (s.value / max) * 100,
            label: s.value === null ? '—' : `${s.value} / mois`,
            alert: s.status === 'faible',
          })}
          <div class="conv">${chip}</div>
        </div>`;
      })
      .join('')}
  </div>
  <p class="muted" style="margin-top:1.5mm">Chaque barre est proportionnelle au volume mensuel
  déclaré ; le pourcentage mesure la conversion depuis l'étape précédente, face au repère du
  métier — en vert quand il est tenu, en rouge quand il ne l'est pas.</p>`;
}

function pagePipeline(data: AuditData): string {
  const p = data.pipeline;
  return page(
    5,
    `<div class="sec"><h2><span class="no">05</span> Votre chaîne commerciale — vue d'ensemble</h2>
      <p class="muted">Moyennes mensuelles déclarées · repères ${esc(data.of.name)}.
      Les deux maillons les plus faibles sont signalés.</p>
      ${funnel(data)}
      <h4 style="margin-top:5mm">Le détail, face aux repères</h4>
      <table>
        <thead><tr><th>Étape</th><th class="num">Volume / mois</th><th class="num">Taux de passage</th><th class="num">Repère</th><th>État</th></tr></thead>
        <tbody>
          ${p.stages
            .map(
              (s) => `<tr>
              <td>${esc(s.label)}</td>
              <td class="num">${s.value ?? '—'}</td>
              <td class="num">${s.conversionPercent === null ? '—' : `${s.conversionPercent} %`}</td>
              <td class="num">${s.benchmark === null ? '—' : `${s.benchmark} %`}</td>
              <td>${
                s.benchmark === null || s.conversionPercent === null
                  ? '<span class="chip">non comparé</span>'
                  : s.status === 'faible'
                    ? '<span class="chip alert">en retard</span>'
                    : '<span class="chip ok">conforme</span>'
              }</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <div class="grid2" style="margin-top:5mm">
        <div class="tile"><div class="lbl">Part d'exclusivité</div>
          <div class="display">${p.exclusivity.value === null ? '—' : `${p.exclusivity.value} %`}</div>
          <p>Repère ${p.exclusivity.benchmark} %${p.exclusivity.status === 'faible' ? ' — en dessous' : ''}</p></div>
        <div class="tile"><div class="lbl">CA moyen par vente</div>
          <div class="display">${money(p.averageRevenuePerSale)}</div>
          <p>Déclaré au chapitre 1</p></div>
      </div>
      ${
        p.weakestLinks.length > 0
          ? `<h4 style="margin-top:6mm">Là où la chaîne fuit le plus</h4>
             ${p.weakestLinks
               .map(
                 (s) => `<div class="tile" style="margin-top:2mm">
                 <b>${esc(s.label)}</b> — ${s.conversionPercent} % contre ${s.benchmark} % attendus.
                 ${
                   s.impactPresentation === 'montant'
                     ? `<p>Reprendre la moitié du chemin vaudrait de l'ordre de <b>${money(s.headlineImpactEuros)}</b> de chiffre d'affaires supplémentaire sur un an.</p>`
                     : s.impactPresentation === 'potentiel_majeur'
                       ? `<p><b>Potentiel majeur — à chiffrer ensemble.</b></p>`
                       : ''
                 }
               </div>`,
               )
               .join('')}
             <p class="muted" style="margin-top:2mm">Projection à tunnel inchangé par ailleurs,
             sur les volumes déclarés — un ordre de grandeur pour situer l'enjeu, pas un engagement.</p>`
          : `<p class="lead" style="margin-top:5mm">Aucun maillon n'est nettement en retard sur
             les repères parmi les étapes renseignées.</p>`
      }
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections 6 → 14 — les chapitres
// ─────────────────────────────────────────────────────────────────────────────

function renderAnswerTable(chapter: AuditChapter, heading: string): string {
  if (chapter.answers.length === 0) {
    return `<h4 style="margin-top:4mm">${heading}</h4>
      <p class="muted">Aucune réponse enregistrée sur ce chapitre.</p>`;
  }
  return `<h4 style="margin-top:4mm">${heading}</h4>
    <table class="qa"><tbody>
      ${chapter.answers
        .map((a) => `<tr><td>${esc(a.label)}</td><td>${esc(a.value)}</td></tr>`)
        .join('')}
    </tbody></table>`;
}

/** Le corps d'un chapitre — identique dans les deux formats. */
function chapterBody(chapter: AuditChapter, section: number): string {
  const clientAlerts = chapter.alerts.filter((a) => a.audience === 'client');
  return `<div class="chap-head">
      <div class="chap-title" style="border:none; margin:0; padding:0">
        <span class="no">${nn(section)}</span> ${esc(chapter.title)}
      </div>
      <div class="chap-meta">
        ${scoreBlock(chapter.score)}
        <div class="answered">${chapter.visibleCount} questions · ${chapter.answeredCount} renseignées</div>
      </div>
    </div>
    <hr style="border:none; border-top:2px solid #00527A; margin:2mm 0 4mm">
    ${renderAnswerTable(chapter, 'Ce que vous nous avez dit')}
    <h4 style="margin-top:4mm">Notre lecture</h4>
    <p class="lecture">${esc(chapter.lecture)}</p>
    <div class="grid2" style="margin-top:3mm">
      <div class="tile"><div class="lbl">Repères</div>
        <p>${
          clientAlerts.length > 0
            ? clientAlerts
                .map(
                  (a) =>
                    `${esc(a.label)} ${a.severity === 'error' ? '<span class="chip alert">prioritaire</span>' : '<span class="chip warn">écart</span>'}`,
                )
                .join('<br>')
            : 'Aucun écart signalé sur ce chapitre <span class="chip ok">au niveau</span>'
        }</p></div>
      <div class="lever"><h4>Premier levier</h4><p>${esc(chapter.lever)}</p></div>
    </div>`;
}

/**
 * Les chapitres, dans le format qui convient à la variante.
 *
 * En COMPLET chaque chapitre prend sa page. En LÉGER ils s'enchaînent dans une
 * région de flux : le moteur en met deux ou trois par page selon leur contenu
 * réel, sans jamais en couper un.
 */
function renderChapters(data: AuditData): string {
  const blocks = DIAGNOSTIC_CHAPTERS.filter((c) => c.chapter >= 3)
    .map((meta, i) => {
      const chapter = data.chapters.find((c) => c.chapter === meta.chapter);
      if (!chapter) return null;
      return { chapter, section: FIRST_CHAPTER_SECTION + i };
    })
    .filter((x): x is { chapter: AuditChapter; section: number } => x !== null);

  if (data.variant === 'COMPLET') {
    return blocks.map((b) => page(b.section, chapterBody(b.chapter, b.section))).join('\n');
  }

  return `<div class="flow">
${blocks
  .map((b) => `  <div class="chap" id="s-${nn(b.section)}">${chapterBody(b.chapter, b.section)}</div>`)
  .join('\n')}
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 15 — la performance de l'équipe
// ─────────────────────────────────────────────────────────────────────────────

const STATUT_LABEL = {
  INDEPENDANT: 'Agent commercial',
  SALARIE: 'Salarié',
  DIRIGEANT: 'Dirigeant',
} as const;

function pageTeam(data: AuditData): string {
  const { lines, hasContent, growthRate } = data.teamObjectives;

  return page(
    15,
    `<div class="sec"><h2><span class="no">15</span> La performance de votre équipe — personne par personne</h2>
      <p class="muted">Issu des fiches individuelles du diagnostic. Ce tableau vous est destiné :
      il n'apparaît sur aucun lien partagé.</p>
      ${
        lines.length === 0
          ? '<p class="lead">Aucune fiche individuelle n’a été saisie pendant le rendez-vous.</p>'
          : `<table>
        <thead><tr><th>Collaborateur</th><th>Statut</th><th class="num">Production N-1</th>${
          hasContent
            ? '<th class="num">Objectif proposé</th><th>Constats &amp; préconisation</th>'
            : ''
        }</tr></thead>
        <tbody>
          ${lines
            .map(
              (m) => `<tr>
              <td>${esc(m.displayName)}</td>
              <td>${STATUT_LABEL[m.statut]}</td>
              <td class="num">${money(m.caN1)}</td>
              ${
                hasContent
                  ? `<td class="num">${money(m.objectiveCa)}</td>
              <td>${m.recommendation === null ? '—' : esc(m.recommendation)}</td>`
                  : ''
              }
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
      }
      ${
        hasContent && growthRate !== null
          ? `<p class="muted" style="margin-top:4mm">Les objectifs proposés reprennent, pour chacun,
             l'ambition de croissance de l'agence (+${Math.round(growthRate * 100)} % entre le chiffre
             d'affaires N-1 et votre objectif déclaré). Ce sont des points de départ d'entretien,
             pas des quotas : ils se valident avec la personne concernée.</p>`
          : `<p class="muted" style="margin-top:4mm">Les objectifs proposés sont des points de départ
             d'entretien, pas des quotas : ils se valident avec la personne concernée.</p>`
      }
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 16 — objectif, priorités, plan 90 jours
// ─────────────────────────────────────────────────────────────────────────────

function pagePriorities(data: AuditData): string {
  const ecart =
    data.revenueGoal !== null && data.revenueN1 !== null && data.revenueN1 > 0
      ? Math.round(((data.revenueGoal - data.revenueN1) / data.revenueN1) * 100)
      : null;

  return page(
    16,
    `<div class="sec"><h2><span class="no">16</span> Un objectif, trois priorités, un plan de 90 jours</h2>
      <div class="scorehero">
        <div class="big">${money(data.revenueGoal)}</div>
        <p>Votre objectif déclaré pour l'année${ecart !== null ? ` (${ecart >= 0 ? '+' : ''} ${ecart} % par rapport à l'an dernier)` : ''}.
        Les trois priorités ci-dessous sont celles qui pèsent le plus sur cet écart.</p>
      </div>
      <div style="margin-top:5mm">
        ${data.priorities
          .map(
            (p, i) => `<div class="tile" style="margin-top:3mm">
            <div class="lbl">Priorité ${i + 1} · ${esc(p.horizon)}</div>
            <b>${esc(p.title)}</b>
            <p>${esc(p.why)}</p>
          </div>`,
          )
          .join('')}
      </div>
      <h4 style="margin-top:6mm">Les 90 prochains jours</h4>
      <table>
        <thead><tr><th>Échéance</th><th>Ce qui se met en place</th></tr></thead>
        <tbody>
          <tr><td>Jours 1 à 30</td><td>${esc(data.priorities[0]?.title ?? 'Première priorité')} — mise en place et premiers rituels.</td></tr>
          <tr><td>Jours 31 à 60</td><td>${esc(data.priorities[1]?.title ?? 'Deuxième priorité')} — déploiement à toute l'équipe.</td></tr>
          <tr><td>Jours 61 à 90</td><td>${esc(data.priorities[2]?.title ?? 'Troisième priorité')} — puis première mesure des écarts.</td></tr>
        </tbody>
      </table>
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 17 — le financement, en DERNIER
// ─────────────────────────────────────────────────────────────────────────────

function pageFunding(data: AuditData): string {
  const f = data.funding;

  // Des droits mobilisables sans bénéficiaire, c'est une promesse en l'air : la
  // page annonçait « 0 salarié(s) » et « 2 500 € » sur la même ligne, alors que
  // le chapitre 2 déclarait un salarié dont aucune fiche n'avait été saisie. On
  // ne montre l'enveloppe que si quelqu'un peut en bénéficier — et on dit
  // pourquoi elle ne l'est pas.
  const opcoHasBeneficiaries = f.opcoEp.participantCount > 0;
  const opcoRights = !opcoHasBeneficiaries
    ? '—'
    : f.opcoEp.manualValidationRequired
      ? 'à valider'
      : money(f.opcoEp.budget);
  const declared = data.declaredEmployeeCount;
  const opcoNote =
    !opcoHasBeneficiaries && declared !== null && declared > 0
      ? `<p class="muted" style="margin-top:2mm">${declared} salarié${declared > 1 ? 's' : ''} déclaré${declared > 1 ? 's' : ''}
         au chapitre 2, mais aucune fiche individuelle saisie : l'enveloppe OPCO EP se chiffrera
         dès que le ou les salariés concernés seront cartographiés.</p>`
      : '';

  return page(
    17,
    `<div class="sec"><h2><span class="no">17</span> Votre potentiel de financement</h2>
      <table>
        <thead><tr><th>Financeur</th><th>Bénéficiaires</th><th class="num">Droits mobilisables</th><th class="num">Prise en charge</th></tr></thead>
        <tbody>
          <tr><td>AGEFICE</td><td>${f.agefice.participantCount} agent(s) commercial(aux)</td>
            <td class="num">${money(f.agefice.budget)}</td><td class="num">${money(f.agefice.coverage)}</td></tr>
          <tr><td>OPCO EP</td><td>${f.opcoEp.participantCount} salarié(s)</td>
            <td class="num">${opcoRights}</td>
            <td class="num">${money(f.opcoEp.coverage)}</td></tr>
        </tbody>
      </table>
      ${opcoNote}
      <div class="grid3" style="margin-top:5mm">
        <div class="tile"><div class="lbl">Volume proposé</div>
          <div class="display">${f.halfDays}<small>&#160;demi-journées</small></div>
          <p>${f.onsiteHours} h sur site</p></div>
        <div class="tile"><div class="lbl">Heures conventionnées</div>
          <div class="display">${f.conventionedHours} h</div>
          <p>La valeur portée sur la convention, l'émargement et le dossier financeur</p></div>
        <div class="tile"><div class="lbl">Reste à charge</div>
          <div class="display">${money(f.totalRemainder)}</div>
          <p>Sur ${money(f.totalPrice)} HT</p></div>
      </div>
      ${
        f.alerts.filter((a) => a.audience === 'client').length > 0
          ? `<h4 style="margin-top:6mm">À savoir</h4><p>${f.alerts
              .filter((a) => a.audience === 'client')
              .map((a) => esc(a.label))
              .join('<br>')}</p>`
          : ''
      }
      <h4 style="margin-top:6mm">Ce que nous prenons en charge</h4>
      <p class="lead">Le montage administratif est assuré de bout en bout par ${esc(data.of.name)} :
      constitution des dossiers, dépôt dans les délais, suivi jusqu'au règlement. Aucune avance de
      trésorerie ne vous est demandée. Deux dossiers distincts sont montés selon les statuts, pour
      un seul reste à charge.</p>
      <p class="muted" style="margin-top:4mm">Montants indicatifs, établis sur les éléments
      déclarés pendant le rendez-vous et sur les règles de financement en vigueur au
      ${esc(dateFmt.format(data.generatedAt))}. Ils sont confirmés à l'instruction de chaque
      dossier. Les droits non consommés au 31 décembre sont perdus.</p>
      <p class="muted" style="margin-top:3mm">${esc(data.of.name)}${data.of.numDA ? ` — déclaration d'activité n° ${esc(data.of.numDA)}` : ''}${data.of.siret ? ` — SIRET ${esc(data.of.siret)}` : ''}.
      Analyse produite le ${esc(dateFmt.format(data.generatedAt))} · barème ${esc(data.scoringVersion)} · rédaction ${esc(data.generationSource)}.</p>
    </div>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function renderAuditHtml(data: AuditData): string {
  const pageRule = renderAuditPageRule({
    brand: data.of.name.toUpperCase(),
    documentLine: `Audit de performance — ${data.agencyName} · ${data.reference}`,
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Audit de performance — ${esc(data.agencyName)} · ${esc(data.reference)}</title>
<style>${AUDIT_STYLES}</style>
<style>${pageRule}
/* Le sommaire ne connaît pas les pages : c'est le moteur d'impression qui les
   résout, une fois la pagination faite. Indispensable au format condensé, où
   le numéro de section ne vaut plus numéro de page. */
.toc .pno{ color:#7b8894; font-variant-numeric:tabular-nums; text-decoration:none }
.toc .pno::after{ content:target-counter(attr(href), page) }</style>
</head>
<body>
${pageCover(data)}
${pageHowToRead(data)}
${pageIdentity(data)}
${pageExecutiveSummary(data)}
${pagePipeline(data)}
${renderChapters(data)}
${pageTeam(data)}
${pagePriorities(data)}
${pageFunding(data)}
</body>
</html>`;
}
