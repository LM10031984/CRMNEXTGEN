import {
  Building2,
  MapPin,
  Image,
  Hash,
  CreditCard,
  Mail,
  Users,
  Sparkles,
  Settings,
  FileText,
  Receipt,
} from 'lucide-react';
import { prisma } from '@qualiof/db';
import { validateRequest } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { SettingsSection } from '@/components/settings/settings-section';
import { OfIdentityForm } from '@/components/settings/of-identity-form';
import { OfAddressForm } from '@/components/settings/of-address-form';
import { OfAssetsForm } from '@/components/settings/of-assets-form';
import { OfInvoicingForm } from '@/components/settings/of-invoicing-form';
import { OfBankingForm } from '@/components/settings/of-banking-form';
import { OfEmailForm } from '@/components/settings/of-email-form';
import { InvoiceSettingsForm } from '@/components/parametres/invoice-settings-form';
import { LegalDocsForm } from '@/components/parametres/legal-docs-form';
import { EmailSettingsForm } from '@/components/parametres/email-settings-form';
import { EMAIL_CATEGORY_LABELS, EMAIL_CATEGORY_FIELD } from '@/lib/email-policy';
import { formatIban } from '@/lib/iban-format';

const ICON_CLASS = 'h-5 w-5 mt-0.5 text-primary shrink-0';

/**
 * Page Paramètres OF (Phase 7 Plan 07-04).
 *
 * Server Component qui :
 *  - Récupère le Tenant complet + count factures
 *  - Rend 6 sections éditables (inline edit via SettingsSection) +
 *    3 sections legacy en lecture seule (Utilisateurs / OPCO / Docs Qualiopi)
 *  - Layout : grid 1 colonne, sections empilées (recommandation A Finding 8
 *    RESEARCH.md — préfère "scroll continu" plutôt que tabs pour réduire
 *    la charge cognitive sur une page peu fréquentée).
 *
 * Décisions UX :
 *  - "Modifier" par section (pas un mode édition global) → cohérent avec
 *    le pattern fiche apprenant Phase 5.
 *  - Sections legacy conservées en bas (Utilisateurs/OPCO/Docs) avec
 *    `allowEdit={false}` → pas de bouton Modifier.
 *  - Préférence stockage hybride BDD ⤳ ENV (D-01 CONTEXT.md) :
 *    si BDD est null → afficher placeholder italique "à renseigner".
 */
export default async function ParametresPage() {
  const { user } = await validateRequest();
  if (!user) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
  });
  const invoiceCount = await prisma.invoice.count({
    where: { tenantId: user.tenantId },
  });
  const usersCount = await prisma.user.count({ where: { tenantId: user.tenantId } });

  // Phase 22 Plan 22-11 — réglages envois emails (nullable → défauts tout OFF).
  const emailSettings = await prisma.tenantEmailSettings.findUnique({
    where: { tenantId: user.tenantId },
  });
  const emailSettingsInitial = {
    emailsEnabled: emailSettings?.emailsEnabled ?? false,
    invoiceRemindersEnabled: emailSettings?.invoiceRemindersEnabled ?? false,
    preinscriptionRemindersEnabled: emailSettings?.preinscriptionRemindersEnabled ?? false,
    opcoRemindersEnabled: emailSettings?.opcoRemindersEnabled ?? false,
    opcoSubmissionsEnabled: emailSettings?.opcoSubmissionsEnabled ?? false,
    internalNotificationsEnabled: emailSettings?.internalNotificationsEnabled ?? false,
    userInvitationsEnabled: emailSettings?.userInvitationsEnabled ?? false,
    diagnosticProgramsEnabled: emailSettings?.diagnosticProgramsEnabled ?? false,
    testSessionIds: emailSettings?.testSessionIds ?? [],
  };
  // Sessions sélectionnables : 30 plus récentes ∪ celles déjà en mode test
  // (jamais masquer une sélection existante).
  const recentSessions = await prisma.trainingSession.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { startDate: 'desc' },
    take: 30,
    select: { id: true, code: true, startDate: true, product: { select: { title: true } } },
  });
  const missingTestIds = emailSettingsInitial.testSessionIds.filter(
    (id) => !recentSessions.some((s) => s.id === id),
  );
  const extraSessions = missingTestIds.length
    ? await prisma.trainingSession.findMany({
        where: { id: { in: missingTestIds }, tenantId: user.tenantId },
        select: { id: true, code: true, startDate: true, product: { select: { title: true } } },
      })
    : [];
  const sessionDateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });
  const selectableSessions = [...recentSessions, ...extraSessions].map((s) => ({
    id: s.id,
    label: `${s.code} · ${s.product.title} · ${sessionDateFmt.format(s.startDate)}`,
  }));
  const enabledCategories = Object.entries(EMAIL_CATEGORY_FIELD)
    .filter(([, field]) => emailSettingsInitial[field])
    .map(([category]) => EMAIL_CATEGORY_LABELS[category as keyof typeof EMAIL_CATEGORY_LABELS]);

  const opcos = await prisma.opcoCatalog.findMany({ orderBy: { name: 'asc' } });
  const docCatalog = await prisma.qualiopiDocCatalog.findMany({
    orderBy: { phase: 'asc' },
  });

  if (!tenant) {
    return (
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="Paramètres"
          subtitle="Configuration de votre organisme de formation"
        />
        <p className="text-sm text-red-600">Tenant introuvable.</p>
      </div>
    );
  }

  // Adresse — le Json Prisma est typé `JsonValue`. On cast en shape connue.
  const address = (tenant.address ?? null) as {
    street?: string;
    street2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  } | null;

  const invoicePrefix = tenant.invoicePrefix ?? 'FAC';

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Paramètres"
        subtitle="Configuration de votre organisme de formation"
      />

      <div className="grid grid-cols-1 gap-6">
        {/* ─── 1. Organisme — Identité légale (SET-01) ──────────────────── */}
        <SettingsSection
          icon={<Building2 className={ICON_CLASS} aria-hidden="true" />}
          title="Organisme — Identité légale"
          description="Raison sociale, SIRET, déclaration d'activité, RCS, forme juridique"
          readView={
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Raison sociale" value={tenant.name} />
              <Field label="SIRET" value={tenant.siret} />
              <Field label="N° Déclaration d'activité" value={tenant.numDA} />
              <Field label="RCS" value={tenant.rcs} />
              <Field label="Forme juridique" value={tenant.legalForm} />
            </dl>
          }
          editView={<OfIdentityForm
              initial={{
                name: tenant.name,
                siret: tenant.siret,
                numDA: tenant.numDA,
                rcs: tenant.rcs,
                legalForm: tenant.legalForm,
              }}
            />}
        />

        {/* ─── 2. Adresse & mentions légales (SET-02 texte) ─────────────── */}
        <SettingsSection
          icon={<MapPin className={ICON_CLASS} aria-hidden="true" />}
          title="Adresse & mentions légales"
          description="Apparaît dans les conventions, factures et documents Qualiopi"
          readView={
            <dl className="space-y-3">
              <Field
                label="Adresse"
                value={
                  address
                    ? [
                        address.street,
                        address.street2,
                        [address.postalCode, address.city]
                          .filter(Boolean)
                          .join(' '),
                        address.country,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : null
                }
              />
              <Field
                label="Mentions légales"
                value={
                  tenant.legalMentions ? (
                    <span className="whitespace-pre-wrap">{tenant.legalMentions}</span>
                  ) : null
                }
              />
            </dl>
          }
          editView={<OfAddressForm
              initial={{
                address: address ?? null,
                legalMentions: tenant.legalMentions,
              }}
            />}
        />

        {/* ─── 3. Logo & signatures (SET-02 assets) ──────────────────── */}
        <SettingsSection
          icon={<Image className={ICON_CLASS} aria-hidden="true" />}
          title="Logo & signatures"
          description="Affichés en en-tête / pied des documents Qualiopi générés"
          readView={
            <div className="text-sm text-muted-foreground">
              Cliquer sur <strong>Modifier</strong> pour gérer le logo et les
              signatures.
              {(tenant.logoPath ||
                tenant.signaturePedagoPath ||
                tenant.signatureDirigeantPath) && (
                <ul className="mt-2 text-xs space-y-0.5">
                  {tenant.logoPath && <li>• Logo personnalisé actif</li>}
                  {tenant.signaturePedagoPath && (
                    <li>• Signature responsable pédagogique personnalisée</li>
                  )}
                  {tenant.signatureDirigeantPath && (
                    <li>• Signature dirigeant personnalisée</li>
                  )}
                </ul>
              )}
            </div>
          }
          editView={<OfAssetsForm
              initial={{
                logoPath: tenant.logoPath,
                signaturePedagoPath: tenant.signaturePedagoPath,
                signatureDirigeantPath: tenant.signatureDirigeantPath,
              }}
            />}
        />

        {/* ─── 4. Numérotation factures (SET-03 préfixe) ─────────────── */}
        <SettingsSection
          icon={<Hash className={ICON_CLASS} aria-hidden="true" />}
          title="Numérotation factures"
          description={`Prochain numéro : ${invoicePrefix}-${(invoiceCount + 1).toString().padStart(6, '0')}`}
          readView={
            <dl className="space-y-3">
              <Field label="Préfixe" value={<span className="font-mono">{invoicePrefix}</span>} />
              <Field
                label="Factures émises"
                value={
                  invoiceCount > 0
                    ? `${invoiceCount} facture${invoiceCount > 1 ? 's' : ''}`
                    : 'Aucune facture émise pour l\'instant'
                }
              />
            </dl>
          }
          editView={<OfInvoicingForm
              initial={{
                invoicePrefix,
                iban: tenant.iban,
                bic: tenant.bic,
              }}
              invoiceCount={invoiceCount}
            />}
        />

        {/* ─── 4bis. Facturation — Relances et avoirs (Phase 11 Plan 11-04) ─ */}
        <SettingsSection
          icon={<Receipt className={ICON_CLASS} aria-hidden="true" />}
          title="Facturation — Relances et avoirs"
          description="Préfixe séquence avoirs (CGI art. 289) et délais de relance impayés"
          readView={
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field
                label="Préfixe avoirs"
                value={
                  <span className="font-mono">
                    {tenant.creditNotePrefix ?? 'AVO'}
                  </span>
                }
              />
              <Field
                label="Délais de relance (jours)"
                value={
                  <span className="font-mono">
                    {(tenant.invoiceReminderDays?.length
                      ? tenant.invoiceReminderDays
                      : [30, 45]
                    ).join(', ')}
                  </span>
                }
              />
            </dl>
          }
          editView={<InvoiceSettingsForm
              initial={{
                invoiceReminderDays:
                  tenant.invoiceReminderDays?.length
                    ? tenant.invoiceReminderDays
                    : [30, 45],
                creditNotePrefix: tenant.creditNotePrefix,
              }}
            />}
        />

        {/* ─── 4bis-2. Envois d'emails (Phase 22 Plan 22-11 — D-06) ────── */}
        <SettingsSection
          icon={<Mail className={ICON_CLASS} aria-hidden="true" />}
          title="Envois d'emails"
          description="Garde-fou applicatif : rien ne part sans activation explicite (fail-closed)"
          readView={
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {emailSettingsInitial.emailsEnabled ? (
                  <Badge variant="success">Actifs</Badge>
                ) : (
                  <Badge variant="muted">Coupés — mode test</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {emailSettingsInitial.emailsEnabled
                    ? 'Les catégories cochées envoient pour tout le parc.'
                    : 'Aucun email ne part, sauf sessions de test autorisées (catégories cochées).'}
                </span>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <Field
                  label="Catégories autorisées"
                  value={
                    enabledCategories.length > 0 ? enabledCategories.join(', ') : (
                      <span className="text-muted-foreground italic">
                        Aucune — tout est décoché (défaut)
                      </span>
                    )
                  }
                />
                <Field
                  label="Sessions en mode test"
                  value={
                    emailSettingsInitial.testSessionIds.length > 0
                      ? `${emailSettingsInitial.testSessionIds.length} session${emailSettingsInitial.testSessionIds.length > 1 ? 's' : ''}`
                      : null
                  }
                />
              </dl>
            </div>
          }
          editView={<EmailSettingsForm
              initial={emailSettingsInitial}
              sessions={selectableSessions}
            />}
        />

        {/* ─── 4ter. Documents légaux statiques (BUG-15) ───────────── */}
        <SettingsSection
          icon={<FileText className={ICON_CLASS} aria-hidden="true" />}
          title="Documents légaux"
          description="CGV (indic 1 Qualiopi) + Règlement intérieur (indic 9) — markdown éditable, PDF à la volée"
          readView={
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <Field
                label="CGV"
                value={
                  tenant.cgvMarkdown ? (
                    <span className="text-emerald-600">
                      ✓ {tenant.cgvMarkdown.length.toLocaleString('fr-FR')} caractères
                    </span>
                  ) : (
                    <span className="text-orange-600 italic">Non rédigées</span>
                  )
                }
              />
              <Field
                label="Règlement intérieur"
                value={
                  tenant.reglementInterieurMarkdown ? (
                    <span className="text-emerald-600">
                      ✓ {tenant.reglementInterieurMarkdown.length.toLocaleString('fr-FR')} caractères
                    </span>
                  ) : (
                    <span className="text-orange-600 italic">Non rédigé</span>
                  )
                }
              />
            </dl>
          }
          editView={<LegalDocsForm
              initial={{
                cgvMarkdown: tenant.cgvMarkdown ?? null,
                reglementInterieurMarkdown: tenant.reglementInterieurMarkdown ?? null,
              }}
            />}
        />

        {/* ─── 5. Coordonnées bancaires (SET-03 RIB) ─────────────────── */}
        <SettingsSection
          icon={<CreditCard className={ICON_CLASS} aria-hidden="true" />}
          title="Coordonnées bancaires"
          description="Apparaissent en bas des factures et conventions"
          readView={
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">IBAN</dt>
                <dd className="font-mono text-sm mt-0.5">
                  {tenant.iban ? formatIban(tenant.iban) : (
                    <span className="text-muted-foreground italic">à renseigner</span>
                  )}
                </dd>
              </div>
              <Field
                label="BIC"
                value={tenant.bic ? <span className="font-mono">{tenant.bic}</span> : null}
              />
            </dl>
          }
          editView={<OfBankingForm
              initial={{
                invoicePrefix,
                iban: tenant.iban,
                bic: tenant.bic,
              }}
            />}
        />

        {/* ─── 6. Email expéditeur (SET-03 email) ────────────────────── */}
        <SettingsSection
          icon={<Mail className={ICON_CLASS} aria-hidden="true" />}
          title="Email expéditeur"
          description="Adresse 'From' des emails envoyés par l'application"
          readView={
            <dl className="space-y-3">
              <Field
                label="Adresse d'envoi"
                value={
                  tenant.emailFrom ? (
                    <a
                      href={`mailto:${tenant.emailFrom}`}
                      className="text-primary hover:underline"
                    >
                      {tenant.emailFrom}
                    </a>
                  ) : null
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Le mot de passe SMTP reste géré dans la configuration serveur.
              </p>
            </dl>
          }
          editView={<OfEmailForm
              initial={{ emailFrom: tenant.emailFrom }}
            />}
        />

        {/* ─── Sections legacy read-only ──────────────────────────────── */}

        <SettingsSection
          icon={<Users className={ICON_CLASS} aria-hidden="true" />}
          title={`Utilisateurs (${usersCount})`}
          description="Gestion des accès et des rôles"
          allowEdit={false}
          readView={
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Rôles : ADMIN, MANAGER, FORMATEUR, COMMERCIAL, COMPTABLE, LECTEUR.
              </p>
              <a
                href="/app/parametres/utilisateurs"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Gérer les utilisateurs
                <span aria-hidden="true">→</span>
              </a>
            </div>
          }
        />

        <SettingsSection
          icon={<Sparkles className={ICON_CLASS} aria-hidden="true" />}
          title={`OPCO référencés (${opcos.length})`}
          description="Catalogue des financeurs alimentant le module Dossiers OPCO"
          allowEdit={false}
          readView={
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {opcos.map((o) => (
                <div
                  key={o.id}
                  className="rounded-lg border border-border p-3 text-sm flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {o.type}{' '}
                      {o.averageDelayDays ? `· délai ${o.averageDelayDays}j` : ''}
                      {o.yearlyCapPerPerson
                        ? ` · plafond ${Number(o.yearlyCapPerPerson).toFixed(0)}€/an`
                        : ''}
                    </div>
                  </div>
                  <Badge variant="success">{o.status}</Badge>
                </div>
              ))}
            </div>
          }
        />

        <SettingsSection
          icon={<Settings className={ICON_CLASS} aria-hidden="true" />}
          title={`Référentiel documents Qualiopi (${docCatalog.length})`}
          description="32 indicateurs Qualiopi — alimenté par la seed Prisma"
          allowEdit={false}
          readView={
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        Document
                      </span>
                    </th>
                    <th className="px-2 py-2">Phase</th>
                    <th className="px-2 py-2">Indicateur</th>
                    <th className="px-2 py-2">Obligatoire</th>
                    <th className="px-2 py-2">Délai</th>
                  </tr>
                </thead>
                <tbody>
                  {docCatalog.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-2 font-medium">{d.name}</td>
                      <td className="px-2 py-2 text-xs">
                        <Badge variant="muted">{d.phase}</Badge>
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {d.qualiopiIndicator ?? '—'}
                      </td>
                      <td className="px-2 py-2">
                        {d.isMandatory ? (
                          <Badge variant="primary">Oui</Badge>
                        ) : (
                          <Badge variant="muted">Non</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {d.recommendedDelay ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'string' && value.trim() === '');
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </dt>
      <dd className="mt-0.5">
        {isEmpty ? (
          <span className="text-muted-foreground italic">à renseigner</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
