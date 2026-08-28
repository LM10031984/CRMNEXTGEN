/**
 * Ce qui manque AVANT de générer les documents d'entreprise — SOURCE UNIQUE.
 *
 * Demande de Laurent (28/08) : « avoir des garde-fous qui me le disent avant la
 * génération pour que je les saisisse ». Jusqu'ici, le manque n'apparaissait
 * qu'APRÈS coup, dans le message d'erreur du cœur — après avoir cliqué, attendu,
 * et pour l'analyse des besoins, après un appel IA payé pour rien.
 *
 * Ce helper énonce AVANT ce que les cœurs refusent APRÈS. Les deux doivent
 * rester d'accord : un garde-fou qui laisse passer ce qu'un cœur refuse est
 * pire que pas de garde-fou. Toute nouvelle garde dans
 * `generateConventionEntrepriseCore` ou `generateAnalyseBesoinEntrepriseCore`
 * se reflète ici.
 *
 * Même forme que `SessionCompletenessBlocker` (clé stable + libellé + où
 * corriger), pour que l'UI se comporte comme le reste de la fiche session.
 *
 * MODULE NEUTRE et PUR : aucune lecture, aucune écriture — il reçoit ce qu'il
 * juge. Importable depuis une page RSC comme depuis un test.
 */

export type BlocageDocEntrepriseKey =
  | 'representant_manquant'
  | 'prix_manquants'
  | 'produit_manquant';

/** Document d'entreprise concerné par un blocage. */
export type DocEntreprise = 'convention' | 'analyse';

export interface BlocageDocEntreprise {
  key: BlocageDocEntrepriseKey;
  /** Ce qui manque, dit à l'utilisateur (français, nomme les personnes). */
  label: string;
  /** Où et comment corriger. */
  hint: string;
  /** Lien direct vers l'endroit où saisir. */
  href?: string;
  /** Documents que ce manque empêche de produire. */
  documents: DocEntreprise[];
}

export interface BlocagesInput {
  org: {
    id: string;
    legalName: string;
    representative?: string | null;
    /** Un contact principal existe : il sert de repli au représentant légal. */
    aContactPrincipal: boolean;
  };
  /** Salariés de CE commanditaire inscrits à la session. */
  participants: { nom: string; priceHT: number }[];
  /** La session porte-t-elle un produit de formation ? */
  produitPresent: boolean;
}

export function blocagesDocsEntreprise(input: BlocagesInput): BlocageDocEntreprise[] {
  const blocages: BlocageDocEntreprise[] = [];

  // 1. Représentant — c'est lui qui SIGNE la convention et auprès de qui le
  //    besoin est recueilli. Repli sur le contact principal, comme les cœurs.
  const representant = (input.org.representative ?? '').trim();
  if (!representant && !input.org.aContactPrincipal) {
    blocages.push({
      key: 'representant_manquant',
      label: `Aucun représentant légal pour « ${input.org.legalName} »`,
      hint: 'Renseignez le représentant sur la fiche entreprise (ou désignez un contact principal) : c’est lui qui signe la convention et auprès de qui le besoin est recueilli.',
      href: `/app/organisations/${input.org.id}`,
      documents: ['convention', 'analyse'],
    });
  }

  // 2. Prix — la convention somme les priceHT BRUTS, sans jamais retomber sur
  //    le prix produit : elle annoncerait un montant différent de la facture
  //    groupée. L'analyse des besoins, elle, ne parle pas d'argent.
  const sansPrix = input.participants.filter((p) => !(p.priceHT > 0));
  if (sansPrix.length > 0) {
    const noms = sansPrix.map((p) => p.nom).join(', ');
    blocages.push({
      key: 'prix_manquants',
      label: `Tarif non renseigné : ${noms}`,
      hint: 'Le montant de la convention est la somme des tarifs des salariés inscrits — le compléter ici évite qu’elle annonce autre chose que la facture.',
      href: '#section-participants',
      documents: ['convention'],
    });
  }

  // 3. Produit — les deux documents décrivent la formation envisagée.
  if (!input.produitPresent) {
    blocages.push({
      key: 'produit_manquant',
      label: 'Aucun produit de formation lié à la session',
      hint: 'Rattachez le produit à la session : titre, durée et programme en sont tirés.',
      documents: ['convention', 'analyse'],
    });
  }

  return blocages;
}

/** Blocages qui empêchent CE document précis. */
export function blocagesPourDocument(
  blocages: ReadonlyArray<BlocageDocEntreprise>,
  doc: DocEntreprise,
): BlocageDocEntreprise[] {
  return blocages.filter((b) => b.documents.includes(doc));
}
