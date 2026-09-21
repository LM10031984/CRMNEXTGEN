# Émargement — tampon et signature seuls en page 2 (relevé du 21/09/2026)

## Le symptôme

SES-0111 « Du surfeur au pilote — Étape 2 » (7 inscrits, 2 jours, 28-29/09) : la feuille
d'émargement met la signature du formateur et le tampon **seuls en page 2**. Même défaut que
l'assiduité corrigée par la PR #100.

## Ce que j'ai cherché, et ce que j'ai trouvé

**Le moteur n'est pas Gotenberg.** L'émargement passe par `renderHtmlToPdfWeasy`
(`apps/web/src/lib/pdf-render.ts`) — WeasyPrint, pour le pied de page répété en CSS Paged Media.
Une preuve rendue par Chromium aurait mesuré la pagination d'un autre moteur. La preuve livrée
rend donc par WeasyPrint (`qualiof_weasyprint`, 127.0.0.1:5001).

**La feuille est par stagiaire** : une ligne par JOUR, deux cases de signature. « 7 inscrits ×
2 jours » = 7 feuilles de 2 lignes ; « 12 × 9 » = 12 feuilles de 9 lignes.

**Population touchée, mesurée sur le gabarit d'avant** (balayage 1 → 12 jours, rendu réel) :
toutes les durées de **2 à 7 jours**. 1 jour : sain. 8 jours et plus : sain par chance, le
tableau débordant de lui-même avec au moins deux lignes.

**La cause n'était pas un manque de place.** Sur SES-0111, la page 1 gardait ~35 mm de vide sous
« Fait à Cagnes-sur-Mer » — les 26 mm du tampon TENAIENT. C'est la rangée d'images en
`display: flex` que WeasyPrint pagine mal en bas de page, et qui sautait.

**L'historique explique pourquoi les deux réglages précédents échouaient** :
- avant le 01/07 : `break-inside: avoid` sur le SEUL bloc du bas → il sautait entier en page 2
  en laissant du vide ;
- du 01/07 au 21/09 : plus aucun `break-inside` → la QUEUE du bloc s'orphelinait.
Même raison dans les deux cas : l'insécable portait le bloc seul.

## Le correctif

Un tableau, deux `<tbody>`. Le premier, sécable, porte les jours 1 à n-2 (l'en-tête se répète
seul). Le second, **insécable**, porte les deux derniers jours ET le bloc de fin. Plus de flex
dans ce bloc : des inline-block. Marges et interlignes resserrés comme dans #100 ; les cases à
signer (18 mm), l'espace formateur (12 mm) et le tampon (26 mm) sont intacts.

## Preuve — `apps/web/scripts/proof-emargement-tampon.ts` (WeasyPrint réel, sans base ni .env)

| Cas | Avant | Après |
|---|---|---|
| SES-0111, 7 feuilles × 2 jours | 7/7 en défaut, 2 pages | 7/7 sur **1 page** |
| 2 jours, libellés les plus longs | — | 1 page |
| 12 feuilles × 9 jours | sain par chance | 2 pages, tampon avec ≥ 2 lignes |
| Balayage 2 → 7 jours | tous en défaut | aucun orphelin |

Contrôle visuel fait sur SES-0111 (nom le plus long), 3 jours et 9 jours.

## Décision du 21/09 (soir) — la certification à côté du tampon

Laurent a tranché : « Certifié exact / Fait à » passe À CÔTÉ de la signature et du tampon, plus
au-dessus. ~10 mm gagnés. Même règle : texte, signature et tampon dans le même groupe insécable.

| Cas | Résultat |
|---|---|
| Balayage 3 jours | **1 page** (2 avant) |
| 3 jours, libellés les plus longs (titre, lieu, nom) | **1 page** |
| SES-0111, 2 jours | 1 page, inchangé |
| 4 jours et plus | 2 pages, tampon avec ≥ 2 lignes, en-tête répété |

Contrôle visuel refait sur le cas « 3 jours, libellés les plus longs ».

## Non fait, et pourquoi

**Non joué sur le déploiement** : Laurent régénère lui-même l'émargement de SES-0111 après fusion
(tampon avec les signatures, une page par stagiaire).
