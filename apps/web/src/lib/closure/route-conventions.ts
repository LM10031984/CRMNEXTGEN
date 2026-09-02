/**
 * Applique la règle payeur du 12/08 aux conventions d'une session — SOURCE UNIQUE.
 *
 * Payeur personne morale ⇒ UNE convention de groupe par commanditaire, signée
 * par le chef d'entreprise ; auto-payeur ⇒ chemin individuel. Jamais les deux
 * pour un même inscrit : la session porterait deux conventions contradictoires,
 * ce qui se voit en audit (constat du 21/08 sur SES-0107 / SES-0108).
 *
 * Extrait de `prepare-training.ts` le 28/08 : le helper y était privé, donc les
 * DEUX autres chemins qui génèrent des conventions en boucle ne l'utilisaient
 * pas — `sessions.addParticipant` (auto-génération à l'inscription) et
 * `closure-pack` (pack de fin de formation) fabriquaient encore une convention
 * NOMINATIVE au 1er salarié d'une entreprise, avant que la moindre convention
 * de groupe n'existe.
 *
 * MODULE NEUTRE, sans auth : il n'appelle que les cœurs `*Core`, jamais les
 * server actions. Il reste donc utilisable depuis un script tsx ou le worker,
 * comme `convention-core` lui-même. Les appelants qui ont un contexte de page
 * font leur `revalidatePath` — ce module ne touche pas au cache Next.
 *
 * Les groupes sont traités EN SÉRIE : `generateConventionEntrepriseCore`
 * supprime puis recrée des Documents de la même session ; deux appels
 * concurrents se marcheraient dessus.
 */

import { generateConventionCore, generateConventionEntrepriseCore } from './convention-core';
import { partitionByPayerRule } from '@/lib/sessions/payer-rule';

/**
 * Inscrit tel que les appelants doivent le charger — le commanditaire et sa
 * forme juridique sont nécessaires pour appliquer la règle payeur AVANT toute
 * génération.
 */
export interface RoutableParticipant {
  id: string;
  sponsorOrgId: string;
  sponsorOrg: { id: string; legalName: string; legalForm: string } | null;
  person: {
    firstName: string;
    lastName: string;
    /**
     * Casquettes de l'apprenant. On y cherche celle qui le relie AU
     * commanditaire : c'est elle qui dit si celui-ci est son employeur — donc
     * convention — ou s'il se forme à ses frais — donc contrat individuel.
     * Indispensable depuis le 02/09 pour les EI employeuses.
     */
    legalLinks: { organizationId: string; role: string }[];
  };
}

/** `select` partagé — une seule définition, pour que tous les chemins voient la même chose. */
export const ROUTABLE_PARTICIPANT_SELECT = {
  id: true,
  sponsorOrgId: true,
  sponsorOrg: { select: { id: true, legalName: true, legalForm: true } },
  person: {
    select: {
      firstName: true,
      lastName: true,
      legalLinks: { select: { organizationId: true, role: true } },
    },
  },
} as const;

/** Projection vers la forme attendue par les helpers purs de `payer-rule`. */
export function toPayerParticipants(participants: ReadonlyArray<RoutableParticipant>) {
  return participants.map((p) => ({
    id: p.id,
    sponsorOrgId: p.sponsorOrgId,
    sponsorLegalForm: p.sponsorOrg?.legalForm,
    sponsorName: p.sponsorOrg?.legalName,
    roleChezSponsor: roleChezSponsor(p),
  }));
}

/**
 * Le rôle de l'apprenant CHEZ SON COMMANDITAIRE, et nulle part ailleurs.
 *
 * Un apprenant porte souvent plusieurs casquettes (pattern immobilier : son
 * EI + son enseigne). Prendre « la première » donnerait un régime au hasard :
 * on ne retient que le lien vers l'organisation qui paye.
 */
export function roleChezSponsor(p: RoutableParticipant): string | null {
  return p.person?.legalLinks?.find((l) => l.organizationId === p.sponsorOrgId)?.role ?? null;
}

export interface ConventionRouting {
  /** Inscrits COUVERTS par une convention (groupe ou individuelle). */
  covered: number;
  groupsCount: number;
  individuelsCount: number;
  errors: { participantName: string; message: string }[];
}

export async function routeConventionsByPayerRule(
  tenantId: string,
  sessionId: string,
  participants: ReadonlyArray<RoutableParticipant>,
): Promise<ConventionRouting> {
  const { groups, individuels } = partitionByPayerRule(toPayerParticipants(participants));

  const errors: ConventionRouting['errors'] = [];
  // Compte les inscrits COUVERTS, pas le nombre d'appels : sinon la fiche
  // session afficherait « 1 convention / 8 inscrits » sur ASSALIT et
  // déclencherait à tort l'action de masse qui régénère des individuelles.
  let covered = 0;

  for (const g of groups) {
    const r = await generateConventionEntrepriseCore(tenantId, sessionId, g.sponsorOrgId).catch(
      (e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    if (r.ok) covered += g.participantIds.length;
    else
      errors.push({
        participantName: g.sponsorName ?? '(entreprise)',
        message: r.error ?? 'Erreur inconnue',
      });
  }

  const byId = new Map(participants.map((p) => [p.id, p]));
  await Promise.all(
    individuels.map(async (participantId) => {
      const p = byId.get(participantId);
      const name = p ? `${p.person.firstName} ${p.person.lastName}` : participantId;
      const r = await generateConventionCore(tenantId, participantId).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }));
      if (r.ok) covered += 1;
      else errors.push({ participantName: name, message: r.error ?? 'Erreur inconnue' });
    }),
  );

  return { covered, groupsCount: groups.length, individuelsCount: individuels.length, errors };
}
