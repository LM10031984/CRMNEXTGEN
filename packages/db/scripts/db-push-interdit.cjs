/**
 * `db:push` ne pousse plus rien — il explique pourquoi.
 *
 * Le script est conservé plutôt que supprimé, pour une raison précise : celui
 * qui tape `pnpm --filter @qualiof/db run db:push` a une raison de le faire, et
 * un « script introuvable » ne lui apprendrait rien. Il chercherait la commande
 * équivalente, la trouverait (`prisma db push` marche toujours), et referait
 * exactement ce qu'on veut éviter.
 */
console.error(`
  ⛔ INTERDIT depuis le 10/09/2026 (décision Laurent).

  \`db push\` aligne la base sur le schéma SANS écrire de migration. La base
  devient juste ; l'historique de migrations, lui, ne l'est plus — et rien ne
  le signale. Une CI qui vérifie sur une base poussée par \`db push\` valide le
  schéma contre lui-même : elle ne PEUT PAS voir l'écart.

  C'est ainsi que l'index GIN \`AgeficePointAccueil.departmentsServed\` a vécu
  deux jours en base sans exister au schéma, à un \`migrate dev\` près d'être
  supprimé en silence.

  À la place :

    pnpm --filter @qualiof/db run db:migrate:local        # créer la migration
    pnpm --filter @qualiof/db exec prisma migrate deploy  # l'appliquer
    pnpm --filter @qualiof/db run check:schema            # vérifier avant de livrer

  En environnement non interactif, où \`migrate dev\` refuse de tourner :
  générer le SQL avec \`prisma migrate diff --from-migrations
  --to-schema-datamodel --script\`, écrire le dossier de migration à la main,
  puis \`migrate deploy\`.

  Détails : .claude/commands/quick.md, section « Migrations ».
`);
process.exit(1);
