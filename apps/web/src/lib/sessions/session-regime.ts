import { legalLinkAtSession, type PeriodLink, type SessionPeriod } from '@/lib/persons/legal-link-period';
import { releveDeLaConvention, estEmployeurDeLApprenant } from './payer-rule';

export type SessionRegime = 'ENTREPRISE' | 'INDIVIDUEL';
export type SessionPrice = { regime?: SessionRegime | null; priceTotalHT?: unknown };

/** Source contractuelle unique. Les sessions historiques gardent leur calcul. */
export function sessionTotalHT(session: SessionPrice, participants: readonly { priceHT: unknown }[]): number {
  if (session.regime !== 'ENTREPRISE') return participants.reduce((sum, p) => sum + Number(p.priceHT), 0);
  const total = Number(session.priceTotalHT);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Renseignez le prix total HT dans le régime de la fiche session.');
  return total;
}

/** Parts techniques des tableaux existants, jamais la source du prix contractuel.
 * Tri stable + centimes : le troisième inscrit redistribue 240 €, il n'ajoute rien.
 */
export function allocateCompanyPrice(total: number, ids: readonly string[]): Record<string, number> {
  if (!Number.isFinite(total) || total <= 0 || Math.abs(total * 100 - Math.round(total * 100)) > 0.00001) {
    throw new Error('Le prix total doit être positif avec au plus deux décimales.');
  }
  const sorted = [...new Set(ids)].sort();
  if (sorted.length === 0) return {};
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / sorted.length);
  const rest = cents % sorted.length;
  return Object.fromEntries(sorted.map((id, i) => [id, (base + (i < rest ? 1 : 0)) / 100]));
}

export function refusalForSessionPayer(
  regime: SessionRegime | null | undefined,
  payer: { sponsorLegalForm?: string | null; roleChezSponsor?: string | null; name: string },
): string | null {
  if (!regime) return null;
  if (!payer.sponsorLegalForm) return `${payer.name} : forme juridique du payeur absente. Corrigez l’organisation commanditaire dans sa fiche avant l’inscription.`;
  const company = releveDeLaConvention({ sponsorLegalForm: payer.sponsorLegalForm, roleChezSponsor: payer.roleChezSponsor });
  if ((regime === 'ENTREPRISE') === company) return null;
  return `${payer.name} : le payeur ne correspond pas au régime ${regime} de cette session. Corrigez l’organisation commanditaire depuis la fiche d’inscription ou choisissez une session ${company ? 'ENTREPRISE' : 'INDIVIDUEL'}.`;
}

/** Fonds du rattachement actif CHEZ le payeur, sans repli sur une EI étrangère. */
export function sessionFunding(input: {
  sponsorOrgId: string; sponsorOpcoCode?: string | null; sponsorAgeficeProfile?: unknown; links: readonly PeriodLink[];
  session: SessionPeriod; financingMode?: string | null;
}): string | null {
  if (['AUTOFINANCEMENT', 'ENTREPRISE'].includes(input.financingMode ?? '')) return null;
  const link = legalLinkAtSession(input.links, input.sponsorOrgId, input.session);
  if (!link) return null;
  const code = input.sponsorOpcoCode?.trim() || null;
  if (estEmployeurDeLApprenant(link.role)) return code === 'AGEFICE' ? null : code;
  if (['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT'].includes(link.role) && input.sponsorAgeficeProfile != null) return 'AGEFICE';
  return ['EI_SELF', 'AGENT_COMMERCIAL', 'DIRIGEANT'].includes(link.role) ? code : null;
}
