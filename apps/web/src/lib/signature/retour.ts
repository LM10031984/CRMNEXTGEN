/**
 * Le RETOUR du prestataire — décisions PURES du lot C.3.
 *
 * Ce module ne fait rien : il DÉCIDE. Qui a signé, quel statut la demande prend
 * ensuite, qui doit être prévenu maintenant, et où les fichiers se rangent.
 * L'orchestrateur (`server/actions/signature-retour.ts`) n'a plus qu'à écrire.
 *
 * POURQUOI PUR. Un webhook arrive sans utilisateur, sans session, parfois deux
 * fois, parfois dans le désordre. Ce sont exactement les conditions où une
 * règle enfouie dans une transaction devient intestable. Ici, chaque décision
 * se joue sur une liste de signataires et une date.
 *
 * ⚠ LE PIÈGE DE CE LOT : retrouver un signataire PAR DEVINETTE. Le prestataire
 * envoie tantôt un identifiant, tantôt seulement un email. Se rabattre sur « le
 * premier qui n'a pas signé » poserait la signature du client sur la ligne de
 * l'organisme le jour où deux événements arrivent dans le désordre — et le
 * certificat, lui, dirait autre chose. On retrouve, ou on rend `null`.
 */

import type { SignatureSigner } from '@qualiof/shared';
import type { SignatureStatus } from './port';

/** Une chaîne réellement remplie. Un identifiant fait d'espaces n'identifie rien. */
function utile(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}

function memeEmail(gauche: string, droite: string): boolean {
  return gauche.trim().toLowerCase() === droite.trim().toLowerCase();
}

/**
 * Le signataire visé par un événement — retrouvé, jamais deviné.
 *
 * L'identifiant du prestataire PRIME : c'est la seule donnée qui ne peut pas
 * être partagée par deux lignes. L'email ne sert que lorsqu'il n'y a pas
 * d'identifiant — ce que font certains événements.
 */
export function trouverSignataire(
  signers: readonly SignatureSigner[],
  ref: { signerId: string | null; email: string | null },
): SignatureSigner | null {
  const id = utile(ref.signerId);
  if (id !== null) {
    const parId = signers.find((s) => s.providerSignerId === id);
    if (parId !== undefined) return parId;
  }
  const email = utile(ref.email);
  if (email !== null) {
    const parEmail = signers.find((s) => memeEmail(s.email, email));
    if (parEmail !== undefined) return parEmail;
  }
  return null;
}

/** Le même signataire, au sens de la ligne — pas de l'objet. */
function estLeMeme(s: SignatureSigner, cible: SignatureSigner): boolean {
  return s.providerSignerId === cible.providerSignerId;
}

/**
 * Pose la signature. Le PREMIER horodatage fait foi : un webhook rejoué ne doit
 * pas repousser la date d'une signature déjà enregistrée — c'est elle qui est
 * opposable, et le certificat du prestataire porte la même.
 */
export function appliquerSignature(
  signers: readonly SignatureSigner[],
  cible: SignatureSigner,
  at: Date,
): SignatureSigner[] {
  return signers.map((s) => {
    if (!estLeMeme(s, cible)) return s;
    if (utile(s.signedAt) !== null) return s;
    return { ...s, signedAt: at.toISOString(), status: 'completed' };
  });
}

/** Pose le refus. `signedAt` reste vide : un refus n'est pas une signature. */
export function appliquerRefus(
  signers: readonly SignatureSigner[],
  cible: SignatureSigner,
  at: Date,
): SignatureSigner[] {
  return signers.map((s) => {
    if (!estLeMeme(s, cible)) return s;
    if (utile(s.declinedAt) !== null) return s;
    return { ...s, declinedAt: at.toISOString(), status: 'declined' };
  });
}

function aSigne(s: SignatureSigner): boolean {
  return utile(s.signedAt) !== null;
}

function aRefuse(s: SignatureSigner): boolean {
  return utile(s.declinedAt) !== null;
}

/**
 * Le statut de la demande, DÉDUIT de l'état des signataires — jamais posé à la
 * main par le gestionnaire d'événement. Deux sources pour un même fait
 * finiraient par diverger, et c'est ce statut qui décide si la pièce est gelée.
 *
 * ⚠ LA LISTE VIDE. `[].every(…)` vaut `true` : sans la garde, une demande sans
 * signataire ressortirait `DONE`, et le webhook irait chercher un PDF signé qui
 * n'existe pas.
 */
export function statutApresRetour(
  signers: readonly SignatureSigner[],
): Extract<SignatureStatus, 'SENT' | 'PARTIALLY_SIGNED' | 'DONE'> {
  if (signers.length === 0) return 'SENT';
  if (signers.every(aSigne)) return 'DONE';
  if (signers.some(aSigne)) return 'PARTIALLY_SIGNED';
  return 'SENT';
}

/**
 * Qui reçoit l'email « à votre tour » maintenant.
 *
 * Le PREMIER de la liste qui n'a ni signé ni refusé, ET qui a un lien. La liste
 * est déjà triée par ordre de signature depuis le lot C.2a : on ne re-trie pas,
 * on ne cherche pas « l'organisme » — la règle est « celui dont c'est le tour »,
 * et avec `signatoryOrder = BEFORE` ce tour peut être celui de l'organisme dès
 * le départ.
 *
 * `null` quand il n'y a personne, ou quand le suivant n'a pas de lien : envoyer
 * « signez ici » sans lien est pire que ne rien envoyer.
 */
export function prochainAPrevenir(signers: readonly SignatureSigner[]): SignatureSigner | null {
  const suivant = signers.find((s) => !aSigne(s) && !aRefuse(s));
  if (suivant === undefined) return null;
  return utile(suivant.signUrl) === null ? null : suivant;
}

/**
 * Les deux clés de bucket — spec §4.4.
 *
 * MÊME convention que le dépôt de scan du lot A
 * (`persistSignedScan`) : une session = un préfixe = un dossier zippable pour
 * le pack audit. Le certificat porte le MÊME nom que le PDF, suffixé
 * `.audit-trail.pdf` : côte à côte dans le bucket, ils se retrouvent ensemble
 * même sans la base.
 */
export function cheminsSigne(a: {
  tenantId: string;
  sessionCode: string;
  docType: string;
  entityId: string;
  /** 8 premiers caractères du SHA-256 du PDF signé. */
  sha8: string;
}): { pdf: string; auditTrail: string } {
  const code = (utile(a.sessionCode) ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');
  const base = `sessions/${a.tenantId}/${code}/signed/${a.docType}-${a.entityId}-${a.sha8}`;
  return { pdf: `${base}.pdf`, auditTrail: `${base}.audit-trail.pdf` };
}
