# Fiche DPA — Railway

| Champ | Valeur |
|---|---|
| **Fournisseur** | Railway Corp. |
| **Rôle** | Sous-traitant (art. 28 RGPD) — exécution des workers de fond |
| **Service utilisé** | 3 services (plan Pro) : worker QualiOF (closure/veille/relances/OCR sous pm2) + gotenberg-proxy + weasyprint (moteurs HTML→PDF) |
| **Données transmises** | Génération des documents Qualiopi : contenus HTML des documents (noms stagiaires, données sessions) rendus en PDF ; **logs des workers** (audités D-17 au plan 22-02 : les logs référencent des IDs, jamais nom/CNI/RIB en clair) ; emails de relances factures via SMTP (transport OVH, voir [ovh-smtp.md](ovh-smtp.md)) |
| **Localisation** | **`europe-west4` (Pays-Bas, UE)** — fixé en config-as-code, cf. `17-REGIONS.md` |
| **Document DPA public** | https://railway.com/legal/dpa (vérifiée 200 le 2026-07-06) + Trust Center Railway. **Subprocessors déclarés : GCP (infrastructure), Stripe (facturation), Cloudflare (réseau).** |
| **Garanties de transfert hors UE** | Workloads en région UE (europe-west4 sur GCP). DPA public couvrant la chaîne de subprocessors. |
| **Date de vérification** | 2026-07-06 (URL re-vérifiée HTTP 200) |

## Mesures techniques côté QualiOF

- Moteurs PDF exposés protégés par Bearer token (`DOC_ENGINE_TOKEN`) ; service worker privé (réseau interne Railway).
- 5 secrets chiffrés en variables de service (SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, DOC_ENGINE_TOKEN, AUTH_SECRET, SMTP_PASS).
- Audit logs PII réalisé (plan 22-02) sur les `console.*` du worker et des générateurs.

## Points ouverts / limites

- Les logs Railway (stdout des services) sont conservés par la plateforme selon sa politique de rétention — l'audit D-17 garantit qu'ils ne contiennent pas de PII brut. ⚠ Durée de rétention des logs côté Railway non vérifiée précisément — à vérifier si un auditeur le demande.
