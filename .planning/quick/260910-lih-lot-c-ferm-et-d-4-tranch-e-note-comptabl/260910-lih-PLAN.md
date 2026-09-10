---
phase: quick-260910-lih
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/docs/comptabilite/note-chronologie-factures-2026.md
  - .planning/docs/comptabilite/audit-chronologie-2026-09-10.txt
  - .planning/specs/2026-09-10-datation-numerotation-factures.md
  - .planning/specs/2026-09-02-facturation-electronique-pa.md
autonomous: true
must_haves:
  truths:
    - "Si un tiers demande pourquoi la numérotation n'est pas chronologique, une note datée répond seule, sans reconstitution."
    - "Le lot C est FERMÉ, pas reporté : aucune spec ne laisse croire qu'une réécriture reste à faire."
    - "Aucune pièce comptable n'est modifiée."
    - "Le lot 2 trouvera écrit que le financeur n'est ni buyer ni payee, avant d'écrire le builder."
  artifacts:
    - path: ".planning/docs/comptabilite/note-chronologie-factures-2026.md"
      provides: "Note opposable — constat, cause unique datée, hors-périmètre montant/TVA, règle corrigée, pourquoi le passé n'est pas réécrit"
