import { DIAGNOSTIC_CHAPTERS } from './chapters';
import { LIGHT_QUESTION_SET } from './light-set';
import { DIAGNOSTIC_QUESTIONS, REFERENTIAL_VERSION } from './questions';
import type { DiagnosticQuestion } from './types';

/**
 * Rend le référentiel de questions en Markdown, DEPUIS le code.
 *
 * Pourquoi générer plutôt que maintenir à la main : dans le repo d'origine, le
 * document métier et le code ont divergé (des questions dans le doc n'existaient
 * plus, d'autres n'y figuraient pas). Le doc servait quand même de « source de
 * vérité » — donc plus personne ne savait laquelle des deux disait vrai.
 *
 * Ici le code EST la source, le document en est le rendu, et un test de contrat
 * échoue si le fichier commité ne correspond plus. Régénérer :
 *   UPDATE_REFERENTIAL_DOC=1 pnpm --filter @qualiof/shared test
 */

const TYPE_LABELS: Record<DiagnosticQuestion['type'], string> = {
  text: 'texte',
  int: 'entier',
  percent: '%',
  money: '€',
  date: 'date',
  url: 'url',
  choice: 'choix',
  multichoice: 'multi-choix',
  yesno: 'O/N',
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function describeCondition(q: DiagnosticQuestion): string {
  const bits: string[] = [];
  if (q.showIf) {
    const values = Array.isArray(q.showIf.equals) ? q.showIf.equals.join(' / ') : q.showIf.equals;
    bits.push(`si \`${q.showIf.questionId}\` = ${values}`);
  }
  if (q.prefillFrom) bits.push(`pré-rempli depuis \`${q.prefillFrom.questionId}\``);
  return bits.join(' · ');
}

export function renderReferentialDoc(): string {
  const light = new Set(LIGHT_QUESTION_SET);
  const lines: string[] = [];

  lines.push('# Référentiel des questions — Diagnostic agence (R1)');
  lines.push('');
  lines.push('> ⚠️ **Document généré depuis le code.** Ne pas éditer à la main.');
  lines.push('>');
  lines.push('> Source : `packages/shared/src/diagnostic/questions.ts`.');
  lines.push(
    '> Régénérer : `pnpm --filter @qualiof/shared exec tsx src/diagnostic/write-referential-doc.ts`.',
  );
  lines.push(
    '> Un test de contrat (`referential-doc.contract.test.ts`) échoue si ce fichier est périmé.',
  );
  lines.push('');
  lines.push(`**Version du référentiel** : \`${REFERENTIAL_VERSION}\``);
  lines.push('');
  lines.push(
    `**Volumétrie** : ${DIAGNOSTIC_QUESTIONS.length} questions sur ${DIAGNOSTIC_CHAPTERS.length} chapitres · ` +
      `set LÉGER : ${LIGHT_QUESTION_SET.length} questions.`,
  );
  lines.push('');
  lines.push('## Règles de lecture');
  lines.push('');
  lines.push(
    '- **ID** : la clé de `DiagnosticAnswer.questionId`. Elle ne se renomme jamais — une réponse déjà saisie y est rattachée.',
  );
  lines.push(
    "- **O/F** : obligatoire ou facultative. Une obligatoire manquante ne bloque JAMAIS le diagnostic — elle lève l'alerte `missing_required_data`, visible au cockpit et dans le rapport.",
  );
  lines.push(
    '- **Lég.** : ✅ = la question fait partie du set LÉGER (R1 sec, ~30 min). Le léger est un sous-ensemble strict du complet : un upgrade ne fait re-saisir aucune réponse.',
  );
  lines.push(
    "- **Hint** : la façon de poser la question à l'oral. C'est le script de l'entretien, pas une note de développeur.",
  );
  lines.push('');
  lines.push(
    "Les fiches nominatives de l'équipe (Ch.2.2 / 2.3) ne sont pas des questions : elles vivent dans le modèle `DiagnosticParticipant` (une ligne par indé/salarié). L'identité durable de l'agence (raison sociale, SIRET, adresse) vient de `Organization`, pas d'une réponse.",
  );
  lines.push('');

  for (const chapter of DIAGNOSTIC_CHAPTERS) {
    const questions = DIAGNOSTIC_QUESTIONS.filter((q) => q.chapter === chapter.chapter);
    lines.push('---');
    lines.push('');
    const minutes = chapter.approxMinutes ? ` (~${chapter.approxMinutes} min)` : '';
    lines.push(`## Chapitre ${chapter.chapter} — ${chapter.title}${minutes}`);
    lines.push('');
    lines.push(`**Objectif** : ${chapter.objective}`);
    lines.push('');
    if (chapter.followedBySynthesis) {
      const label =
        chapter.followedBySynthesis === 'funding'
          ? '« Votre potentiel de financement »'
          : '« Votre pipeline de transformation »';
      lines.push(
        `> 🔔 **Synthèse en fin de chapitre** : ${label} — calculée par fonctions pures, affichée en moins d'une seconde, sans aucun appel IA (on est en rendez-vous).`,
      );
      lines.push('');
    }
    lines.push(
      `${questions.length} question${questions.length > 1 ? 's' : ''} · ` +
        `${questions.filter((q) => light.has(q.id)).length} dans le set léger.`,
    );
    lines.push('');
    lines.push('| ID | Question | Type | O/F | Lég. | Conditionnement | Alimente |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const q of questions) {
      const cells = [
        `\`${q.id}\``,
        escapeCell(q.question),
        TYPE_LABELS[q.type],
        q.required ? 'O' : 'F',
        light.has(q.id) ? '✅' : '',
        escapeCell(describeCondition(q)),
        escapeCell((q.alimente ?? []).join(' · ')),
      ];
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');

    const withChoices = questions.filter((q) => q.choices?.length);
    if (withChoices.length > 0) {
      lines.push('<details><summary>Valeurs de réponse</summary>');
      lines.push('');
      for (const q of withChoices) {
        const rendered = (q.choices ?? [])
          .map((c) => (q.optionLabels?.[c] ? `${q.optionLabels[c]} (\`${c}\`)` : `\`${c}\``))
          .join(' · ');
        lines.push(`- \`${q.id}\` : ${rendered}`);
      }
      const withAnswerLabels = questions.filter((q) => q.answerLabels);
      for (const q of withAnswerLabels) {
        lines.push(
          `- \`${q.id}\` : oui = « ${q.answerLabels!.yes} » · non = « ${q.answerLabels!.no} »`,
        );
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    lines.push('<details><summary>Comment poser ces questions (script commercial)</summary>');
    lines.push('');
    for (const q of questions) {
      lines.push(`- \`${q.id}\` — ${q.hint ?? ''}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}
