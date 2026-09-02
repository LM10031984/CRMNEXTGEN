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
const PAGE_BG = '#F3F7FA';
const INK = '#1F2937';
const MUTED = '#64748B';
const LINE = '#E2E8F0';

/**
 * Signature collective (décision Laurent, 02/09/2026) : le prospect a rencontré
 * une équipe sur le stand, il reçoit un email de l'équipe. Le prénom et le
 * portable du responsable restent en dessous — c'est un humain qu'on appelle.
 */
const signatureEquipe = (ofName: string) => `L'équipe ${ofName}`;
/** La patte de la maison, sous le nom — reste vraie quel que soit le produit. */
const TAGLINE = "Spécialistes de l'IA pour les professionnels de l'immobilier";

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
const CTA_SOUS_TEXTE =
  'Vous choisissez votre créneau, on regarde ensemble ce qui est finançable et ce qu\'il vous reste de droits. Sans engagement.';

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
/**
 * Qui signe. Exporté parce que les relances J+4 / J+10 signent la MÊME
 * personne : deux résolutions séparées, et le prospect reçoit un programme
 * signé Laurent puis une relance signée autrement.
 */
export function signataire(of: OfConfig): { nom: string; titre: string; phone: string } {
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
    ? surMesure.sequences.flatMap((s, i) => [
        ``,
        `${i + 1}. ${MOMENTS[s.moment]} — ${s.titre}`,
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
    cta ? CTA_SOUS_TEXTE : null,
    ``,
    signatureEquipe(of.name),
    TAGLINE,
    signature.phone ? `${signature.nom} — ${signature.phone}` : null,
    of.addressFull ?? '',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  // ── version HTML ─────────────────────────────────────────────────────────
  // Compatible clients mail : tables pour la structure, styles inline, aucune
  // image externe (rien à charger, rien à bloquer). Une seule couleur de marque.
  const objectifsHtml = objectifs
    .map(
      (o) => `
          <tr>
            <td valign="top" style="width:22px; padding:0 0 8px 0; color:${BRAND_DARK}; font-weight:700;">&#10003;</td>
            <td style="padding:0 0 8px 0; font-size:14px; line-height:1.5; color:${INK};">${escapeHtml(o)}</td>
          </tr>`,
    )
    .join('');

  const sequencesHtml = surMesure
    ? surMesure.sequences
        .map(
          (s, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0; border:1px solid ${LINE}; border-radius:10px; border-collapse:separate;">
        <tr>
          <td style="padding:16px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:${BRAND_DARK}; color:#ffffff; font-size:12px; font-weight:700; border-radius:14px; padding:3px 10px; white-space:nowrap;">${i + 1}</td>
              <td style="padding-left:10px; font-size:11px; letter-spacing:0.6px; text-transform:uppercase; color:${MUTED}; white-space:nowrap;">${escapeHtml(MOMENTS[s.moment])}</td>
            </tr></table>
            <div style="font-size:16px; font-weight:700; color:${BRAND_DARK}; margin:8px 0 4px 0; line-height:1.3;">${escapeHtml(s.titre)}</div>
            <div style="font-size:13px; color:${MUTED}; margin:0 0 10px 0; line-height:1.5;">${escapeHtml(s.pourquoiVous)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              ${s.points
                .map(
                  (p) => `
              <tr>
                <td valign="top" style="width:16px; padding:0 0 6px 0; color:${BRAND_DARK};">&bull;</td>
                <td style="padding:0 0 6px 0; font-size:14px; line-height:1.5; color:${INK};">${escapeHtml(p.texte)}</td>
              </tr>`,
                )
                .join('')}
            </table>
          </td>
        </tr>
      </table>`,
        )
        .join('')
    : `<div style="font-size:14px; line-height:1.6; white-space:pre-wrap; margin:16px 0; color:${INK};">${escapeHtml(produit.programmeMd)}</div>`;

  const financementHtml = financement
    .map((p) => `<p style="margin:0 0 8px 0; font-size:14px; line-height:1.55; color:${INK};">${escapeHtml(p)}</p>`)
    .join('');

  // UN SEUL bouton, et rien d'autre de cliquable dans le corps.
  const ctaHtml = cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:30px auto 6px auto;">
        <tr>
          <td style="background:${BRAND_DARK}; border-radius:999px;">
            <a href="${escapeHtml(cta)}" style="display:inline-block; color:#ffffff; text-decoration:none; font-weight:700; font-size:15px; padding:15px 30px; border-radius:999px;">${escapeHtml(CTA_LIBELLE)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px 0; text-align:center; font-size:12px; line-height:1.5; color:${MUTED};">${escapeHtml(CTA_SOUS_TEXTE)}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${PAGE_BG}; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color:${INK};">
  <!-- pré-en-tête : la ligne visible dans la liste des messages, avant l'ouverture -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(probl.titre)} — la journée assemblée sur vos réponses, et vos droits AGEFICE 2026.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 4px 18px rgba(0,82,122,0.10);">

          <!-- En-tête -->
          <tr>
            <td style="background:${BRAND_DARK}; padding:30px 36px 26px 36px;">
              <div style="font-size:22px; font-weight:800; letter-spacing:2px; color:#ffffff; text-transform:uppercase;">${escapeHtml(of.name)}</div>
              <div style="font-size:12px; letter-spacing:0.8px; color:#BFE3F5; margin-top:6px; text-transform:uppercase;">${escapeHtml(TAGLINE)}</div>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 36px 8px 36px;">
              <p style="margin:0 0 14px 0; font-size:16px; line-height:1.5;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
              <p style="margin:0 0 22px 0; font-size:15px; line-height:1.6; color:${INK};">
                Merci d'avoir pris 90 secondes sur notre stand. Voici la journée que votre diagnostic
                fait ressortir — construite sur vos réponses, pas sur un catalogue générique.
              </p>

              <!-- Votre priorité -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_LIGHT_BG}; border-radius:12px; border-left:5px solid ${BRAND_DARK}; border-collapse:separate;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:11px; letter-spacing:0.8px; text-transform:uppercase; color:${BRAND_DARK}; font-weight:700;">Votre priorité</div>
                    <div style="font-size:19px; font-weight:800; color:${BRAND_DARK}; margin:6px 0 8px 0; line-height:1.3;">${escapeHtml(probl.titre)}</div>
                    <p style="margin:0; font-size:14px; line-height:1.55; color:${INK};">${escapeHtml(accroche)}</p>
                  </td>
                </tr>
              </table>

              <!-- La journée -->
              <div style="margin:32px 0 4px 0; font-size:11px; letter-spacing:0.8px; text-transform:uppercase; color:${MUTED}; font-weight:700;">La journée qu'on vous propose</div>
              <h2 style="margin:0 0 6px 0; font-size:22px; line-height:1.25; color:${BRAND_DARK}; font-weight:800;">${escapeHtml(produit.title)}</h2>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;"><tr>
                <td style="background:${PAGE_BG}; color:${BRAND_DARK}; font-size:12px; font-weight:700; border-radius:999px; padding:5px 12px;">${escapeHtml(duree)}</td>
                <td style="padding-left:8px;"></td>
                <td style="background:${PAGE_BG}; color:${BRAND_DARK}; font-size:12px; font-weight:700; border-radius:999px; padding:5px 12px;">Présentiel</td>
                <td style="padding-left:8px;"></td>
                <td style="background:${PAGE_BG}; color:${BRAND_DARK}; font-size:12px; font-weight:700; border-radius:999px; padding:5px 12px;">IA &times; m&eacute;tier</td>
              </tr></table>

              <h3 style="margin:0 0 10px 0; font-size:15px; color:${BRAND_DARK}; font-weight:700;">À l'issue de la journée, vous saurez</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px 0;">${objectifsHtml}</table>

              <h3 style="margin:0 0 12px 0; font-size:15px; color:${BRAND_DARK}; font-weight:700;">Le déroulé de votre journée</h3>
              ${sequencesHtml}

              ${
                suite
                  ? `<p style="margin:18px 0 0 0; font-size:13px; line-height:1.5; color:${MUTED};">En prolongement, un second axe ressort de vos réponses : « ${escapeHtml(suite.titre)} ».</p>`
                  : ''
              }

              <!-- Vos droits formation -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 0 0; background:${PAGE_BG}; border-radius:12px; border-collapse:separate;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:11px; letter-spacing:0.8px; text-transform:uppercase; color:${BRAND_DARK}; font-weight:700;">Vos droits formation</div>
                    <div style="margin:6px 0 12px 0; line-height:1.1;">
                      <span style="font-size:30px; font-weight:800; color:${BRAND_DARK};">${AGEFICE.priseEnChargeJournee} €</span>
                      <span style="font-size:13px; color:${MUTED};"> pris en charge par l'AGEFICE pour cette journée</span>
                    </div>
                    ${financementHtml}
                  </td>
                </tr>
              </table>

              ${ctaHtml}

              <!-- Signature -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 26px 0; border-top:1px solid ${LINE};">
                <tr>
                  <td style="padding-top:20px; font-size:14px; line-height:1.6; color:${INK};">
                    <strong style="color:${BRAND_DARK};">${escapeHtml(signatureEquipe(of.name))}</strong><br>
                    <span style="color:${MUTED};">${escapeHtml(TAGLINE)}</span>${
                      signature.phone
                        ? `<br><span style="color:${MUTED};">${escapeHtml(signature.nom)} — ${escapeHtml(signature.phone)}</span>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Pied -->
          <tr>
            <td style="background:${PAGE_BG}; padding:16px 36px; border-top:1px solid ${LINE}; font-size:11px; line-height:1.6; color:${MUTED}; text-align:center;">
              <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
              ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
