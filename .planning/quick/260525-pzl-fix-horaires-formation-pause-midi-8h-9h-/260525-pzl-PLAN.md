---
phase: quick-260525-pzl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/formation-horaires.ts
  - apps/web/src/lib/__tests__/formation-horaires.test.ts
  - apps/web/src/lib/closure/ollama-generators.ts
  - apps/web/src/lib/closure/qualiopi-prompts.ts
  - apps/web/src/server/actions/ai-fill-product.ts
  - apps/web/src/lib/closure/parse-programme-to-deroule.ts
  - apps/web/src/lib/closure/deroule-template.ts
  - apps/web/src/lib/closure/stub-content.ts
autonomous: true
requirements:
  - HORAIRES-01
  - HORAIRES-02
  - HORAIRES-03
must_haves:
  truths:
    - "Quand Laurent crée un produit 8h via IA, le programme généré couvre 9h00-18h00 avec pause déjeuner 13h00-14h00"
    - "Le déroulé pédagogique IA reprend les mêmes horaires (9h00-18h00 pour 8h, 9h00-13h00 pour 4h)"
    - "La règle pause obligatoire dès >=5h/jour est centralisée dans formation-horaires.ts"
    - "Le parser parse-programme-to-deroule continue de matcher les programmes existants (12h-13h, 12h30-13h30, etc.) ET les nouveaux (13h-14h)"
  artifacts:
    - path: "apps/web/src/lib/formation-horaires.ts"
      provides: "Helper centralisé PAUSE_DEJEUNER + getDayStartEnd + formatHoraireLabel"
      exports: ["PAUSE_DEJEUNER", "FORMATION_START", "getDayStartEnd", "formatHoraireLabel"]
    - path: "apps/web/src/lib/__tests__/formation-horaires.test.ts"
      provides: "Tests Vitest helper (8h, 6h, 5h, 4h, 7h)"
    - path: "apps/web/src/lib/closure/parse-programme-to-deroule.ts"
      provides: "Détection gap midday élargie 11h30-14h30"
      contains: "endMin >= 690 && endMin <= 870"
  key_links:
    - from: "apps/web/src/lib/closure/ollama-generators.ts:600"
      to: "apps/web/src/lib/formation-horaires.ts"
      via: "import getDayStartEnd, PAUSE_DEJEUNER"
      pattern: "getDayStartEnd\\(heuresParJour\\)"
    - from: "apps/web/src/server/actions/ai-fill-product.ts:48"
      to: "règle canonique 13h00-14h00"
      via: "prompt système littéral"
      pattern: "13h00.{1,5}14h00"
    - from: "apps/web/src/lib/closure/qualiopi-prompts.ts:176"
      to: "règle canonique 13h00-14h00"
      via: "prompt système littéral"
      pattern: "13h00.{1,5}14h00"
---

<objective>
Bug Laurent : "produit 8h IA → 9h30-17h30 sans pause midi comptabilisée". Cause : 4 fichiers de prompts/calculs avec 4 plages pause différentes (12h00-13h30, 12h15-13h45, 12h30-13h30, 12h00-13h00) et un calcul `9 + heuresParJour` qui oublie l'heure de pause.

Harmoniser TOUT sur la règle Laurent canonique :
- Pause déjeuner stricte 13h00-14h00 (1h pile)
- Journée 8h = 9h00-13h00 + 14h00-18h00
- Pause obligatoire dès heuresParJour >= 5

Purpose : tout produit IA généré désormais conforme à la règle métier Start Academy, sans dérive entre prompt programme et prompt déroulé. Source unique = `lib/formation-horaires.ts`.

Output : helper centralisé + 6 fichiers refactorés + tests rétro-compat parser.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@apps/web/src/lib/closure/ollama-generators.ts
@apps/web/src/lib/closure/qualiopi-prompts.ts
@apps/web/src/server/actions/ai-fill-product.ts
@apps/web/src/lib/closure/parse-programme-to-deroule.ts
@apps/web/src/lib/closure/deroule-template.ts
@apps/web/src/lib/closure/stub-content.ts

<interfaces>
<!-- Contrat du helper à créer en Task 1, consommé par Tasks 2-3-4 -->

From apps/web/src/lib/formation-horaires.ts (à créer) :
```typescript
export const PAUSE_DEJEUNER: { start: '13h00'; end: '14h00'; durationMin: 60 };
export const FORMATION_START: '9h00';

export function getDayStartEnd(heuresParJour: number): {
  start: string;       // toujours '9h00'
  end: string;         // ex: '18h00' pour 8h+pause, '13h00' pour 4h
  hasPause: boolean;   // true si heuresParJour >= 5
  pauseStart: string;  // '13h00'
  pauseEnd: string;    // '14h00'
};

export function formatHoraireLabel(start: string, end: string, durationLabel?: string): string;
```

Règle de calcul `end` :
- hasPause = heuresParJour >= 5
- endHour = 9 + heuresParJour + (hasPause ? 1 : 0)
- → 4h sans pause = 13h ; 5h avec pause = 15h ; 6h avec pause = 16h ; 7h avec pause = 17h ; 8h avec pause = 18h
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 : Créer le helper centralisé formation-horaires.ts + tests Vitest</name>
  <files>
    apps/web/src/lib/formation-horaires.ts
    apps/web/src/lib/__tests__/formation-horaires.test.ts
  </files>
  <behavior>
    Tests Vitest à écrire AVANT implémentation :
    - getDayStartEnd(4) → { start: '9h00', end: '13h00', hasPause: false, pauseStart: '13h00', pauseEnd: '14h00' }
    - getDayStartEnd(5) → { start: '9h00', end: '15h00', hasPause: true, ... }
    - getDayStartEnd(6) → { start: '9h00', end: '16h00', hasPause: true, ... }
    - getDayStartEnd(7) → { start: '9h00', end: '17h00', hasPause: true, ... }
    - getDayStartEnd(8) → { start: '9h00', end: '18h00', hasPause: true, ... }
    - getDayStartEnd(3) → hasPause: false (limite basse)
    - PAUSE_DEJEUNER.start === '13h00' && PAUSE_DEJEUNER.end === '14h00' && PAUSE_DEJEUNER.durationMin === 60
    - formatHoraireLabel('9h00', '13h00') → '9h00–13h00'
    - formatHoraireLabel('9h00', '13h00', '4h') → '9h00–13h00 (4h)'
  </behavior>
  <action>
    1. Créer `apps/web/src/lib/formation-horaires.ts` avec les exports exactement comme spécifiés dans `<interfaces>` ci-dessus. Constantes `as const` pour PAUSE_DEJEUNER et FORMATION_START.
    2. Créer `apps/web/src/lib/__tests__/formation-horaires.test.ts` avec `import { describe, it, expect } from 'vitest'` et les cas listés dans `<behavior>`.
    3. Pas de defensive code, pas de commentaire WHAT — uniquement le code et les tests.
    4. Séparateur dans formatHoraireLabel = caractère `–` (en-dash U+2013), cohérent avec le reste du codebase (cf. `ollama-generators.ts:600`).
  </action>
  <verify>
    <automated>cd apps/web && pnpm vitest run src/lib/__tests__/formation-horaires.test.ts</automated>
  </verify>
  <done>
    - Fichier helper exporte PAUSE_DEJEUNER, FORMATION_START, getDayStartEnd, formatHoraireLabel
    - 9 tests Vitest passent (5 cas heuresParJour, 1 limite, 1 constante, 2 formatHoraireLabel)
    - `tsc --noEmit` clean sur le helper
  </done>
</task>

<task type="auto">
  <name>Task 2 : Refactor ollama-generators.ts (déroulé IA) sur le helper</name>
  <files>apps/web/src/lib/closure/ollama-generators.ts</files>
  <action>
    1. Ajouter import en tête de fichier : `import { getDayStartEnd, PAUSE_DEJEUNER } from '@/lib/formation-horaires';`
    2. Ligne 600 (dans `generateDerouleContent`) : remplacer le calcul inline
       `9h00–${9 + heuresParJour}h00`
       par
       `const { start, end } = getDayStartEnd(heuresParJour);`
       et utiliser `${start}–${end}` dans la string template.
    3. Ligne 609 : remplacer `Pause déjeuner 12h00–13h30` par `Pause déjeuner ${PAUSE_DEJEUNER.start}–${PAUSE_DEJEUNER.end} (1h)`.
    4. Vérifier qu'aucune autre occurrence "12h00", "12h15", "12h30", "13h30", "13h45" ne subsiste dans ce fichier avec `grep -n "12h\|13h30\|13h45" apps/web/src/lib/closure/ollama-generators.ts`.
  </action>
  <verify>
    <automated>cd apps/web && pnpm tsc --noEmit -p . 2>&1 | grep -v "node_modules" | head -20 && grep -n "12h00\|12h15\|12h30\|13h30\|13h45" src/lib/closure/ollama-generators.ts || echo "PASS: aucune ancienne plage horaire"</automated>
  </verify>
  <done>
    - Import helper présent
    - Plus aucune référence aux anciennes plages (12h00-13h30 etc.) dans ce fichier
    - tsc clean
  </done>
</task>

<task type="auto">
  <name>Task 3 : Refactor qualiopi-prompts.ts (système prompt déroulé)</name>
  <files>apps/web/src/lib/closure/qualiopi-prompts.ts</files>
  <action>
    1. Ligne 173 : remplacer `Structure type d'une journée (9h00–17h00) :` par `Structure type d'une journée (9h00–18h00, soit 8h de formation + 1h de pause déjeuner) :`
    2. Ligne 176 : remplacer `Pause déjeuner 12h00–13h30 (isPause: true, objectifs: "Pause déjeuner")` par `Pause déjeuner 13h00–14h00 (1h) (isPause: true, objectifs: "Pause déjeuner")`
    3. Lignes 207-208 (section "PAUSES — pour les séquences isPause:true") : remplacer l'exemple `"12h00–13h30 (1h30)"` par `"13h00–14h00 (1h)"`.
    4. Vérifier qu'aucune autre occurrence "12h00", "12h15", "12h30", "13h30", "13h45" ne subsiste avec `grep -n "12h\|13h30\|13h45" apps/web/src/lib/closure/qualiopi-prompts.ts`.
    5. NE PAS toucher au prompt programme dans ai-fill-product.ts (Task 4).
  </action>
  <verify>
    <automated>cd apps/web && grep -n "12h00\|12h15\|12h30\|13h30\|13h45" src/lib/closure/qualiopi-prompts.ts || echo "PASS: aucune ancienne plage horaire" && pnpm tsc --noEmit -p . 2>&1 | grep "qualiopi-prompts" | head -10</automated>
  </verify>
  <done>
    - Le prompt déroulé impose désormais 9h00-18h00 et pause 13h00-14h00
    - Aucune ancienne plage horaire ne subsiste
    - tsc clean
  </done>
</task>

<task type="auto">
  <name>Task 4 : Refactor ai-fill-product.ts (prompt programme) sur règle 13h-14h</name>
  <files>apps/web/src/server/actions/ai-fill-product.ts</files>
  <action>
    Réécrire le bloc "⚠ RÈGLE HORAIRES STRICTES" (lignes ~40-66) pour qu'il reflète la règle Laurent. Remplacements exacts :

    1. Ligne 44 (titre du découpage) : `**Découpage horaire OBLIGATOIRE pour une journée de 8h (35h/semaine = standard Code du travail FR)** :` → `**Découpage horaire OBLIGATOIRE pour une journée de 8h (règle Start Academy)** :`

    2. Lignes 45-51 (le découpage) : remplacer par EXACTEMENT :
       ```
          - 9h00 – 10h30 : 1er bloc (1h30)
          - 10h30 – 10h45 : **pause café matin** (15 min)
          - 10h45 – 13h00 : 2ème bloc (2h15)
          - 13h00 – 14h00 : **pause déjeuner** (1h pile — règle Start Academy)
          - 14h00 – 15h30 : 3ème bloc (1h30)
          - 15h30 – 15h45 : **pause café après-midi** (15 min)
          - 15h45 – 18h00 : 4ème bloc (2h15) — total cumulé 8h00
          Soit 4 blocs de cours (1h30 + 2h15 + 1h30 + 2h15) = 7h30 + accueil 30min = 8h.
       ```

    3. Ligne 53 (règle adaptable) : remplacer `1 pause déjeuner si > 5h` par `1 pause déjeuner OBLIGATOIRE 13h00-14h00 (1h) dès que la journée >= 5h ; aucune pause déjeuner si <= 4h`.

    4. Ligne 58 (exemple format pause déjeuner) : `### 12h15 – 13h45 | Pause déjeuner` → `### 13h00 – 14h00 | Pause déjeuner`

    5. Vérifier qu'aucune occurrence "12h15", "13h45", "12h30", "13h30" ne subsiste : `grep -n "12h15\|13h45\|12h30\|13h30" apps/web/src/server/actions/ai-fill-product.ts`.

    Note : on ne refactore PAS ce fichier sur le helper `formation-horaires.ts` car le prompt système est une string littérale envoyée à Ollama — l'injecter dynamiquement compliquerait le prompt sans bénéfice (le mistral-small ne lit que la version finalisée). Les valeurs sont écrites en clair pour rester lisibles côté prompt engineering.
  </action>
  <verify>
    <automated>cd apps/web && grep -n "12h15\|13h45\|12h30\|13h30" src/server/actions/ai-fill-product.ts || echo "PASS: aucune ancienne plage horaire" && grep -n "13h00 – 14h00" src/server/actions/ai-fill-product.ts | head -5 && pnpm tsc --noEmit -p . 2>&1 | grep "ai-fill-product" | head -5</automated>
  </verify>
  <done>
    - Prompt programme impose 13h00-14h00 pause déjeuner
    - Découpage 8h cohérent (somme = 8h00 vérifiable)
    - Aucune ancienne plage horaire ne subsiste
    - tsc clean
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5 : Élargir détection gap midday parse-programme-to-deroule.ts + test rétro-compat</name>
  <files>
    apps/web/src/lib/closure/parse-programme-to-deroule.ts
    apps/web/src/lib/closure/__tests__/parse-programme-to-deroule.test.ts
  </files>
  <behavior>
    Tests à écrire AVANT le changement parser :

    Cas existants à NE PAS casser (rétro-compat) :
    - Programme avec `12h00 – 12h30 : Module X` puis `13h00 – 14h30 : Module Y` (gap 12h30→13h00 = 30 min, endMin=750) → pause détectée comme "Pause déjeuner"
    - Programme avec `11h30 – 13h00 : Module X` puis `14h00 – 16h00 : Module Y` (gap 60min, endMin=780) → "Pause déjeuner"
    - Programme avec `9h00 – 10h30 : Module` puis `10h45 – 12h00 : Module` (endMin=630, hors plage) → "Pause" (pas déjeuner)

    Nouveau cas (norme Laurent 13h-14h) à supporter :
    - Programme avec `10h45 – 13h00 : Module X` puis `14h00 – 15h30 : Module Y` (gap 60min, endMin=780) → "Pause déjeuner"
    - Programme avec `12h00 – 13h00 : Module X` puis `14h00 – 15h30 : Module Y` (gap 60min, endMin=780) → "Pause déjeuner"
    - Programme avec `9h00 – 14h00 : Module X` puis `15h00 – 16h30 : Module Y` (gap 60min, endMin=840) → "Pause déjeuner" (cas limite, fin de pause à 14h00)

    Cas hors plage à classer "Pause" simple :
    - Programme avec `9h00 – 15h00 : Module X` puis `15h30 – 17h00 : Module Y` (endMin=900) → "Pause" (pas déjeuner)

    Au moins 1 test par mode supporté du parser :
    - Mode multi-jours (header "Jour 1 :")
    - Mode mono-jour (sections "Matinée :" / "Après-midi :")
  </behavior>
  <action>
    1. Créer `apps/web/src/lib/closure/__tests__/parse-programme-to-deroule.test.ts` avec les cas listés dans `<behavior>`. Importer `parseProgrammeToDeroule`. Pour chaque cas, construire un `programmeMd` minimal valide (≥50 char) et vérifier `result.jours[0].sequences` contient une séquence `isPause: true` avec `objectifs === 'Pause déjeuner'` ou `'Pause'` selon le cas.

    2. Lancer les tests : ils doivent ÉCHOUER sur les 3 nouveaux cas (norme 13h-14h, endMin > 780) avec la borne actuelle `<= 780`.

    3. Modifier `parse-programme-to-deroule.ts` ligne 192 :
       - AVANT : `const isDej = endMin >= 690 && endMin <= 780; // 11h30–13h00`
       - APRÈS : `const isDej = endMin >= 690 && endMin <= 870; // 11h30–14h30 (couvre normes historiques 12h-13h et règle Laurent 13h-14h)`

    4. Mettre à jour les commentaires d'exemples du fichier qui sont obsolètes :
       - Lignes 17-18 (exemple format) : `12h30 – 13h30 : Pause déjeuner` → `13h00 – 14h00 : Pause déjeuner` (commentaire JSDoc en tête)
       - Ligne 20 : `13h30 – 15h30 : Module 3` → `14h00 – 15h30 : Module 3`
       - Ligne 178 (commentaire fillGapsWithPauses) : `Typiquement : gap de 12h00 à 13h00 → "Pause déjeuner".` → `Typiquement : gap de 13h00 à 14h00 (norme Start Academy) → "Pause déjeuner".`

    5. Relancer les tests : TOUS doivent passer (rétro-compat + nouveaux cas).
  </action>
  <verify>
    <automated>cd apps/web && pnpm vitest run src/lib/closure/__tests__/parse-programme-to-deroule.test.ts</automated>
  </verify>
  <done>
    - Tests existants (anciennes plages) passent toujours
    - Nouveaux tests (norme 13h-14h, cas limites) passent
    - Borne élargie à 870 (14h30)
    - Commentaires alignés sur la nouvelle norme
  </done>
</task>

<task type="auto">
  <name>Task 6 : Cleanup commentaires deroule-template.ts + stub-content.ts + grep global</name>
  <files>
    apps/web/src/lib/closure/deroule-template.ts
    apps/web/src/lib/closure/stub-content.ts
  </files>
  <action>
    1. `deroule-template.ts` ligne 11 (commentaire JSDoc "Format QG") : `3. Pause déjeuner (90 min)` → `3. Pause déjeuner (60 min — règle Start Academy 13h-14h)`

    2. `stub-content.ts` ligne 230 : lire le contexte (lignes 225-240). Si le commentaire mentionne "pause déjeuner 60 min" → OK, ne pas toucher. Si mentionne 90 min ou 1h30 → corriger en "60 min (13h-14h)". Si la constante `lunchDur = 60` (ligne 233) est déjà correcte, ne pas la modifier.

    3. Lancer le grep de validation globale :
       `cd apps/web && grep -rn "12h00.*13h30\|12h15.*13h45\|12h30.*13h30\|12h00.*13h00" src --include="*.ts" --include="*.tsx" | grep -v "__tests__"`
       Doit retourner VIDE (ou uniquement des matches dans __tests__ qui testent la rétro-compat).

    4. Lancer tsc final : `pnpm tsc --noEmit -p .` doit être clean.
  </action>
  <verify>
    <automated>cd apps/web && grep -rn "12h00.*13h30\|12h15.*13h45\|12h30.*13h30" src --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "parse-programme-to-deroule" || echo "PASS: aucune ancienne plage hors tests"</automated>
  </verify>
  <done>
    - deroule-template.ts mentionne 60 min (au lieu de 90)
    - stub-content.ts vérifié cohérent
    - Grep global vide hors __tests__
    - tsc final clean
  </done>
</task>

</tasks>

<verification>
Vérifications de bout en bout après les 6 tasks :

1. **Helper centralisé** : `pnpm vitest run src/lib/__tests__/formation-horaires.test.ts` → 9 tests verts
2. **Parser rétro-compat** : `pnpm vitest run src/lib/closure/__tests__/parse-programme-to-deroule.test.ts` → tous verts (ancien + nouveau)
3. **TypeScript** : `pnpm tsc --noEmit -p apps/web` → 0 erreur
4. **Grep ancien horaire** : `grep -rn "12h00.*13h30\|12h15.*13h45\|12h30.*13h30" apps/web/src --include="*.ts"` doit être vide (hors tests rétro-compat)
5. **Grep nouvelle norme** : `grep -rn "13h00.{1,5}14h00" apps/web/src/lib/closure apps/web/src/server/actions/ai-fill-product.ts` doit ramener au moins 4 hits (ollama-generators, qualiopi-prompts ×2, ai-fill-product)
6. **Suite Vitest complète** : `cd apps/web && pnpm vitest run` ne doit régresser aucun test existant (closure tests, etc.)

**Validation métier Laurent** (hors plan, après merge) : créer un produit test "Test horaires 8h" avec `durationHours=8` via le bouton IA → vérifier que le `programMd` généré contient `13h00 – 14h00 | Pause déjeuner` et que la dernière heure est `18h00` (pas 17h30).
</verification>

<success_criteria>
- Les 6 tasks committées en commits atomiques (un commit par task minimum, format `fix(quick-260525-pzl): {description}`)
- Helper `lib/formation-horaires.ts` est désormais la SOURCE UNIQUE pour la règle pause Laurent
- 4 fichiers (ollama-generators, qualiopi-prompts, ai-fill-product, deroule-template) alignés sur 13h00-14h00 (1h)
- Parser `parse-programme-to-deroule` détecte les deux normes (rétro-compat 12h-13h ET nouvelle 13h-14h) sans casser les programmes existants
- `pnpm vitest run` apps/web reste vert
- `pnpm tsc --noEmit` clean
- Aucun fichier hors `files_modified` modifié
</success_criteria>

<output>
Après complétion : créer `.planning/quick/260525-pzl-fix-horaires-formation-pause-midi-8h-9h-/260525-pzl-SUMMARY.md` documentant :
- Fichiers touchés et nature du change
- Tests ajoutés (compte + rétro-compat confirmée)
- Comment Laurent valide en créant un produit test 8h via IA
- Bug worker import auth React (mémoire MEMORY.md) : N/A ici, pas de worker concerné
</output>
