# Phase 9 — Smoke manuel DevTools

**Pré-requis :**
- `pnpm dev:full` lancé (.next clean auto-clean inclus)
- Connecté en tant qu'ADMIN dans le tenant Start Academy
- Au moins 2 comptes COMMERCIAL actifs dans le tenant
- SMTP_HOST vide (mode dry-run) — vérification email = console log

## Flow 1 — Création de lead avec auto-assignation

1. Naviguer vers `/app/leads`
2. Cliquer "Nouveau lead" (en haut à droite, à côté de "Auto-assigner")
3. Remplir : Prénom "Test", Nom "Smoke9", Source "DevTools"
4. Cliquer "Créer le lead"

**Attendu :**
- Toast vert "Lead créé"
- Redirect vers `/app/leads/{leadId}`
- Section "Commercial assigné" : badge avec le nom d'un commercial (celui le moins chargé)
- En console serveur (`pnpm dev:full` terminal) : log `mailer dry-run` avec subject "Nouveau lead à traiter — Test Smoke9"
- Page Historique `/app/parametres/historique` (en tant qu'ADMIN) : nouvelle row `leads.auto_assigned` avec `actorUserId=null` (system)

## Flow 2 — Réassignation manuelle

1. Sur la fiche lead créée en Flow 1, cliquer le bouton "Réassigner"
2. Confirmer dans la dialog Radix qui s'ouvre (cliquer "Réassigner")

**Attendu :**
- Toast vert "Lead réassigné à {ownerName}"
- Section "Commercial assigné" : badge mis à jour (potentiellement le même nom si la charge est équilibrée — vérifier que l'AuditLog enregistre la transaction quoi qu'il en soit)
- Page `/app/parametres/historique` (ADMIN) : nouvelle row `leads.reassigned` avec `actorUserId=admin actuel`
- En console serveur : log `mailer dry-run` (le helper `notifyLeadAssigned` est appelé même en cas de réassignation au même owner)

## Flow 3 — Toggles distribution leads

1. Naviguer vers `/app/parametres/distribution-leads` (visible dans la sidebar ADMIN > Configuration)
2. Décocher "Auto-assignation des leads"
3. Cliquer "Enregistrer"
4. Toast vert "Paramètres mis à jour"
5. Retourner sur `/app/leads/new` → créer un nouveau lead "Test SmokeNoAuto"

**Attendu :**
- Lead créé mais "Commercial assigné" = "Non assigné"
- Aucun email dry-run en console (la chaîne `notifyLeadAssigned` n'est pas déclenchée car le toggle parent est OFF)
- Page Historique : row `leads.distribution_config` avec `diff: { autoAssignLeads: { before: true, after: false } }`

**Important :** réactiver "Auto-assignation des leads" + sauver après ce flow pour ne pas casser les flows suivants.

## Flow 4 — Vue de charge

1. Naviguer vers `/app/leads/charge` (visible dans la sidebar ADMIN+MANAGER > Suivi)
2. Vérifier les 4 PrioCard en haut : Leads en cours / Gagnés ce mois / Taux conversion / Temps moyen
3. Vérifier le tableau commercial × 4 KPI (Commercial, Leads en cours, Gagnés ce mois, Taux conv., Temps moyen j)
4. Vérifier le camembert SVG inline (1 part par commercial avec leads actifs)
5. Se déconnecter, se reconnecter en tant que COMMERCIAL
6. Tenter de naviguer vers `/app/leads/charge` (URL directe)

**Attendu :**
- En ADMIN ou MANAGER : page rendue avec données réelles, camembert visible
- En COMMERCIAL : redirect immédiat vers `/app` (RBAC bloque l'accès)
- Sidebar en COMMERCIAL : pas d'entrée "Vue de charge" visible
- Sidebar en COMMERCIAL : pas d'entrée "Distribution leads" visible non plus

## Flow 5 (bonus) — Transition statut + KPI Gagnés ce mois

1. Sur la fiche lead Flow 1, changer le select statut vers "Gagné"
2. Toast vert "Statut : Gagné"
3. Vérifier l'affichage "Gagné le {date du jour}" sous le select
4. Retourner sur `/app/leads/charge` → la colonne "Gagnés ce mois" devrait avoir incrémenté pour le commercial concerné

**Attendu :**
- Database : `Lead.wonAt` set à `now()`
- KPI 2 (Leads gagnés ce mois) sur la vue de charge a incrémenté de 1
- Page Historique : row `leads.status.change` avec `diff: { status: { before: 'NEW', after: 'WON' }, wonAt: { before: null, after: '<ISO date>' } }`

---

**Validation finale :** Laurent confirme que les 5 flows passent → Phase 9 OK et fermée.
