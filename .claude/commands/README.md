# Commandes Claude Code — QualiOF

Fichiers versionnés avec le dépôt : ils suivent le projet, pas la machine.
Taper `/` dans Claude Code les propose en autocomplétion.

| Commande | À quel moment |
|---|---|
| `/audit-session SES-0107` | Avant un contrôle Qualiopi ou l'envoi d'un dossier — double regard auditeur + gestionnaire OPCO |
| `/tarif SES-0107 1400` | Changer UN prix (produit ou session) et propager la cascade sans casser les pièces engagées |
| `/tarification SES-0107` | Piloter la tarification d'une session **par payeur** : forfait groupe entreprise et tarif par stagiaire TNS coexistant. `--etat` pour un simple état des lieux |
| `/coherence-docs SES-0107` | Trouver les PDF qui mentent parce que la donnée a bougé après leur génération |
| `/financeur FIFPL` | Brancher un nouveau financeur au même niveau de service que l'AGEFICE |
| `/quick <tâche>` | Petite évolution en TDD avec les garde-fous du projet (tenantId, AuditLog, gates) |
| `/livraison` | Avant de commiter — règle anti-collision de snapshot + les trois gates |
| `/prod` | Point de situation Vercel / Supabase / Railway / coûts avant toute intervention |

Les commandes encodent des règles métier réelles (règle payeur personne morale,
antériorité de la demande OPCO, avoir plutôt que réécriture de facture) et des
leçons déjà payées (collision de snapshot du 12/08, relances brûlées, credit
limit OpenRouter à vie). Quand une règle change, corriger le fichier — c'est là
qu'elle vit désormais.
