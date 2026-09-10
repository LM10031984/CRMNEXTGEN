import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Garde de région (demande de Laurent, 04/09/2026, à la bascule sur l'instance UE).
 *
 * Le choix de région DocuSeal porte l'enjeu RGPD : les conventions et dossiers
 * AGEFICE véhiculent identité, adresse, n° de sécurité sociale et IBAN. Un host
 * `docuseal.com` réintroduit quelque part dans le code ferait repartir une
 * partie du trafic hors de l'instance UE — sans que rien ne le signale.
 *
 * Règle : **un seul endroit du dépôt décide de la région**, la variable
 * `DOCUSEAL_BASE_URL` (dont le défaut vit dans `packages/shared/src/env.ts`).
 * Tout le reste s'en déduit, y compris le host des liens de signature envoyés
 * aux signataires (`signHost` dans l'adaptateur).
 *
 * Ce test lit les sources : les mentions en commentaire ou en message d'aide
 * sont tolérées, une valeur en position de code ne l'est pas.
 */

const RACINE = path.resolve(__dirname, '../../..'); // apps/web/src
const HOST = /docuseal\.(com|eu)/;

function fichiersSources(dossier: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === 'node_modules' || entree === '__tests__') continue;
    const complet = path.join(dossier, entree);
    if (statSync(complet).isDirectory()) out.push(...fichiersSources(complet));
    else if (/\.tsx?$/.test(entree)) out.push(complet);
  }
  return out;
}

/** Retire commentaires de bloc, commentaires de ligne et littéraux de message. */
function codeSeul(source: string): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l));
}

describe('région DocuSeal — un seul endroit décide', () => {
  const fautifs: string[] = [];

  for (const fichier of fichiersSources(RACINE)) {
    for (const [i, ligne] of codeSeul(readFileSync(fichier, 'utf-8')).entries()) {
      if (!HOST.test(ligne)) continue;
      // Toléré : une URL citée dans un message destiné à un humain (le motif
      // affiché à l'admin quand la configuration est incomplète).
      if (/reason|message|throw new Error|console\.(warn|error|log)/.test(ligne)) continue;
      fautifs.push(`${path.relative(RACINE, fichier)}:${i + 1} → ${ligne.trim()}`);
    }
  }

  it('aucun host DocuSeal codé en dur dans apps/web/src', () => {
    expect(fautifs).toEqual([]);
  });

  it('le défaut de région est bien déclaré dans le schéma d’env partagé', () => {
    const env = readFileSync(
      path.resolve(RACINE, '../../../packages/shared/src/env.ts'),
      'utf-8',
    );
    expect(env).toMatch(/DOCUSEAL_BASE_URL:.*default\('https:\/\/api\.docuseal\.eu'\)/);
  });
});
