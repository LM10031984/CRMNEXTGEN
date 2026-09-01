/**
 * Template email — la journée proposée à l'issue du diagnostic du stand.
 *
 * CLONE STRICT de `lead-assigned.ts` : HTML inline, escapeHtml sur toute valeur
 * interpolée, OfConfig pour la marque, texte de repli. Template PUR : aucun
 * side-effect réseau, testable sans SMTP.
 *
 * Destinataire : un PROSPECT, pas un collègue. D'où les règles de fond :
 *  - aucun lien vers l'application (il n'y a pas de compte à ouvrir) ;
 *  - AUCUN PRIX de la journée. Le tarif dépend du payeur et des droits AGEFICE
 *    restants ; l'annoncer dans un email automatique, c'est s'engager à
 *    l'aveugle. Les montants qui figurent ici sont ceux de la PRISE EN CHARGE
 *    AGEFICE — un droit du prospect, pas une facture ;
 *  - AUCUN chiffre de satisfaction. Les notes en base sont générées (source IA,
 *    valeurs quasi uniformes) : les publier serait une réserve d'audit ET un
 *    argument mensonger. À rétablir seulement sur des questionnaires réels ;
 *  - UN SEUL lien cliquable. Un email de prospect avec trois liens ne convertit
 *    sur aucun.
 *
 * Deux rendus possibles :
 *  1. `surMesure` fourni → la journée assemblée pour ce prospect à partir du
 *     programme du catalogue (chaque point ancré, cf. programme-sur-mesure.ts) ;
 *  2. `surMesure` null → le programme du catalogue TEL QUEL. Moins flatteur,
 *     mais toujours vrai. Un repli lisible vaut mieux qu'un email raté.
 */

import type { OfConfig } from '@/lib/of-config';
import { PROBLEMATIQUES, type ProblematiqueKey } from '@/lib/diagnostic/questions';
import type { ProgrammeSurMesure } from '@/lib/diagnostic/programme-sur-mesure';

const BRAND_DARK = '#00527A';
const BRAND_LIGHT_BG = '#F0F9FF';

/**
 * Barème AGEFICE 2026 (source : communication-agefice.fr — plafonds 2026 et
 * étapes clefs 2026). Constantes FIGÉES, pas de calcul « élégant » : ce sont des
 * règles de financement, elles changent par décision de l'AGEFICE, pas par
 * arithmétique. À revoir au 1er janvier.
 *
 * Ce bloc remplace l'ancienne promesse « c'est souvent pris en charge en
 * totalité », qui était FAUSSE pour une journée de 8 h et se retournait au
 * premier appel.
 */
const AGEFICE = {
  /** Année du barème. Figée avec les montants : les deux se revoient ENSEMBLE. */
  annee: 2026,
  tauxPresentielParHeure: 42,
  enveloppeAnnuelle: '3 000',
  priseEnChargeJournee: 336,
  delaiDepotJours: 15,
} as const;

const CTA_LIBELLE = 'Réserver mon point financement — 15 min';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** « 8 h / 1 jour » — convention projet : 8 h = 1 jour (9h-13h / 14h-18h). */
export function formatDuree(heures: number): string {
  const jours = heures / 8;
  const j = Number.isInteger(jours) ? `${jours}` : jours.toFixed(1).replace('.', ',');
  return `${heures} h / ${j} jour${jours > 1 ? 's' : ''}`;
}

/**
 * L'unique lien cliquable de l'email — helper PUR, testable sans environnement.
 *
 * Ordre : `DIAGNOSTIC_CTA_URL` (lien de réservation d'un créneau), sinon repli
 * sur le portable de l'organisme en `tel:` — au moins aussi bon depuis un
 * téléphone. Si ni l'un ni l'autre, on n'affiche AUCUN bouton plutôt qu'un
 * bouton mort.
 *
 * Seuls `https`, `http`, `tel` et `mailto` sont acceptés : une variable
 * d'environnement mal remplie ne doit pas pouvoir injecter un `javascript:`
 * dans un email envoyé à des prospects.
 */
export function resolveCtaUrl(envUrl: string | undefined, ofPhone: string): string | null {
  const brut = (envUrl ?? '').trim();
  if (brut) {
    if (/^(https?|tel|mailto):/i.test(brut)) return brut;
    return null;
  }
  const tel = (ofPhone ?? '').replace(/[^\d+]/g, '');
  return tel ? `tel:${tel}` : null;
}

/** Signature NOMINATIVE : un email d'OF signé par un humain joignable convertit mieux. */
function signataire(of: OfConfig): { nom: string; titre: string; phone: string } {
  const nom = [of.resp.prenom, of.resp.nom].filter(Boolean).join(' ').trim();
  const secours = [of.contact.prenom, of.contact.nom].filter(Boolean).join(' ').trim();
  return {
    nom: nom || secours || of.name,
    titre: of.resp.titre || of.contact.titre || '',
    phone: of.resp.phone || of.contact.phone || of.phone || '',
  };
}

export interface ProduitPropose {
  title: string;
  dureeHeures: number;
  objectifs: string[];
  /** Programme du catalogue, utilisé en repli si le sur-mesure a échoué. */
  programmeMd: string;
}

export interface DiagnosticProgrammeEmailInput {
  firstName: string;
  dominante: ProblematiqueKey;
  secondaire: ProblematiqueKey | null;
  produit: ProduitPropose;
  surMesure: ProgrammeSurMesure | null;
  /** Surcharge du lien du CTA (tests). En production : `DIAGNOSTIC_CTA_URL`. */
  ctaUrl?: string;
}

const MOMENTS: Record<'MATIN' | 'APRES_MIDI', string> = {
  MATIN: 'Matinée (9h - 13h)',
  APRES_MIDI: 'Après-midi (14h - 18h)',
};

export function renderDiagnosticProgrammeEmail(
  input: DiagnosticProgrammeEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { firstName, dominante, secondaire, produit, surMesure } = input;
  const probl = PROBLEMATIQUES[dominante];
  const suite = secondaire ? PROBLEMATIQUES[secondaire] : null;
  const duree = formatDuree(produit.dureeHeures);

  const subject = `Votre journée — ${produit.title}`;
  const accroche = surMesure?.accroche ?? probl.accroche;
  const objectifs = surMesure?.objectifs ?? produit.objectifs;

  const cta = resolveCtaUrl(input.ctaUrl ?? process.env.DIAGNOSTIC_CTA_URL, of.phone);
  const signature = signataire(of);

  // Le bloc financement, en une seule formulation partagée HTML/texte : deux
  // rédactions séparées finissent par diverger, et c'est le passage le plus
  // sensible de l'email.
  const financement = [
    `Votre enveloppe formation ${AGEFICE.annee} auprès de l'AGEFICE est de ${AGEFICE.enveloppeAnnuelle} € par an.`,
    `Une journée en présentiel est prise en charge à hauteur de ${AGEFICE.tauxPresentielParHeure} € de l'heure, soit ${AGEFICE.priseEnChargeJournee} € pour une journée de 8 h.`,
    `Deux règles à connaître : le dossier doit être déposé au plus tard ${AGEFICE.delaiDepotJours} jours calendaires avant le début de la formation, et l'enveloppe est annuelle — ce qui n'est pas consommé au 31 décembre est perdu.`,
    `Concrètement, pour une journée en décembre, le dossier doit partir à la mi-novembre.`,
  ];

  // ── version texte ────────────────────────────────────────────────────────
  const texteSequences = surMesure
    ? surMesure.sequences.flatMap((s) => [
        ``,
        `${MOMENTS[s.moment]} — ${s.titre}`,
        `  ${s.pourquoiVous}`,
        ...s.points.map((p) => `  - ${p.texte}`),
      ])
    : ['', 'PROGRAMME', produit.programmeMd];

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `Merci d'avoir pris 90 secondes sur notre stand.`,
    ``,
    accroche,
    ``,
    `LA JOURNÉE QU'ON VOUS PROPOSE`,
    produit.title,
    `Durée : ${duree}`,
    ``,
    `À l'issue de la journée, vous saurez :`,
    ...objectifs.map((o) => `- ${o}`),
    ...texteSequences,
    ``,
    suite ? `En prolongement, un second axe ressort : ${suite.titre}.` : null,
    ``,
    `VOS DROITS FORMATION`,
    ...financement,
    ``,
    cta ? `${CTA_LIBELLE} : ${cta}` : null,
    ``,
    signature.nom,
    signature.titre ? `${signature.titre} — ${of.name}` : of.name,
    signature.phone ? signature.phone : null,
    of.addressFull ?? '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  // ── version HTML ─────────────────────────────────────────────────────────
  const objectifsHtml = objectifs
    .map((o) => `<li style="margin-bottom:6px;">${escapeHtml(o)}</li>`)
    .join('');

  const sequencesHtml = surMesure
    ? surMesure.sequences
        .map(
          (s) => `
      <div style="margin:18px 0; padding-left:14px; border-left:3px solid ${BRAND_DARK};">
        <div style="font-size:9pt; text-transform:uppercase; letter-spacing:0.5px; color:#94A3B8;">${escapeHtml(MOMENTS[s.moment])}</div>
        <div style="font-weight:600; color:${BRAND_DARK}; margin-top:2px;">${escapeHtml(s.titre)}</div>
        <div style="font-size:10pt; color:#475569; font-style:italic; margin:4px 0 8px 0;">${escapeHtml(s.pourquoiVous)}</div>
        <ul style="margin:0; padding-left:18px; font-size:10pt;">
          ${s.points.map((p) => `<li style="margin-bottom:4px;">${escapeHtml(p.texte)}</li>`).join('')}
        </ul>
      </div>`,
        )
        .join('')
    : `<div style="font-size:10pt; white-space:pre-wrap; margin:16px 0;">${escapeHtml(produit.programmeMd)}</div>`;

  const financementHtml = financement
    .map((p) => `<p style="margin:0 0 8px 0;">${escapeHtml(p)}</p>`)
    .join('');

  // UN SEUL bouton, et rien d'autre de cliquable dans le corps.
  const ctaHtml = cta
    ? `
      <div style="text-align:center; margin:28px 0 8px 0;">
        <a href="${escapeHtml(cta)}" style="display:inline-block; background:${BRAND_DARK}; color:#ffffff; text-decoration:none; font-weight:600; font-size:11pt; padding:14px 26px; border-radius:6px;">${escapeHtml(CTA_LIBELLE)}</a>
      </div>
      <p style="margin:0; text-align:center; font-size:9pt; color:#94A3B8;">
        On regarde ensemble ce qui est finançable et ce qu'il vous reste de droits. Sans engagement.
      </p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#F1F5F9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color:#1F2937; line-height:1.5;">
  <div style="max-width:600px; margin:24px auto; background:white; border-radius:8px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${BRAND_DARK}; padding:28px 32px; text-align:center; color:white;">
      <h1 style="margin:0; font-size:18pt; font-weight:700; letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>

    <div style="padding:32px;">
      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>

      <p style="margin:0 0 16px 0;">
        Merci d'avoir pris 90 secondes sur notre stand. Voici la journée que votre diagnostic
        fait ressortir — construite sur vos réponses, pas sur un catalogue générique.
      </p>

      <div style="background:${BRAND_LIGHT_BG}; border-radius:6px; padding:16px; margin:16px 0;">
        <div style="font-size:9pt; text-transform:uppercase; letter-spacing:0.5px; color:${BRAND_DARK};">Votre priorité</div>
        <strong style="font-size:12pt; color:${BRAND_DARK};">${escapeHtml(probl.titre)}</strong>
        <p style="margin:8px 0 0 0; font-size:10pt;">${escapeHtml(accroche)}</p>
      </div>

      <h2 style="margin:28px 0 4px 0; font-size:14pt; color:${BRAND_DARK};">${escapeHtml(produit.title)}</h2>
      <p style="margin:0 0 16px 0; font-size:10pt; color:#64748B;">${escapeHtml(duree)}</p>

      <h3 style="margin:20px 0 8px 0; font-size:11pt; color:${BRAND_DARK};">À l'issue de la journée, vous saurez</h3>
      <ul style="margin:0; padding-left:18px; font-size:10pt;">${objectifsHtml}</ul>

      <h3 style="margin:24px 0 8px 0; font-size:11pt; color:${BRAND_DARK};">Le déroulé de votre journée</h3>
      ${sequencesHtml}

      ${
        suite
          ? `<p style="margin:20px 0 0 0; font-size:10pt; color:#64748B;">En prolongement, un second axe ressort de vos réponses : « ${escapeHtml(suite.titre)} ».</p>`
          : ''
      }

      <div style="background:#F8FAFC; border-left:3px solid ${BRAND_DARK}; padding:14px 16px; margin:24px 0; font-size:10pt;">
        <strong style="color:${BRAND_DARK}; display:block; margin-bottom:8px;">Vos droits formation</strong>
        ${financementHtml}
      </div>

      ${ctaHtml}

      <p style="margin:28px 0 0 0; font-size:10pt; color:#475569;">
        <strong>${escapeHtml(signature.nom)}</strong><br>
        ${signature.titre ? `${escapeHtml(signature.titre)} — ` : ''}${escapeHtml(of.name)}${signature.phone ? `<br>${escapeHtml(signature.phone)}` : ''}
      </p>
    </div>

    <div style="background:#F8FAFC; padding:16px 32px; border-top:1px solid #E2E8F0; font-size:9pt; color:#64748B; text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
      ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
