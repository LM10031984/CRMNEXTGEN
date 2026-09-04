/**
 * Backfill — une LIGNE DE SYNTHÈSE par facture existante (lot 1 e-invoicing).
 *
 * Le profil EN 16931 exige des lignes ; aucune facture du parc n'en a. Ce
 * script en pose une, et RIEN d'autre.
 *
 * ── La règle qui commande tout le reste ──────────────────────────────────
 *
 * AUCUNE MODIFICATION DE MONTANT. Une facture émise ne se modifie pas ; elle
 * s'annule par avoir (code de commerce, et règle `/tarification` du dépôt). On
 * ajoute de la STRUCTURE autour d'un montant qu'on ne touche pas.
 *
 * Concrètement : `totalHT` et `unitPriceHT` reçoivent l'objet `Decimal` de
 * `Invoice.amountHT` TEL QUEL — pas `Number(...)` puis reconversion. Le
 * round-trip serait exact aux montants qu'on manipule, mais « exact en
 * pratique » n'est pas un argument sur une pièce comptable.
 *
 * ── Sûr par défaut ───────────────────────────────────────────────────────
 *
 * Inventaire seul, sauf `--apply` explicite (même discipline que
 * `purge-orphan-drafts.ts` : lister, faire valider, puis exécuter).
 *
 *   pnpm invoices:backfill-lines                  # inventaire + plan
 *   pnpm invoices:backfill-lines --apply          # écriture
 *   pnpm invoices:backfill-lines --limit=50       # borne le lot
 *   pnpm invoices:backfill-lines --tenant=<uuid>  # un seul tenant
 *
 * Idempotent : ne touche que les factures à ZÉRO ligne. Relancé, il ne fait
 * rien. Chaque écriture pose un `AuditLog` `invoices.lines_backfilled` dans la
 * MÊME transaction que la ligne — `userId: null`, convention « action système »
 * déjà en vigueur pour le worker de relances.
 */

import { prisma, Prisma } from '@qualiof/db';
import { MENTION_TVA } from '../src/lib/catalogue-constants';
import { resolveSiren, vatCategoryFor } from '../src/lib/einvoice/invoice-snapshot';

// ─── Arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith('--limit='));
  if (!a) return null;
  const n = Number(a.slice('--limit='.length));
  if (!Number.isInteger(n) || n < 1) throw new Error(`--limit invalide : ${a}`);
  return n;
})();
const TENANT = args.find((x) => x.startsWith('--tenant='))?.slice('--tenant='.length) ?? null;

const inconnus = args.filter(
  (a) => a !== '--apply' && !a.startsWith('--limit=') && !a.startsWith('--tenant='),
);
if (inconnus.length > 0) {
  throw new Error(`Argument inconnu : ${inconnus.join(', ')}`);
}

// ─── Libellé de la ligne de synthèse ──────────────────────────────────────

const UNITE_FORFAIT = 'C62';

interface FactureAConvertir {
  id: string;
  tenantId: string;
  number: string;
  status: string;
  amountHT: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  participantId: string | null;
  label: string;
}

function euros(d: Prisma.Decimal | number): string {
  return `${Number(d).toFixed(2)} €`;
}

// ─── Programme ────────────────────────────────────────────────────────────

async function main() {
  const scope = TENANT ? { tenantId: TENANT } : {};
  console.log(
    `Backfill lignes de facture — ${APPLY ? 'ÉCRITURE (--apply)' : 'INVENTAIRE (aucune écriture)'}` +
      `${TENANT ? ` · tenant ${TENANT}` : ''}${LIMIT ? ` · limite ${LIMIT}` : ''}\n`,
  );

  // ── 1. État des lieux ───────────────────────────────────────────────────

  const total = await prisma.invoice.count({ where: scope });
  const avecLignes = await prisma.invoice.count({
    where: { ...scope, lines: { some: {} } },
  });
  const sansParties = await prisma.invoice.count({
    where: { ...scope, parties: { none: {} } },
  });
  const sansEmpreinte = await prisma.invoice.count({
    where: { ...scope, sourceFingerprint: null },
  });

  console.log('── Parc ─────────────────────────────────────────────');
  console.log(`  factures                     ${total}`);
  console.log(`  déjà porteuses de lignes     ${avecLignes}`);
  console.log(`  sans ligne (candidates)      ${total - avecLignes}`);
  console.log(`  sans partie figée            ${sansParties}`);
  console.log(`  sans empreinte source        ${sansEmpreinte}`);

  // ── 2. Contrat de montants sur ce qui a DÉJÀ des lignes ────────────────
  //
  // Ce que le test `invoices-lines-contract` vérifie en CI, appliqué au parc
  // réel : si une ligne existante ne redonne pas le total, le backfill n'est
  // pas le sujet — il y a une incohérence à comprendre avant d'en ajouter.

  const dejaLignees = await prisma.invoice.findMany({
    where: { ...scope, lines: { some: {} } },
    select: { number: true, amountHT: true, lines: { select: { totalHT: true } } },
  });
  const violations = dejaLignees
    .map((f) => ({
      number: f.number,
      ecart:
        Math.round(
          (Number(f.amountHT) - f.lines.reduce((s, l) => s + Number(l.totalHT), 0)) * 100,
        ) / 100,
    }))
    .filter((f) => f.ecart !== 0);

  if (violations.length > 0) {
    console.log('\n⚠ Contrat amountHT === Σ lines.totalHT VIOLÉ :');
    for (const v of violations) console.log(`  ${v.number} — écart ${euros(v.ecart)}`);
    console.log('  → à comprendre AVANT tout backfill. Rien n’est écrit.');
    return;
  }
  console.log(`  contrat de montants          ${dejaLignees.length} vérifiée(s), 0 écart`);

  // ── 3. Ce qui bloquerait une émission aujourd'hui ──────────────────────
  //
  // Information, pas action : depuis ce lot, une facture NEUVE est refusée si
  // le payeur n'a ni SIREN ni SIRET. Autant savoir combien de fiches sont à
  // compléter avant que quelqu'un ne le découvre en cliquant.

  const payeurs = await prisma.organization.findMany({
    where: { ...scope, invoices: { some: {} } },
    select: { legalName: true, siren: true, siret: true },
  });
  const sansSiren = payeurs.filter((o) => resolveSiren(o) === null);
  console.log(
    `  payeurs sans SIREN ni SIRET  ${sansSiren.length} / ${payeurs.length}` +
      (sansSiren.length > 0 ? '  (émission refusée tant que la fiche n’est pas complétée)' : ''),
  );
  for (const o of sansSiren.slice(0, 10)) console.log(`      · ${o.legalName}`);
  if (sansSiren.length > 10) console.log(`      … et ${sansSiren.length - 10} autre(s)`);

  // ── 4. Candidates ──────────────────────────────────────────────────────

  const candidates = await prisma.invoice.findMany({
    where: { ...scope, lines: { none: {} } },
    orderBy: { number: 'asc' },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: {
      id: true,
      tenantId: true,
      number: true,
      status: true,
      amountHT: true,
      vatRate: true,
      participantId: true,
      sessionId: true,
      notes: true,
      originalInvoice: { select: { number: true } },
      participant: {
        select: {
          session: {
            select: { code: true, name: true, product: { select: { title: true } } },
          },
        },
      },
    },
  });

  if (candidates.length === 0) {
    console.log('\nRien à faire : aucune facture sans ligne.');
    return;
  }

  // Les factures groupées ne portent pas de `participantId` : leur session se
  // lit par `sessionId`. Un seul aller-retour plutôt que N.
  const sessionIds = [...new Set(candidates.map((f) => f.sessionId).filter((s): s is string => !!s))];
  const sessions = sessionIds.length
    ? await prisma.trainingSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, code: true, name: true, product: { select: { title: true } } },
      })
    : [];
  const parSession = new Map(sessions.map((s) => [s.id, s]));

  const tenants = await prisma.tenant.findMany({
    where: TENANT ? { id: TENANT } : {},
    select: { id: true, vatExemptionText: true },
  });
  const mentionParTenant = new Map(
    tenants.map((t) => [t.id, t.vatExemptionText?.trim() || MENTION_TVA]),
  );

  const aEcrire: FactureAConvertir[] = candidates.map((f) => {
    const s = f.participant?.session ?? (f.sessionId ? parSession.get(f.sessionId) : null) ?? null;
    const titre = s?.product?.title ?? s?.name ?? null;

    // Un avoir cite la pièce qu'il corrige ; une facture, sa formation. Sans
    // rattachement lisible, on écrit un libellé neutre plutôt qu'un libellé
    // inventé — la ligne de synthèse ne prétend pas savoir ce que le PDF disait.
    const label = f.originalInvoice
      ? `Avoir sur facture ${f.originalInvoice.number}`
      : titre
        ? `Formation « ${titre} »${s?.code ? ` — ${s.code}` : ''}`
        : 'Prestation de formation';

    return {
      id: f.id,
      tenantId: f.tenantId,
      number: f.number,
      status: f.status,
      amountHT: f.amountHT,
      vatRate: f.vatRate,
      participantId: f.participantId,
      label,
    };
  });

  console.log(`\n── Plan : ${aEcrire.length} ligne(s) de synthèse ────────────`);
  for (const f of aEcrire.slice(0, 15)) {
    console.log(`  ${f.number.padEnd(14)} ${f.status.padEnd(12)} ${euros(f.amountHT).padStart(12)}  ${f.label}`);
  }
  if (aEcrire.length > 15) console.log(`  … et ${aEcrire.length - 15} autre(s)`);

  if (!APPLY) {
    console.log('\nInventaire seul — rien n’a été écrit. Relancez avec --apply pour écrire.');
    return;
  }

  // ── 5. Écriture ────────────────────────────────────────────────────────

  let ecrites = 0;
  const echecs: { number: string; erreur: string }[] = [];

  for (const f of aEcrire) {
    const vatRate = Number(f.vatRate);
    const vatCategory = vatCategoryFor(vatRate);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.invoiceLine.create({
          data: {
            invoiceId: f.id,
            position: 1,
            label: f.label,
            quantity: new Prisma.Decimal(1),
            unit: UNITE_FORFAIT,
            // Le Decimal d'origine, tel quel : aucun montant n'est recalculé.
            unitPriceHT: f.amountHT,
            vatRate: f.vatRate,
            vatCategory,
            // D-2 non tranchée : pas de code VATEX inventé.
            vatExemptionReasonCode: null,
            vatExemptionReasonText:
              vatCategory === 'E' ? (mentionParTenant.get(f.tenantId) ?? MENTION_TVA) : null,
            participantId: f.participantId,
            totalHT: f.amountHT,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: f.tenantId,
            userId: null, // action système — convention du worker de relances
            entity: 'Invoice',
            entityId: f.id,
            action: 'invoices.lines_backfilled',
            diff: {
              number: f.number,
              label: f.label,
              totalHT: Number(f.amountHT),
              montantModifie: false,
            },
          },
        });
      });
      ecrites++;
    } catch (e) {
      echecs.push({ number: f.number, erreur: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`\n── Rapport ──────────────────────────────────────────`);
  console.log(`  lignes écrites               ${ecrites}`);
  console.log(`  échecs                       ${echecs.length}`);
  for (const e of echecs) console.log(`      · ${e.number} — ${e.erreur}`);

  // Vérification post-écriture : le contrat tient-il sur ce qu'on vient de poser ?
  const apres = await prisma.invoice.findMany({
    where: { ...scope, id: { in: aEcrire.map((f) => f.id) } },
    select: { number: true, amountHT: true, lines: { select: { totalHT: true } } },
  });
  const restantes = apres.filter(
    (f) =>
      f.lines.length === 0 ||
      Math.abs(Number(f.amountHT) - f.lines.reduce((s, l) => s + Number(l.totalHT), 0)) >= 0.005,
  );
  console.log(
    restantes.length === 0
      ? '  contrat après écriture       OK sur toutes les factures traitées'
      : `  ⚠ contrat ENCORE violé sur   ${restantes.map((f) => f.number).join(', ')}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
