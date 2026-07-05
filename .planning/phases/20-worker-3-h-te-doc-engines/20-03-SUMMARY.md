---
phase: 20-worker-3-h-te-doc-engines
plan: 03
subsystem: infra
tags: [flask, weasyprint, gotenberg, caddy, bearer-auth, docker, pdf-render]

# Dependency graph
requires:
  - phase: 17-fondations-cloud-r-gion-eu-env
    provides: "Client Bearer câblé (pdf-render.ts authHeaders() conditionnel au DOC_ENGINE_TOKEN)"
provides:
  - "Enforcement Bearer server-side dans le micro-service WeasyPrint (Flask before_request)"
  - "Mini reverse-proxy Caddy Bearer devant Gotenberg (Gotenberg 8 = basic-auth only, pas Bearer)"
  - "Tests Python (5) prouvant le check WeasyPrint ; caddy validate + smoke runtime prouvant le proxy"
affects: [20-04, 20-05, phase-21-vercel]

# Tech tracking
tech-stack:
  added: [caddy:2-alpine]
  patterns:
    - "Enforcement Bearer server-side CONDITIONNEL au token (dev local sans token non cassé, parité pdf-render.ts authHeaders())"
    - "Proxy Bearer sidecar Caddy devant un backend qui ne parle pas Bearer (Gotenberg basic-auth only)"
    - "Import paresseux des libs natives lourdes (weasyprint) dans la route pour garder l'auth/les tests exécutables sans stack native"

key-files:
  created:
    - docker/weasyprint/test_auth.py
    - docker/gotenberg-proxy/Caddyfile
    - docker/gotenberg-proxy/Dockerfile
  modified:
    - docker/weasyprint/server.py

key-decisions:
  - "Proxy Caddy léger devant Gotenberg (pas de bascule du client sur basic-auth) : pdf-render.ts reste homogène Bearer partout, 0 régression Phase 17"
  - "Import weasyprint rendu paresseux dans la route /pdf pour que le check Bearer et les tests tournent sans Pango/cairo natif"

patterns-established:
  - "Check Bearer conditionnel au token (truthy DOC_ENGINE_TOKEN) : sécurité prod sans casser le dev local"
  - "/health toujours exempté d'auth (probe liveness Railway) sur les deux doc-engines"

requirements-completed: [WORK-01]

# Metrics
duration: 5min
completed: 2026-07-05
---

# Phase 20 Plan 03: Enforcement Bearer server-side doc-engines Summary

**Check Bearer Flask dans WeasyPrint (401 sans token valide, /health ouvert) + mini reverse-proxy Caddy Bearer devant Gotenberg (basic-auth only), les deux conditionnels au DOC_ENGINE_TOKEN pour ne pas casser le dev local — prouvés par 5 tests Python et un smoke runtime Caddy.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-05T09:14:23Z
- **Completed:** 2026-07-05T09:19:09Z
- **Tasks:** 2
- **Files modified:** 4 (1 modifié, 3 créés)

## Accomplishments
- WeasyPrint refuse server-side toute requête POST /pdf sans `Authorization: Bearer <DOC_ENGINE_TOKEN>` (401), accepte avec le bon Bearer, exempte /health, et reste ouvert en dev sans token — via `@app.before_request _enforce_bearer`.
- Gotenberg (qui ne connaît que basic-auth) est protégé par un mini reverse-proxy Caddy qui valide le Bearer AVANT de forwarder le body multipart intact vers l'upstream privé `gotenberg.railway.internal:3000`.
- Le contrat client `pdf-render.ts` (Phase 17) reste inchangé : Bearer homogène partout, aucune régression, aucune bascule basic-auth.
- Preuves : 5 tests pytest verts (health ouvert, 401 missing/wrong, 200 correct, dev-mode open) + `caddy validate` exit 0 + smoke runtime Caddy (200 /health, 401 sans/mauvais Bearer, 502 avec bon Bearer = gate franchi vers upstream mort).

## Task Commits

Each task was committed atomically:

1. **Task 1: Check Bearer server-side WeasyPrint Flask + tests Python** - `35f7505` (feat)
2. **Task 2: Proxy Caddy Bearer devant Gotenberg** - `5bc5470` (feat)

## Files Created/Modified
- `docker/weasyprint/server.py` (modifié) - Ajout `import os`, lecture `DOC_ENGINE_TOKEN`, hook `@app.before_request _enforce_bearer` (401 conditionnel, /health exempté), import weasyprint rendu paresseux dans la route /pdf.
- `docker/weasyprint/test_auth.py` (créé) - 5 tests Flask test_client via helper `_load(monkeypatch, token)` + `importlib.reload(server)`.
- `docker/gotenberg-proxy/Caddyfile` (créé) - `auto_https off`, /health ouvert, `@unauthorized not header Authorization "Bearer {$DOC_ENGINE_TOKEN}"` → 401, sinon `reverse_proxy {$GOTENBERG_UPSTREAM}`.
- `docker/gotenberg-proxy/Dockerfile` (créé) - `FROM caddy:2-alpine` + COPY Caddyfile (ENTRYPOINT par défaut).

## Decisions Made
- **Proxy Caddy devant Gotenberg plutôt que basculer le client sur basic-auth** (Open Question 1 RESEARCH tranchée, discrétion D) : garde `pdf-render.ts` homogène Bearer, 0 régression Phase 17.
- **Import weasyprint paresseux** (dans la route /pdf, pas au niveau module) : nécessaire pour que le check Bearer et les tests d'auth s'exécutent sans la stack native Pango/cairo. Comportement runtime identique (weasyprint n'est utilisé QUE pour rendre le PDF).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import weasyprint déplacé au niveau module → route (lazy import)**
- **Found during:** Task 1 (verify pytest)
- **Issue:** `from weasyprint import HTML` en tête de `server.py` charge les libs natives Pango/cairo AU LOAD du module. Sur le Mac host de la verify (libs absentes), `import server` échouait la collection pytest (`OSError: cannot load library 'pango-1.0-0'`) → impossible de tester le check Bearer, qui pourtant ne dépend PAS de weasyprint.
- **Fix:** Import weasyprint déplacé DANS la route `render_pdf` (import paresseux). Le module se charge sans stack native ; weasyprint n'est importé qu'au moment de rendre un PDF (seul endroit où il sert). Installé aussi `pango` via Homebrew pour que les 2 tests de rendu réel (200) passent.
- **Files modified:** docker/weasyprint/server.py
- **Verification:** 5/5 tests pytest verts (dont test_pdf_accepts_correct_bearer et test_no_token_dev_mode_open qui rendent un vrai PDF).
- **Committed in:** `35f7505` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Nécessaire pour rendre le check Bearer testable sans dégrader le runtime (comportement de rendu identique en prod, l'image Docker fournit Pango/cairo). Aucun scope creep, la route /pdf n'est pas modifiée fonctionnellement.

## Issues Encountered
- La stack native WeasyPrint (Pango/cairo) est absente du Mac host de la verify. Résolu par (a) l'import paresseux ci-dessus et (b) `brew install pango` pour que les 2 tests de rendu réel renvoient 200. Les tests d'auth pur (401) ne nécessitent aucune lib native.

## User Setup Required
None - aucune configuration de service externe requise à ce plan. Le branchement réel (URL publique du proxy, déploiement Railway, preuve HTTPS 401/200) est aux plans 20-04/20-05.

## Next Phase Readiness
- Les 2 doc-engines refusent server-side toute requête de rendu PDF sans Bearer valide, tout en restant ouverts en dev local sans token. WORK-01 (doc-engines exposables en HTTPS public authentifié) contribué côté enforcement.
- Prêt pour 20-04 (conteneurisation / docker-compose du proxy) et 20-05 (preuve HTTPS réelle 401 sans token / 200 avec, après déploiement Railway).
- Rappel : en Phase 21, `GOTENBERG_URL` (worker/Vercel) doit pointer vers le domaine PUBLIC du proxy Caddy, `WEASYPRINT_URL` vers le service WeasyPrint public. Gotenberg reste privé derrière le proxy.

## Self-Check: PASSED

- FOUND: docker/weasyprint/server.py, docker/weasyprint/test_auth.py, docker/gotenberg-proxy/Caddyfile, docker/gotenberg-proxy/Dockerfile, 20-03-SUMMARY.md
- FOUND commits: 35f7505 (Task 1), 5bc5470 (Task 2)

---
*Phase: 20-worker-3-h-te-doc-engines*
*Completed: 2026-07-05*
