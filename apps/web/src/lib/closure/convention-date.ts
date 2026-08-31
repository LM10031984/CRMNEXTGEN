/**
 * Date de signature d'une convention — **source unique** de la règle.
 *
 * Règle historique (COR-1) : J-15 jours OUVRÉS avant le début de session.
 * Elle vient des régularisations — générer après coup les conventions de
 * sessions déjà passées demandait une date plausible située avant la formation.
 * Cohérence contractuelle : signée à J-15 ouvrés, la rétractation de 14 jours
 * (Art. 6) s'achève vers J-1, et le solde « la veille » (Art. 7) tient.
 *
 * Constat de Laurent le 31/08 : sur une session du 7 octobre, elle sortait une
 * convention datée du 16 septembre — dans le FUTUR. On ne fait pas signer
 * aujourd'hui un document daté dans trois semaines : en audit, une convention
 * signée avant sa propre date se voit immédiatement.
 *
 * D'où le plafond au jour même. Dater PLUS TÔT que J-15 ne casse rien : la
 * règle est « signée ≥ 15 jours avant », et 37 jours d'avance la respectent
 * mieux encore. C'est dater APRÈS J-15 qui serait non conforme — ce que
 * `min()` ne peut jamais produire.
 *
 * MODULE PUR : `today` est un paramètre, jamais lu de l'horloge. Une règle
 * datée qui interroge l'horloge n'est pas testable, et se casse à minuit.
 */

import { subtractBusinessDaysISO } from '@/lib/business-days';

/** Délai contractuel minimal entre la signature et le début de formation. */
export const JOURS_OUVRES_AVANT_DEBUT = 15;

const ISO_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date retenue pour la convention, en ISO `yyyy-mm-dd`.
 *
 * `override` (date saisie à la main) l'emporte sur tout : aucune règle
 * automatique ne connaît la date réellement négociée avec le client. Une saisie
 * malformée est ignorée plutôt que propagée — un document daté n'importe
 * comment est pire qu'un document daté par défaut.
 */
export function resolveConventionDateIso(
  startIso: string,
  todayIso: string,
  override?: string | null,
): string {
  const saisie = (override ?? '').trim();
  if (ISO_JOUR.test(saisie)) return saisie;

  const regle = subtractBusinessDaysISO(startIso, JOURS_OUVRES_AVANT_DEBUT);
  // Jamais dans le futur : on ne signe pas aujourd'hui un document daté demain.
  return regle > todayIso ? todayIso : regle;
}

/** Même règle, en `Date` UTC — forme attendue par les gabarits. */
export function resolveConventionDate(
  startDate: Date,
  today: Date,
  override?: string | null,
): Date {
  const iso = resolveConventionDateIso(
    startDate.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
    override,
  );
  return new Date(iso + 'T00:00:00Z');
}
