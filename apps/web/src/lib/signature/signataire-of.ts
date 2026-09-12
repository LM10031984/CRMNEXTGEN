/**
 * LA résolution du signataire de l'ORGANISME — une seule, pour tous ses lecteurs.
 *
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST SORTI DE `signature-envoi.ts`.
 * Cette résolution y vivait en fonction privée. Elle ne pouvait donc servir
 * qu'au moteur : `signature-envoi.ts` porte `'use server'`, où tout export
 * devient une server action. La fiche session, qui doit désormais annoncer
 * « 1. client · 2. OF » sur CHAQUE ligne du bloc « Signature », n'avait aucun
 * chemin vers elle — et le seul autre moyen d'obtenir ce couple aurait été de
 * relire `Tenant.signatory*` + `of-config` une seconde fois.
 *
 * ⚠ CE QU'UNE SECONDE LECTURE AURAIT COÛTÉ. La cascade de `resolveTenantSignatory`
 * n'est pas un `SELECT` : ce qui est saisi en base gagne, sinon on retombe sur
 * le responsable OF (`OF_RESP_*`, D-01 hybride). Deux recopies de cette cascade
 * divergent au premier changement de règle, et l'écran finirait par annoncer un
 * signataire différent de celui qui reçoit le lien. Le module est donc DÉPLACÉ,
 * jamais dupliqué : `signature-envoi.ts` l'importe désormais lui aussi.
 *
 * PAS PUR — il lit la base et la configuration OF. À n'appeler que côté serveur
 * (server action ou composant serveur). Ce qui en sort, en revanche, est du
 * JSON : `SignataireOfPrevu` traverse la frontière RSC sans transformation.
 */

import { prisma } from '@qualiof/db';
import { loadOfConfig } from '@/lib/of-config';
import { resolveTenantSignatory, type ResolveSignatoryResult } from '@/lib/signature/signatory';
import type { SignataireOfPrevu } from '@/lib/signature/envoi-contrats';

/**
 * Le signataire de l'organisme, résolu, ou le REFUS NOMMÉ qui dit quel réglage
 * manque (`SIGNATAIRE_OF_INCOMPLET` côté moteur).
 */
export async function resoudreSignataireOf(tenantId: string): Promise<ResolveSignatoryResult> {
  const [tenant, of] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        signatoryName: true,
        signatoryEmail: true,
        signatoryTitle: true,
        signatoryOrder: true,
      },
    }),
    loadOfConfig(tenantId),
  ]);
  if (!tenant) {
    return {
      ok: false as const,
      error: 'Organisme introuvable : impossible de résoudre son signataire.',
    };
  }
  return resolveTenantSignatory(tenant, of);
}

/**
 * Ce que les ÉCRANS gardent de cette résolution : un nom, une adresse, un rang.
 *
 * ⚠ PROJECTION, PAS SECONDE RÉSOLUTION. Le récapitulatif et le bloc de la fiche
 * session appellent tous deux cette fonction sur le MÊME résultat, pour que la
 * ligne affichée décrive exactement le signataire que `sendForSignature`
 * enverra au prestataire.
 *
 * `null` quand la résolution n'a pas abouti : l'écran rend alors la seule ligne
 * sûre, et l'empêchement nominatif dit quel réglage renseigner. Inventer
 * « (organisme inconnu) » ferait chercher autre chose.
 */
export function signataireOfPrevu(resultat: ResolveSignatoryResult): SignataireOfPrevu | null {
  return resultat.ok
    ? {
        nom: resultat.signatory.name,
        email: resultat.signatory.email,
        ordre: resultat.signatory.order,
      }
    : null;
}
