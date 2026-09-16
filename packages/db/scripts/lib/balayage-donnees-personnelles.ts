/**
 * Le balayage des réponses en TEXTE LIBRE, avant qu'elles ne descendent.
 *
 * ## Pourquoi ce garde existe avant le deuxième import, et pas après
 *
 * Les champs STRUCTURÉS d'un diagnostic sont sûrs par construction : un statut
 * est un enum, un CA est un nombre, une éligibilité est un booléen. Aucun d'eux
 * ne peut contenir le nom de quelqu'un.
 *
 * **Les réponses en texte libre, si.** C'est exactement l'endroit où un nom de
 * personne se glisse sans que le formulaire l'ait demandé — « j'en ai parlé à
 * Sophie », « mon associé Marc ». Sur le dossier du 15/09/2026 il n'y en avait
 * aucun, relevé et arbitré par Laurent. Le garde ne sert donc à rien ce jour-là,
 * et c'est précisément la raison de l'écrire ce jour-là : au deuxième import,
 * personne ne relira trois réponses à la main.
 *
 * ## Ce qu'il fait, et ce qu'il ne fait SURTOUT pas
 *
 * Il **arrête**. Il ne caviarde pas.
 *
 * Un caviardage automatique sur du texte métier abîmerait le sens — « Passer de
 * 220 000 à 300 000 € » amputé de ses nombres ne dit plus rien, et c'est ce
 * texte-là qui alimente les douleurs, donc la composition. C'est le motif qui
 * répond à deux choses (§4 quater) : une ambiguïté tranchée toute seule est une
 * écriture qu'on ne peut plus relire.
 *
 * Le script rend donc ce qu'il a trouvé, nomme le motif qui l'a trouvé, et
 * **attend un arbitrage**. L'arbitrage se donne réponse par réponse, sur la
 * ligne de commande — jamais par défaut.
 *
 * ## Le relevé dit ce qu'il a CHERCHÉ (§4 quater)
 *
 * `MOTIFS` est exporté pour être IMPRIMÉ, y compris — et surtout — quand la
 * trouvaille est vide. « 0 trouvaille » ne veut rien dire sans la liste de ce
 * qu'on a su chercher : sans elle, on ne distingue pas « il n'y a rien » de
 * « je n'ai pas su le chercher ».
 *
 * ## Le réglage : large à la DÉTECTION, strict à l'ACTION
 *
 * Un faux positif coûte un arbitrage — trente secondes de lecture. Un faux
 * négatif coûte un nom de personne versé dans une base de travail. Les deux ne
 * se valent pas, donc les motifs ratissent large. Ce qu'ils ne font jamais,
 * c'est agir seuls.
 */

export type GenreDonneePersonnelle =
  | 'EMAIL'
  | 'TELEPHONE'
  | 'ADRESSE'
  | 'CIVILITE'
  | 'PRENOM'
  | 'RELATION';

export interface Motif {
  genre: GenreDonneePersonnelle;
  /** En clair, pour le rapport — c'est ce qui rend « 0 trouvaille » lisible. */
  libelle: string;
  regex: RegExp;
}

export interface ReponseLibre {
  questionId: string;
  /** La valeur JSON brute de `DiagnosticAnswer.value`, quelle que soit sa forme. */
  valeur: unknown;
}

export interface Trouvaille {
  questionId: string;
  genre: GenreDonneePersonnelle;
  /** Le fragment exact qui a déclenché — jamais la réponse entière. */
  extrait: string;
  /** Le motif employé, en clair. */
  motif: string;
}

/**
 * Les motifs à expression régulière.
 *
 * `PRENOM` n'en fait pas partie : il ne se reconnaît pas à une forme mais à un
 * VOCABULAIRE (cf. `PRENOMS`). Il est déclaré ici tout de même, avec les autres,
 * parce que la liste sert d'abord à dire au lecteur ce qui a été cherché.
 */
const MOTIFS_REGEX: readonly Motif[] = [
  {
    genre: 'EMAIL',
    libelle: 'adresse e-mail',
    regex: /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.\p{L}{2,}/gu,
  },
  {
    genre: 'TELEPHONE',
    libelle: 'numéro de téléphone français (0X ou +33)',
    regex: /(?<!\d)(?:\+33|0)[\s.\-]?[1-9](?:[\s.\-]?\d{2}){4}(?!\d)/gu,
  },
  {
    genre: 'ADRESSE',
    libelle: 'numéro suivi d’un type de voie',
    regex:
      /\b\d{1,4}\s*(?:bis|ter|quater)?\s*,?\s*(?:rue|avenue|av\.|boulevard|bd|impasse|all[ée]es?|chemin|route|place|quai|cours|square|r[ée]sidence)\b/giu,
  },
  {
    genre: 'ADRESSE',
    libelle: 'code postal suivi d’une commune',
    regex: /\b\d{5}\s+(?!EUR|EUROS|HT\b|TTC\b|K\b)\p{Lu}[\p{L}'’-]{2,}/gu,
  },
  {
    genre: 'CIVILITE',
    libelle: 'civilité suivie d’un nom',
    regex: /\b(?:M\.|MM\.|Mme|Mmes|Mlle|Monsieur|Madame|Mademoiselle|Dr)\s+\p{Lu}[\p{L}'’-]+/gu,
  },
  {
    genre: 'RELATION',
    libelle: 'lien de personne suivi d’un nom',
    regex:
      /\b(?:mon|ma|notre|son|sa|leur)\s+(?:associ[ée]e?|coll[èe]gue|collaborat(?:eur|rice)|patron(?:ne)?|assistant(?:e)?|secr[ée]taire|direct(?:eur|rice)|g[ée]rant(?:e)?|responsable|commercial(?:e)?|n[ée]gociat(?:eur|rice)|stagiaire|apprenti(?:e)?|conjoint(?:e)?|[ée]pou(?:se|x)|fr[èe]re|sœur|fils|fille)\s+\p{Lu}[\p{L}'’-]+/giu,
  },
  {
    genre: 'RELATION',
    libelle: 'verbe d’échange suivi d’un nom',
    regex:
      /\b(?:parl[ée]\w*\s+(?:à|avec)|vu\s+avec|discut[ée]\w*\s+avec|rencontr[ée]\w*|appel[ée]\w*|demand[ée]\w*\s+à|selon|d['’]apr[èe]s)\s+\p{Lu}[\p{L}'’-]+/giu,
  },
];

export const MOTIFS: readonly Motif[] = [
  ...MOTIFS_REGEX,
  {
    genre: 'PRENOM',
    libelle: 'prénom usuel français (liste de vocabulaire, accents neutralisés)',
    // Sert au relevé ET à la détection : tout mot capitalisé est confronté à
    // `PRENOMS`. Le motif seul ne décide rien — c'est le vocabulaire qui tranche.
    regex: /\p{Lu}[\p{L}'’-]+/gu,
  },
];

/**
 * Le vocabulaire des prénoms — délibérément des PRÉNOMS, pas des mots capitalisés.
 *
 * Un balayage de tous les mots capitalisés arrêterait sur « Hektor » et
 * « Netty », qui sont des logiciels, et sur chaque début de phrase. Il crierait
 * si fort qu'on cesserait de l'écouter — et un garde qu'on désarme ne garde
 * rien. La liste reste donc étroite et sûre : ce qu'elle nomme est un prénom.
 *
 * Écartés volontairement, parce qu'ils sont aussi des noms communs et
 * déclencheraient sur du texte métier : Rose, Olive, Ambre, Aurore, Capucine,
 * Colombe, Violette, Noël, Fleur.
 */
const PRENOMS: ReadonlySet<string> = new Set(
  `adrien alain aline alexandra alexandre alexis alice amandine amelie amine anais andre anne annie
   antoine arnaud arthur audrey aurelia aurelie aurelien axel aymeric baptiste bastien beatrice
   benjamin benoit bernard bertrand brigitte bruno camille carole caroline catherine cecile cedric
   celine chantal charles charlotte chloe christelle christian christine christophe cindy claire
   clara clarisse claude clement colette corinne cyril cyrille damien daniel danielle david
   delphine denis didier dominique dylan edith edouard elisabeth elise elodie eloise emilie emma
   emmanuel eric estelle etienne eva evelyne fabien fabienne fabrice fanny farid florence florent
   florian francis franck francois francoise frederic gabriel gaelle gaetan geoffrey georges
   gerard ghislaine gilles gregoire gregory guillaume guy gwenaelle helene henri herve hugo ingrid
   isabelle jacqueline jacques jean jeanne jennifer jeremy jerome jocelyne joel joelle jonathan
   jordan josephine josiane julie julien juliette justine karim karine kevin laetitia laure
   laurence laurent laurie lea leila leo leon leslie lilian lionel lisa loic louis louise luc
   lucas lucie lucien ludovic lydie madeleine maelle magali manon marc marcel margaux marguerite
   marianne marie marine marion martine maryline mathieu mathilde matthieu maud maxime mehdi
   melanie michel michele micheline mickael mireille monique morgane muriel myriam nadege nadia
   nathalie nathan nicolas nicole noemie nolan odile olivier pascal pascale patrice patricia
   patrick paul pauline philippe pierre pierrick priscilla quentin rachel raphael raphaelle
   raymond rebecca regis remi renaud rene richard robert roland romain romane sabine sabrina sacha
   salome samir samuel sandra sandrine sarah sebastien serge severine simon sofia solene sonia
   sophie stephan stephane stephanie sylvain sylviane sylvie tanguy theo thibault thierry thomas
   timothee tiphaine tom valentin valerie vanessa vera veronique victor vincent virginie vivien
   william xavier yacine yann yannick yohan yolande yves zoe`
    .split(/\s+/)
    .filter(Boolean),
);

/** Minuscules, accents retirés — « Léa » et « LEA » désignent le même prénom. */
function neutraliser(mot: string): string {
  return mot
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Toutes les chaînes d'une valeur JSON, jusqu'aux feuilles.
 *
 * `DiagnosticAnswer.value` est du JSON : une chaîne, mais aussi bien un tableau
 * de choix ou un objet `{ autre: "..." }`. Ne balayer que les chaînes nues
 * laisserait passer le champ « autre », qui est justement celui qu'on saisit à
 * la main.
 */
export function textesDe(valeur: unknown): string[] {
  if (typeof valeur === 'string') return [valeur];
  if (Array.isArray(valeur)) return valeur.flatMap(textesDe);
  if (valeur !== null && typeof valeur === 'object') return Object.values(valeur).flatMap(textesDe);
  return [];
}

/**
 * Ce que le balayage a trouvé — vide si le texte est du texte métier.
 *
 * L'appelant décide quoi en faire. Ce module n'écrit rien, ne modifie rien et
 * ne s'arrête pas lui-même : il CONSTATE. La décision d'arrêter appartient au
 * script d'import, qui est le seul à savoir s'il s'apprête à écrire.
 */
export function balayerTextesLibres(reponses: readonly ReponseLibre[]): Trouvaille[] {
  const trouvailles: Trouvaille[] = [];
  const vues = new Set<string>();

  const retenir = (t: Trouvaille): void => {
    const cle = `${t.questionId}|${t.genre}|${t.extrait}`;
    if (vues.has(cle)) return;
    vues.add(cle);
    trouvailles.push(t);
  };

  for (const { questionId, valeur } of reponses) {
    for (const texte of textesDe(valeur)) {
      for (const motif of MOTIFS_REGEX) {
        for (const m of texte.matchAll(motif.regex)) {
          retenir({ questionId, genre: motif.genre, extrait: m[0].trim(), motif: motif.libelle });
        }
      }

      for (const m of texte.matchAll(/\p{Lu}[\p{L}'’-]+/gu)) {
        if (PRENOMS.has(neutraliser(m[0]))) {
          retenir({
            questionId,
            genre: 'PRENOM',
            extrait: m[0],
            motif: 'prénom usuel français',
          });
        }
      }
    }
  }

  return trouvailles;
}
