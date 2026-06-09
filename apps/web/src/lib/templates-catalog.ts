/**
 * Catalogue centralisé des templates de documents générés par QualiOF.
 *
 * Phase 12 D-10 : 1 source de vérité pour le mapping (label, path, vars, category).
 * Phase 12 D-06 : pas d'éditeur, pas de versioning, pas de BDD — read-only V1.
 * Phase 12 D-11 : aperçu rendu NON implémenté V1 (Gotenberg trop coûteux à brancher
 *   pour chaque template — décision planner). Si extension v2 : screenshots statiques
 *   dans apps/web/public/templates-previews/ ou réutiliser lib/pdf-render.ts.
 *
 * Variables listées : indicatives (3-8 vars représentatives par entrée), NON
 * exhaustives — D-08. Les noms reflètent les conventions réelles observées
 * dans le code source (ClosureContext, OfConfig, etc.).
 *
 * Consommé par :
 * - apps/web/src/app/app/templates/page.tsx (V1)
 * - Phase 10 Audit Qualiopi blanc (potentiel — export catalogue PDF auditeur)
 */

export type TemplateCategory = 'qualiopi' | 'agefice' | 'email';

export interface TemplateCatalogEntry {
  /** Slug stable kebab-case — clé d'identification, ne JAMAIS changer (D-10). */
  id: string;
  /** Nom user-friendly français — affiché dans la page /app/templates. */
  label: string;
  /** Catégorie : Qualiopi / AGEFICE / Email (D-07). */
  category: TemplateCategory;
  /** Chemin relatif au repo root (depuis Next.js root). */
  sourcePath: string;
  /** 1-2 phrases : à quoi sert ce template (affiché en tooltip ou subtitle). */
  description: string;
  /** Variables principales — 3-8 par template, pas exhaustif (D-08). */
  variables: string[];
}

export const TEMPLATES_CATALOG: ReadonlyArray<TemplateCatalogEntry> = [
  // ─── Catégorie Qualiopi (Pack fin de formation 1-clic — Palier 2.2 + Phases 7-11) ───
  {
    id: 'closure-attestation',
    label: 'Attestation de fin de formation',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/attestation-template.ts',
    description:
      "Attestation Qualiopi indicateur 11 (art. L.6353-1) délivrée à chaque stagiaire en fin de session.",
    variables: [
      'apprenantPrenom',
      'apprenantNom',
      'apprenantCivility',
      'sessionTitle',
      'sessionStartDate',
      'sessionEndDate',
      'tenantName',
      'tenantSiret',
    ],
  },
  {
    id: 'closure-certificat',
    label: 'Certificat de réalisation',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/certificat-template.ts',
    description:
      'Certificat individuel par stagiaire destiné aux financeurs (équivalent réglementaire de l\'attestation).',
    variables: [
      'apprenantPrenom',
      'apprenantNom',
      'sessionTitle',
      'durationHours',
      'tenantSignaturePedago',
      'tenantSignatureDirigeant',
    ],
  },
  {
    id: 'closure-analyse-besoin',
    label: 'Analyse de besoin individuelle',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/analyse-besoin-template.ts',
    description:
      'Analyse pédagogique personnalisée par stagiaire (générée via Ollama mistral-small:24b).',
    variables: ['apprenantPrenom', 'apprenantNom', 'apprenantFonction', 'sessionTitle', 'analyseTexte'],
  },
  {
    id: 'closure-qcm',
    label: "QCM d'évaluation des acquis",
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/qcm-template.ts',
    description:
      "QCM 10-13 questions partagé par session, scoring personnalisé par stagiaire (75-95% cible).",
    variables: ['sessionTitle', 'questions', 'selected_answer', 'is_correct', 'score'],
  },
  {
    id: 'closure-deroule',
    label: 'Déroulé pédagogique',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/deroule-template.ts',
    description:
      'Déroulé pédagogique de la session (1 par session, partagé entre tous les stagiaires).',
    variables: ['sessionTitle', 'modules', 'durationHours', 'formateurNom'],
  },
  {
    id: 'closure-emargement',
    label: "Feuille d'émargement",
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/emargement-template.ts',
    description:
      'Émargement par demi-journée (matin/après-midi), à signer par les stagiaires et le formateur.',
    variables: ['sessionTitle', 'sessionDays', 'apprenants', 'formateurNom', 'tenantLogo'],
  },
  {
    id: 'closure-positionnement',
    label: 'Positionnement initial',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/positionnement-template.ts',
    description:
      'Positionnement compétences en début de formation (Qualiopi indicateur 12).',
    variables: ['apprenantPrenom', 'apprenantNom', 'sessionTitle', 'competencesEvaluation'],
  },
  {
    id: 'closure-satisfaction-chaud',
    label: 'Satisfaction à chaud',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/satisfaction-chaud-template.ts',
    description: "Questionnaire de satisfaction immédiate fin de session (J+0).",
    variables: ['apprenantPrenom', 'apprenantNom', 'sessionTitle', 'questionsSatisfaction'],
  },
  {
    id: 'closure-satisfaction-froid',
    label: 'Satisfaction à froid',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/satisfaction-froid-template.ts',
    description: 'Questionnaire de satisfaction à 3 mois (Qualiopi indicateur 31).',
    variables: ['apprenantPrenom', 'apprenantNom', 'sessionTitle', 'sessionEndDate'],
  },
  {
    id: 'closure-satisfaction-session',
    label: 'Satisfaction session (agrégée)',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/satisfaction-session-template.ts',
    description:
      'Synthèse de satisfaction de la session (1 par session, agrégée sur tous les stagiaires).',
    variables: ['sessionTitle', 'satisfactionGlobale', 'verbatimsAnonymes'],
  },
  {
    id: 'closure-grille-obs-session',
    label: "Grille d'observation session",
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/grille-obs-session-template.ts',
    description: "Grille d'observation pédagogique de la session (1 par session).",
    variables: ['sessionTitle', 'criteresObservation', 'formateurNom'],
  },
  {
    id: 'closure-grille-observation',
    label: "Grille d'observation individuelle",
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/grille-observation-template.ts',
    description: 'Observation pédagogique individuelle par stagiaire.',
    variables: ['apprenantPrenom', 'apprenantNom', 'sessionTitle', 'criteresIndividuels'],
  },
  {
    id: 'closure-checklist-formation',
    label: 'Checklist formation',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/closure/checklist-formation-template.ts',
    description:
      'Checklist matériel/logistique cochée aléatoirement par stagiaire (BUG-15 fix session 22/05).',
    variables: ['sessionTitle', 'pointsCheckList', 'apprenants'],
  },
  {
    id: 'convention-formation',
    label: 'Convention de formation',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/convention-template.ts',
    description:
      'Convention OF / OPCO ou OF / Employeur (recopie intégrale du programme — feedback Qualiopi).',
    variables: [
      'organisationNom',
      'organisationSiret',
      'sessionTitle',
      'durationHours',
      'priceHT',
      'programmeMd',
    ],
  },
  {
    id: 'programme-formation',
    label: 'Programme de formation',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/programme-template.ts',
    description:
      "Programme Qualiopi avec priceHT explicite + objectifs verbes Bloom (feedback non-négociable).",
    variables: [
      'titre',
      'objectifsBloom',
      'modules',
      'durationHours',
      'priceHT',
      'prerequis',
      'publicCible',
    ],
  },
  {
    id: 'convocation',
    label: 'Convocation',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/convocation-template.ts',
    description:
      'Convocation stagiaire avec lieu / horaires / formateur (refait HTML+Gotenberg session 22/05).',
    variables: [
      'apprenantPrenom',
      'apprenantNom',
      'sessionTitle',
      'sessionStartDate',
      'sessionLocation',
      'formateurNom',
    ],
  },
  {
    id: 'legal-docs-cgv-ri',
    label: 'CGV / Règlement intérieur',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/legal-docs-template.ts',
    description:
      'CGV + Règlement intérieur (éditables via Paramètres OF — Phase 7 SET-02).',
    variables: ['tenantName', 'tenantAddress', 'cgvMarkdown', 'riMarkdown'],
  },
  {
    id: 'invoice-facture',
    label: 'Facture / Avoir',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/invoice-template.ts',
    description:
      'Facture FAC-NNNNNN ou avoir AVO-NNNNNN — Phase 11 FACT-02 (export PDF + xlsx).',
    variables: ['invoiceNumber', 'invoiceType', 'amountHt', 'amountTtc', 'clientName', 'clientSiret'],
  },
  {
    id: 'veille-audit',
    label: 'Rapport veille Qualiopi (audit)',
    category: 'qualiopi',
    sourcePath: 'apps/web/src/lib/veille-audit-template.ts',
    description:
      'PDF audit veille critère 6 — indicateurs 23/24/25/26 (Phase 13 VEILLE-03).',
    variables: ['theme', 'entries', 'tenantName', 'tenantSiret', 'tenantNda'],
  },

  // ─── Catégorie AGEFICE (Palier 4 + session 22/05) ───
  {
    id: 'agefice-fiche-html',
    label: 'Fiche AGEFICE (HTML)',
    category: 'agefice',
    sourcePath: 'apps/web/src/lib/agefice-template.ts',
    description: 'Fiche récapitulative AGEFICE HTML pour dépôt de dossier.',
    variables: [
      'apprenantPrenom',
      'apprenantNom',
      'apprenantSiret',
      'sessionTitle',
      'priceHT',
      'budgetRestant',
    ],
  },
  {
    id: 'agefice-form-fill-pdf',
    label: 'Formulaire AGEFICE PDF (92 champs)',
    category: 'agefice',
    sourcePath: 'apps/web/src/lib/agefice-form-fill.ts',
    description:
      "Pré-remplissage du PDF officiel AGEFICE via pdf-lib (92 champs mappés).",
    variables: [
      'apprenantPrenom',
      'apprenantNom',
      'apprenantSiret',
      'apprenantAdresse',
      'sessionTitle',
      'organismeFormationSiret',
      'priceHT',
      'financingRequestDate',
    ],
  },
  {
    id: 'agefice-attendance',
    label: "Attestation d'assiduité AGEFICE",
    category: 'agefice',
    sourcePath: 'apps/web/src/lib/closure/agefice-attendance-template.ts',
    description:
      "Attestation d'assiduité requise pour le remboursement AGEFICE (fix session 22/05).",
    variables: ['apprenantPrenom', 'apprenantNom', 'sessionTitle', 'sessionDays', 'attendanceHours'],
  },

  // ─── Catégorie Email (Palier 4 + Phases 8/9/11) ───
  {
    id: 'email-preinscription-reminder',
    label: 'Email — Relance pré-inscription',
    category: 'email',
    sourcePath: 'apps/web/src/lib/preinscription-reminder-template.ts',
    description:
      "Relance email pour pré-inscription incomplète (formulaire public tokenisé).",
    variables: ['apprenantNomComplet', 'publicUrl', 'tenantName', 'tenantLogo'],
  },
  {
    id: 'email-user-invitation',
    label: 'Email — Invitation utilisateur',
    category: 'email',
    sourcePath: 'apps/web/src/lib/mailer-templates/user-invitation.ts',
    description:
      'Invitation collaborateur (Phase 8 RBAC-02) — lien tokenisé /invitation/[token].',
    variables: ['userEmail', 'inviterName', 'invitationUrl', 'tenantName', 'tenantAddressFull'],
  },
  {
    id: 'email-user-password-reset',
    label: 'Email — Réinitialisation du mot de passe',
    category: 'email',
    sourcePath: 'apps/web/src/lib/mailer-templates/user-password-reset.ts',
    description: 'Réinitialisation du mot de passe utilisateur (Phase 8 RBAC-02).',
    variables: ['userEmail', 'resetUrl', 'tenantName'],
  },
  {
    id: 'email-invoice-reminder',
    label: 'Email — Relance facture',
    category: 'email',
    sourcePath: 'apps/web/src/lib/mailer-templates/invoice-reminder.ts',
    description:
      "Relance J+30 (amical) ou J+45 (ferme avec mention CGI art. L441-10) — Phase 11.",
    variables: ['invoiceNumber', 'amountTtc', 'daysOverdue', 'clientName', 'tenantName'],
  },
  {
    id: 'email-lead-assigned',
    label: 'Email — Notification lead assigné',
    category: 'email',
    sourcePath: 'apps/web/src/lib/mailer-templates/lead-assigned.ts',
    description:
      "Notification au commercial lors de l'auto-assignation d'un lead (Phase 9 LEAD-01).",
    variables: ['commercialFirstName', 'prospectName', 'leadSource', 'productTitle', 'leadUrl'],
  },
];

/**
 * Retourne tous les templates d'une catégorie donnée.
 * @example getTemplatesByCategory('email') // → 5 entrées
 */
export function getTemplatesByCategory(category: TemplateCategory): TemplateCatalogEntry[] {
  return TEMPLATES_CATALOG.filter((t) => t.category === category);
}

/**
 * Retourne un template par son id stable, ou undefined si introuvable.
 */
export function getTemplateById(id: string): TemplateCatalogEntry | undefined {
  return TEMPLATES_CATALOG.find((t) => t.id === id);
}

/**
 * Labels user-friendly pour chaque catégorie (UI affichage section).
 */
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  qualiopi: 'Documents Qualiopi',
  agefice: 'AGEFICE',
  email: 'Templates email',
};

/**
 * Compte total par catégorie (utile pour badges UI).
 */
export function countByCategory(): Record<TemplateCategory, number> {
  return {
    qualiopi: getTemplatesByCategory('qualiopi').length,
    agefice: getTemplatesByCategory('agefice').length,
    email: getTemplatesByCategory('email').length,
  };
}
