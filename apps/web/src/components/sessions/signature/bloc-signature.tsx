'use client';

/**
 * Le bloc « Signature électronique » des onglets Avant / Après — lot C.2b-2.
 *
 * RÈGLE LOCKED « 1 doc = 1 maison » : la matrice MONTRE, Avant / Après
 * AGISSENT. Le geste d'envoi vit donc ici, pas dans une cellule.
 *
 * IL NE DÉCIDE RIEN. Tout ce qu'il affiche — les lignes, leur état, l'existence
 * du bouton — lui arrive calculé par `construireVueSignature`, côté serveur. Ce
 * fichier est une mise en page ; c'est ce qui permet de garder les décisions de
 * Laurent sous test unitaire plutôt que sous inspection visuelle.
 *
 * TROIS CHOSES QUI NE SE NÉGOCIENT PAS :
 *
 *  1. **Le bouton d'envoi n'est jamais `disabled`.** Quand il n'y a rien à
 *     envoyer, il n'est PAS dans le DOM (décision Laurent n°3). Un bouton grisé
 *     laisse croire qu'il manque un réglage, alors qu'une session 100 % OPCO
 *     n'a simplement aucune pièce à faire signer après la formation.
 *  2. **Les messages du moteur sont rendus TELS QUELS.** `AnomalieEnvoi.message`
 *     nomme déjà la personne, la pièce, ce qui n'a PAS eu lieu et le geste à
 *     faire. Les reformuler ou les résumer en toast perdrait exactement ce qui
 *     fait qu'un admin corrige au lieu de recliquer.
 *  3. **Aucun lien « Relancer ».** La relance est un CRON (`signature-reminders`,
 *     J+3/J+7, lot C.3), pas un bouton : `provider.remind` n'a toujours aucun
 *     appelant. Un lien qui ne relance rien est le « bouton qui laisse croire
 *     qu'il manque un réglage » que la décision n°3 interdit — amendement n°8.
 *
 * ⚠ CE QUE LA RECETTE DU 11/09/2026 A TROUVÉ ICI (défaut D-C3-1), et qui est
 * corrigé : une pièce partie n'affichait RIEN de ce qui s'était passé chez le
 * prestataire. Le client avait signé — le webhook l'avait écrit, l'Historique le
 * montrait — et la ligne disait toujours « En attente de signature », sans date,
 * **sans le lien « Signer maintenant »** dont c'était pourtant le tour. Le
 * calcul existait et était testé (`ordreSignatairesEnvoyes`) ; il ne servait
 * qu'au récapitulatif, c'est-à-dire à l'écran qu'on ne revoit jamais. Ce
 * fichier REND désormais l'état rang par rang — sans rien décider de plus.
 *
 * ⚠ CE QUE LE RETRAIT DU DÉPÔT PAR LIGNE A EMPORTÉ AVEC LUI (correction n°6,
 * Laurent 11/09/2026), et qu'il faut savoir avant le premier envoi réel.
 *
 * Ce bloc était le SEUL appelant à passer `envoiEnAttente` à
 * `<UploadSignedDocDialog>` — l'autre, le menu de la matrice, ne l'a jamais
 * su. L'ÉTAPE de confirmation « le dépôt annule l'envoi » (lot C.2b-3) n'a donc
 * plus d'appelant : un scan déposé depuis la matrice sur une pièce partie en
 * signature sera REFUSÉ par `persistSignedScan` (fail-closed, inchangé), avec
 * le message qui renvoie ici. Le recours est le bouton « Annuler l'envoi » de
 * cette ligne, puis le dépôt. La RÈGLE de C.2b-3 tient donc toujours — c'est
 * son raccourci en un geste qui disparaît.
 *
 * ⚠ LA ZONE DE DÉPÔT VIT DÉSORMAIS ICI (demande n°4, Laurent 11/09/2026).
 *
 * Elle vivait à part, dans les onglets Avant et Après. Les DEUX chemins vers la
 * même preuve — faire signer à distance, rentrer le papier signé — se
 * cherchaient donc à deux endroits, alors qu'ils s'EXCLUENT : un scan déposé
 * sur une pièce partie en signature annule l'envoi chez le prestataire, et
 * `persistSignedScan` le REFUSE sans confirmation explicite. Les mettre côte à
 * côte, c'est ce qui rend cette exclusion lisible avant de la subir.
 *
 * Conséquence assumée sur le silence du bloc : il ne se tait plus dès que le
 * plan est vide. Une session 100 % OPCO n'a rien à faire e-signer, mais elle a
 * des feuilles d'émargement à rentrer — renvoyer `null` ferait disparaître le
 * seul endroit où les déposer.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import {
  LIBELLE_LIEN_CORRIGER_COMMANDITAIRE,
  lienCorrigerFinanceur,
} from '@/lib/sessions/lien-corriger-financeur';
import {
  libelleLienRenseignerFinanceur,
  lienRenseignerFinanceur,
  retourVersOnglet,
} from '@/lib/sessions/lien-renseigner-financeur';
import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  ExternalLink,
  FileSignature,
  Loader2,
  OctagonAlert,
  PenLine,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { annulerEnvoiSignature } from '@/server/actions/signature-envoi';
import type {
  CorrectionAvertissement,
  EtatPiece,
  LigneSignature,
  VueSignature,
} from '@/lib/sessions/bloc-signature-vue';
// ⚠ Le libellé et le séparateur viennent du MÊME module que le récapitulatif :
// « Ordre de signature : 1. … · 2. … » doit se lire à l'identique sur les deux
// écrans. Recopier ` · ` ou le libellé dans ce JSX rouvrirait la divergence que
// ce lot ferme.
import {
  LIBELLE_ORDRE_SIGNATURE,
  SEPARATEUR_ORDRE,
  mentionSignatureFaite,
} from '@/lib/sessions/ordre-signataires';
import type { ScopeEnvoi } from '@/lib/signature/plan-envoi';
import {
  AIDE_DEPOT_MANUEL,
  MENTION_RETOUR_AUTOMATIQUE,
  TITRE_DEPOT_MANUEL,
} from '@/lib/sessions/titre-depot-signe';
import {
  SignedDocDropZone,
  type DropZoneParticipant,
} from '../qualiopi-matrix/signed-doc-drop-zone';
import { RecapitulatifEnvoi } from './recapitulatif-envoi';

export interface BlocSignatureProps {
  sessionId: string;
  scope: ScopeEnvoi;
  vue: VueSignature;
  /**
   * Le droit d'ÉCRIRE un scan — `canWrite` côté onglets, qui inclut COMMERCIAL.
   *
   * ⚠ SURTOUT PAS `vue.canSign`, qui vaut `ADMIN | MANAGER` : le dépôt d'un
   * scan n'est pas un envoi en signature, et le réduire aux deux rôles de
   * l'envoi retirerait à un commercial un geste qu'il faisait hier.
   */
  depotAutorise?: boolean;
  /** Les inscrits auxquels rattacher un scan. Vide ⇒ aucune zone rendue. */
  depotParticipants?: DropZoneParticipant[];
  /** Le type proposé par défaut : CONVENTION avant, EMARGEMENT après. */
  depotDocType?: string;
  /** Les types que ce moment de la formation accepte en dépôt. */
  depotDocTypeOptions?: Array<{ value: string; label: string }>;
}

const PASTILLE: Record<EtatPiece, { texte: string; classe: string }> = {
  ABSENT: { texte: 'À générer', classe: 'bg-amber-50 border-amber-200 text-amber-800' },
  GENERE: { texte: 'Prêt à envoyer', classe: 'bg-sky-50 border-sky-200 text-sky-800' },
  ENVOYE: {
    texte: 'En attente de signature',
    classe: 'bg-violet-50 border-violet-200 text-violet-800',
  },
  SIGNE: { texte: 'Signé', classe: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
};

export function BlocSignature({
  sessionId,
  scope,
  vue,
  depotAutorise = false,
  depotParticipants,
  depotDocType,
  depotDocTypeOptions,
}: BlocSignatureProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** La demande en cours d'annulation — une ligne à la fois. */
  const [annulationEnCours, setAnnulationEnCours] = useState<string | null>(null);
  /** Le refus d'annulation, rendu TEL QUEL sur la ligne concernée. */
  const [refusAnnulation, setRefusAnnulation] = useState<Record<string, string>>({});
  /**
   * Les clés que le récapitulatif doit préparer. `cles: undefined` = tout le
   * plan du moment ; une seule clé = l'envoi d'une ligne.
   *
   * ⚠ `null` FERME la modale, et c'est ce qui garantit une préparation NEUVE à
   * chaque ouverture : `<RecapitulatifEnvoi>` relance `preparerEnvoiSignature`
   * sur la transition `open`, donc l'aperçu — et le hash qu'il porte — ne
   * peuvent pas dater d'une session de travail antérieure.
   */
  const [demandeRecapitulatif, setDemandeRecapitulatif] = useState<{
    cles?: string[];
  } | null>(null);

  /**
   * La zone de dépôt est-elle proposable ? Trois conditions, aucune devinée :
   * l'appelant l'a câblée (`depotDocType`), le rôle autorise l'écriture, et il
   * y a quelqu'un à qui rattacher un scan.
   */
  const depotDisponible =
    depotAutorise &&
    depotDocType !== undefined &&
    depotParticipants !== undefined &&
    depotParticipants.length > 0;

  // Le bloc se tait quand il n'a rien à dire : une section vide, titrée
  // « Signature électronique », ferait chercher ce qu'il manque.
  //
  // ⚠ « Rien à dire » inclut désormais « rien à déposer » (demande n°4). Une
  // session sans pièce e-signable garde ses feuilles d'émargement à rentrer :
  // se taire lui retirerait le seul endroit où le faire.
  //
  // ⚠ ET « rien à signer » EST QUELQUE CHOSE À DIRE (lot D, défaut D-C3-4).
  // C'est ici que SES-0112 s'est joué : cinq apprenants sans aucune pièce, la
  // zone de dépôt disponible — donc le bloc s'affichait, mais RÉDUIT à cette
  // zone, ce qui se lit comme « tout va bien ». Et sans zone de dépôt, il
  // aurait disparu complètement. Dans les deux cas, personne n'apprenait que
  // cinq conventions n'existaient pas.
  const muet =
    vue.lignes.length === 0 &&
    vue.avertissements.length === 0 &&
    vue.blocages.length === 0 &&
    vue.riensASigner.length === 0 &&
    !depotDisponible;
  if (muet) return null;

  function handleAnnuler(ligne: LigneSignature) {
    const signatureRequestId = ligne.signatureRequestId;
    if (signatureRequestId === null) return;
    setAnnulationEnCours(ligne.cle);
    setRefusAnnulation((prev) => {
      const next = { ...prev };
      delete next[ligne.cle];
      return next;
    });
    startTransition(async () => {
      try {
        const res = await annulerEnvoiSignature({ signatureRequestId });
        if (res.ok) {
          toast.success(`Envoi annulé — « ${ligne.libelle} » peut repartir`);
          router.refresh();
        } else {
          // Le moteur nomme déjà l'état constaté et ce qui n'a PAS bougé
          // (`messageDemandeNonAnnulable`, `messageAnnulationPrestataireImpossible`).
          // On le rend TEL QUEL, à sa place, plutôt qu'en toast fugace.
          setRefusAnnulation((prev) => ({ ...prev, [ligne.cle]: res.error }));
        }
      } finally {
        setAnnulationEnCours(null);
      }
    });
  }

  const titre =
    scope === 'BEFORE'
      ? 'Signature électronique — avant la formation'
      : 'Signature électronique — après la formation';

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
          <FileSignature className="h-4 w-4" aria-hidden="true" /> {titre}
        </h3>

        {/* ⚠ DÉCISION LAURENT n°3 — rendu CONDITIONNEL, jamais `disabled`.
            Quand il n'y a rien à envoyer, l'élément n'existe pas dans le DOM :
            un bouton grisé laisse croire qu'il manque un réglage, et fait
            chercher un réglage qui n'existe pas. Verrouillé par le test
            « aucun élément nommé /envoyer pour signature/i ».

            ⚠ `text-white`, ÉCRIT EXPLICITEMENT (Laurent, 11/09/2026). Ce bouton
            portait `text-primary-foreground`, une classe qui ne produisait
            aucune règle CSS faute de jeton — 2,12:1, échec WCAG. Le jeton est
            désormais défini dans `tailwind.config.ts`, mais la classe explicite
            reste : elle survit à une refonte du jeton, et c'est la forme
            employée partout ailleurs dans le dépôt (`add-participant-dialog`,
            `duplicate-session-button`). `hover:bg-primary-600` plutôt que
            `bg-primary/90` pour la même raison — une couleur nommée, pas une
            opacité qui dépend du fond derrière. */}
        {vue.boutonVisible && (
          <button
            type="button"
            onClick={() => setDemandeRecapitulatif({})}
            aria-label={`Envoyer pour signature (${vue.nbEnvoyables})`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Envoyer pour signature ({vue.nbEnvoyables})
          </button>
        )}
      </div>

      {/* Les blocages d'abord : ils empêchent, ils ne préviennent pas. */}
      {vue.blocages.map((blocage) => (
        <p
          key={`blocage-${blocage.participantId}-${blocage.docType}`}
          role="alert"
          className="mb-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <OctagonAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{blocage.message}</span>
        </p>
      ))}

      {/* Puis les avertissements « régime incohérent » (garde-fou C.1).
          Ils n'ajoutent AUCUNE ligne et ne rendent AUCUN bouton : ils invitent à
          corriger la donnée. C'est la contrepartie visible du changement de
          règle du lot C.2b-1 — sans eux, un apprenant perdrait son dossier
          AGEFICE sans qu'aucun message ne le dise.

          ⚠ UN ENCART PAR PARTICIPANT (Laurent, 11/09/2026). Le moteur en rend
          un PAR PIÈCE — juste de son point de vue, chaque pièce ayant son sort —
          et Camille ROUSSEL se retrouvait affichée deux fois pour UNE seule
          correction à faire. `construireVueSignature` regroupe et compose ; ce
          composant, lui, continue de rendre le message TEL QUEL. */}
      {vue.avertissements.map((avertissement) => (
        <EncartACorriger
          key={`avert-${avertissement.participantId}`}
          message={avertissement.message}
          correction={avertissement.correction}
          participantId={avertissement.participantId}
          sessionId={sessionId}
          scope={scope}
        />
      ))}

      {/* ── D-C3-4 — CE QUE LE BLOC NE DISAIT PAS QUAND IL N'AVAIT RIEN ─────
          Constat de production du 12/09/2026 (SES-0112) : cinq apprenants
          « Agence », `regle === null` pour tous, donc aucune pièce — et aucun
          avertissement non plus, le moteur n'ayant rien d'INCOHÉRENT à
          signaler. Le bloc se réduisait à la zone de dépôt, ce qui se lit comme
          « tout va bien ». Les cinq dossiers sont partis sans convention.

          Même encart, même mécanique de lien : `composerRiensASigner` a déjà
          décidé de la phrase ET de la destination. */}
      {vue.riensASigner.map((rien) => (
        <EncartACorriger
          key={`rien-${rien.participantId}`}
          message={rien.message}
          correction={rien.correction}
          participantId={rien.participantId}
          sessionId={sessionId}
          scope={scope}
        />
      ))}

      {vue.lignes.length > 0 && (
        <ul className="divide-y divide-border">
          {vue.lignes.map((ligne) => {
            const pastille = PASTILLE[ligne.etat];
            const occupe = pending && annulationEnCours === ligne.cle;
            const refus = refusAnnulation[ligne.cle];
            return (
              <li key={ligne.cle} className="py-2.5">
                <div className="flex items-center gap-3 flex-wrap">
                  {ligne.etat === 'SIGNE' ? (
                    <span className="h-4 w-4 rounded-full bg-emerald-500 text-white inline-flex items-center justify-center shrink-0">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : ligne.etat === 'ENVOYE' ? (
                    <Clock className="h-4 w-4 text-violet-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <span
                      className="h-4 w-4 rounded-full border-2 border-sky-300 bg-sky-50 shrink-0"
                      aria-hidden="true"
                    />
                  )}

                  <span className="flex-1 min-w-0 text-sm">
                    <span className="font-medium">{ligne.libelle}</span>
                    {/* ⚠ L'ORDRE COMPLET, SUR LA LIGNE (Laurent, 11/09/2026).
                        La correction n°4 avait posé ici « signataire : Paul
                        DURAND · paul@… » pour repérer une mauvaise adresse d'un
                        coup d'œil. Elle ne disait qu'une moitié : le moteur
                        envoie DEUX signataires sur la convention et
                        l'attestation depuis le lot C.2a, et un admin pouvait
                        croire la pièce close au premier paraphe. Le
                        récapitulatif le disait déjà — mais il s'atteint APRÈS
                        avoir décidé d'envoyer, et c'est ICI qu'on décide.

                        ⚠ RIEN N'EST DÉCIDÉ NI COMPOSÉ ICI. `ligne.ordre` arrive
                        calculé par `construireVueSignature`, donc par
                        `ordreSignatairesPrevu`, donc par `ANCRES_PAR_PIECE` :
                        le dossier AGEFICE n'a qu'un rang sans que ce JSX ait à
                        le savoir. On rend `s.texte` tel quel — la phrase est
                        celle du récapitulatif, au caractère près.

                        UN ÉLÉMENT PAR RANG, et pas une chaîne unique : l'adresse
                        de chaque signataire reste portée COMPLÈTE par `title`,
                        y compris celle de l'organisme, qui n'apparaît nulle part
                        dans le texte. Une adresse qu'on ne peut plus lire ne
                        permet justement pas de repérer l'erreur. */}
                    {ligne.ordre.length === 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        signataire à déterminer
                      </span>
                    ) : (
                      <span className="block text-xs text-muted-foreground break-words">
                        {LIBELLE_ORDRE_SIGNATURE} :{' '}
                        {ligne.ordre.map((signataire, index) => {
                          // ⚠ COMPOSÉE AILLEURS (`mentionSignatureFaite`), fuseau
                          // de Paris fixé. « a signé » sans date ne dit pas si
                          // l'on attend depuis une heure ou depuis trois
                          // semaines — et c'est la seule question qui décide
                          // d'une relance.
                          const signeLe = mentionSignatureFaite(signataire.signedAt);
                          return (
                            <span key={`${ligne.cle}-${signataire.partie}-${signataire.rang}`}>
                              {index === 0 ? '' : SEPARATEUR_ORDRE}
                              <span title={signataire.email}>{signataire.texte}</span>
                              {signeLe !== null && (
                                <span className="font-medium text-emerald-700">
                                  {' '}
                                  · {signeLe}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>

                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium shrink-0',
                      pastille.classe,
                    )}
                  >
                    {pastille.texte}
                  </span>

                  {ligne.documentId && (
                    <a
                      href={`/api/documents/${ligne.documentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-primary hover:bg-primary-50 transition-colors shrink-0"
                    >
                      Ouvrir <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}

                  {/* ── LE CERTIFICAT DE SIGNATURE (lot D, défaut D-C3-5) ───
                      À CÔTÉ d'« Ouvrir », jamais à la place : ce sont DEUX
                      pièces, et un dossier AGEFICE les range toutes les deux.
                      Il était produit, stocké et joint à l'email « Votre
                      exemplaire signé » depuis le lot C.3 — mais le retrouver
                      obligeait à fouiller sa boîte mail.

                      ⚠ RIEN N'EST DÉCIDÉ ICI. `ligne.certificat` est nul sur
                      une pièce signée par un scan déposé à la main : elle n'a
                      pas de certificat, et un lien qui mène à un 404 fait
                      cesser de croire l'écran. La règle vit dans
                      `certificatDeLaPiece`, sous test unitaire.

                      `?dl=1` : le certificat se RANGE plus qu'il ne se lit. */}
                  {ligne.certificat && (
                    <a
                      href={`/api/signature-requests/${ligne.certificat.signatureRequestId}/audit-trail?dl=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Certificat de
                      signature
                    </a>
                  )}

                  {/* ── LE geste de la ligne : l'envoi, et lui seul ─────────
                      La décision n°4 faisait COEXISTER ici « Envoyer » et
                      « Déposer le scan ». Laurent la révise le 11/09/2026
                      (correction n°6) : le dépôt par ligne n'apparaissait que
                      sur la ligne AGEFICE — incohérent — et il ne doit
                      apparaître sur AUCUNE. La zone de dépôt en dessous suffit,
                      et elle traite tous les stagiaires d'un coup.

                      L'exclusion, elle, ne bouge pas : une pièce signée ne se
                      resigne pas (`sendForSignature` la refuserait,
                      `DEJA_SIGNE`), et `ligne.envoyable` est faux dès qu'un
                      signé existe — quelle qu'en soit l'origine. */}
                  {vue.canSign && ligne.envoyable && (
                    <button
                      type="button"
                      onClick={() => setDemandeRecapitulatif({ cles: [ligne.cle] })}
                      aria-label={`Envoyer pour signature — ${ligne.libelle}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-semibold shrink-0 transition-colors shadow-sm bg-primary text-white hover:bg-primary-600"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" /> Envoyer
                    </button>
                  )}

                  {/* L'annulation — livrée en C.2b-bis, sans appelant jusqu'ici.
                      `messageEnvoiEnCours` dit « Annulez l'envoi en cours » :
                      tant que ce bouton n'existait pas, l'écran promettait un
                      geste inatteignable et la pièce restait gelée. */}
                  {vue.canSign && ligne.etat === 'ENVOYE' && ligne.signatureRequestId !== null && (
                    <button
                      type="button"
                      onClick={() => handleAnnuler(ligne)}
                      disabled={occupe}
                      aria-label={`Annuler l’envoi — ${ligne.libelle}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium shrink-0 border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
                    >
                      {occupe ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Annuler l’envoi
                    </button>
                  )}
                </div>

                {/* ── UNE PIÈCE PARTIE : OÙ ELLE EN EST, ET LE GESTE QUI RESTE ──
                    Aucun lien « Relancer » — voir l'en-tête de fichier.

                    ⚠ LE LIEN « SIGNER MAINTENANT » DE L'ORGANISME (défaut
                    D-C3-1). C'est le geste que la recette a cherché en vain :
                    le client venait de signer, l'email « à votre tour » était
                    parti, et QualiOF n'offrait AUCUN moyen de signer depuis le
                    CRM. Il n'est ni grisé ni masqué — `signerMaintenant` est
                    adossé au `signedAt` du client, donc il n'existe pas tant
                    que le tour n'est pas venu. Et quand il n'existe pas,
                    `attente` dit pourquoi. */}
                {ligne.etat === 'ENVOYE' && (
                  <div className="mt-1 pl-7 space-y-1">
                    {ligne.ordre
                      .filter((s) => s.signerMaintenant && s.signUrl !== null)
                      .map((signataire) => (
                        <a
                          key={`${ligne.cle}-signer-${signataire.rang}`}
                          href={signataire.signUrl ?? ''}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-600 transition-colors shadow-sm"
                        >
                          <PenLine className="h-3.5 w-3.5" aria-hidden="true" /> Signer maintenant
                        </a>
                      ))}

                    {/* La phrase de la ligne, COMPOSÉE côté serveur : elle nomme
                        qui est attendu et promet le retour automatique du PDF
                        signé et de son certificat. Elle remplace la phrase
                        « … arrive au lot C.2c », fausse depuis le 11/09/2026. */}
                    {ligne.attente !== null && (
                      <p className="text-xs text-muted-foreground">{ligne.attente}</p>
                    )}

                    {/* Pourquoi le lien de l'ORGANISME n'est pas là — jamais une
                        absence muette, qui passerait pour une panne. */}
                    {ligne.ordre
                      .filter((s) => s.partie === 'OF' && s.attente !== null)
                      .map((signataire) => (
                        <p
                          key={`${ligne.cle}-attente-${signataire.rang}`}
                          className="text-xs text-muted-foreground"
                        >
                          {signataire.attente}
                        </p>
                      ))}

                    {ligne.signatureRequestId === null && (
                      <p className="text-xs text-muted-foreground">
                        Cet envoi n’est rattaché à aucune demande enregistrée : il n’est pas
                        annulable depuis cet écran. Rechargez la fiche session ; si l’état
                        persiste, la pièce doit être débloquée côté prestataire.
                      </p>
                    )}
                  </div>
                )}

                {refus && (
                  <p
                    role="alert"
                    className="mt-1.5 ml-7 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  >
                    {refus}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── L'AUTRE CHEMIN VERS LA MÊME PREUVE ───────────────────────────
          Repliée : le cas courant du bloc reste l'envoi en signature, pas le
          dépôt. Sous les lignes, parce qu'elle les COMPLÈTE — c'est le geste
          de masse qui rentre les feuilles ramassées en salle.

          `docType` par défaut et options viennent de l'appelant : c'est le
          moment de la formation qui sait quelles pièces peuvent revenir
          signées à la main, pas ce composant. */}
      {depotDisponible && depotDocType !== undefined && depotParticipants !== undefined && (
        <div className="mt-4">
          <SignedDocDropZone
            sessionId={sessionId}
            docType={depotDocType}
            participants={depotParticipants}
            defaultOpen={false}
            titre={TITRE_DEPOT_MANUEL}
            aide={
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>{AIDE_DEPOT_MANUEL}</p>
                {/* ⚠ CE QUI ÉVITE LE GESTE QUI DÉFAIT LE PRÉCÉDENT. Sans cette
                    phrase, l'admin qui vient d'envoyer une convention dépose
                    aussi son scan ici — et annule son propre envoi. */}
                <p>{MENTION_RETOUR_AUTOMATIQUE}</p>
              </div>
            }
            {...(depotDocTypeOptions === undefined ? {} : { docTypeOptions: depotDocTypeOptions })}
          />
        </div>
      )}

      {/* Le récapitulatif : monté SEULEMENT quand une demande existe, pour que
          chaque ouverture reparte d'une préparation neuve (cf. l'état ci-dessus). */}
      {demandeRecapitulatif !== null && (
        <RecapitulatifEnvoi
          open
          onOpenChange={(ouvert) => {
            if (!ouvert) setDemandeRecapitulatif(null);
          }}
          sessionId={sessionId}
          scope={scope}
          cles={demandeRecapitulatif.cles}
        />
      )}
    </section>
  );
}


/**
 * L'ENCART « À CORRIGER », partagé par l'avertissement de régime et le
 * « rien à signer » du lot D.
 *
 * POURQUOI PARTAGÉ. Les deux disent la même chose sous deux causes : voici ce
 * qui manque, voici où le corriger. Les rendre séparément aurait recopié la
 * règle des DEUX destinations — et c'est précisément la recopie qui avait fait
 * pointer l'avertissement TOUJOURS vers le formulaire d'inscription, faux dans
 * la moitié des cas (correction n°7 bis, Laurent 11/09/2026).
 *
 * IL NE DÉCIDE RIEN : `correctionAvertissement` a déjà tranché, et le message
 * est composé. Ce composant choisit entre deux `<Link>`, rien de plus.
 */
function EncartACorriger({
  message,
  correction,
  participantId,
  sessionId,
  scope,
}: {
  message: string;
  correction: CorrectionAvertissement;
  participantId: string;
  sessionId: string;
  scope: ScopeEnvoi;
}) {
  return (
    <div
      role="alert"
      className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0">
        {message}{' '}
        {/* `typedRoutes` est actif : Link n'accepte pas une URL construite.
            `as Route` plutôt que `as any` — on échappe au typage des routes, pas
            au typage tout court (motif de `devis/page.tsx:209`). */}
        {correction.cible === 'ORGANISATION' ? (
          <Link
            href={
              lienRenseignerFinanceur({
                organizationId: correction.organizationId,
                // Le retour suit le scope : l'admin est reposé sur l'onglet
                // qu'il a quitté.
                retourVers: retourVersOnglet(sessionId, scope === 'BEFORE' ? 'avant' : 'apres'),
              }) as Route
            }
            className="whitespace-nowrap font-semibold underline underline-offset-2 hover:text-amber-950"
          >
            {libelleLienRenseignerFinanceur(correction.libelleOrganisation)}
          </Link>
        ) : (
          <Link
            href={
              lienCorrigerFinanceur({
                sessionId,
                participantId,
                retour: scope === 'BEFORE' ? 'avant' : 'apres',
              }) as Route
            }
            className="whitespace-nowrap font-semibold underline underline-offset-2 hover:text-amber-950"
          >
            {LIBELLE_LIEN_CORRIGER_COMMANDITAIRE}
          </Link>
        )}
      </span>
    </div>
  );
}
