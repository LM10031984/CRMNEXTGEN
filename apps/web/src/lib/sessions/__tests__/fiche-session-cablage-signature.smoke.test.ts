/**
 * Le CÂBLAGE de la fiche session vers le bloc « Signature » — smoke source.
 *
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST EN REGEX DE SOURCE. Les deux
 * corrections du 11/09/2026 qui ajoutent de l'information à l'écran
 * (l'avertissement regroupé, le couple signataire + adresse) sont calculées
 * PURES et testées comme telles — mais elles n'arrivent à l'écran que si
 * `page.tsx` les passe. Or `page.tsx` est un composant serveur qui ouvre
 * Prisma, Lucia et une douzaine de modules : il n'est pas montable en jsdom, et
 * les deux props se seraient perdues sans qu'aucun test ne bouge. C'est le
 * défaut exact que les mutations ont révélé — le calcul gardé, le câblage non.
 *
 * Même forme que les smoke tests du lot A (`signed-doc-drop-zone.smoke.test.ts`) :
 * on lit la source et on vérifie que le fil est branché.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pageSrc = readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'app', 'sessions', '[id]', 'page.tsx'),
  'utf-8',
);

describe('fiche session — les deux props du bloc « Signature » sont branchées', () => {
  it('le couple signataire + adresse est calculé ET passé à la vue (correction n°4)', () => {
    expect(pageSrc).toMatch(/signataireParCle:\s*signataireParCle\(plan\)/);
    expect(pageSrc).toMatch(/['"]@\/lib\/signature\/signataire-de-la-piece['"]/);
  });

  it('la résolution passe par le MÊME module que le moteur, jamais par une cascade recopiée', () => {
    expect(pageSrc).toMatch(/resoudreSignataireClient\(/);
    expect(pageSrc).toMatch(/formeDuDocument\(/);
    // Aucune cascade de `representant.ts` appelée directement depuis la page :
    // ce serait la seconde règle « qui signe » que l'extraction évite.
    expect(pageSrc).not.toMatch(/resoudreRepresentantEntreprise|resoudreEmailRepresentant/);
  });

  it('le contexte de l’avertissement est calculé ET passé à la vue (correction n°3)', () => {
    expect(pageSrc).toMatch(/contexteAvertissementParParticipant,/);
    expect(pageSrc).toMatch(/financeurSansRegime:/);
    expect(pageSrc).toMatch(/financeursRattaches:/);
  });

  it('l’ID du commanditaire est transporté — sans lui, le cas A n’a aucune fiche à ouvrir', () => {
    // Correction n°7 bis : le lien « Renseigner le financeur de {organisation} »
    // mène à `/app/organisations/{id}`. L'id vient d'ici, et de nulle part
    // ailleurs : oublié, le lien retomberait silencieusement sur le formulaire
    // d'inscription — c'est-à-dire sur le comportement que la correction
    // supprime.
    expect(pageSrc).toMatch(/sponsorOrgId: lu\.sponsorOrgId,/);
  });

  it('l’adresse du signataire est réellement chargée : sans elle, la ligne resterait muette', () => {
    // `person.email` et les contacts complets de l'organisation bénéficiaire.
    const selectPersonne = pageSrc.slice(pageSrc.indexOf('          person: {'));
    expect(selectPersonne.slice(0, 1200)).toMatch(/email: true,/);
    expect(pageSrc).toMatch(/orderBy: \[\{ isPrimary: 'desc' \}, \{ createdAt: 'asc' \}\]/);
  });

  it('le garde-fou « contact principal » ne compte plus des lignes, il teste `isPrimary`', () => {
    // La requête charge désormais TOUS les contacts : `contacts.length > 0`
    // répondrait « oui » pour une organisation sans aucun contact principal.
    expect(pageSrc).toMatch(/aContactPrincipal: org\.contacts\.some\(\(c\) => c\.isPrimary\)/);
    expect(pageSrc).not.toMatch(/aContactPrincipal: org\.contacts\.length > 0/);
  });
});

/* ── D-C3-1 — les signataires RÉELS traversent-ils la page ? ─────────────── */

/**
 * POURQUOI CE GARDE EXISTE, ET POURQUOI IL N'EST PAS REMPLAÇABLE PAR `tsc`.
 *
 * `DocumentDeLaPiece.signataires` est OBLIGATOIRE : l'oublier est une erreur de
 * compilation. Mais `tsc` ne voit pas la SUBSTITUTION — `signataires: []`
 * compile parfaitement et produit exactement l'écran d'avant la correction :
 * une pièce partie qui n'affiche ni date de signature, ni lien « Signer
 * maintenant ». C'est le trou mesuré au lot C.2b-8 sur `signataireOf`, à la
 * lettre. Prop obligatoire ET assertion sur la valeur réellement passée.
 */
describe('fiche session — les signataires de la demande remontent jusqu’au bloc (D-C3-1)', () => {
  it('la requête CHARGE les signataires : sans eux, il n’y a rien à afficher', () => {
    // La colonne Json `SignatureRequest.signers`, jointe au document — pas une
    // requête de plus : `sessionDocs` charge déjà tous les documents utiles.
    expect(pageSrc).toMatch(/signatureRequest: \{ select: \{[^}]*\bsigners: true\b/);
  });

  it('ils sont RELUS par le contrat partagé, jamais castés à la main', () => {
    // `parseSignatureSigners` écarte sans bruit une ligne mal formée : c'est le
    // seul point de lecture autorisé de cette colonne (règle du lot C.3).
    expect(pageSrc).toMatch(/parseSignatureSigners\(/);
    expect(pageSrc).not.toMatch(/as SignatureSigner\[\]/);
  });

  it('le CAMP de chaque signataire vient du module partagé avec le webhook', () => {
    // `signatairesDeLaDemande` est la MÊME fonction que celle qui compose les
    // destinataires des emails de retour. Recopier ici « le rôle d'ancre OF
    // désigne l'organisme » ferait une seconde règle, et l'écran finirait par
    // désigner un camp différent de celui des emails.
    expect(pageSrc).toMatch(/signatairesDeLaDemande\(/);
  });

  it('et ils sont PASSÉS à la vue : la substitution par un tableau vide doit rougir', () => {
    expect(pageSrc).toMatch(/signataires: signatairesDeLaDemande\(/);
    expect(pageSrc).not.toMatch(/signataires: \[\],/);
  });
});

/* ── D-C3-5 — le certificat traverse-t-il la page ? ──────────────────────── */

/**
 * MÊME TROU, MÊME GARDE. `DocumentDeLaPiece.auditTrailUrl` est OBLIGATOIRE :
 * l'oublier ne compile pas. Mais `auditTrailUrl: null` compile parfaitement et
 * reproduit exactement l'écran d'avant — une ligne verte sans son certificat,
 * et un dossier AGEFICE qu'il faut aller reconstituer dans sa boîte mail.
 * C'est la SUBSTITUTION que `tsc` ne voit pas (lot C.2b-8, puis D-C3-1).
 */
describe('fiche session — le certificat de signature remonte jusqu’au bloc (D-C3-5)', () => {
  it('la requête CHARGE la clé du certificat, sur la MÊME jointure que les signataires', () => {
    // Une seconde jointure vers `signatureRequest` serait une requête de plus
    // pour une colonne du même enregistrement.
    expect(pageSrc).toMatch(/signatureRequest: \{ select: \{[^}]*\bauditTrailUrl: true\b/);
    // Sur la MÊME jointure que les signataires : deux `signatureRequest:` dans
    // le même `select` seraient une requête de plus pour deux colonnes du même
    // enregistrement.
    expect(pageSrc.match(/signatureRequest: \{ select:/g) ?? []).toHaveLength(1);
  });

  it('et elle est PASSÉE à la vue : la substitution par `null` doit rougir', () => {
    expect(pageSrc).toMatch(/auditTrailUrl: d\.signatureRequest\?\.auditTrailUrl \?\? null,/);
    expect(pageSrc).not.toMatch(/auditTrailUrl: null,/);
  });
});
