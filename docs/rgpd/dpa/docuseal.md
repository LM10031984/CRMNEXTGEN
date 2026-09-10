# Fiche DPA — DocuSeal

| Champ | Valeur |
|---|---|
| **Fournisseur** | DocuSeal (DocuSeal Inc. / DocuSeal LLC — raison sociale à confirmer sur le DPA signé) |
| **Rôle** | Sous-traitant (art. 28 RGPD) — prestataire de signature électronique |
| **Service utilisé** | API de signature électronique (`POST /submissions/pdf`), webhooks de retour, certificat de signature (audit log). Plan cloud. **Aucun Template DocuSeal n'est stocké** : chaque envoi part du PDF généré par QualiOF, les champs de signature sont posés par des ancres textuelles invisibles dans le document. |
| **Données transmises** | **Le PDF à signer**, et donc son contenu : convention de formation (identité et coordonnées de l'entreprise bénéficiaire et de son représentant, noms des stagiaires, tarifs), dossier de demande de prise en charge AGEFICE (identité complète du stagiaire, date et lieu de naissance, adresse, **n° de sécurité sociale**, **IBAN/BIC**, SIRET), attestation d'assiduité (identité, heures réalisées).<br>**Et les données propres à la signature** : nom, adresse email et rôle de chaque signataire, **adresse IP**, user-agent, horodatages (envoi, ouverture, signature), **image de la signature manuscrite tracée**. Ces dernières constituent le certificat de signature. |
| **Catégories de personnes** | Dirigeants des entreprises bénéficiaires, stagiaires (dont travailleurs indépendants AGEFICE), signataire de l'organisme de formation. |
| **Localisation** | **Serveur UE — `https://api.docuseal.eu`**. Compte créé sur `console.docuseal.eu` le **2026-09-04** par le responsable de traitement, avant toute mise en service. La clé API est liée à la région : la bascule n'était pas un simple changement d'URL. Les liens de signature servis aux signataires sont sur `docuseal.eu` (le host est déduit de la région, aucun host n'est codé en dur dans l'application).<br>⚠ Le serveur global (`api.docuseal.com`) a servi aux **tests d'acceptation du lot B uniquement**, avec des données fictives (société « EXPERTA (TEST QualiOF) ») et les adresses email de l'OF — aucune donnée d'apprenant réel. |
| **Document DPA public** | https://www.docuseal.com/legal/dpa — **à récupérer, vérifier et accepter/signer avant la mise en service du lot C**, et à conserver comme preuve (capture horodatée). |
| **Garanties de transfert hors UE** | Traitement sur l'instance UE. **À confirmer sur le DPA** : liste des sous-traitants ultérieurs (hébergeur de l'instance UE) et clauses de transfert si le support ou l'administration technique sont opérés hors UE. |
| **Durée de conservation côté fournisseur** | **Alignée sur celle du dossier de formation : 5 ans.** Le document signé et son certificat sont **rapatriés dans QualiOF** (bucket Supabase UE) dès la complétion — DocuSeal n'est pas la source de vérité documentaire (décision O-1 de la spec du 2026-09-04). La copie résiduelle chez le prestataire est purgée à l'échéance ; les envois de test sont archivés dès la fin du test. |
| **Date de vérification** | 2026-09-04 (API et forme des réponses vérifiées contre l'instance réelle ; **DPA pas encore récupéré ni accepté** — voir points ouverts) |

## Pourquoi ce sous-traitant

Décision O-2 de la spec « Signature électronique & retour des documents signés »
(2026-09-04). Yousign a été écarté sur le prix (104 € HT/mois pour 500
signatures). Le critère décisif n'est pas le tarif mais la **valeur probante** :
les financeurs AGEFICE réclament régulièrement le rapport d'audit / certificat
de signature délivré par un tiers. Une page de preuve produite par QualiOF
lui-même risquerait d'être refusée.

L'application n'appelle jamais DocuSeal directement : elle passe par le port
`SignatureProvider` (`apps/web/src/lib/signature/port.ts`), ce qui permet de
changer de prestataire — ou de repasser à une implémentation interne — sans
toucher au métier.

## Mesures techniques côté QualiOF

- **Aucun email envoyé par DocuSeal** (`send_email: false` sur l'envoi et sur
  chaque signataire) : les liens de signature partent du mailer QualiOF (SMTP Google Workspace
  depuis le 2026-09-02, voir [google.md](google.md)), qui est fail-closed et dispose d'une catégorie décochable par tenant. Le prestataire ne
  constitue donc pas de liste de diffusion à partir de nos signataires.
- **Webhooks authentifiés** : HMAC-SHA256 sur `timestamp.corps`, fenêtre de rejeu
  de 5 minutes, comparaison à temps constant. **Sans secret configuré, tout
  webhook est rejeté** — jamais de « accepté par défaut ».
- **Fail-closed en production** : sans clé API ou sans région, la fonction de
  signature est désactivée avec un message à l'admin ; elle ne retombe jamais en
  mode simulé silencieux.
- **Rapatriement systématique** : PDF signé et certificat sont téléchargés et
  stockés dans le bucket privé `qualiof-docs`
  (`sessions/{tenantId}/{sessionCode}/signed/…`), servis par signed URL à TTL
  court. Voir [supabase.md](supabase.md).
- **Secret et clé API** en variables d'environnement chiffrées, jamais dans le
  dépôt. Un seul endroit du code porte un host DocuSeal : `DOCUSEAL_BASE_URL`.

## Points ouverts / limites

1. ⚠ **DPA non encore récupéré ni accepté** — action bloquante avant la mise en
   service du lot C (envoi réel de conventions).
2. ⚠ **Sous-traitants ultérieurs de l'instance UE à documenter** (hébergeur,
   support) une fois le DPA en main.
3. ~~Compte UE à créer~~ — **fait le 2026-09-04** : compte `console.docuseal.eu`,
   `DOCUSEAL_BASE_URL="https://api.docuseal.eu"` et clé API de la région posés.
4. Les envois de test créés sur le serveur **global** pendant la mise au point du
   lot B doivent être **archivés** une fois les tests terminés (script
   `smoke-docuseal-sandbox.ts`, variable `SMOKE_ARCHIVE`). Ils ne contenaient que
   des données fictives et les adresses email de l'OF.
