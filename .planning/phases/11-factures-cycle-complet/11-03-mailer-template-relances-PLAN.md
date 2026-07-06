---
phase: 11-factures-cycle-complet
plan: 03
type: execute
wave: 1
depends_on:
  - "11-00"
files_modified:
  - apps/web/src/lib/mailer-templates/invoice-reminder.ts
  - apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts
autonomous: true
requirements:
  - FACT-03
must_haves:
  truths:
    - "renderInvoiceReminderEmail produit subject/html/text pour 2 niveaux (J+30 amical, J+45 ferme)."
    - "Toutes les variables interpolées passent par escapeHtml (Pitfall 6)."
    - "Niveau 2 inclut la mention légale art. L441-10 Code de commerce."
  artifacts:
    - path: "apps/web/src/lib/mailer-templates/invoice-reminder.ts"
      provides: "Template email relance 2 niveaux (clone-strict pattern Phase 9 lead-assigned.ts)"
      exports: ["renderInvoiceReminderEmail", "InvoiceReminderEmailInput"]
      min_lines: 110
    - path: "apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts"
      provides: "Suite Vitest 9 behaviors (subjects verbatim, escape, mention légale, URL CTA, branding OF)"
      min_lines: 100
  key_links:
    - from: "Plan 11-06 sendInvoiceReminder + worker"
      to: "renderInvoiceReminderEmail"
      via: "import depuis @/lib/mailer-templates/invoice-reminder"
      pattern: "renderInvoiceReminderEmail\\("
---

<objective>
Créer `apps/web/src/lib/mailer-templates/invoice-reminder.ts` — template email 2 niveaux (D-12) : niveau 1 amical "Rappel — Facture {number} en attente" / niveau 2 ferme "Mise en demeure — Facture {number} impayée depuis {N} jours". Clone-strict du pattern Phase 9 `lead-assigned.ts` (escape sur toutes les valeurs, OfConfig pour marque, HTML inline CSS compatible tous clients mail, text fallback).

Purpose: Bloc fondation Wave 1, indépendant des server actions (Plan 11-06 le consomme). Pas de dépendances Prisma ni RBAC.
Output: Module + suite Vitest verte (9 behaviors).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/11-factures-cycle-complet/11-CONTEXT.md
@.planning/phases/11-factures-cycle-complet/11-RESEARCH.md
@apps/web/src/lib/mailer-templates/lead-assigned.ts
@apps/web/src/lib/of-config.ts

<interfaces>
<!-- Signature cible (D-12) -->

```typescript
import type { OfConfig } from '@/lib/of-config';

export interface InvoiceReminderEmailInput {
  level: 1 | 2;              // D-12 : 1 = amical, 2 = ferme
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  daysOverdue: number;       // jours depuis dueDate
  amountTtc: number;         // restant dû (après partial payments)
  payerName: string;
  invoiceUrl: string;        // lien fiche facture (download/consultation)
}

export function renderInvoiceReminderEmail(
  input: InvoiceReminderEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string };
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Implémenter renderInvoiceReminderEmail + tests</name>
  <files>apps/web/src/lib/mailer-templates/invoice-reminder.ts, apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts</files>
  <read_first>
    - apps/web/src/lib/mailer-templates/lead-assigned.ts (pattern Phase 9 à cloner strictement — escapeHtml, fmtEUR, fmtDate, palette BRAND_DARK / BRAND_LIGHT_BG, structure HTML)
    - apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts (stub Wave 0 à remplir)
    - apps/web/src/lib/of-config.ts (interface OfConfig avec name, addressFull, siret, rnq)
    - .planning/phases/11-factures-cycle-complet/11-RESEARCH.md §Mailer Templates Relances (template HTML complet à copier verbatim)
  </read_first>
  <behavior>
    - Test 1 : `level=1` → subject `"Rappel — Facture FAC-000042 en attente"` (verbatim)
    - Test 2 : `level=2` → subject `"Mise en demeure — Facture FAC-000042 impayée depuis 47 jours"` (verbatim)
    - Test 3 : `text` fallback contient `invoiceNumber` + amountTtc formaté fr-FR (`1 200,00 €`) + dueDate formaté fr-FR (`15/03/2026`)
    - Test 4 : `html` escape `<script>` dans payerName (Pitfall 6)
    - Test 5 : `level=2` html contient `"art. L441-10"` (mention légale Code de commerce)
    - Test 6 : `html` contient `<a href="${invoiceUrl}"` (CTA "Consulter la facture")
    - Test 7 : `html` contient `of.name` dans header + footer
    - Test 8 : `level=1` headline color = BRAND_DARK (`#00527A`) ; `level=2` headline color = red-700 (`#B91C1C`)
    - Test 9 : `level=1` band color = BRAND_LIGHT_BG (`#F0F9FF`) ; `level=2` band color = red-50 (`#FEF2F2`)
  </behavior>
  <action>
1. **Créer** `apps/web/src/lib/mailer-templates/invoice-reminder.ts` avec EXACTEMENT le contenu suivant (copié verbatim depuis RESEARCH.md §Mailer Templates Relances) :

```typescript
import type { OfConfig } from '@/lib/of-config';

const BRAND_DARK = '#00527A';
const BRAND_LIGHT_BG = '#F0F9FF';

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export interface InvoiceReminderEmailInput {
  level: 1 | 2;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  daysOverdue: number;
  amountTtc: number;
  payerName: string;
  invoiceUrl: string;
}

export function renderInvoiceReminderEmail(
  input: InvoiceReminderEmailInput,
  of: OfConfig,
): { subject: string; html: string; text: string } {
  const { level, invoiceNumber, issueDate, dueDate, daysOverdue, amountTtc, payerName, invoiceUrl } = input;

  // === SUBJECT (D-12 verbatim) ===
  const subject = level === 1
    ? `Rappel — Facture ${invoiceNumber} en attente`
    : `Mise en demeure — Facture ${invoiceNumber} impayée depuis ${daysOverdue} jours`;

  // === TEXT BODY (fallback non-HTML) ===
  const text = level === 1
    ? [
        `Bonjour,`,
        ``,
        `Petit rappel : la facture ${invoiceNumber} (émise le ${fmtDate.format(issueDate)}) est en attente de règlement.`,
        `Montant restant dû : ${fmtEUR.format(amountTtc)}.`,
        `Échéance dépassée depuis le ${fmtDate.format(dueDate)}.`,
        ``,
        `Si le règlement a déjà été effectué, merci d'ignorer ce message.`,
        ``,
        `Consulter la facture : ${invoiceUrl}`,
        ``,
        `Cordialement,`,
        `${of.name}`,
      ].join('\n')
    : [
        `Bonjour,`,
        ``,
        `La facture ${invoiceNumber} (émise le ${fmtDate.format(issueDate)}) est impayée depuis ${daysOverdue} jours.`,
        `Montant restant dû : ${fmtEUR.format(amountTtc)}.`,
        ``,
        `Sans règlement de votre part sous 15 jours, nous engagerons une procédure de recouvrement,`,
        `et appliquerons les pénalités légales (indemnité forfaitaire de 40 € + intérêts au taux légal majoré`,
        `de 10 points — art. L441-10 du Code de commerce).`,
        ``,
        `Consulter la facture : ${invoiceUrl}`,
        ``,
        `Cordialement,`,
        `${of.name}`,
      ].join('\n');

  // === HTML BODY (escape toutes les valeurs interpolées) ===
  const headline = level === 1 ? 'Rappel de règlement' : 'Mise en demeure';
  const headlineColor = level === 1 ? BRAND_DARK : '#B91C1C';
  const bandColor = level === 1 ? BRAND_LIGHT_BG : '#FEF2F2';
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1F2937;line-height:1.5;">
  <div style="max-width:600px;margin:24px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.04);">
    <div style="background:${headlineColor};padding:28px 32px;text-align:center;color:white;">
      <h1 style="margin:0;font-size:18pt;font-weight:700;letter-spacing:1px;">${escapeHtml(of.name)}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px 0;font-size:16pt;color:${headlineColor};">${escapeHtml(headline)}</h2>
      <p style="margin:0 0 16px 0;">Bonjour <strong>${escapeHtml(payerName)}</strong>,</p>
      ${level === 1
        ? `<p style="margin:0 0 16px 0;">Petit rappel : la facture ci-dessous est en attente de règlement depuis le ${escapeHtml(fmtDate.format(dueDate))}.</p>`
        : `<p style="margin:0 0 16px 0;">La facture ci-dessous est impayée depuis <strong>${daysOverdue} jours</strong>. Sans règlement sous 15 jours, nous engagerons une procédure de recouvrement.</p>`
      }
      <div style="background:${bandColor};border-radius:6px;padding:16px;margin:16px 0;">
        <div><strong>Numéro :</strong> <span style="font-family:monospace;">${escapeHtml(invoiceNumber)}</span></div>
        <div><strong>Date d'émission :</strong> ${escapeHtml(fmtDate.format(issueDate))}</div>
        <div><strong>Date d'échéance :</strong> ${escapeHtml(fmtDate.format(dueDate))}</div>
        <div style="margin-top:8px;font-size:13pt;"><strong>Montant restant dû :</strong> ${escapeHtml(fmtEUR.format(amountTtc))}</div>
      </div>
      <div style="text-align:center;margin:32px 0;">
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:${headlineColor};color:white;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:11pt;">
          Consulter la facture
        </a>
      </div>
      ${level === 2 ? `<p style="margin:24px 0 0 0;font-size:9pt;color:#7F1D1D;">Pénalités légales applicables : indemnité forfaitaire de 40 € + intérêts au taux légal majoré de 10 points (art. L441-10 du Code de commerce).</p>` : ''}
      <p style="margin:24px 0 0 0;font-size:10pt;color:#64748B;">Si le règlement a déjà été effectué, merci d'ignorer ce message.<br><br>Cordialement,<br>L'équipe ${escapeHtml(of.name)}</p>
    </div>
    <div style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E2E8F0;font-size:9pt;color:#64748B;text-align:center;">
      <strong style="color:${BRAND_DARK};">${escapeHtml(of.name)}</strong>${of.addressFull ? ` — ${escapeHtml(of.addressFull)}` : ''}<br>
      ${of.siret ? `SIRET : ${escapeHtml(of.siret)}` : ''}${of.siret && of.rnq ? ' — ' : ''}${of.rnq ? `NDA : ${escapeHtml(of.rnq)}` : ''}
    </div>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
```

2. **Remplacer** `apps/web/src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` (stub Wave 0) par :

```typescript
import { describe, it, expect } from 'vitest';
import { renderInvoiceReminderEmail } from '../invoice-reminder';
import type { OfConfig } from '@/lib/of-config';

const MOCK_OF: OfConfig = {
  name: 'Start Academy',
  addressFull: '1 rue de la Paix, 75002 Paris',
  siret: '12345678900012',
  rnq: '11754321099',
} as OfConfig;

const BASE_INPUT = {
  invoiceNumber: 'FAC-000042',
  issueDate: new Date('2026-01-15T00:00:00Z'),
  dueDate: new Date('2026-02-14T00:00:00Z'),
  daysOverdue: 47,
  amountTtc: 1200,
  payerName: 'Société Dupont',
  invoiceUrl: 'https://app.example.fr/app/factures/inv-1',
};

describe('renderInvoiceReminderEmail', () => {
  it('level=1 → subject "Rappel — Facture {number} en attente" verbatim', () => {
    const { subject } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(subject).toBe('Rappel — Facture FAC-000042 en attente');
  });

  it('level=2 → subject "Mise en demeure — Facture {number} impayée depuis {N} jours" verbatim', () => {
    const { subject } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 2 }, MOCK_OF);
    expect(subject).toBe('Mise en demeure — Facture FAC-000042 impayée depuis 47 jours');
  });

  it('text fallback contient invoiceNumber + amountTtc fr-FR + dueDate fr-FR', () => {
    const { text } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(text).toContain('FAC-000042');
    // Intl fr-FR formatte 1200 → "1 200,00 €" (espace insécable + virgule)
    expect(text).toMatch(/1\s?200,00\s?€/);
    expect(text).toContain('14/02/2026');
  });

  it('html escape toutes les variables interpolées (Pitfall 6 — XSS)', () => {
    const { html } = renderInvoiceReminderEmail(
      { ...BASE_INPUT, level: 1, payerName: '<script>alert(1)</script>' },
      MOCK_OF,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('level=2 html inclut la mention légale art. L441-10 Code de commerce', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 2 }, MOCK_OF);
    expect(html).toContain('art. L441-10');
    expect(html).toContain('Code de commerce');
  });

  it('html contient le CTA <a href> vers invoiceUrl', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(html).toContain('href="https://app.example.fr/app/factures/inv-1"');
    expect(html).toContain('Consulter la facture');
  });

  it('html contient of.name dans header + footer', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    const occurrences = html.split('Start Academy').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // header + footer + signature
  });

  it('level=1 headline color = #00527A (BRAND_DARK)', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 1 }, MOCK_OF);
    expect(html).toContain('background:#00527A');
  });

  it('level=2 headline color = #B91C1C (red-700)', () => {
    const { html } = renderInvoiceReminderEmail({ ...BASE_INPUT, level: 2 }, MOCK_OF);
    expect(html).toContain('background:#B91C1C');
  });
});
```

3. Lancer : `pnpm --filter @qualiof/web test -- --run src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` → 9 verts.
  </action>
  <verify>
    <automated>pnpm --filter @qualiof/web test -- --run src/lib/mailer-templates/__tests__/invoice-reminder.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/lib/mailer-templates/invoice-reminder.ts` existe (ls)
    - Exporte `renderInvoiceReminderEmail` et type `InvoiceReminderEmailInput` (grep `export function renderInvoiceReminderEmail` + `export interface InvoiceReminderEmailInput`)
    - Subject verbatim D-12 : `\`Rappel — Facture \${invoiceNumber} en attente\`` (level=1) et `\`Mise en demeure — Facture \${invoiceNumber} impayée depuis \${daysOverdue} jours\`` (level=2) — grep templates dans le code source
    - `escapeHtml()` appelée sur toutes les variables interpolées dans le `html` (grep `escapeHtml(payerName)`, `escapeHtml(invoiceNumber)`, `escapeHtml(invoiceUrl)`, `escapeHtml(of.name)`)
    - level=2 contient la mention `art. L441-10` ET `Code de commerce` (grep)
    - Suite Vitest 9/9 verte : `pnpm --filter @qualiof/web test -- --run src/lib/mailer-templates/__tests__/invoice-reminder.test.ts`
    - Suite complète apps/web verte (anti-régression Phase 9 lead-assigned.ts) : `pnpm --filter @qualiof/web test -- --run`
  </acceptance_criteria>
  <done>Template email 2 niveaux + tests verts. Plan 11-06 peut maintenant importer `renderInvoiceReminderEmail`.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @qualiof/web test -- --run src/lib/mailer-templates/__tests__/invoice-reminder.test.ts` → 9/9 verts
- `pnpm --filter @qualiof/web test -- --run src/lib/mailer-templates/__tests__/lead-assigned.test.ts` → tests Phase 9 toujours verts (anti-régression)
- `pnpm --filter @qualiof/web typecheck` → exit 0
</verification>

<success_criteria>
- `renderInvoiceReminderEmail` exportée
- Subject verbatim D-12 pour les 2 niveaux
- HTML escape Pitfall 6 (XSS prevention)
- Niveau 2 contient la mention légale L441-10
- Suite Vitest 9/9 verte
</success_criteria>

<output>
After completion, create `.planning/phases/11-factures-cycle-complet/11-03-SUMMARY.md`
</output>
