# Quick 260910-koz — Résumé

**Livré le 2026-09-10** · commit `53b126d` · branche `feat/signature-docs-signes`

## Ce qui est fait

| Fichier | Modification |
|---|---|
| `docs/rgpd/dpa/docuseal.pdf` | **Versé au dépôt** (16 pages, 220 Ko). C'est la pièce opposable ; la fiche ne fait que la résumer. |
| `docs/rgpd/dpa/docuseal.md` | Raison sociale, DPA signé, portée `docuseal.eu`, CCT module 2, section 11 écrite avec ses réserves, points ouverts 1 et 2 traités, **gate du lot C levé**. |
| `docs/rgpd/REGISTRE-TRAITEMENTS.md` | Gate v1.6 levé ; ligne « Localisation » corrigée ; **ligne DocuSeal ajoutée aux Transferts hors UE** ; sous-traitant n°8 renvoyant à la pièce signée. |

## Contrôle du PDF — fait avant rédaction

La skill `signature` impose un contrôle explicite sur `docs/rgpd/dpa/docuseal.pdf`.
Le fichier a été ouvert et lu. Ce qui a été confirmé : DocuSeal LLC (332 S Michigan
Ave, Chicago), Laurent MARX CEO / Kriti Pinto Co-Founder, « Date Signed: Sept 10,
2026 » des deux côtés, sceau numérique (`/Type /Sig`, `/ByteRange`, `adbe.pkcs7`),
CCT (UE) 2021/914 module 2, sous-traitants par renvoi valant annexe III.

## Trois écarts avec la formulation reçue — corrigés, pas recopiés

1. **« Engagement de non-hébergement hors UE (section 11) » est trop fort.**
   §11.5 pose l'hébergement dans l'Union et l'absence de stockage *intentionnel*
   hors EEE, mais avec trois réserves écrites : sous-traitants listés hors EEE,
   obligation légale, et un **accès distant depuis hors EEE explicitement prévu**
   (support, maintenance, sécurité, incident, continuité). §11.1 rappelle que le
   sous-traitant est **établi aux États-Unis**. Écrire l'engagement sans ces
   réserves dans une pièce opposable à la CNIL l'aurait surinterprété.
2. **Le registre n'avait aucune ligne DocuSeal dans « Transferts hors UE ».**
   Ajoutée : c'est précisément la rubrique qu'un contrôleur ouvre après avoir lu
   « sous-traitant américain ».
3. **Le point ouvert « sous-traitants ultérieurs » ne se ferme qu'à moitié.** Le
   mécanisme est documenté (renvoi valant annexe III), mais une liste par renvoi
   est mouvante et c'est son état à une date donnée qui est opposable. La capture
   horodatée reste à faire à la mise en service.

## Gain

Le premier envoi réel de conventions en production n'est plus bloqué par le
contrat. Il reste conditionné aux garde-fous techniques déjà en place (clé API et
secret de webhook, sans quoi la fonction est désactivée — fail-closed).

## Reste ouvert

- Capture horodatée de la liste des sous-traitants ultérieurs (point ouvert 2).
- Réglage de la langue du compte DocuSeal en Français (point ouvert 5, quick `260910-jxr`).
- Contreseing du registre v1.2 → v1.6 par le responsable de traitement.
