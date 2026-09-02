// ecosystem.config.cjs — supervision pm2-runtime des workers de fond QualiOF.
//
// Lancé par le CMD du Dockerfile worker : ["pm2-runtime", "ecosystem.config.cjs"].
// pm2-runtime = mode PID-1 conteneur (pas de daemon) : si un worker meurt, il le
// redémarre SANS tuer les autres (autorestart), logs unifiés vers stdout Railway.
//
// 4 process (source : pattern pm2-runtime standard, pm2.keymetrics.io) :
//   - closure   : poll ClosureJob (Postgres FOR UPDATE SKIP LOCKED)
//   - veille    : cron croner lundi 8h (RSS + résumés)
//   - reminders : cron croner quotidien 8h (relances factures)
//   - ocr       : poll PreEnrollment SUBMITTED (rastérisation poppler + vision)
//
// ⛔ CONTRAINTE RAILWAY — AUCUN EMAIL NE PEUT PARTIR D'ICI (mesuré le 01/09/2026)
//
// Depuis le conteneur (`railway ssh --service worker`), toute connexion sortante
// vers un port SMTP est silencieusement avalée : 25, 465, 587 ET 2525, vers
// n'importe quel hôte (smtp.gmail.com, ssl0.ovh.net, smtp-relay.brevo.com,
// in-v3.mailjet.com) — timeout systématique, ou `ENETUNREACH` sur l'adresse
// IPv6. Le même conteneur atteint `openrouter.ai:443` en 9 ms et
// `api.brevo.com:443` en 12 ms : l'egress fonctionne, ce sont les ports SMTP qui
// sont filtrés. Il n'existe donc aucun réglage applicatif qui répare ça.
//
// Conséquences, à connaître avant d'ajouter un worker ici :
//   - le process `diagnostic` a été RETIRÉ (incident du 01/09 : il générait les
//     programmes puis mourait sur le SMTP, en brûlant les 3 tentatives et en
//     enterrant les soumissions en FAILED). L'envoi du diagnostic se fait
//     désormais sur Vercel : navigateur du prospect (`POST /api/diagnostic/traiter`)
//     en principal, cron Vercel en rattrapage ;
//   - `reminders` (relances factures) envoie du mail depuis ce conteneur : il ne
//     peut donc rien envoyer non plus. Même remarque pour les envois de
//     `closure`. Dette ouverte — à basculer sur Vercel, ou à faire passer le
//     mailer par une API HTTP (port 443, qui, lui, sort).
//
// Recalibrage cloud (WORK-03 / D-09) : concurrency ~3 pour rester compatible avec
// le pooler Supabase (connection_limit=1, Pitfall 1 RESEARCH) — ne PAS monter
// agressivement. Le "timeout 600s→120s" de D-09 est déjà réglé côté LLM
// (OpenRouter timeoutMs 240000 ; la branche 600000 Ollama ne tourne pas en prod).
// Le vrai levier de charge est ici : poll interval + concurrency. Toutes ces
// valeurs sont surchargeables par les variables de service Railway.
//
// interpreter: 'tsx' → tsx (devDependency ^4.21.0 de @qualiof/web) exécute les .ts
// directement. Si pm2 ne résout pas 'tsx' sur le PATH dans l'image, fallback :
//   script: 'tsx', args: 'apps/web/scripts/<worker>.ts'
// (à ajuster au smoke conteneur, plan 20-05).

// Les scripts importent l'alias `@/*` → `apps/web/src/*` (apps/web/tsconfig.json).
// Deux réglages OBLIGATOIRES (révélés au smoke conteneur 20-05) :
//  1. cwd: 'apps/web' → parité avec le lancement local (pnpm exécute les scripts
//     avec cwd = dossier du package).
//  2. TSX_TSCONFIG_PATH → tsx découvre son tsconfig depuis process.cwd() par
//     défaut ; sous pm2 (interpreter 'tsx'), le cwd seul ne suffisait pas à faire
//     charger apps/web/tsconfig.json → `ERR_MODULE_NOT_FOUND Cannot find package
//     '@/lib'`. On pointe tsx EXPLICITEMENT sur le bon tsconfig (chemin absolu
//     dans l'image = /app/apps/web/tsconfig.json) pour résoudre les `paths`.
const TSCONFIG = '/app/apps/web/tsconfig.json';

module.exports = {
  apps: [
    {
      name: 'closure',
      script: 'scripts/closure-worker-postgres.ts',
      cwd: 'apps/web',
      interpreter: 'tsx',
      autorestart: true,
      env: {
        QUEUE_CONCURRENCY: '3',
        QUEUE_POLL_INTERVAL_MS: '3000',
        TSX_TSCONFIG_PATH: TSCONFIG,
      },
    },
    {
      name: 'veille',
      script: 'scripts/veille-worker.ts',
      cwd: 'apps/web',
      interpreter: 'tsx',
      autorestart: true,
      env: { TSX_TSCONFIG_PATH: TSCONFIG },
    },
    {
      name: 'reminders',
      script: 'scripts/invoice-reminder-worker.ts',
      cwd: 'apps/web',
      interpreter: 'tsx',
      autorestart: true,
      env: { TSX_TSCONFIG_PATH: TSCONFIG },
    },
    {
      name: 'ocr',
      script: 'scripts/preinscription-ocr-worker.ts',
      cwd: 'apps/web',
      interpreter: 'tsx',
      autorestart: true,
      env: {
        OCR_CONCURRENCY: '2',
        OCR_POLL_INTERVAL_MS: '5000',
        TSX_TSCONFIG_PATH: TSCONFIG,
      },
    },
  ],
};
