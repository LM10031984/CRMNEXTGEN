# Phase 12 — Smoke Tests Manuels

À exécuter par Laurent **après** complétion des Plans 12-01 et 12-02, **avant** clôture officielle de la phase (checkpoint Task 4 Plan 12-03).

**Préparation :**
- Stack dev tournante sur `localhost:3010` (`pnpm dev:full`)
- 6 utilisateurs test disponibles avec rôles différents (ADMIN / MANAGER / COMMERCIAL / COMPTABLE / FORMATEUR / LECTEUR)

---

## Smoke Pre-checks (CLI — exécutés par Claude avant checkpoint)

| Check                                                                  | Résultat                          | Statut |
| ---------------------------------------------------------------------- | --------------------------------- | ------ |
| `pnpm --filter @qualiof/web build`                                     | exit 0, `/app/inscriptions` + `/app/templates` listés, `/app/preinscriptions` ABSENT du listing | ✅      |
| `pnpm --filter @qualiof/web test --run`                                | 707/707 tests verts (91 test files, 2.31s)                                                       | ✅      |
| `grep -rn "/app/preinscriptions" apps/web/src/` (hors exclusions D-03/D-05/tests/commentaires) | 0 lignes                                                                                          | ✅      |
| `grep -c "label: 'Inscriptions'" apps/web/src/components/layout/nav-config.ts` | 1                                                                                          | ✅      |
| `grep -c "label: 'Pré-inscriptions'" apps/web/src/components/layout/nav-config.ts` | 0                                                                                          | ✅      |
| `grep -c "label: 'Modèles de documents'" apps/web/src/components/layout/nav-config.ts` | 1                                                                                  | ✅      |
| `grep -c "^export const TEMPLATES_CATALOG" apps/web/src/lib/templates-catalog.ts` | 1                                                                                  | ✅      |
| `grep -c "category: 'qualiopi'" apps/web/src/lib/templates-catalog.ts` | 19 (≥10 D-07)                                                                                     | ✅      |
| `grep -c "category: 'agefice'" apps/web/src/lib/templates-catalog.ts`  | 3 (≥2 D-07)                                                                                       | ✅      |
| `grep -c "category: 'email'" apps/web/src/lib/templates-catalog.ts`    | 5 (≥4 D-07)                                                                                       | ✅      |
| `grep -c "requireRole" apps/web/src/app/app/templates/page.tsx`        | 2 (1 import + 1 call)                                                                              | ✅      |
| `grep -c "<Placeholder" apps/web/src/app/app/templates/page.tsx`       | 0                                                                                                  | ✅      |
| `grep -c "<Placeholder" apps/web/src/app/app/inscriptions/page.tsx`    | 0                                                                                                  | ✅      |
| `grep -rn "ui/placeholder" apps/web/src/` (post-suppression composant) | 0 (composant orphelin supprimé Plan 12-03)                                                         | ✅      |

**Verdict pré-flow** : Toutes les validations CLI structurelles PASSENT. Smoke flow runtime à confirmer par Laurent en navigateur ci-dessous.

---

## Flow 1 — Redirect 308 `/app/preinscriptions` (CLI curl)

```bash
curl -sI http://localhost:3010/app/preinscriptions | grep -E "(HTTP|location)"
# Attendu :
# HTTP/1.1 308 Permanent Redirect
# location: /app/inscriptions

curl -sI http://localhost:3010/app/preinscriptions/abc-123 | grep -E "(HTTP|location)"
# Attendu :
# HTTP/1.1 308 Permanent Redirect
# location: /app/inscriptions/abc-123

curl -sI http://localhost:3010/app/pre-inscriptions | grep -E "(HTTP|location)"
# Attendu (chaîne BUG-03 préservée) :
# HTTP/1.1 308 Permanent Redirect
# location: /app/preinscriptions  (qui redirige ensuite vers /app/inscriptions)
```

☐ OK ☐ KO + détails : __________

---

## Flow 2 — Sidebar propre (UI navigateur, login ADMIN)

1. Se connecter en tant qu'ADMIN sur `http://localhost:3010/login`
2. Observer la sidebar : section "Essentiel"
3. **Vérifier :**
   - ☐ 1 entrée "Inscriptions" avec icône Inbox (section Essentiel)
   - ☐ 0 entrée "Pré-inscriptions" (le texte n'apparaît plus)
   - ☐ Dans section "Configuration" : 1 entrée "Modèles de documents" (icône FileText), 0 entrée "Inscriptions" (doublon supprimé)
   - ☐ 0 page placeholder "Bientôt disponible" en cliquant sur Inscriptions OU Modèles

---

## Flow 3 — Page /app/inscriptions (login ADMIN)

1. Login ADMIN, cliquer "Inscriptions" dans la sidebar
2. **Vérifier :**
   - ☐ URL = `/app/inscriptions` (pas de redirect)
   - ☐ Page affiche la liste des pré-inscriptions (PreEnrollments tenant-scoped)
   - ☐ Bouton "Nouveau lien" fonctionne (génère token)
   - ☐ Cliquer une pré-inscription → URL = `/app/inscriptions/{id}` (pas `/preinscriptions/{id}`)
   - ☐ Sur la page détail, le bouton "Retour" remonte vers `/app/inscriptions`

---

## Flow 4 — Page /app/templates par rôle (sidebar filtrée + accès direct)

Pour CHAQUE rôle, login → vérifier la sidebar ET tenter l'accès direct `http://localhost:3010/app/templates` :

| Rôle       | Sidebar "Modèles de documents" visible ? | `/app/templates` direct                  |
| ---------- | ----------------------------------------- | ---------------------------------------- |
| ADMIN      | ☐ OUI                                     | ☐ Affiche le catalogue 27 templates       |
| MANAGER    | ☐ OUI                                     | ☐ Affiche le catalogue                    |
| LECTEUR    | ☐ OUI                                     | ☐ Affiche le catalogue                    |
| COMMERCIAL | ☐ NON                                     | ☐ Redirect ou 403 (requireRole bloque)    |
| COMPTABLE  | ☐ NON                                     | ☐ Redirect ou 403                          |
| FORMATEUR  | ☐ NON                                     | ☐ Redirect ou 403                          |

---

## Flow 5 — Catalogue templates content (login ADMIN)

1. Login ADMIN, ouvrir `/app/templates`
2. **Vérifier :**
   - ☐ 3 sections affichées : "Documents Qualiopi" / "AGEFICE" / "Templates email"
   - ☐ Section Qualiopi contient 19 entrées (≥10 D-07 — attestation, certificat, qcm, déroulé, grille obs, analyse besoin, positionnement, satisfaction chaud/froid, checklist, convention, programme, convocation, legal-docs, invoice, veille-audit, etc.)
   - ☐ Section AGEFICE contient 3 entrées (Fiche AGEFICE HTML + Formulaire PDF 92 champs + Attestation assiduité)
   - ☐ Section Email contient 5 entrées (preinscription-reminder + user-invitation + user-password-reset + invoice-reminder + lead-assigned)
   - ☐ Chaque entrée affiche : Label + Description + sourcePath (code monospace) + Variables (chips bleu primary)
   - ☐ Note V1 affichée en bas de page ("Cette vue est en lecture seule...")

---

## Flow 6 — Formulaire public préservé (D-03)

1. Sans login (logout d'abord)
2. Visiter une URL public form pré-inscription : `http://localhost:3010/preinscription/{token-valide-existant}`
3. **Vérifier :**
   - ☐ Pas de redirect 308 vers /app/inscriptions
   - ☐ Formulaire public s'affiche normalement (champs apprenant + upload CNI/RIB/CFP)
   - ☐ Soumission fonctionne (revient à l'écran de confirmation)

---

## Conclusion

☐ Tous les flows passent → checkpoint Laurent Task 4 = "approved"
☐ Au moins 1 flow échoue → noter détails et créer issue (Plan 12-04 gap closure ou correctif quick)

---

## Validation CLI / smoke automatique : ✅ ALL PASS

- Build Next.js exit 0 (40 routes compilent, `/app/inscriptions` + `/app/templates` présents, `/app/preinscriptions` absent du listing — n'existe que via redirect 308)
- 707/707 tests Vitest verts (91 test files, dont les 15 tests Wave 0 dédiés Phase 12)
- 14 greps defense-in-depth tous PASS
- Composant `<Placeholder>` orphelin supprimé (0 import restant)

**Reste à valider par Laurent visuellement** : Flows 2 à 6 (Flow 1 curl peut aussi être exécuté CLI side).
