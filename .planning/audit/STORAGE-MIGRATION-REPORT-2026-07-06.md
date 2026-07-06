# Rapport migration storage MinIO→Supabase — 2026-07-06

- **Mode** : WRITE (écriture réelle Supabase)

## Total par bucket

| Bucket | Total clés | Simulés (DRY) | Migrés (WRITE) |
| --- | --- | --- | --- |
| qualiof-docs | 893 | 0 | 866 |
| preinscriptions | 6 | 0 | 5 |

## Migrés : 871

## Orphelins (clé en base, objet absent de MinIO — AUCUNE action auto, D-04)

- Document.pdfUrl [f4b1d397-1992-4341-b09c-f54f4a0b0c53] → `qualiof-docs/programmes/produits/prod-0064-890f110f.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [e15295b5-b32e-4dfd-9c73-ba005587e178] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-attestation-3230971a.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [3d3ee833-1384-4666-ba50-887a487f9e12] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-attestation-e2350e82.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [5f45186a-45d0-438f-994f-1d104e43785e] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-certificat-4018a6b5.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [0a420de1-604f-4e99-90f9-45274206e9f4] → `qualiof-docs/checklists/SES-0094/157a8ea6.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [8b93d59d-9ee4-4eb7-a3dd-773de1190e05] → `qualiof-docs/conventions/SES-0094/russo-yannick-1d7d41f7.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [4cb16fb0-70ca-4fab-b28a-d27fe1fe137b] → `qualiof-docs/conventions/SES-0094/pancracio-charlotte-cd7e39ae.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [55a64349-6e3f-4bc1-9fb6-b99b2feaf515] → `qualiof-docs/conventions/SES-0094/kretchmann-pierre-2967025a.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [c3b7aa57-7f8e-4456-879e-38e7d41bc37f] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-certificat-e931c42c.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [ce820be2-b68c-4f42-aacf-3ccfb322708b] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-attestation-77f4dfa7.pdf` : NoSuchKey: The specified key does not exist.
- Document.pdfUrl [afb075d3-82a6-4225-aa47-156f733105ab] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-certificat-0212600b.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [c0b40a0c-b184-4e19-965e-c9b5b21edb84] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-emargement-583517bf.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [2193f93e-2d9b-405e-aa0b-57f4a1bfd777] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-emargement-8b0911b8.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [835c27d5-5cbc-497a-bd10-1157669ff3ad] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-grille_obs-055763c7.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [0f4dae68-dbf4-4f40-852f-5f5ad42f900d] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-positionnement-726ba920.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [e6610d76-da96-4180-a016-385015787328] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-qcm-c1d821b2.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [14b97873-1108-4a7a-a894-f65e2bfa341b] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-qcm-6340d809.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [08ee1c45-eb60-4a2f-a9c7-63668a8140b5] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-grille_obs-43628ac0.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [3a7f67a5-2d32-492c-91cf-98d197f82ec9] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-qcm-36cd1fd3.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [abcddf6b-d4ee-4ebf-964b-b67d8b69c76f] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-emargement-4b408238.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [1f4ca75d-6e34-42a1-aaae-6e9b1cd46480] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-grille_obs-5b199754.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [3bbbb349-bdad-45a7-8fb0-f644895ae6b3] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-positionnement-fb6ad058.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [2c149111-9b3b-4a07-96c4-307caf060f7e] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-positionnement-75ad3f67.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [70a75a84-96a3-4e83-ab50-6036431c3c5d] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/kretchmann-pierre-satisfaction_chaud-5c0a8bd9.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [c2a63d01-0819-4ba4-a382-99c7564f0883] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/pancracio-charlotte-satisfaction_chaud-41cd4531.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [39ee77ea-95e0-4fca-9a50-a3662053b3f6] → `qualiof-docs/closure/db191440-a144-48d1-93c1-767e6f647f2c/SES-0094/8ae02817-e0d1-45f3-90ef-1f665b5a64e0/russo-yannick-satisfaction_chaud-ffc2e082.pdf` : NoSuchKey: The specified key does not exist.
- PedagogicalAsset.pdfUrl [6bf227d8-08af-476b-b5de-3d306a9a13ab] → `qualiof-docs/deroules/SES-0094/c067d908.pdf` : NoSuchKey: The specified key does not exist.
- PreEnrollment.cniKey [d85031cd-cfcc-4f19-a948-867974babd9d] → `preinscriptions/TEST-OCR-P6D-mr8szn7r/cni-scan-test.pdf` : NoSuchKey: The specified key does not exist.

## Clés invalides Supabase (leading /, //, %, non-ASCII — NON uploadées)

_Aucune._

## Liens morts après migration (DOIT être VIDE pour autoriser la bascule)

_Aucun (0 lien mort)._
