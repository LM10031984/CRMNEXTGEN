/**
 * GARDE — un produit ne naît jamais sans trace, ni à moitié.
 *
 * ## Ce qui a rendu ce test nécessaire (relevé prod du 12/09/2026)
 *
 * `PROD-cdd22466` existe en production depuis le 21/08/2026 06:14. Il porte
 * **4 sessions réelles**, 88 h, 2 500 € — ce n'est pas un déchet d'import.
 * Et personne ne peut dire d'où il vient, parce qu'il ne porte **ni AuditLog,
 * ni ExternalIdentity**.
 *
 * La comparaison avec ses voisins est ce qui tranche. Les trois produits créés
 * le 12/08 à 07:34 portent la signature COMPLÈTE d'un import : un
 * `ExternalIdentity` dont l'`externalId` est le UUID dont les huit premiers
 * caractères FORMENT le code (`PROD-f8be726b` ↔
 * `f8be726b-5b5f-4f5a-8ed6-7001b3a052e1`). `PROD-cdd22466` n'en porte que la
 * moitié : la forme du code, pas l'identité.
 *
 * Or `trainingProduct.create()` et `ensureExternalIdentity()` étaient deux
 * écritures SÉPARÉES. Un run interrompu entre les deux produit exactement cette
 * ligne — un produit orphelin qu'un prochain import ne retrouvera pas par son
 * UID, et qu'il recréera donc en doublon.
 *
 * ## Les trois invariants gardés ici
 *
 *  1. **Aucun repli hexadécimal** nulle part : un code fabriqué sort du
 *     générateur unique (`packages/db/scripts/lib/product-code.ts`), et il est
 *     lisible ET séquençable. `PROD-7a78c8b2` n'est ni l'un ni l'autre — il est
 *     même invisible au séquenceur, qui ne lit que `/^PROD-0*(\d+)$/`.
 *  2. **Tout chemin de création pose un `AuditLog`.** Constat du 12/09 :
 *     AUCUN ne le faisait, pas même `createProduct` côté appli — `PROD-0674`
 *     ne porte que deux `products.validate_ai_draft`, jamais sa création.
 *  3. **La création passe par un client de transaction** (`tx.trainingProduct`),
 *     jamais par `prisma.trainingProduct` : c'est ce qui rend le trio
 *     produit + identité + trace atomique.
 *
 * ## Ce que ce test ne garde PAS, et pourquoi
 *
 * Les seeds, fixtures et scénarios e2e créent aussi des produits. Ils ne sont
 * pas dans la liste : ils fabriquent des données jetables dans une base
 * jetable, il n'y a rien à auditer. La liste ci-dessous énumère les chemins qui
 * écrivent dans une base RÉELLE à partir d'une source RÉELLE — et l'énumérer
 * est délibéré : ajouter un chemin ici est le moment où l'on décide qui le
 * trace.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../..', '..', '..');

/**
 * Les chemins qui créent un produit dans une base réelle.
 *
 * `transaction: false` marque ceux dont la création n'a pas d'identité externe
 * à poser dans le même geste — l'atomicité produit+identité ne les concerne
 * pas, la trace si.
 */
const CHEMINS_DE_CREATION = [
  { f: 'apps/web/scripts/import-from-smartof.ts', transaction: true },
  { f: 'apps/web/scripts/sync-smartof-1208.ts', transaction: true },
  { f: 'packages/db/scripts/import-smartof.ts', transaction: true },
  { f: 'packages/db/scripts/import-diag-catalog.ts', transaction: false },
  { f: 'packages/db/scripts/import-drive-catalog.ts', transaction: false },
  { f: 'apps/web/src/server/actions/crud-edits.ts', transaction: false },
] as const;

/**
 * Un `AuditLog` dont l'entité est le PRODUIT — pas n'importe quel AuditLog du
 * fichier. Les imports journalisent déjà personnes et organisations ; s'en
 * contenter laisserait le produit sans trace tout en affichant du vert.
 */
const AUDIT_PRODUIT = /auditLog\.create\s*\(\s*\{[\s\S]{0,600}?entity:\s*'TrainingProduct'/;

/** Le repli d'origine, sous ses deux orthographes (`slice` et `substring`). */
const REPLI_HEXA = /`PROD-\$\{[^`}]*\b(?:slice|substring)\s*\(\s*0\s*,\s*8\s*\)/;

function lire(f: string): string {
  return fs.readFileSync(path.join(RACINE, f), 'utf8');
}

/** Retire les lignes de commentaire : un motif CITÉ en prose n'est pas du code. */
function sansCommentaires(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('Création de produit — trace et atomicité', () => {
  it('AUCUN fichier du dépôt ne fabrique un code par repli hexadécimal', () => {
    const fichiers = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
      cwd: RACINE,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 32,
    })
      .trim()
      .split('\n')
      .filter(Boolean);

    const coupables = fichiers.filter((f) => REPLI_HEXA.test(sansCommentaires(lire(f))));

    expect(
      coupables,
      `Repli hexadécimal détecté. Un code fabriqué sort de resolveProductCode() ` +
        `(packages/db/scripts/lib/product-code.ts), pas d'un fragment d'UID : ` +
        `PROD-7a78c8b2 ne se dicte pas au téléphone et n'avance pas la série.`,
    ).toEqual([]);
  });

  it.each(CHEMINS_DE_CREATION.map((c) => c.f))(
    "%s pose un AuditLog PORTANT SUR LE PRODUIT",
    (f) => {
      const src = sansCommentaires(lire(f));

      // ⚠ Le discriminant, appris en écrivant ce test : chercher un
      // `auditLog.create(` quelconque rendait TROIS de ces fichiers VERTS
      // avant tout correctif — ils journalisent déjà leurs personnes et leurs
      // organisations. Le test mesurait la présence d'un import, pas la trace
      // du produit. C'est exactement la décoration que §4 ter décrit.
      //
      // On exige donc l'entité : un `AuditLog` dont `entity` vaut
      // `'TrainingProduct'`.
      expect(
        AUDIT_PRODUIT.test(src),
        `${f} crée un produit sans AuditLog portant sur ce produit. ` +
          `C'est ce qui rend PROD-cdd22466 inexplicable trois semaines après ` +
          `son écriture en production.`,
      ).toBe(true);
    },
  );

  it.each(CHEMINS_DE_CREATION.filter((c) => c.transaction).map((c) => c.f))(
    '%s crée le produit DANS une transaction, pas sur le client nu',
    (f) => {
      const src = sansCommentaires(lire(f));

      // Le discriminant : `tx.trainingProduct.create` et non
      // `prisma.trainingProduct.create`. Vérifier la seule présence de
      // `$transaction` dans le fichier ne prouverait rien — le fichier peut en
      // contenir une ailleurs et créer le produit à côté.
      expect(
        /\btx\.trainingProduct\.(create|upsert)\s*\(/.test(src),
        `${f} doit créer le produit via le client de transaction ` +
          `(tx.trainingProduct.create), pour que produit + identité externe + ` +
          `AuditLog soient posés ensemble ou pas du tout.`,
      ).toBe(true);

      expect(
        /\bprisma\.trainingProduct\.(create|upsert)\s*\(/.test(src),
        `${f} crée encore un produit hors transaction (prisma.trainingProduct). ` +
          `C'est la porte par laquelle PROD-cdd22466 est passé.`,
      ).toBe(false);
    },
  );
});
