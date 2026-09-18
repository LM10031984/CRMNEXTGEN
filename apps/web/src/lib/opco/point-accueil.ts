import { prisma } from '@qualiof/db';
import { departmentOfPostalCode, servesDepartment } from '@/lib/agefice/select-point-accueil';

type Point = {
  id: string;
  name: string;
  email: string | null;
  department: string;
  departmentsServed: string[];
  numberPta: string | null;
};
type Profile = {
  id: string;
  paFields: unknown;
  paNumber?: string | null;
  pointAccueilLockedManually?: boolean;
  pointAccueil?: Point | null;
};
const fold = (value: unknown) =>
  typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    : '';
/** Le département vient de l'entreprise vérifiée sur la CFP ; jamais du lieu de formation. */
export async function resolveDossierPointAccueil(profile: Profile | null) {
  const fields =
    profile?.paFields && typeof profile.paFields === 'object'
      ? (profile.paFields as Record<string, unknown>)
      : {};
  const cp = fields['Code Postal (Entreprise)'] ?? fields['Code postal (Entreprise)'];
  const department = departmentOfPostalCode(
    typeof cp === 'string' || typeof cp === 'number' ? String(cp) : null,
  );
  let selected = profile?.pointAccueil ?? null;
  if (!profile) return { selected: null, department, options: [] as Point[] };
  if (selected && !department) return { selected, department, options: [selected] };
  if (
    selected &&
    department &&
    !profile.pointAccueilLockedManually &&
    !servesDepartment(selected, department)
  )
    selected = null;
  const options = department
    ? await prisma.ageficePointAccueil.findMany({
        where: {
          numberPta: { not: null },
          OR: [
            { departmentsServed: { has: department } },
            { department, departmentsServed: { isEmpty: true } },
          ],
        },
        orderBy: { name: 'asc' },
      })
    : [];
  if (selected && !options.some((p) => p.id === selected!.id))
    options.unshift(selected as (typeof options)[number]);
  // Reprendre un PTA explicitement importé, uniquement si la correspondance est unique.
  if (!selected) {
    const number = String(profile.paNumber ?? fields['N° de PTA'] ?? '').trim();
    const names = [fields['Nom du PTA'], fields['Nom du PA AGEFICE']].map(fold).filter(Boolean);
    const matches = options.filter(
      (p) => !!p.email && ((number && p.numberPta === number) || names.includes(fold(p.name))),
    );
    if (matches.length === 1) selected = matches[0]!;
    else if (matches.length === 0 && options.filter((p) => !!p.email).length === 1)
      selected = options.find((p) => !!p.email)!;
  }
  return { selected, department, options };
}
