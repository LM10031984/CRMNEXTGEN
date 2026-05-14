import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { validateRequest } from '@/lib/auth';
import { getQualiopiBilan } from '@/lib/qualiopi-bilan-stats';
import { loadOfConfig } from '@/lib/of-config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { user } = await validateRequest();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const of = await loadOfConfig(user.tenantId);

  const url = new URL(req.url);
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year)) return new NextResponse('Year invalide', { status: 400 });

  const bilan = await getQualiopiBilan(user.tenantId, year);

  // Construit les données du tableau au format aligné sur le DOCX
  // "C1.i2_Indicateurs de résultats et bilan_v1.xlsx" fourni par Laurent.
  const headers = [
    'formation',
    'Formateur en charge',
    'DATES',
    'Nbre heures de formation',
    'Nbre de stagiaires prévu',
    'Nbre de stagiaires présents',
    'Nbre de stagiaires absent',
    "Cause de l'absence",
    'Nbre de stagiaires ayant abandonné',
    "Cause de l'abandon",
    'Note moyenne de la satisfaction stagiaire /5',
    'Taux de recommandation %',
    "Prix payé par l'entreprise TTC",
  ];

  const rows = bilan.rows.map((r) => [
    r.formationTitre,
    r.formateur,
    r.datesLabel,
    r.nbHeures,
    r.nbStagiairesPrevu,
    r.nbStagiairesPresents,
    r.nbStagiairesAbsents,
    r.causeAbsence,
    r.nbStagiairesAbandonnes,
    r.causeAbandon,
    r.noteMoyenneSatisfaction != null ? Number(r.noteMoyenneSatisfaction.toFixed(2)) : '',
    r.tauxRecommandation != null ? Number(r.tauxRecommandation.toFixed(0)) : '',
    Math.round(r.prixTTC),
  ]);

  const totalRow = [
    'BILAN',
    '',
    '',
    bilan.total.nbHeures,
    bilan.total.nbStagiairesPrevu,
    bilan.total.nbStagiairesPresents,
    bilan.total.nbStagiairesAbsents,
    '',
    bilan.total.nbStagiairesAbandonnes,
    '',
    bilan.total.noteMoyenneSatisfaction != null
      ? Number(bilan.total.noteMoyenneSatisfaction.toFixed(2))
      : '',
    bilan.total.tauxRecommandation != null
      ? Number(bilan.total.tauxRecommandation.toFixed(0))
      : '',
    Math.round(bilan.total.prixTTC),
  ];

  const sheetData = [
    [`TABLEAU DE SUIVI DES FORMATIONS ANIMÉES ANNÉE ${year}`],
    [],
    headers,
    ...rows,
    totalRow,
    [],
    [
      `${of.name} – Siège social : ${of.addressStreet} ${of.addressCp} ${of.addressVille}`,
    ],
    [
      `SIRET : ${of.siret} NDA ${of.rnq} - Coordonnées de contact : ${of.email} - ${of.phone}`,
    ],
    [`Version 01 vérifié du ${new Date().toLocaleDateString('fr-FR')}`],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Largeurs de colonnes (en caractères)
  ws['!cols'] = [
    { wch: 40 }, // formation
    { wch: 22 }, // formateur
    { wch: 26 }, // dates
    { wch: 10 }, // heures
    { wch: 9 },
    { wch: 9 },
    { wch: 9 },
    { wch: 22 }, // cause absence
    { wch: 9 },
    { wch: 22 }, // cause abandon
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  // Fusionne le titre sur toutes les colonnes
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Bilan ${year}`);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="C1.i2_Bilan_Qualiopi_${year}.xlsx"`,
    },
  });
}
