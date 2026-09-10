/**
 * « À corriger » — ce qui fausse le chiffre, chiffré (Laurent 2026-09-10).
 *
 * Né d'un cas concret : SES-0100 était comptée 30 240 € (10 inscrits au tarif
 * du produit 72 h) alors que la formation vendue était UNE journée à 336 €,
 * soit 3 360 €. Le prix était pourtant cohérent avec le produit rattaché — donc
 * invisible pour un contrôle de prix. C'est le produit qui ne correspondait pas
 * à ce qui avait été fait, et rien dans l'application ne pouvait le dire :
 * ni créneau saisi, ni facture émise.
 *
 * Ce module ne corrige rien et ne masque rien. Il pose des questions, avec un
 * montant en face de chacune, pour que la décision reste à Laurent.
 *
 * Les quatre familles, dans l'ordre où elles coûtent cher :
 *  1. sessions passées restées en brouillon ;
 *  2. inscrits jamais passés à « a suivi » sur une session terminée ;
 *  3. prix d'inscription qui ne colle pas au produit ;
 *  4. sessions terminées et vendues, mais sans aucune facture.
 */

import { prisma } from '@qualiof/db';

export interface LigneAnomalie {
  sessionId: string;
  code: string;
  libelle: string;
  date: Date;
  /** Montant en jeu (EUR HT) — ce que la ligne pèse dans le CA affiché. */
  montant: number;
  /** Précision lisible : « 10 inscrits à 3 024 € », « attendu 672 € »… */
  detail: string;
}

export interface FamilleAnomalies {
  cle: 'brouillons' | 'statuts' | 'prix' | 'sans-facture';
  titre: string;
  /** Ce que la famille change si on la traite. */
  explication: string;
  montant: number;
  lignes: LigneAnomalie[];
}

export async function getAnomaliesPilotage(
  tenantId: string,
  annee: number,
): Promise<FamilleAnomalies[]> {
  const start = new Date(Date.UTC(annee, 0, 1));
  const end = new Date(Date.UTC(annee + 1, 0, 1));
  const maintenant = new Date();

  const sessions = await prisma.trainingSession.findMany({
    where: { tenantId, startDate: { gte: start, lt: end } },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      product: { select: { code: true, title: true, priceHT: true, groupFlatPrice: true } },
      participants: {
        select: { id: true, priceHT: true, enrollmentStatus: true },
      },
    },
    orderBy: { startDate: 'asc' },
  });

  const idsAvecFacture = new Set(
    (
      await prisma.invoice.findMany({
        where: { tenantId, sessionId: { in: sessions.map((s) => s.id) } },
        select: { sessionId: true },
      })
    )
      .map((i) => i.sessionId)
      .filter((x): x is string => !!x),
  );
  const participantsFactures = new Set(
    (
      await prisma.invoice.findMany({
        where: { tenantId, participantId: { not: null } },
        select: { participantId: true },
      })
    )
      .map((i) => i.participantId)
      .filter((x): x is string => !!x),
  );

  const brouillons: LigneAnomalie[] = [];
  const statuts: LigneAnomalie[] = [];
  const prix: LigneAnomalie[] = [];
  const sansFacture: LigneAnomalie[] = [];

  for (const s of sessions) {
    if (s.participants.length === 0) continue;
    const total = s.participants.reduce((a, p) => a + Number(p.priceHT ?? 0), 0);
    const libelle = s.name ?? s.product?.title ?? s.code;
    const terminee = s.endDate < maintenant;

    // 1. Une session passée encore en brouillon n'a jamais été validée — et
    //    pèse pourtant de plein droit dans le CA « réalisé ».
    if (s.status === 'DRAFT' && terminee) {
      brouillons.push({
        sessionId: s.id,
        code: s.code,
        libelle,
        date: s.startDate,
        montant: total,
        detail: `${s.participants.length} inscrit${s.participants.length > 1 ? 's' : ''}, session terminée jamais validée`,
      });
    }

    // 2. Sur une session terminée, un inscrit resté « pré-inscrit » ou
    //    « confirmé » est du CA que rien n'étaye : ni présence constatée, ni
    //    désinscription. On ne peut pas trancher à sa place — on le montre.
    if (terminee) {
      const enAttente = s.participants.filter(
        (p) => p.enrollmentStatus === 'PRE_ENROLLED' || p.enrollmentStatus === 'CONFIRMED',
      );
      if (enAttente.length > 0) {
        const montant = enAttente.reduce((a, p) => a + Number(p.priceHT ?? 0), 0);
        statuts.push({
          sessionId: s.id,
          code: s.code,
          libelle,
          date: s.startDate,
          montant,
          detail: `${enAttente.length}/${s.participants.length} inscrit${enAttente.length > 1 ? 's' : ''} jamais passé${enAttente.length > 1 ? 's' : ''} à « a suivi »`,
        });
      }
    }

    // 3. Prix d'inscription ≠ tarif du produit (hors forfait groupe, qui a sa
    //    propre règle : le forfait divisé entre les inscrits).
    const prixProduit = Number(s.product?.priceHT ?? 0);
    const forfait = s.product?.groupFlatPrice ? Number(s.product.groupFlatPrice) : null;
    const attendu = forfait ?? prixProduit * s.participants.length;
    const ecart = total - attendu;
    if (Math.abs(ecart) > 1) {
      prix.push({
        sessionId: s.id,
        code: s.code,
        libelle,
        date: s.startDate,
        montant: ecart,
        detail: `${total.toLocaleString('fr-FR')} € portés contre ${attendu.toLocaleString('fr-FR')} € attendus (${s.product?.code ?? '—'})`,
      });
    }

    // 4. Une session terminée et vendue dont AUCUNE facture n'existe DANS
    //    QUALIOF. Laurent, 10/09/2026 : ses factures partent aujourd'hui depuis
    //    un tableau de suivi tenu à part — l'absence de facture ici ne prouve
    //    donc pas qu'elle n'a pas été émise, seulement que l'outil l'ignore.
    //    La ligne reste utile (le suivi de trésorerie est aveugle sur ce
    //    montant) mais elle ne doit accuser personne.
    if (terminee && total > 0) {
      const aUneFacture =
        idsAvecFacture.has(s.id) || s.participants.some((p) => participantsFactures.has(p.id));
      if (!aUneFacture) {
        sansFacture.push({
          sessionId: s.id,
          code: s.code,
          libelle,
          date: s.startDate,
          montant: total,
          detail: `${s.participants.length} inscrit${s.participants.length > 1 ? 's' : ''}, aucune facture émise`,
        });
      }
    }
  }

  const total = (l: LigneAnomalie[]) => l.reduce((a, x) => a + x.montant, 0);
  const parMontant = (a: LigneAnomalie, b: LigneAnomalie) =>
    Math.abs(b.montant) - Math.abs(a.montant);

  const familles: FamilleAnomalies[] = [
    {
      cle: 'brouillons',
      titre: 'Sessions passées restées en brouillon',
      explication:
        'Elles comptent dans le CA réalisé alors qu’elles n’ont jamais été validées. À valider ou à supprimer.',
      montant: total(brouillons),
      lignes: brouillons.sort(parMontant),
    },
    {
      cle: 'statuts',
      titre: 'Inscrits sans présence constatée sur une session terminée',
      explication:
        'Ni « a suivi », ni désinscrit : leur CA repose sur un statut jamais mis à jour. L’émargement tranche.',
      montant: total(statuts),
      lignes: statuts.sort(parMontant),
    },
    {
      cle: 'prix',
      titre: 'Prix d’inscription différent du tarif du produit',
      explication:
        'Un écart négatif est souvent une remise consentie. Un écart positif est presque toujours une erreur de rattachement.',
      montant: total(prix),
      lignes: prix.sort(parMontant),
    },
    {
      cle: 'sans-facture',
      titre: 'Sessions vendues dont QualiOF ne connaît aucune facture',
      explication:
        'Ces formations ont peut-être été facturées ailleurs (tableau de suivi, SmartOF) : ce n’est pas un reproche, c’est la part de votre trésorerie sur laquelle cet écran ne peut rien dire.',
      montant: total(sansFacture),
      lignes: sansFacture.sort(parMontant),
    },
  ];
  return familles.filter((f) => f.lignes.length > 0);
}
