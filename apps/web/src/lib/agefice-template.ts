/**
 * Template HTML "demande de prise en charge AGEFICE" — V1 récapitulatif.
 *
 * Reproduit la structure du formulaire AGEFICE officiel avec tous les champs
 * pré-remplis. Quand Laurent fournira le PDF officiel, on bascule sur un
 * form-fill via pdf-lib (les noms de champs PDF sont déjà mappés ci-dessous).
 */

export interface AgeficePdfData {
  // Stagiaire (Person + SensitiveData)
  stagiaireNom: string;
  stagiairePrenom: string;
  stagiaireNomNaissance: string | null;
  stagiaireDateNaissance: Date | null;
  stagiaireLieuNaissance: string | null;
  stagiaireSecu: string | null;
  stagiaireEmail: string | null;
  stagiaireTel: string | null;
  stagiaireAdresse: string | null;
  stagiaireCp: string | null;
  stagiaireVille: string | null;
  // Entreprise (Organization EI)
  entrepriseRaisonSociale: string;
  entrepriseSiret: string | null;
  entrepriseSiren: string | null;
  entrepriseNaf: string | null;
  entrepriseFormeJuridique: string;
  entrepriseRcs: string | null;
  entrepriseAdresse: string | null;
  entrepriseCp: string | null;
  entrepriseVille: string | null;
  entrepriseTel: string | null;
  entrepriseEmail: string | null;
  entrepriseActivite: string | null;
  // Bancaire (AgeficeProfile.paFields ou BillingProfile)
  iban: string | null;
  bic: string | null;
  banque: string | null;
  // Affiliation AGEFICE
  paName: string | null; // Nom du Point d'Accueil
  paAddress: string | null;
  paContact: string | null;
  affiliationUrssaf: string | null;
  // Formation
  formationTitre: string;
  formationCode: string;
  formationDureeHeures: number;
  formationDateDebut: Date;
  formationDateFin: Date;
  formationLieu: string | null;
  formationModalite: string;
  formationFormateur: string;
  formationTarifHT: number;
  formationTarifTotal: number; // pour la session si applicable
  // OF
  ofName: string;
  ofSiret: string;
  ofRnq: string;
  ofAddress: string;
  ofPhone: string;
  ofEmail: string;
  // Date de la demande
  demandeDate: Date;
}

const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDateLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

function fmtSecu(s: string | null): string {
  if (!s) return '';
  // Format français : 1 23 45 67 890 123 / 12
  const d = s.replace(/\D/g, '');
  if (d.length < 13) return s;
  return `${d.slice(0, 1)} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 10)} ${d.slice(10, 13)} ${d.length >= 15 ? '/ ' + d.slice(13, 15) : ''}`;
}

function fmtSiret(s: string | null): string {
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  if (d.length !== 14) return s;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9, 14)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function f(v: string | null | undefined): string {
  return v ? escapeHtml(String(v)) : '<span class="empty">__________</span>';
}

const STYLES = `
<style>
  @page { size: A4; margin: 14mm 16mm; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 10pt;
    color: #111;
    line-height: 1.4;
    margin: 0;
  }
  header.cover {
    border: 2px solid #00527A;
    padding: 12px 16px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #F8FAFC;
  }
  header.cover h1 {
    font-size: 14pt;
    color: #00527A;
    margin: 0;
    letter-spacing: 0.5px;
  }
  header.cover .meta {
    font-size: 8pt;
    color: #555;
    text-align: right;
  }
  h2 {
    font-size: 11pt;
    color: white;
    background: #00527A;
    padding: 4px 10px;
    margin: 14px 0 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  table.fields {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  table.fields td {
    padding: 4px 6px;
    border-bottom: 1px solid #E5E7EB;
    vertical-align: top;
  }
  table.fields td.label {
    color: #555;
    width: 38%;
    font-size: 8.5pt;
  }
  table.fields td.value {
    font-weight: 500;
  }
  .empty { color: #B0B0B0; letter-spacing: 1px; }
  .signature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 18px;
  }
  .signature-grid > div {
    border: 1px dashed #94A3B8;
    border-radius: 4px;
    padding: 10px 12px;
    min-height: 80px;
    font-size: 9pt;
  }
  .signature-grid .label { color: #555; font-size: 8pt; margin-bottom: 4px; }
  footer {
    margin-top: 18px;
    border-top: 1px solid #E5E7EB;
    padding-top: 8px;
    font-size: 7.5pt;
    color: #666;
    text-align: center;
  }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
</style>
`;

export function renderAgeficeHtml(d: AgeficePdfData): string {
  const adresseStagiaire = [d.stagiaireAdresse, d.stagiaireCp, d.stagiaireVille].filter(Boolean).join(' · ') || null;
  const adresseEntreprise = [d.entrepriseAdresse, d.entrepriseCp, d.entrepriseVille].filter(Boolean).join(' · ') || null;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Demande AGEFICE — ${escapeHtml(d.stagiaireNom)} ${escapeHtml(d.stagiairePrenom)}</title>
${STYLES}
</head>
<body>

<header class="cover">
  <div>
    <h1>Demande de prise en charge AGEFICE</h1>
    <div style="font-size: 8.5pt; color: #444; margin-top: 4px;">
      Récapitulatif généré par <strong>${escapeHtml(d.ofName)}</strong> — version pré-remplie automatiquement
    </div>
  </div>
  <div class="meta">
    <div>${fmtDateLong.format(d.demandeDate)}</div>
    <div><strong>${escapeHtml(d.formationCode)}</strong></div>
  </div>
</header>

<h2>1. Stagiaire</h2>
<div class="grid-2">
  <table class="fields">
    <tr><td class="label">Nom</td><td class="value">${f(d.stagiaireNom)}</td></tr>
    <tr><td class="label">Prénom</td><td class="value">${f(d.stagiairePrenom)}</td></tr>
    <tr><td class="label">Nom de naissance</td><td class="value">${f(d.stagiaireNomNaissance)}</td></tr>
    <tr><td class="label">Date de naissance</td><td class="value">${d.stagiaireDateNaissance ? fmtDate.format(d.stagiaireDateNaissance) : f(null)}</td></tr>
    <tr><td class="label">Lieu de naissance</td><td class="value">${f(d.stagiaireLieuNaissance)}</td></tr>
    <tr><td class="label">N° Sécurité sociale</td><td class="value font-mono">${f(fmtSecu(d.stagiaireSecu))}</td></tr>
  </table>
  <table class="fields">
    <tr><td class="label">Email</td><td class="value">${f(d.stagiaireEmail)}</td></tr>
    <tr><td class="label">Téléphone</td><td class="value">${f(d.stagiaireTel)}</td></tr>
    <tr><td class="label">Adresse</td><td class="value">${f(d.stagiaireAdresse)}</td></tr>
    <tr><td class="label">Code postal</td><td class="value">${f(d.stagiaireCp)}</td></tr>
    <tr><td class="label">Ville</td><td class="value">${f(d.stagiaireVille)}</td></tr>
  </table>
</div>

<h2>2. Entreprise (auto-entreprise / EI)</h2>
<div class="grid-2">
  <table class="fields">
    <tr><td class="label">Raison sociale</td><td class="value">${f(d.entrepriseRaisonSociale)}</td></tr>
    <tr><td class="label">SIRET</td><td class="value font-mono">${f(fmtSiret(d.entrepriseSiret))}</td></tr>
    <tr><td class="label">SIREN</td><td class="value font-mono">${f(d.entrepriseSiren)}</td></tr>
    <tr><td class="label">Code APE / NAF</td><td class="value font-mono">${f(d.entrepriseNaf)}</td></tr>
    <tr><td class="label">Forme juridique</td><td class="value">${f(d.entrepriseFormeJuridique)}</td></tr>
    <tr><td class="label">RCS</td><td class="value">${f(d.entrepriseRcs)}</td></tr>
  </table>
  <table class="fields">
    <tr><td class="label">Adresse</td><td class="value">${f(d.entrepriseAdresse)}</td></tr>
    <tr><td class="label">Code postal · Ville</td><td class="value">${f([d.entrepriseCp, d.entrepriseVille].filter(Boolean).join(' '))}</td></tr>
    <tr><td class="label">Téléphone</td><td class="value">${f(d.entrepriseTel)}</td></tr>
    <tr><td class="label">Email</td><td class="value">${f(d.entrepriseEmail)}</td></tr>
    <tr><td class="label">Activité principale</td><td class="value">${f(d.entrepriseActivite)}</td></tr>
  </table>
</div>

<h2>3. Coordonnées bancaires (RIB)</h2>
<table class="fields">
  <tr><td class="label" style="width:18%">IBAN</td><td class="value font-mono">${f(d.iban)}</td></tr>
  <tr><td class="label">BIC</td><td class="value font-mono">${f(d.bic)}</td></tr>
  <tr><td class="label">Banque</td><td class="value">${f(d.banque)}</td></tr>
</table>

<h2>4. Point d'Accueil AGEFICE rattaché</h2>
<table class="fields">
  <tr><td class="label" style="width:18%">Nom du PA</td><td class="value">${f(d.paName)}</td></tr>
  <tr><td class="label">Adresse PA</td><td class="value">${f(d.paAddress)}</td></tr>
  <tr><td class="label">Contact PA</td><td class="value">${f(d.paContact)}</td></tr>
  <tr><td class="label">N° affiliation URSSAF</td><td class="value font-mono">${f(d.affiliationUrssaf)}</td></tr>
</table>

<h2>5. Formation demandée</h2>
<table class="fields">
  <tr><td class="label" style="width:25%">Intitulé</td><td class="value"><strong>${f(d.formationTitre)}</strong></td></tr>
  <tr><td class="label">Code session</td><td class="value font-mono">${f(d.formationCode)}</td></tr>
  <tr><td class="label">Dates</td><td class="value">du ${fmtDate.format(d.formationDateDebut)} au ${fmtDate.format(d.formationDateFin)}</td></tr>
  <tr><td class="label">Durée</td><td class="value">${d.formationDureeHeures} heures</td></tr>
  <tr><td class="label">Modalité</td><td class="value">${f(d.formationModalite)}</td></tr>
  <tr><td class="label">Lieu</td><td class="value">${f(d.formationLieu)}</td></tr>
  <tr><td class="label">Formateur</td><td class="value">${f(d.formationFormateur)}</td></tr>
  <tr><td class="label">Tarif HT par stagiaire</td><td class="value tabular-nums"><strong>${fmtEUR.format(d.formationTarifHT)}</strong></td></tr>
</table>

<h2>6. Organisme de formation</h2>
<table class="fields">
  <tr><td class="label" style="width:18%">Raison sociale</td><td class="value">${f(d.ofName)}</td></tr>
  <tr><td class="label">SIRET</td><td class="value font-mono">${f(d.ofSiret)}</td></tr>
  <tr><td class="label">N° déclaration (RNQ)</td><td class="value font-mono">${f(d.ofRnq)}</td></tr>
  <tr><td class="label">Adresse</td><td class="value">${f(d.ofAddress)}</td></tr>
  <tr><td class="label">Téléphone · Email</td><td class="value">${f(d.ofPhone)} · ${f(d.ofEmail)}</td></tr>
</table>

<div class="signature-grid">
  <div>
    <div class="label">Le Stagiaire — Lu et approuvé</div>
    <strong>${escapeHtml(`${d.stagiairePrenom} ${d.stagiaireNom}`)}</strong>
    <div style="margin-top: 8px; font-size: 8pt;">Date et signature :</div>
  </div>
  <div>
    <div class="label">L'Organisme de formation — Lu et approuvé</div>
    <strong>${escapeHtml(d.ofName)}</strong>
    <div style="margin-top: 8px; font-size: 8pt;">Cachet, date et signature :</div>
  </div>
</div>

<footer>
  Document généré automatiquement par QualiOF — données extraites de la fiche apprenant + auto-entreprise.<br>
  ${escapeHtml(d.ofName)} · SIRET ${escapeHtml(d.ofSiret)} · Déclaration ${escapeHtml(d.ofRnq)}
</footer>

</body>
</html>`;
}
