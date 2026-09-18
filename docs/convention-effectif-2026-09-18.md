# Convention : effectif du document et effectif de la session

Correction du 18/09/2026 de la phrase de l'article 4 : « Elle est organisée pour un effectif de 1 stagiaire. »

Le modèle comptait les personnes couvertes par la convention (`stagiaires.length`) tout en présentant ce nombre comme l'effectif de l'action de formation. Sur un dossier individuel, il affichait donc 1, même si d'autres personnes étaient inscrites à la même session avec leur propre convention.

Le modèle affiche désormais :

> Effectif couvert par la présente convention : **1 stagiaire**.
>
> L’effectif total de la session peut évoluer au fil des inscriptions. La présente convention concerne la personne suivante :

La liste reste limitée aux personnes couvertes par ce document. Une convention commune à deux inscrits affiche **2 stagiaires** et leurs deux noms. Aucun effectif total provisoire n'est figé dans les conventions individuelles ; les inscriptions ultérieures à d'autres dossiers ne modifient ni leur bénéficiaire ni leur prix.

La correction concerne uniquement la rédaction du modèle. Elle ne change pas le routage des conventions, les prix, les statuts, la base de données ou les PDF déjà stockés. Les brouillons existants doivent être régénérés après déploiement pour afficher le nouveau texte. Aucune régénération de document réel n'a été lancée.

Validation : deux nouveaux tests initialement rouges reproduisent l'ambiguïté. Après correction, 54 tests ciblés de conventions et ancres de signature passent. Suite complète sans cache : **4 369 tests unitaires réussis, 2 ignorés**. Lint et TypeScript passent ; l'avertissement alt d'image préexistant reste présent.

Pour une convention censée couvrir toute une agence mais ne listant qu'un seul inscrit, il reste à vérifier le commanditaire des inscriptions et la date de génération du document. Cette situation est distincte d'une convention individuelle dans une session collective ; aucune hypothèse sur les données réelles n'a été appliquée.
