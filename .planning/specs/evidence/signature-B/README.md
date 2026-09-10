# Preuves du test d'acceptation — lot B (signature électronique)

Envoi DocuSeal **1619115**, instance **UE** (`api.docuseal.eu`), signé le
**10/09/2026** par les deux rôles.

| Fichier | Ce qu'il prouve |
|---|---|
| `1619115-convention-signee.pdf` | Le PDF final est **signé numériquement** : `/Type /Sig`, `/ByteRange[0 95960 135962 7900]`, `/SubFilter /adbe.pkcs7.detached`, `/AcroForm`. Ouvert dans Adobe Reader, le panneau de signature s'affiche et la signature est **valide après mise à jour AATL** (certificat **Netrust**). |
| `1619115-certificat-de-signature.pdf` | Le certificat (audit log) que les AGEFICE réclament : ID d'enveloppe, SHA-256 du document avant et après signature, horodatage, puis par signataire l'email, l'adresse IP, l'ID de session, le user-agent, le fuseau horaire et l'image de la signature tracée. |

Les deux pièces ont été servies par `docuseal.eu` — l'hébergement UE se lit sur
l'URL de service, le texte du certificat ne citant aucun hôte.

**Réserve de lecture** : sur cet envoi, les deux signatures **débordaient de leur
cadre** (celle du client chevauchait la bordure et le libellé du bloc de l'OF).
Le défaut a été corrigé après coup — l'ancre est devenue une zone dédiée de
180 × 60 pt alignée à droite — et revérifié sur l'envoi **1619495**, signé lui
aussi. Ces fichiers-ci restent la preuve de la **chaîne de signature** ; la
preuve du **placement** est l'envoi 1619495.

---

## Portée exacte de ces preuves

Elles portent sur la **convention**, rendue en HTML par WeasyPrint. Elles ne
disent rien des deux autres documents, qui n'ont pas le même mécanisme :

| Document | Rendu | Ancrage | Signataires |
|---|---|---|---|
| Convention | HTML → WeasyPrint | zone HTML invisible | client + OF |
| Attestation d'assiduité | HTML → WeasyPrint | zone HTML invisible | stagiaire + OF |
| **Dossier AGEFICE** | **formulaire officiel rempli par pdf-lib** | **ancre dessinée** (`ANCRE_DEMANDEUR`) | **stagiaire seul** — l'OF a déjà son image apposée |

Le 10/09/2026, une première version de ce README affirmait que « les 3 gabarits »
partageaient les ancres HTML. C'était faux : `renderAgeficeHtml` n'est appelé
par personne, et le dossier AGEFICE serait parti **sans champ à signer**.
Corrigé le même jour ; ancrage vérifié en sandbox sur les trois types.
