/**
 * Panneau de vérification de cohérence pour la pièce d'identité (CNI / passeport).
 *
 * L'OCR de la pièce d'identité n'est pas la source principale des données
 * (c'est l'attestation CFP qui l'est). Ici on l'utilise UNIQUEMENT pour :
 * - vérifier que ce qu'a saisi l'apprenant correspond à sa vraie pièce
 * - compléter avec les infos non saisies (n° pièce, nom de naissance)
 * - servir d'archive Qualiopi (le fichier est stocké en MinIO)
 *
 * Si l'OCR échoue → on affiche juste un message neutre, pas un échec.
 */

import { CheckCircle2, AlertTriangle, FileSearch, ImageOff } from 'lucide-react';

interface CniData {
  firstName?: string | null;
  lastName?: string | null;
  birthName?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  idDocumentNumber?: string | null;
  idDocumentType?: string | null;
  expiryDate?: string | null;
  nationality?: string | null;
}

interface SavedData {
  firstName: string | null;
  lastName: string | null;
  birthDate: Date | null;
  birthPlace: string | null;
}

interface DivergenceRow {
  field: string;
  saisi: string;
  extrait: string;
  match: boolean;
}

function normalizeForCompare(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function compareValues(saisi: string | null | undefined, extrait: string | null | undefined): boolean {
  const a = normalizeForCompare(saisi);
  const b = normalizeForCompare(extrait);
  if (!a || !b) return true; // pas de saisie ou pas d'extraction → on considère pas de divergence
  return a === b || a.includes(b) || b.includes(a);
}

export function IdentityCheckPanel({
  cni,
  saved,
  hasDocument,
}: {
  cni: CniData | null;
  saved: SavedData;
  hasDocument: boolean;
}) {
  // Cas 1 : pas de pièce uploadée
  if (!hasDocument) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white p-5 text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <ImageOff className="h-4 w-4" />
          Aucune pièce d'identité jointe (optionnel — sera demandé à la conversion).
        </div>
      </div>
    );
  }

  // Cas 2 : pièce uploadée mais OCR a échoué
  if (!cni) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-semibold text-sm inline-flex items-center gap-2 mb-2">
          <FileSearch className="h-4 w-4 text-amber-700" /> Pièce d'identité — OCR indisponible
        </h3>
        <p className="text-xs text-amber-900">
          La pièce a bien été archivée mais l'OCR n'a pas pu en extraire le texte (image floue, format
          non supporté, ou modèle vision absent). Vérifie visuellement la pièce ci-dessous, l'archive
          reste valable pour Qualiopi.
        </p>
      </div>
    );
  }

  // Cas 3 : OCR réussi → table de cohérence + compléments
  const checks: DivergenceRow[] = [];
  if (saved.firstName) {
    checks.push({
      field: 'Prénom',
      saisi: saved.firstName,
      extrait: cni.firstName ?? '—',
      match: compareValues(saved.firstName, cni.firstName),
    });
  }
  if (saved.lastName) {
    checks.push({
      field: 'Nom',
      saisi: saved.lastName,
      extrait: cni.lastName ?? '—',
      match: compareValues(saved.lastName, cni.lastName),
    });
  }
  if (saved.birthDate && cni.birthDate) {
    const savedIso = saved.birthDate.toISOString().slice(0, 10);
    checks.push({
      field: 'Date de naissance',
      saisi: new Date(saved.birthDate).toLocaleDateString('fr-FR'),
      extrait: cni.birthDate,
      match: savedIso === cni.birthDate,
    });
  }
  if (saved.birthPlace && cni.birthPlace) {
    checks.push({
      field: 'Lieu de naissance',
      saisi: saved.birthPlace,
      extrait: cni.birthPlace,
      match: compareValues(saved.birthPlace, cni.birthPlace),
    });
  }

  const hasDivergence = checks.some((c) => !c.match);
  const complements = [
    cni.birthName && !saved.firstName?.includes(cni.birthName) ? { label: 'Nom de naissance', value: cni.birthName } : null,
    cni.birthDate && !saved.birthDate ? { label: 'Date de naissance', value: cni.birthDate } : null,
    cni.birthPlace && !saved.birthPlace ? { label: 'Lieu de naissance', value: cni.birthPlace } : null,
    cni.idDocumentNumber ? { label: `N° ${cni.idDocumentType ?? 'pièce'}`, value: cni.idDocumentNumber } : null,
    cni.expiryDate ? { label: "Date d'expiration", value: cni.expiryDate } : null,
    cni.nationality ? { label: 'Nationalité', value: cni.nationality } : null,
  ].filter((c): c is { label: string; value: string } => c !== null);

  return (
    <div
      className={`rounded-2xl border p-5 ${
        hasDivergence ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50/50'
      }`}
    >
      <h3 className="font-semibold text-sm inline-flex items-center gap-2 mb-3">
        {hasDivergence ? (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Pièce d'identité — divergence à valider
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            Pièce d'identité — cohérence OK
          </>
        )}
      </h3>

      {checks.length > 0 && (
        <div className="space-y-1.5 text-xs mb-3">
          {checks.map((c) => (
            <div key={c.field} className="flex items-center gap-2">
              {c.match ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              )}
              <span className="text-muted-foreground w-32 shrink-0">{c.field}</span>
              <span className={c.match ? 'text-foreground' : 'text-amber-900 font-medium'}>
                {c.saisi}
                {!c.match && (
                  <span className="text-muted-foreground ml-2">
                    (CNI : <strong>{c.extrait}</strong>)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {complements.length > 0 && (
        <div className="border-t border-border/50 pt-3 mt-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 font-semibold">
            Compléments OCR
          </div>
          <div className="space-y-1 text-xs">
            {complements.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className="text-muted-foreground w-32 shrink-0">{c.label}</span>
                <span className="font-medium">{c.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
