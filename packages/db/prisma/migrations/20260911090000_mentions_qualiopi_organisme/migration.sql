-- Lot I-2 (gabarit) — les mentions Qualiopi du programme appartiennent à
-- l'ORGANISME, pas à un produit.
--
-- Le programme composé pour DIAG-0001 héritait son « Public visé » d'un
-- programme de marketing digital et sortait, pour une agence immobilière :
-- « Professionnels du marketing, entrepreneurs… Durée de la formation : » —
-- phrase tronquée comprise. Et ses trois rubriques d'organisme sortaient VIDES.
--
-- Une rubrique vide n'est pas un document incomplet : l'accessibilité aux
-- personnes en situation de handicap est l'indicateur Qualiopi 26, et un
-- programme qui la laisse blanche est une non-conformité en contrôle.
--
-- Ces colonnes portent donc le texte de l'organisme, éditable. Nullables comme
-- les autres paramètres OF, mais leur repli n'est PAS une variable
-- d'environnement : c'est le texte standard de Start Academy, relevé dans ses
-- propres programmes et figé dans `lib/docs/qualiopi-mentions.ts`. À la sortie,
-- elles ne peuvent jamais être vides — un test de contrat le vérifie.
--
-- Additif et réversible : trois colonnes nullables, aucune reprise de données.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "qualiopiPedagogicalMethods" TEXT,
ADD COLUMN     "qualiopiEvaluationMethods" TEXT,
ADD COLUMN     "qualiopiAccessibility" TEXT;
