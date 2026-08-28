# Amendement au Traitement 2 — inscriptions publiques par session

| Champ | Valeur |
|---|---|
| **Objet** | Extension du Traitement 2 (« Pré-inscriptions self-service + OCR IA ») au lien public **par session** |
| **Date de rédaction** | 2026-08-28 |
| **Rédaction** | Générée par assistance IA (Claude), sous contrôle du responsable de traitement |
| **Statut** | ⏳ **À valider par Laurent MARX** avant intégration dans `REGISTRE-TRAITEMENTS.md` (qui est validé au 2026-07-07 et n'a pas été modifié) |
| **Spec technique** | `docs/superpowers/specs/2026-08-28-inscriptions-publiques-par-session-design.md` |

> **Ce n'est pas un nouveau traitement.** La finalité, les catégories de personnes et
> les sous-traitants sont identiques à ceux du Traitement 2. Seuls le point d'entrée
> (un lien par session au lieu d'un lien par candidat), une catégorie de données et
> deux mesures techniques évoluent. Les rubriques ci-dessous remplacent, une fois
> validées, celles du Traitement 2.

---

## Ce qui change

### 1. Nouvelle catégorie de données : le numéro de sécurité sociale

Le formulaire le collecte désormais (il est exigé par les dossiers de financement
AGEFICE). C'est un **identifiant national** : sa collecte appelle une justification
et une minimisation explicites.

**Minimisation retenue** : le numéro transite dans l'appel de soumission mais
**n'est jamais écrit dans la table `PreEnrollment`**, qui est alimentée par un
formulaire ouvert sur Internet. Il n'est enregistré qu'au moment où l'admin valide
l'inscription, et uniquement dans la table `SensitiveData`, séparée du reste.

**Conséquence assumée** : si une demande est rejetée, le numéro est perdu et devra
être redemandé. C'est le comportement voulu.

### 2. Nouvelles données d'identité et d'entreprise

Nom de naissance, adresse postale complète, nom et SIRET de l'entreprise, ancienneté
de dirigeance. Toutes nécessaires au dossier de financement et à la convention ;
aucune n'est une donnée sensible au sens de l'article 9.

### 3. Durée de conservation — brouillons abandonnés

Une nouveauté du dispositif : les pièces sont téléversées **avant** que la demande
n'existe en base (upload direct vers le Storage sous un identifiant de brouillon).
Un visiteur qui abandonne laisse donc des fichiers sans dossier associé.

**Règle retenue** : purge des brouillons sans demande associée au-delà de **30 jours**,
par le script `pnpm storage:purge-drafts` (inventaire par défaut, suppression sur
`WRITE=1`). Les pièces rattachées à une demande réellement soumise suivent la durée
de conservation du Traitement 2, inchangée.

### 4. Mesures techniques — à ajouter à la rubrique existante

- Jeton de session aléatoire de 32 caractères hexadécimaux, sans lien avec le code
  de session (pas d'énumération possible), **révocable** : la régénération invalide
  immédiatement tout lien déjà diffusé.
- **Aucune écriture en base avant la soumission** : un lien diffusé largement ne
  crée plus de dossiers vides contenant des données personnelles partielles.
- Limitation applicative : 5 soumissions par heure et par adresse IP.
- Refus automatique des dépôts quand la session est complète ou close.

---

## Points à trancher par le responsable de traitement

1. **Rate-limiting WAF** : le registre mentionne 30 req/60 s/IP sur `/preinscription`.
   La même règle doit être étendue à `/inscription` — à faire côté Vercel, hors code.
2. **Mention d'information** : le formulaire affiche « Données hébergées dans l'Union
   européenne ». Le formulaire historique `/preinscription` affiche encore « stockées
   en France », ce qui est **inexact** (le projet Supabase est en Irlande). À corriger
   sur l'ancien formulaire.
3. **Durée de 30 jours** pour les brouillons abandonnés : à confirmer ou ajuster.
