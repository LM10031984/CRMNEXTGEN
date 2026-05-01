/**
 * Calcule le taux de complétion d'une fiche apprenant. Utilisé par
 * LearnerCompletenessBadge pour afficher le % en haut de la fiche et lister
 * les champs manquants. Pondération : champs critiques (identité, AGEFICE)
 * pèsent plus que champs accessoires (diplômes, expérience).
 */

export interface CompletenessField {
  key: string;
  label: string;
  weight: number;
  filled: boolean;
  category: 'identite' | 'contact' | 'adresse' | 'pro' | 'agefice';
}

export interface CompletenessResult {
  percent: number;
  filledWeight: number;
  totalWeight: number;
  missing: CompletenessField[];
  filled: CompletenessField[];
}

// Type laxe : accepte tout Person Prisma avec ses relations incluses, on
// ne lit que les champs ci-dessous mais on tolere les extras (siret + autres
// champs sur Organization, etc.).
interface PersonInput {
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
  personalAddress: unknown;
  professionalStatus: string | null;
  educationLevel: string | null;
  diplomas: string | null;
  legalLinks: ReadonlyArray<{
    organization: ({ siret: string | null } & Record<string, unknown>) | null;
  }>;
  sensitiveData:
    | ({ socialSecurityNb: string | null; idDocumentUrl: string | null } & Record<string, unknown>)
    | null;
}

function isAddressFilled(addr: unknown): boolean {
  if (!addr || typeof addr !== 'object') return false;
  const a = addr as Record<string, unknown>;
  return Boolean(a.street && a.postalCode && a.city);
}

export function computeLearnerCompleteness(person: PersonInput): CompletenessResult {
  const fields: CompletenessField[] = [
    { key: 'firstName', label: 'Prénom', weight: 3, filled: Boolean(person.firstName), category: 'identite' },
    { key: 'lastName', label: 'Nom', weight: 3, filled: Boolean(person.lastName), category: 'identite' },
    { key: 'birthDate', label: 'Date de naissance', weight: 2, filled: person.birthDate != null, category: 'identite' },
    { key: 'email', label: 'Email', weight: 3, filled: Boolean(person.email), category: 'contact' },
    { key: 'phone', label: 'Téléphone', weight: 2, filled: Boolean(person.phone), category: 'contact' },
    { key: 'address', label: 'Adresse personnelle (rue · CP · ville)', weight: 2, filled: isAddressFilled(person.personalAddress), category: 'adresse' },
    { key: 'professionalStatus', label: 'Statut professionnel', weight: 2, filled: Boolean(person.professionalStatus), category: 'pro' },
    { key: 'legalLink', label: 'Rattachement à une organisation', weight: 3, filled: person.legalLinks.length > 0, category: 'pro' },
    { key: 'siret', label: 'SIRET de l\'organisation rattachée', weight: 2, filled: person.legalLinks.some((l) => Boolean(l.organization?.siret)), category: 'pro' },
    { key: 'educationLevel', label: 'Niveau d\'études', weight: 1, filled: Boolean(person.educationLevel || person.diplomas), category: 'pro' },
    { key: 'socialSecurityNb', label: 'N° Sécurité sociale (pour AGEFICE)', weight: 2, filled: Boolean(person.sensitiveData?.socialSecurityNb), category: 'agefice' },
    { key: 'idDocument', label: 'Pièce d\'identité scannée (CNI/passeport)', weight: 1, filled: Boolean(person.sensitiveData?.idDocumentUrl), category: 'agefice' },
  ];

  const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
  const filledWeight = fields.filter((f) => f.filled).reduce((s, f) => s + f.weight, 0);
  const percent = totalWeight === 0 ? 0 : Math.round((filledWeight / totalWeight) * 100);

  return {
    percent,
    filledWeight,
    totalWeight,
    missing: fields.filter((f) => !f.filled),
    filled: fields.filter((f) => f.filled),
  };
}
