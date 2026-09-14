/**
 * Le référent handicap de l'organisme — **source unique**.
 *
 * ## Pourquoi ce fichier existe
 *
 * Le 12/09/2026, la page publique `/catalogue` nommait **trois personnes
 * différentes** comme référent handicap : « Julien Lafitte » 58 fois (une
 * constante de texte), « Jean-Guy Ourmières » 2 fois (l'override d'un produit),
 * « Laurent MARX » 2 fois (le repli de `of-config`). Deux des trois étaient
 * faux, et Julien Lafitte avait quitté l'organisme.
 *
 * La cause n'était pas « deux textes » : c'était **une identité recopiée à
 * trois endroits, qu'aucun garde ne confrontait**. Ce module est l'endroit.
 *
 * ## Ce qu'il unifie, et ce qu'il n'unifie PAS
 *
 * Il porte le **triplet d'identité** — nom, adresse, téléphone. Il ne porte
 * aucun texte de rubrique : les deux formulations restent distinctes, et c'est
 * délibéré (arbitrage Laurent du 12/09/2026) —
 *
 *   • `/catalogue` rend une phrase courte de vitrine ;
 *   • le PROGRAMME COMPOSÉ rend les trois paragraphes légaux relevés verbatim
 *     dans les programmes du Drive (`lib/docs/qualiopi-mentions.ts`).
 *
 * Les fondre aurait remplacé le texte légal d'une pièce qui part au client et
 * au financeur, sur un champ d'indicateur 26, à trois semaines d'un audit.
 * **On unifie l'identité, pas la prose.**
 *
 * ## Pourquoi une constante et pas une colonne `Tenant`
 *
 * Le système est multi-tenant, et la colonne est le bon foyer **à terme**. Mais
 * elle resterait vide : les `Tenant.qualiopi*` posées le 11/09 valent `NULL` en
 * production et **aucun écran ne permet de les remplir**. On ajouterait une
 * indirection qui retombe sur cette constante.
 *
 * **Condition de migration** (spec §5.5) : le référent passe en colonne
 * `Tenant` le jour où un **SECOND** organisme utilise QualiOF, pas avant. Même
 * règle que pour le déménagement du générateur de codes vers
 * `packages/shared` : pas de plomberie spéculative.
 *
 * ## La variable d'environnement a disparu, et c'est le correctif
 *
 * `OF_HANDICAP_REFERENT` n'existe plus. Elle était absente du `.env`, donc son
 * repli — un nom de personne codé en dur — gagnait toujours. **Une variable
 * d'environnement absente avec un nom de personne en repli est exactement le
 * mécanisme qui a produit ce défaut.**
 */

/** Le référent handicap unique de l'OF — Qualiopi indicateur 26. */
export const REFERENT_HANDICAP = {
  nom: 'Jean-Guy Ourmières',
  email: 'jean-guy@start-academy.fr',
  telephone: '06 10 23 00 60',
} as const;

/**
 * La ligne complète « nom — adresse — téléphone », telle que les documents de
 * clôture la portent depuis le 17/06/2026.
 */
export const REFERENT_HANDICAP_LIGNE =
  `${REFERENT_HANDICAP.nom} — ${REFERENT_HANDICAP.email} — ${REFERENT_HANDICAP.telephone}` as const;

/**
 * La forme courte « nom — adresse », celle de la vitrine : le téléphone n'y
 * figure pas, une page publique n'affiche pas un numéro direct sans raison.
 */
export const REFERENT_HANDICAP_COURT =
  `${REFERENT_HANDICAP.nom} — ${REFERENT_HANDICAP.email}` as const;
