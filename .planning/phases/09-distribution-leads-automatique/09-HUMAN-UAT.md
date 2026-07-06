---
status: partial
phase: 09-distribution-leads-automatique
source: [09-VERIFICATION.md]
started: 2026-05-18T07:45:00Z
updated: 2026-05-18T07:45:00Z
---

## Current Test

[awaiting human testing — Laurent a choisi de fermer Phase 9 avant exécution manuelle, il reviendra dessus]

## Tests

### 1. Flow 1 — Création de lead avec auto-assignation
expected: Toast vert "Lead créé" + redirect /app/leads/{id} + commercial assigné affiché + dry-run mailer log subject "Nouveau lead à traiter — Test Smoke9" + AuditLog row leads.auto_assigned actorUserId=null
result: [pending]

### 2. Flow 2 — Réassignation manuelle
expected: Toast vert "Lead réassigné à {ownerName}" + badge mis à jour + AuditLog leads.reassigned actorUserId=adminId + dry-run mailer log (re-déclenché même si owner identique)
result: [pending]

### 3. Flow 3 — Toggles distribution leads
expected: Décocher autoAssignLeads → toast vert + créer lead suivant sans commercial assigné + aucun mailer log + AuditLog leads.distribution_config avec diff before/after
result: [pending]

### 4. Flow 4 — Vue de charge RBAC
expected: ADMIN/MANAGER : page rendue avec 4 PrioCard + table + camembert SVG. COMMERCIAL : redirect /app + pas d'entrée sidebar "Vue de charge" ni "Distribution leads"
result: [pending]

### 5. Flow 5 — Transition WON + KPI Gagnés ce mois
expected: Select WON → toast + "Gagné le {date}" affiché + retour /app/leads/charge → KPI Gagnés ce mois incrémenté + Lead.wonAt set en BDD + AuditLog leads.status.change avec diff status + wonAt
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
