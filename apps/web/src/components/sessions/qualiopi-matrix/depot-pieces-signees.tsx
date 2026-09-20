'use client';

import type { ConventionCompany } from './group-convention-upload';
import { SignedDocDropZone, type DropZoneParticipant } from './signed-doc-drop-zone';

export function DepotPiecesSignees({
  sessionId,
  participants,
  pieces = [],
  companies = [],
}: {
  sessionId: string;
  companies?: ConventionCompany[];
  participants: DropZoneParticipant[];
  pieces?: Array<{ label: string; apprenant: string; href: string; source: string }>;
}) {
  return (
    <section
      id="depot-pieces-signees"
      className="scroll-mt-6 space-y-2"
      aria-label="Dépôt des pièces signées"
    >
      <SignedDocDropZone
        sessionId={sessionId}
        companies={companies}
        participants={participants}
        docType="CONVENTION"
        defaultOpen={false}
        titre="Déposer des pièces signées"
        docTypeOptions={[
          { value: 'CONVENTION', label: 'Convention individuelle signée' },
          { value: 'CONVENTION_GROUPE', label: 'Convention entreprise / OPCO — commune aux salariés' },
          { value: 'AGEFICE', label: 'Demande de prise en charge AGEFICE signée' },
          { value: 'EMARGEMENT', label: 'Émargement signé' },
          { value: 'ASSIDUITE', label: 'Attestation d’assiduité signée' },
        ]}
        aide={
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Choisissez le type de pièce ci-dessous.</li>
            <li>Déposez les PDF signés, un fichier par apprenant.</li>
            <li>Vérifiez l’apprenant associé à chaque fichier, puis cliquez sur Enregistrer.</li>
          </ol>
        }
      />
      {pieces.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Pièces signées disponibles</h3>
          <ul className="divide-y">
            {pieces.map((piece) => (
              <li
                key={piece.href}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  <strong>{piece.apprenant}</strong> · {piece.label}
                  <span className="ml-2 text-xs text-muted-foreground">{piece.source}</span>
                </span>
                <a
                  href={piece.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline"
                  aria-label={`Consulter ${piece.label} de ${piece.apprenant}`}
                >
                  Consulter
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="px-1 text-sm text-muted-foreground">
        Convention · Prise en charge AGEFICE · Émargement · Assiduité. Les documents signés avec
        DocuSeal se rangent automatiquement : inutile de les redéposer ici.
      </p>
    </section>
  );
}
