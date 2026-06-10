# Phase 9: Distribution leads automatique - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Activer la distribution automatique des leads entrants vers les commerciaux + offrir une vue de charge dédiée.

- **LEAD-01** : Auto-assignation Lead → Commercial dès la création
- **LEAD-02** : Page dédiée vue de charge par commercial

Hors scope : règles d'assignation complexes (zone géographique, enseigne, historique de conversion) — reporté.

</domain>

<decisions>
## Implementation Decisions

### D-01 — Algorithme de distribution
**Garder l'algo existant** dans `apps/web/src/server/actions/auto-assign-leads.ts` : round-robin équilibré par charge active.
- Cible = utilisateurs `role: 'COMMERCIAL'` du tenant
- "Charge active" = leads `ownerUserId = X` avec status ∈ {NEW, CONTACTED, QUALIFIED, PROPOSAL_SENT, NEGOTIATION, ON_HOLD, TO_FOLLOWUP}
- Le commercial avec la charge la plus faible reçoit le lead
- Tie-breaker : `User.createdAt` ASC (le plus ancien)
- Fallback si aucun commercial disponible : lead reste `ownerUserId = null` → admin alerté via notification

### D-02 — Trigger automatique
**POST-RESEARCH ADJUSTMENT** : aucune `createLead` server action n'existait. À créer dans Phase 9.

Entry points :
1. **Création de Lead via UI** (NEW `server/actions/leads.ts` `createLead`) → appel `autoAssignLead(leadId)` immédiat
2. ~~Pré-inscription convertie en Lead~~ **DESCOPED** : `preinscription-convert.ts` ne crée pas de Lead aujourd'hui (crée Person/Org/LegalLink). Au lieu de trigger auto, ajouter bouton "Créer un lead pour ce prospect" sur fiche pré-inscription (Phase ultérieure).
3. **Bouton manuel "Réassigner"** dans la fiche Lead → appel `autoAssignLead(leadId, { force: true })`

Conditions pour skip auto :
- Lead déjà assigné (`ownerUserId != null`) sauf `force: true`
- Lead en status fermé (`WON` / `LOST`)
- Aucun commercial actif dans le tenant

### D-03 — Notifications
**POST-RESEARCH ADJUSTMENT** : aucun model Prisma `Notification` n'existe — la cloche Phase 4 dérive de Lead/Pré-inscription. À créer dans Phase 9 (utile aussi pour futures notifs).

À l'assignation réussie :
- **Notification cloche app** : créer `Notification` row (NEW model) avec `tenantId`, `userId: assignedCommercialId`, `type: 'lead.assigned'`, `payload: { leadId, source }`, `readAt: null`. Affichée dans le panel cloche TopBar (Phase 4 extended).
- **Email** : envoyé via `mailer.ts` depuis `tenant.emailFrom` au commercial assigné. Sujet : "Nouveau lead à traiter — {prospectName}". Template `lead-assigned-template.ts` similaire aux user-invitation templates.
- **AuditLog** : action `'leads.auto_assigned'` avec diff `{ leadId, assignedTo, assignedBy: 'system' | userId }`.

### D-04 — Page de charge dédiée
Route : `/app/leads/charge` (nouveau lien sidebar sous "Leads" ou sous-section Paramètres).

Visible par : ADMIN + MANAGER (pas par COMMERCIAL — pas besoin de voir la charge des autres).

**POST-RESEARCH ADJUSTMENT** : `Lead.wonAt` n'existe pas — à ajouter en Phase 9 (set automatiquement quand `status` passe à `WON`). Sinon KPI 2/3/4 non calculables.

**4 KPI par commercial** :
1. Leads en cours (status actifs)
2. Leads gagnés ce mois (status = WON + `wonAt` ce mois)
3. Taux de conversion (WON / total leads attribués)
4. Temps moyen lead → signature (createdAt → `wonAt` moyenne)

**Format** : tableau + graphique camembert (répartition des leads en cours par commercial).

Réutilisation : composant `PrioCard` (Phase 6) pour les 4 KPI globaux en haut + tableau détail commercial × KPI.

### D-05 — UI Lead : bouton "Réassigner"
Sur la fiche Lead (`/app/leads/[id]`) :
- Affiche le commercial assigné (badge avec nom)
- Bouton "Réassigner" → AlertDialog confirmation → call `autoAssignLead(leadId, { force: true })`
- Visible pour ADMIN + MANAGER + COMMERCIAL propriétaire du lead

### D-06 — Configuration on/off
Dans `/app/parametres/distribution-leads` (sous-section Paramètres, ADMIN only) :
- Toggle "Auto-assignation activée" (Tenant.autoAssignLeads boolean, défaut true)
- Toggle "Notification email" (Tenant.notifyOnLeadAssign boolean, défaut true)
- Toggle "Notification cloche" (Tenant.notifyBellOnLeadAssign boolean, défaut true)
- Si auto désactivé : leads restent `ownerUserId = null`, admin doit assigner manuellement.

### D-07 — Convention AuditLog étendue (D-10 Phase 8)
- `'leads.auto_assigned'` : action système avec actorUserId = null
- `'leads.reassigned'` : action manuelle avec actorUserId = user.id
- `'leads.distribution_config'` : modif des toggles dans Paramètres

### Claude's Discretion
- Algorithme exact du graphique camembert (Recharts ou SVG custom) — à arbitrer planning
- Trigger email synchrone vs async (background job) — synchrone OK vu petit volume
- Layout exact de la page de charge (tableau vs cards) — à arbitrer planning

</decisions>

<canonical_refs>
## Canonical References

### Code existant (à compléter, pas réécrire)
- `apps/web/src/server/actions/auto-assign-leads.ts` — algorithme round-robin équilibré DÉJÀ implémenté (`autoAssignLead` + `autoAssignUnassignedLeads`)
- `apps/web/src/server/actions/leads.ts` — server actions Lead (créer, update) — à wirer avec autoAssign
- `apps/web/src/server/actions/preinscription-convert.ts` — convert pré-inscription en Lead — à wirer
- `apps/web/src/app/app/leads/page.tsx` — page leads list — à ajouter lien "Vue de charge"
- `apps/web/src/lib/mailer.ts` — pour envoi email (utiliser `getOfConfig().emailFrom`)
- `apps/web/src/lib/audit-log.ts` — convention AuditLog Phase 7+8 (helpers `logUserAction`)
- `apps/web/src/components/topbar/notifications-panel.tsx` — panel cloche Phase 4 (à étendre avec type `lead.assigned`)
- `packages/db/prisma/schema.prisma` — model Notification, Lead, User, Tenant

### Patterns à réutiliser
- `apps/web/src/lib/rbac.ts` requireRole helper Phase 8
- Pattern Server Action `{ ok, ... }` discriminé
- Pattern email template Phase 8 (`mailer-templates/user-invitation.ts`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `autoAssignLead(leadId)` + `autoAssignUnassignedLeads()` : DÉJÀ codés et testés indirectement (pas de unit tests pour l'instant)
- `getCommercialsWithLoad(tenantId)` : helper qui retourne charge active par commercial — réutilisable pour LEAD-02 vue de charge
- `Notification` Prisma model : déjà en place, à consommer pour `type: 'lead.assigned'`
- `Lead.ownerUserId` : champ déjà présent en BDD

### Established Patterns
- Server actions discriminées
- AuditLog convention namespaced (`parameters.*`, `users.*`, `auth.*` → ajouter `leads.*`)
- `requireRole` guards (Phase 8 ADMIN+MANAGER+COMMERCIAL pour leads, ADMIN only pour distribution config)

### Integration Points
- Lead creation flow : `server/actions/leads.ts` création + `preinscription-convert.ts` conversion
- Sidebar : ajouter sous-item "Vue de charge" sous "Leads" (visible ADMIN+MANAGER uniquement via `allowedRoles`)
- Notifications panel TopBar Phase 4 : étendre rendu pour `type: 'lead.assigned'`

</code_context>

<specifics>
## Specific Ideas

- Q1 (Laurent) : Garder l'algo round-robin équilibré existant — pas de règles complexes.
- Q2 (Laurent) : Auto-assign à la création + bouton manuel "Réassigner".
- Q3 (Laurent) : Email + notification cloche.
- Q4 (Laurent) : Page dédiée `/app/leads/charge` avec 4 KPI + graphique camembert.

</specifics>

<deferred>
## Deferred Ideas

- **Règles de distribution avancées** (zone géographique, enseigne, historique de conversion) — Q1A explicite, hors scope.
- **Reassignment auto si commercial absent/en congé** — pas de notion de congés dans le modèle.
- **Score de "fit" prospect-commercial** (ex. commercial qui a le plus de WON sur la même enseigne) — overkill.
- **Notifications mobile push** — pas d'app mobile native.
- **Rebalance automatique périodique** (réassigner les leads des commerciaux surchargés) — éviter, frustrant pour le commercial qui perd un lead.
- **Vue de charge visible par les commerciaux** (pour qu'ils voient leur classement) — non demandé, peut créer compétition toxique.

</deferred>

---

*Phase: 09-distribution-leads-automatique*
*Context gathered: 2026-05-16*
