# Fiche DPA — Anthropic

| Champ | Valeur |
|---|---|
| **Fournisseur** | Anthropic, PBC (États-Unis) |
| **Rôle** | **Sous-sous-traitant** — atteint VIA OpenRouter : **pas de relation contractuelle directe** Start Academy ↔ Anthropic |
| **Service utilisé** | Modèles Claude (Haiku = fast, Sonnet = quality) consommés à travers la passerelle OpenRouter (génération docs closure + OCR vision) |
| **Données transmises** | Identiques au flux OpenRouter (voir [openrouter.md](openrouter.md)) : prompts contenant noms stagiaires + contexte sessions, images CNI/RIB pour l'OCR — transmises par OpenRouter à Anthropic pour l'inférence |
| **Localisation** | États-Unis (transfert hors UE) |
| **Document DPA public** | Anthropic publie ses conditions commerciales et son Data Processing Addendum : https://www.anthropic.com/legal/commercial-terms et https://www.anthropic.com/legal/data-processing-addendum (vérifiées 200 le 2026-07-06). ⚠ Ces documents s'appliquent aux clients directs d'Anthropic — **Start Academy n'est PAS partie à ces contrats** : la chaîne contractuelle passe par OpenRouter. |
| **Garanties de transfert hors UE** | Portées par la chaîne OpenRouter → Anthropic (subprocessor d'OpenRouter). Le choix ZDR côté OpenRouter restreint le routage aux endpoints sans rétention. ⚠ Le détail de l'accord OpenRouter↔Anthropic n'est pas public — à signaler comme trou honnête, pas d'invention. |
| **Date de vérification** | 2026-07-06 (URLs re-vérifiées HTTP 200) |

## Points ouverts / limites

- ⚠ **Aucun lien contractuel direct** : Start Academy ne peut pas produire de DPA signé avec Anthropic. Le document opposable est la relation avec OpenRouter (elle-même limitée en self-serve — voir [openrouter.md](openrouter.md)).
- La politique du model provider (anthropic.com/legal) est référencée à titre d'information sur les pratiques du fournisseur de modèles, pas comme engagement contractuel envers Start Academy.
- ⚠ À VALIDER PAR LE RESPONSABLE DE TRAITEMENT : acceptation de cette chaîne de sous-traitance à deux niveaux (OpenRouter → Anthropic) pour les flux IA.
