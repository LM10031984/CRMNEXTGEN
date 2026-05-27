/**
 * Page /app/templates — Catalogue read-only des templates QualiOF.
 *
 * Phase 12 D-06 : read-only (pas d'éditeur, pas de versioning, pas de BDD).
 * Phase 12 D-09 : RBAC ADMIN+MANAGER+LECTEUR uniquement.
 * Phase 12 D-10 : source unique = lib/templates-catalog.ts.
 * Phase 12 D-11 V1 : pas d'aperçu rendu (décision planner — voir commentaire
 *   JSDoc dans templates-catalog.ts pour l'extension v2).
 */

import { FileText, Mail, FileCheck2 } from 'lucide-react';
import { requireRole } from '@/lib/rbac';
import {
  TEMPLATES_CATALOG,
  CATEGORY_LABELS,
  countByCategory,
  type TemplateCategory,
} from '@/lib/templates-catalog';

export const dynamic = 'force-dynamic';

const CATEGORY_ICONS: Record<TemplateCategory, typeof FileText> = {
  qualiopi: FileCheck2,
  agefice: FileText,
  email: Mail,
};

const ORDERED_CATEGORIES: TemplateCategory[] = ['qualiopi', 'agefice', 'email'];

export default async function TemplatesPage() {
  await requireRole(['ADMIN', 'MANAGER', 'LECTEUR']);

  const counts = countByCategory();
  const total = TEMPLATES_CATALOG.length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Modèles de documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catalogue read-only des {total} templates utilisés pour générer les documents
          Qualiopi, AGEFICE et les emails. Chaque template est défini dans le code source —
          voir la colonne « Source » pour le chemin de fichier.
        </p>
      </header>

      {ORDERED_CATEGORIES.map((cat) => {
        const items = TEMPLATES_CATALOG.filter((t) => t.category === cat);
        if (items.length === 0) return null;
        const Icon = CATEGORY_ICONS[cat];
        return (
          <section key={cat} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary-700" />
              <h2 className="text-lg font-semibold">{CATEGORY_LABELS[cat]}</h2>
              <span className="text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
                {counts[cat]}
              </span>
            </div>
            <div className="rounded-lg border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Template</th>
                    <th className="px-4 py-2 text-left font-medium">Source</th>
                    <th className="px-4 py-2 text-left font-medium">Variables principales</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {t.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <code className="text-xs text-muted-foreground break-all">
                          {t.sourcePath}
                        </code>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {t.variables.slice(0, 6).map((v) => (
                            <span
                              key={v}
                              className="inline-flex items-center rounded bg-primary-50 px-1.5 py-0.5 text-xs font-mono text-primary-800"
                            >
                              {v}
                            </span>
                          ))}
                          {t.variables.length > 6 && (
                            <span className="text-xs text-muted-foreground">
                              +{t.variables.length - 6}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <aside className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Note V1 (Phase 12) :</strong> cette vue est en
        lecture seule. L&apos;édition des templates passe encore par le code source. Si tu
        as besoin de modifier un template, ouvre le fichier listé dans la colonne « Source »
        et propose le changement via une PR (ou demande à Claude via /gsd:quick). Un aperçu
        PDF/HTML pourra être ajouté en V2 si besoin (cf. JSDoc dans
        <code className="ml-1">lib/templates-catalog.ts</code>).
      </aside>
    </div>
  );
}
