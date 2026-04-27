/** Validation simple d'email (côté UI : Zod fait mieux, ici c'est pour les filtres rapides). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(input: string | null | undefined): boolean {
  if (!input) return false;
  return EMAIL_RE.test(input.trim());
}
