'use client';

/**
 * Le récapitulatif d'envoi en signature — lot C.2b-2, tâche 3.
 *
 * CE QU'IL PROMET, ET COMMENT IL LE TIENT.
 *
 * **« Vous envoyez CE PDF-là. »** Son ouverture appelle `preparerEnvoiSignature`,
 * qui RÉGÉNÈRE chaque pièce avec ses ancres de signature et rend son
 * `hashSha256`. L'aperçu affiche ce PDF régénéré lui-même, servi par
 * `/api/documents/{id}?original=1` — `original=1` parce que la route sert par
 * défaut `signedPdfUrl ?? pdfUrl`, et qu'une version signée ne porte plus
 * d'ancres : elle montrerait autre chose que ce qui partirait. Le clic repasse
 * le hash de CE PDF ; `sendForSignature` refuse si quelqu'un l'a régénéré
 * entre-temps (amendement n°5).
 *
 * **TROIS RÈGLES QUI NE SE NÉGOCIENT PAS**, chacune verrouillée par un test :
 *
 *  1. **Le hash vit DANS le même état que l'aperçu.** Jamais dans une variable
 *     séparée qui survivrait à une nouvelle préparation : ce couplage est ce qui
 *     empêche de fabriquer soi-même le refus `DOCUMENT_MODIFIE` qu'on prétend
 *     éviter. Une seule source, `preparation`, remplacée en bloc.
 *  2. **Le refus se REND, il ne se résume pas.** Les messages de
 *     `envoi-contrats.ts` disent déjà ce qui s'est passé, ce qui n'a PAS eu
 *     lieu, et le geste à faire. INTERDIT ici : `toast.error('Erreur')`,
 *     `res.error ?? 'Erreur'`, ou toute reformulation — les trois perdraient la
 *     seule phrase qui dit quoi faire. `DOCUMENT_MODIFIE` ajoute le bouton qui
 *     relance la préparation.
 *  3. **Le bandeau « aucun email » est PERMANENT**, à la revue comme au
 *     résultat. DocuSeal part en `send_email: false` (D-9) et QualiOF n'envoie
 *     rien avant le lot C.2c : sans cette phrase, l'écran laisse croire qu'un
 *     clic prévient quelqu'un. Le `signUrl` affiché avec de quoi le copier est
 *     l'unique moyen de communiquer le lien en attendant.
 *
 * **AUCUN « Relancer »** (amendement n°8) : il suppose l'email de C.2c et une
 * action `provider.remind` sans appelant.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Loader2,
  MailWarning,
  OctagonAlert,
  RefreshCw,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { preparerEnvoiSignature, sendForSignature } from '@/server/actions/signature-envoi';
import type {
  EnvoiEffectue,
  EnvoiPrepare,
  RefusEnvoi,
  SignataireResolu,
} from '@/lib/signature/envoi-contrats';
import type { AnomalieEnvoi, ScopeEnvoi } from '@/lib/signature/plan-envoi';

export interface RecapitulatifEnvoiProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  scope: ScopeEnvoi;
  /** Absent = tout le plan du moment ; une seule clé = l'envoi d'une ligne. */
  cles?: string[];
}

/**
 * ⚠ UN SEUL ÉTAT PORTE L'APERÇU **ET** LES HASHES.
 *
 * C'est volontaire et c'est la règle n°1 : les remplacer ensemble, en bloc,
 * garantit qu'on ne peut pas confirmer un hash qui ne correspond plus à ce que
 * l'admin a sous les yeux.
 */
interface Preparation {
  envois: EnvoiPrepare[];
  blocages: AnomalieEnvoi[];
  avertissements: AnomalieEnvoi[];
}

type Etape = 'preparation' | 'revue' | 'envoi' | 'resultat';

interface Resultat {
  envoyes: EnvoiEffectue[];
  refus: RefusEnvoi[];
}

/** D'où vient le NOM retenu, en français. « ORG_REPRESENTATIVE » ne se lit pas. */
const LIBELLE_SOURCE_NOM: Record<SignataireResolu['sourceNom'], string> = {
  ORG_REPRESENTATIVE: 'représentant de l’organisation',
  CONTACT_PRINCIPAL: 'contact principal de l’organisation',
  APPRENANT_EI_SELF: 'l’apprenant lui-même (son entreprise individuelle)',
  APPRENANT_REPLI: 'l’apprenant, faute de représentant connu',
  APPRENANT_STAGIAIRE: 'l’apprenant lui-même (stagiaire désigné par le régime)',
};

/** D'où vient l'ADRESSE retenue. La dérogation se lit, elle ne se devine pas. */
const LIBELLE_SOURCE_EMAIL: Record<SignataireResolu['sourceEmail'], string> = {
  PERSON: 'fiche de la personne',
  CONTACT_NOMME: 'contact portant ce nom',
  SAISI_PAR_ADMIN: 'adresse saisie à l’instant',
};

const BANDEAU_AUCUN_EMAIL =
  'La demande est créée chez le prestataire, mais aucun email n’a été envoyé au signataire : ' +
  'l’envoi automatique des emails arrive au lot C.2c. Copiez le lien de signature ci-dessous ' +
  'pour le lui transmettre.';

const BANDEAU_AUCUN_EMAIL_REVUE =
  'Envoyer ne prévient personne : aucun email n’est expédié au signataire avant le lot C.2c. ' +
  'Le lien de signature s’affichera ici après l’envoi, à copier et transmettre à la main.';

/** Un empêchement qui se corrige EN SAISISSANT une adresse, ici et maintenant. */
function manqueUneAdresse(envoi: EnvoiPrepare): boolean {
  return envoi.empechements.some((e) => e.raison === 'SIGNATAIRE_SANS_EMAIL');
}

/** Les empêchements qui ne se corrigent PAS depuis cet écran. */
function empechementsBloquants(envoi: EnvoiPrepare) {
  return envoi.empechements.filter((e) => e.raison !== 'SIGNATAIRE_SANS_EMAIL');
}

export function RecapitulatifEnvoi({
  open,
  onOpenChange,
  sessionId,
  scope,
  cles,
}: RecapitulatifEnvoiProps) {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>('preparation');
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  /** Les adresses dérogatoires saisies, par clé de pièce. */
  const [emailsSaisis, setEmailsSaisis] = useState<Record<string, string>>({});

  // `cles` est un tableau : sa RÉFÉRENCE change à chaque rendu du parent. On
  // dépend de son contenu, sinon la préparation repartirait en boucle — et
  // chaque tour régénérerait tous les PDF.
  const clesKey = cles === undefined ? '' : cles.join('|');

  const preparer = useCallback(async () => {
    setEtape('preparation');
    setErreurGlobale(null);
    setResultat(null);
    const res = await preparerEnvoiSignature({
      sessionId,
      scope,
      ...(cles === undefined ? {} : { cles }),
    });
    if (!res.ok) {
      // Le message du serveur, tel quel : il dit ce qui n'appartient pas à cet
      // espace, ou ce qui est invalide dans la demande.
      setErreurGlobale(res.error);
      setPreparation(null);
      setEtape('revue');
      return;
    }
    // ⚠ RÈGLE n°1 — aperçu ET hashes remplacés EN BLOC. Rien ne survit d'une
    // préparation à l'autre : c'est ce qui rend impossible de confirmer un hash
    // qui ne correspond plus au PDF affiché.
    setPreparation({
      envois: res.envois,
      blocages: res.blocages,
      avertissements: res.avertissements,
    });
    setEtape('revue');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, scope, clesKey]);

  useEffect(() => {
    if (!open) return;
    void preparer();
  }, [open, preparer]);

  /** Les pièces réellement envoyables, avec le hash de la DERNIÈRE préparation. */
  const ciblesPretes = (preparation?.envois ?? []).flatMap((envoi) => {
    if (envoi.document === null) return [];
    if (empechementsBloquants(envoi).length > 0) return [];
    const saisi = (emailsSaisis[envoi.cle] ?? '').trim();
    if (manqueUneAdresse(envoi) && saisi.length === 0) return [];
    return [
      {
        cle: envoi.cle,
        hashConfirme: envoi.document.hash,
        ...(saisi.length > 0 ? { emailSaisi: saisi } : {}),
      },
    ];
  });

  async function handleEnvoyer() {
    if (ciblesPretes.length === 0) return;
    setEtape('envoi');
    const res = await sendForSignature({ sessionId, scope, cibles: ciblesPretes });
    if (!res.ok) {
      setErreurGlobale(res.error);
      setEtape('revue');
      return;
    }
    setResultat({ envoyes: res.envoyes, refus: res.refus });
    setEtape('resultat');
    if (res.envoyes.length > 0) {
      toast.success(
        `${res.envoyes.length} pièce${res.envoyes.length > 1 ? 's' : ''} envoyée${
          res.envoyes.length > 1 ? 's' : ''
        } en signature`,
      );
      router.refresh();
    }
  }

  function copier(lien: string) {
    // Le lien reste AFFICHÉ et sélectionnable quoi qu'il arrive : un
    // presse-papiers indisponible (contexte non sécurisé, navigateur ancien) ne
    // doit pas transformer le seul moyen de transmettre le lien en cul-de-sac.
    void navigator.clipboard
      ?.writeText(lien)
      .then(() => toast.success('Lien de signature copié'))
      .catch(() => toast.info('Copie impossible : sélectionnez le lien à la main.'));
  }

  const refusReouvrable =
    resultat?.refus.some((r) => r.raison === 'DOCUMENT_MODIFIE' || r.raison === 'CLE_INCONNUE') ??
    false;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[860px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">
            Envoyer en signature — récapitulatif
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Relisez le PDF exact qui partira, et qui le signera. Rien n’est envoyé avant votre
            confirmation.
          </Dialog.Description>

          {erreurGlobale && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <OctagonAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{erreurGlobale}</span>
            </p>
          )}

          {etape === 'preparation' && (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Régénération des documents avec leurs zones de signature…
            </p>
          )}

          {(etape === 'revue' || etape === 'envoi') && preparation !== null && (
            <div className="mt-4 space-y-4">
              {/* RÈGLE n°3 — visible AVANT le clic. Personne ne doit croire
                  qu'envoyer prévient qui que ce soit. */}
              <p className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                <MailWarning className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{BANDEAU_AUCUN_EMAIL_REVUE}</span>
              </p>

              {preparation.blocages.map((blocage) => (
                <p
                  key={`bloc-${blocage.participantId}-${blocage.docType}`}
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  <OctagonAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{blocage.message}</span>
                </p>
              ))}

              {preparation.avertissements.map((avertissement) => (
                <p
                  key={`avert-${avertissement.participantId}-${avertissement.docType}`}
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{avertissement.message}</span>
                </p>
              ))}

              {preparation.envois.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Aucune pièce à envoyer pour ce moment de la formation.
                </p>
              )}

              {preparation.envois.map((envoi) => (
                <PieceARelire
                  key={envoi.cle}
                  envoi={envoi}
                  emailSaisi={emailsSaisis[envoi.cle] ?? ''}
                  onEmailChange={(valeur) =>
                    setEmailsSaisis((prev) => ({ ...prev, [envoi.cle]: valeur }))
                  }
                />
              ))}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm"
                  >
                    Fermer
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={handleEnvoyer}
                  disabled={etape === 'envoi'}
                  aria-label={`Envoyer ${ciblesPretes.length} pièce${
                    ciblesPretes.length > 1 ? 's' : ''
                  } en signature`}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold',
                    'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait',
                  )}
                >
                  {etape === 'envoi' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  Envoyer ({ciblesPretes.length})
                </button>
              </div>
            </div>
          )}

          {etape === 'resultat' && resultat !== null && (
            <div className="mt-4 space-y-4">
              {resultat.envoyes.length > 0 && (
                <p className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  <MailWarning className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{BANDEAU_AUCUN_EMAIL}</span>
                </p>
              )}

              {resultat.envoyes.map((envoye) => (
                <div
                  key={envoye.cle}
                  className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-sm"
                >
                  <p className="flex items-center gap-2 font-medium text-emerald-900">
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                    {envoye.cle} — envoyée en signature
                  </p>
                  <p className="mt-1 text-emerald-900">
                    Signataire : <strong>{envoye.signataire.nom}</strong> —{' '}
                    {envoye.signataire.email}{' '}
                    <span className="text-muted-foreground">
                      ({LIBELLE_SOURCE_EMAIL[envoye.signataire.source]})
                    </span>
                  </p>
                  {envoye.signUrl === null ? (
                    <p className="mt-1.5 text-xs text-amber-900">
                      Le prestataire n’a rendu aucun lien de signature pour cette pièce : elle est
                      bien créée chez lui, mais le lien devra y être récupéré à la main.
                    </p>
                  ) : (
                    <div className="mt-2">
                      <label
                        htmlFor={`lien-${envoye.cle}`}
                        className="block text-xs font-medium mb-1"
                      >
                        Lien de signature à transmettre
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`lien-${envoye.cle}`}
                          readOnly
                          value={envoye.signUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-w-0 rounded-md border border-border bg-white px-2 py-1 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => copier(envoye.signUrl ?? '')}
                          // ⚠ Ne PAS répéter « lien de signature » ici : le
                          // <label> du champ le porte déjà, et deux nœuds
                          // portant le même nom accessible rendent
                          // `getByLabelText` ambigu — pour un lecteur d'écran
                          // comme pour un test.
                          aria-label={`Copier le lien — ${envoye.cle}`}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted"
                        >
                          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" /> Copier le
                          lien
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* RÈGLE n°2 — le message du moteur, TEL QUEL. Il dit ce qui a
                  changé, que rien n'est parti, et le geste. Le résumer ou le
                  passer en toast perdrait la seule phrase qui dit quoi faire. */}
              {resultat.refus.map((refus) => (
                <p
                  key={`refus-${refus.cle}`}
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  <OctagonAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{refus.message}</span>
                </p>
              ))}

              <div className="flex items-center justify-end gap-2 pt-2">
                {refusReouvrable && (
                  <button
                    type="button"
                    onClick={() => void preparer()}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-muted"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Rouvrir le
                    récapitulatif
                  </button>
                )}
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm"
                  >
                    Fermer
                  </button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ── Une pièce à relire ───────────────────────────────────────────────── */

function PieceARelire({
  envoi,
  emailSaisi,
  onEmailChange,
}: {
  envoi: EnvoiPrepare;
  emailSaisi: string;
  onEmailChange: (valeur: string) => void;
}) {
  const bloquants = empechementsBloquants(envoi);
  const adresseAttendue = manqueUneAdresse(envoi);
  const partira =
    envoi.document !== null &&
    bloquants.length === 0 &&
    (!adresseAttendue || emailSaisi.trim().length > 0);

  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-sm font-semibold">{envoi.libelle}</h4>
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-0.5 rounded-full border text-xs font-medium',
            partira
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900',
          )}
        >
          {partira ? 'Partira' : 'Ne partira pas'}
        </span>
      </div>

      {/* Ce que l'admin relit : le PDF RÉGÉNÉRÉ lui-même. `?original=1` sert le
          `pdfUrl` — la route rend sinon `signedPdfUrl ?? pdfUrl`, et une version
          signée ne porte plus les ancres qui partiraient. */}
      {envoi.document !== null && (
        <>
          <iframe
            src={`/api/documents/${envoi.document.documentId}?original=1`}
            title={`Aperçu — ${envoi.libelle}`}
            className="mt-2 w-full h-64 rounded border border-border bg-muted"
          />
          {envoi.document.regenere && (
            <p className="mt-1 text-xs text-muted-foreground">
              Pièce régénérée à l’instant avec ses zones de signature : c’est cette version-là qui
              partira.
            </p>
          )}
        </>
      )}

      {envoi.signataire !== null && (
        <p className="mt-2 text-sm">
          Signera : <strong>{envoi.signataire.nom}</strong> — {envoi.signataire.email}
          <span className="text-muted-foreground">
            {' '}
            (nom : {LIBELLE_SOURCE_NOM[envoi.signataire.sourceNom]} · adresse :{' '}
            {LIBELLE_SOURCE_EMAIL[envoi.signataire.sourceEmail]})
          </span>
        </p>
      )}

      {/* Les empêchements qui ne se corrigent pas ici : rendus TELS QUELS. */}
      {bloquants.map((empechement) => (
        <p
          key={`${envoi.cle}-${empechement.raison}`}
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <OctagonAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{empechement.message}</span>
        </p>
      ))}

      {/* La SEULE dérogation au « pas de repli sur un autre contact » : une
          adresse saisie à la main, décision humaine, journalisée avec le nom
          retenu (`SAISI_PAR_ADMIN`). */}
      {adresseAttendue && bloquants.length === 0 && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          {envoi.empechements
            .filter((e) => e.raison === 'SIGNATAIRE_SANS_EMAIL')
            .map((e) => (
              <p key={e.raison} role="alert" className="text-sm text-amber-900">
                {e.message}
              </p>
            ))}
          <label
            htmlFor={`email-${envoi.cle}`}
            className="mt-2 block text-xs font-medium text-amber-900"
          >
            Adresse email du signataire
          </label>
          <input
            id={`email-${envoi.cle}`}
            type="email"
            value={emailSaisi}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="prenom.nom@exemple.fr"
            className="mt-1 w-full max-w-sm rounded-md border border-border bg-white px-2 py-1 text-sm"
          />
          {emailSaisi.trim().length === 0 && (
            <p className="mt-1 text-xs text-amber-900">
              Tant que cette adresse est vide, la pièce est exclue de l’envoi : aucune autre
              adresse ne sera utilisée à sa place.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
