/**
 * Le champ « Responsable — signe les conventions » de la fiche organisation —
 * demande n°1 de Laurent, 11/09/2026.
 *
 * CE QUE CET ÉCRAN NE DISAIT PAS, ET QUI COÛTE UN ENVOI. La fiche affichait
 * `representative` dans le SOUS-TITRE de la page, mêlé au réseau et au nom
 * commercial — sans son email, et sans rien dire quand il manquait. Or c'est
 * exactement ce manque qui fait refuser l'envoi : depuis le lot C.2a,
 * `resoudreEmailRepresentant` refuse NOMINATIVEMENT et aucune convention ne part
 * pour cette organisation. L'admin l'apprenait au moment d'envoyer, sur un autre
 * écran, après avoir préparé son dossier.
 *
 * IL NE DÉCIDE RIEN. Le nom, l'adresse et l'avertissement arrivent de
 * `vueResponsableOrganisation`, qui appelle la cascade unique de
 * `representant.ts`. Ce fichier est une mise en page — c'est ce qui permet de
 * garder la règle sous test unitaire plutôt que sous inspection visuelle.
 *
 * ⚠ PAS DE `'use client'`, et c'est délibéré : il est rendu par un composant
 * SERVEUR (`app/app/organisations/[id]/page.tsx`) et n'a ni état ni écouteur.
 */

import { AlertTriangle } from 'lucide-react';
import {
  LIBELLE_RESPONSABLE_ORGANISATION,
  vueResponsableOrganisation,
} from '@/lib/organisations/responsable-organisation';
import type { OrganisationRepresentee } from '@/lib/signature/representant';

export interface ResponsableOrganisationProps {
  /**
   * L'organisation ET SES CONTACTS. Le type l'exige : `contacts` n'est pas
   * optionnel, donc l'appelant qui oublierait de les charger ne compile pas.
   * Sans eux, le nom s'afficherait et l'adresse disparaîtrait en silence — la
   * cascade se rabattrait sur une liste vide.
   */
  organisation: OrganisationRepresentee;
}

export function ResponsableOrganisation({ organisation }: ResponsableOrganisationProps) {
  const vue = vueResponsableOrganisation(organisation);

  return (
    <div className="sm:col-span-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {LIBELLE_RESPONSABLE_ORGANISATION}
      </dt>
      <dd className="space-y-1.5">
        {vue.nom === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium">{vue.nom}</span>
            {vue.email !== null && (
              // L'adresse est CLIQUABLE : corriger une adresse commence souvent
              // par écrire à la personne pour lui demander la bonne.
              <a
                href={`mailto:${vue.email}`}
                className="text-primary hover:underline break-all"
              >
                {vue.email}
              </a>
            )}
          </div>
        )}

        {/* ⚠ `role="alert"` ET un fond ambre : l'avertissement n'existe QUE
            quand un envoi est réellement empêché. Le rendre « pour information »
            en ferait un décor, et un écran qui alerte à tort n'alerte plus.
            Le message est composé par le module — il nomme la personne,
            l'organisation, la conséquence et le geste. */}
        {vue.avertissement !== null && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{vue.avertissement}</span>
          </p>
        )}
      </dd>
    </div>
  );
}
