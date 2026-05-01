export const PLAFOND_AGEFICE = 3000;

export interface LearnerBudgetRow {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  consomme: number;
  nbSessions: number;
  restant: number;
  pct: number;
  status: 'free' | 'low' | 'mid' | 'near_limit' | 'over';
}
