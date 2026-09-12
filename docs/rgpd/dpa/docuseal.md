# Fiche DPA — DocuSeal

| Champ | Valeur |
|---|---|
| **Fournisseur** | **DocuSeal LLC**, 332 S Michigan Ave, Suite 121 #5896, Chicago, IL 60604, États-Unis — notifications `privacy@docuseal.com`. Raison sociale **confirmée par le DPA signé** : le doute « Inc. / LLC » de la première rédaction est levé. |
| **Rôle** | Sous-traitant (art. 28 RGPD) — prestataire de signature électronique |
| **Service utilisé** | API de signature électronique (`POST /submissions/pdf`), webhooks de retour, certificat de signature (audit log). Plan cloud. **Aucun Template DocuSeal n'est stocké** : chaque envoi part du PDF généré par QualiOF, les champs de signature sont posés par des ancres textuelles invisibles dans le document. |
| **Données transmises** | **Le PDF à signer**, et donc son contenu : convention de formation (identité et coordonnées de l'entreprise bénéficiaire et de son représentant, noms des stagiaires, tarifs), dossier de demande de prise en charge AGEFICE (identité complète du stagiaire, date et lieu de naissance, adresse, **n° de sécurité sociale**, **IBAN/BIC**, SIRET), attestation d'assiduité (identité, heures réalisées).<br>**Et les données propres à la signature** : nom, adresse email et rôle de chaque signataire, **adresse IP**, user-agent, horodatages (envoi, ouverture, signature), **image de la signature manuscrite tracée**. Ces dernières constituent le certificat de signature. |
| **Catégories de personnes** | Dirigeants des entreprises bénéficiaires, stagiaires (dont travailleurs indépendants AGEFICE), signataire de l'organisme de formation. |
| **Localisation** | **Serveur UE — `https://api.docuseal.eu`**. ⭐ Le DPA signé est lui-même **cadré sur l'instance UE** — « *This Agreement applies to the Services provided through docuseal.eu* » (préambule) : ce n'est pas seulement notre choix de configuration, c'est le périmètre contractuel. Compte créé sur `console.docuseal.eu` le **2026-09-04** par le responsable de traitement, avant toute mise en service. La clé API est liée à la région : la bascule n'était pas un simple changement d'URL. Les liens de signature servis aux signataires sont sur `docuseal.eu` (le host est déduit de la région, aucun host n'est codé en dur dans l'application).<br>⚠ Le serveur global (`api.docuseal.com`) a servi aux **tests d'acceptation du lot B uniquement**, avec des données fictives (société « EXPERTA (TEST QualiOF) ») et les adresses email de l'OF — aucune donnée d'apprenant réel. |
| **DPA** | ✅ **Signé des deux parties le 2026-09-10.** Pièce versée au dépôt : **[docuseal.pdf](docuseal.pdf)** (16 pages, version du contrat « Last updated August 28, 2026 »). Signataires : **Laurent MARX, CEO** pour Start Academy ; **Kriti Pinto, Co-Founder** pour DocuSeal LLC. Le PDF est **scellé numériquement** (`/Type /Sig`, `/ByteRange`, `/SubFilter /adbe.pkcs7`).<br>Nuance de lecture, à connaître avant un contrôle : le contrat qualifie lui-même ses blocs de signature de « for reference purposes only » et précise qu'il devient contraignant **par l'acceptation des Terms of Service ou par son exécution**. Il lie donc bien les parties — la signature corrobore, elle n'est pas le fait générateur. |
| **Garanties de transfert hors UE** | **Clauses contractuelles types**, décision d'exécution (UE) **2021/914** du 4 juin 2021, **module 2** (responsable → sous-traitant : c'est notre cas, Start Academy est responsable de traitement). Le contrat prévoit le module 3 au cas où Start Academy agirait comme sous-traitant pour ses propres clients — sans objet ici. S'y ajoutent l'UK Addendum et les adaptations suisses, incorporés au **Schedule 1** ; les annexes I, II et III du DPA valent annexes des CCT.<br>**Sous-traitants ultérieurs** : par renvoi à <https://www.docuseal.com/privacy/gdpr#subprocessors>, page qui **constitue l'annexe III** des CCT ; les changements sont notifiés au titre du §5.4, la page n'étant pas l'unique canal.<br>⚠ **Ce que la section 11 dit exactement — ne pas la résumer en « pas d'hébergement hors UE »** : les données sont hébergées dans des centres de données **de l'Union**, et le sous-traitant ne stocke ni n'héberge **intentionnellement** hors EEE (§11.5). Mais trois réserves sont écrites noir sur blanc : (a) les sous-traitants ultérieurs identifiés comme situés hors EEE, (b) l'obligation légale, et surtout (c) un **accès distant depuis hors EEE explicitement prévu** — support, maintenance, sécurité, réponse à incident, continuité de service — limité au nécessaire, encadré par les contrôles d'accès de l'annexe II, et qualifié de transfert couvert par les CCT. DocuSeal LLC étant une société américaine (§11.1), c'est le point qu'un contrôleur sondera.<br>**§11.3** : réquisition d'autorité publique notifiée sauf interdiction légale, pas de divulgation volontaire, et déclaration qu'**aucune demande formelle d'une agence de renseignement ou de sécurité nationale n'avait été reçue** à la date de dernière mise à jour du contrat. |
| **Durée de conservation côté fournisseur** | **Alignée sur celle du dossier de formation : 5 ans.** Le document signé et son certificat sont **rapatriés dans QualiOF** (bucket Supabase UE) dès la complétion — DocuSeal n'est pas la source de vérité documentaire (décision O-1 de la spec du 2026-09-04). La copie résiduelle chez le prestataire est purgée à l'échéance ; les envois de test sont archivés dès la fin du test. |
| **Date de vérification** | 2026-09-04 (API et forme des réponses vérifiées contre l'instance réelle)<br>2026-09-10 (langue du certificat de signature)<br>**2026-09-10 (DPA signé — PDF ouvert et lu ligne à ligne : parties, signataires, sceau, portée `docuseal.eu`, CCT module 2, annexe III, section 11)** |

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
- **Certificat de signature demandé en français** : chaque envoi pose
  `metadata.lang = "fr-FR"` sur **chaque** signataire (DocuSeal compose le
  certificat dans la langue du dernier signataire ayant complété). C'est une
  pièce justificative destinée à un financeur français — l'AGEFICE la réclame
  pour établir la valeur probante. **Portée : les libellés.** Les horodatages
  relèvent d'un réglage de compte, voir points ouverts 5 et 6.

## Points ouverts / limites

1. ~~DPA non encore récupéré ni accepté~~ — **fait le 2026-09-10** : signé des
   deux parties, pièce versée en [docuseal.pdf](docuseal.pdf). **Le gate du lot C
   est levé** : le premier envoi réel en production n'est plus bloqué par le
   contrat. (Il reste conditionné aux garde-fous techniques : clé API et secret
   de webhook configurés, sans quoi la fonction est désactivée.)
2. ⚠ **Partiellement ouvert — liste effective des sous-traitants ultérieurs.**
   Le *mécanisme* est désormais documenté (renvoi à la page fournisseur, qui vaut
   annexe III des CCT, cf. garanties de transfert). Ce qui manque est la **capture
   horodatée de la liste** telle qu'elle est au jour de la mise en service, et sa
   relecture à chaque notification de changement : une liste par renvoi est une
   liste mouvante, et c'est l'état à une date donnée qui est opposable. À joindre
   ici à côté du DPA.
3. ~~Compte UE à créer~~ — **fait le 2026-09-04** : compte `console.docuseal.eu`,
   `DOCUSEAL_BASE_URL="https://api.docuseal.eu"` et clé API de la région posés.
4. Les envois de test créés sur le serveur **global** pendant la mise au point du
   lot B doivent être **archivés** une fois les tests terminés (script
   `smoke-docuseal-sandbox.ts`, variable `SMOKE_ARCHIVE`). Ils ne contenaient que
   des données fictives et les adresses email de l'OF.
5. ⚠ **Action manuelle du responsable de traitement — langue du compte** : régler
   la langue sur **Français** dans `console.docuseal.eu` (écran des paramètres de
   compte). Sans ce réglage, **les horodatages du certificat restent au format
   anglais** (« September 10, 2026 at 12:29 PM CEST ») : ils sont formatés avec
   la langue du **compte**, jamais avec celle de l'envoi (`fr-FR`, déjà posée par
   le code — voir mesures techniques) ; aucun paramètre d'API ne peut les
   atteindre. Le code ne peut donc pas s'en charger. À dater ici une fois fait,
   comme l'a été la création du compte UE au point 3.
6. **Limites résiduelles — trois chaînes resteront en anglais**, compte réglé en
   français ou non : `User agent:` et `Time zone:` dans le certificat, et le
   motif de signature apposé dans le PDF, `Signed with DocuSeal.com`. Elles sont
   codées en dur chez le prestataire, aucun réglage ne les traduit. Noté ici pour
   qu'un futur lecteur ne reprenne pas l'enquête en voyant cet anglais résiduel.
