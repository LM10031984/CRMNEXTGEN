/**
 * Résolution du signataire OF (spec 2026-09-04 §3 + D-1).
 *
 * « Le signataire OF est toujours le même : un TenantSignatory (nom, email,
 * rôle) configuré une fois dans les paramètres tenant. »
 *
 * Stratégie identique au reste des Paramètres organisme (of-config, D-01
 * hybride BDD/ENV) : ce qui est saisi en base gagne, sinon on retombe sur le
 * responsable OF déjà connu (`OF_RESP_*`). Aucune double saisie imposée à
 * Laurent pour une information qu'il a déjà renseignée.
 *
 * Règle métier n°4 gravée : **signataires résolus, jamais devinés**. Sans nom
 * ou sans email, on ne « tente » pas un envoi : on rend un refus nominatif que
 * l'appelant affiche tel quel.
 */

import type { OfConfig } from '../of-config';
import type { SignatoryOrder } from '@qualiof/shared';

/** Les 4 colonnes `Tenant.signatory*` (D-1). */
export interface TenantSignatoryRow {
  signatoryName: string | null;
  signatoryEmail: string | null;
  signatoryTitle: string | null;
  signatoryOrder: SignatoryOrder | null;
}

export interface ResolvedSignatory {
  name: string;
  email: string;
  title: string;
  /** D-3 — `AFTER` : l'OF signe après le client. */
  order: SignatoryOrder;
}

export type ResolveSignatoryResult =
  | { ok: true; signatory: ResolvedSignatory }
  | { ok: false; error: string };

function clean(v: string | null | undefined): string {
  return (v ?? '').trim();
}

export function resolveTenantSignatory(
  tenant: TenantSignatoryRow,
  of: OfConfig,
): ResolveSignatoryResult {
  const respName = clean(`${clean(of.resp?.prenom)} ${clean(of.resp?.nom)}`);

  const name = clean(tenant.signatoryName) || respName;
  const email = clean(tenant.signatoryEmail) || clean(of.resp?.email);
  const title = clean(tenant.signatoryTitle) || clean(of.resp?.titre);
  const order: SignatoryOrder = tenant.signatoryOrder ?? 'AFTER';

  if (!name) {
    return {
      ok: false,
      error:
        "Aucun nom de signataire pour l'organisme de formation. " +
        'Renseigner le signataire dans Paramètres organisme.',
    };
  }
  if (!email) {
    return {
      ok: false,
      error:
        `Aucun email pour le signataire « ${name} » de l'organisme de formation. ` +
        'Renseigner son email dans Paramètres organisme.',
    };
  }

  return { ok: true, signatory: { name, email, title, order } };
}
