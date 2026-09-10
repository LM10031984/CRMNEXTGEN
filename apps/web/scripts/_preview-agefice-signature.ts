/**
 * Rend un dossier AGEFICE de test pour inspecter la case de signature page 3.
 *   pnpm -F @qualiof/web exec tsx scripts/_preview-agefice-signature.ts [chemin.pdf]
 */
import { writeFileSync } from 'node:fs';
import { fillAgeficePdf, type AgeficeFormData } from '../src/lib/agefice-form-fill';

const SORTIE = process.argv[2] ?? '/tmp/agefice-preview.pdf';

const data = {
  pa: { name: 'PA Nice', number: '06', contactName: 'Virginie BEHIN', address: '1 rue du Test',
        postalCode: '06000', city: 'Nice', phone: '0400000000', email: 'pa@test.fr' },
  entreprise: { raisonSociale: 'EXPERTA (TEST QualiOF)', nomCommercial: null, naf: '6820A',
                siret: '81234567800042', activite: 'Immobilier', formeJuridique: 'EI',
                address: "5 place de l'Ile de Beauté", postalCode: '06300', city: 'Nice' },
  stagiaire: { civilite: 'MME', nom: 'AUGUSTIN', prenom: 'Sophie', nomNaissance: null,
               dateNaissance: new Date('1985-04-12T00:00:00Z'), securiteSociale: null,
               phone: '0600000000', email: 'sophie@experta.fr', diplome: 'BAC', experience: '4_10_ANS' },
  of: { name: 'START ACADEMY', rnq: 'RNQ-0001', siret: '95131909400029',
        addressStreet: '12 avenue des Camélias', addressCp: '06800', addressVille: 'Cagnes-sur-Mer',
        resp: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'formation@start-academy.fr' },
        contact: { civilite: 'MR', nom: 'MARX', prenom: 'Laurent', titre: 'PDG', phone: '0631056390', email: 'formation@start-academy.fr' } },
  formationType: 'ACTION', obligatoire: false, reconversion: false,
  formation: { intitule: "Intégrer l'IA dans son entreprise", thematique: 'IA', niveau: 'INITIATION',
               certif: 'SANS_QUALIFICATION', dateDebut: new Date('2026-10-07T00:00:00Z'),
               dateFin: new Date('2026-12-16T00:00:00Z'), dureePresentielIndividuel: 0,
               dureePresentielCollectif: 88, dureeFoadSynchrone: 0, dureeFoadAsynchrone: 0,
               formateur: 'Laurent MARX', lieuPostalCode: '06300', lieuVille: 'Nice', prixHT: 2500,
               enEntreprise: false, lieuAdresseComplete: 'EXPERTA, Nice', deroulementPedago: 'Présentiel' },
  evaluations: ['QUIZ'], evaluationAutreDetail: null, attestation: 'ATTESTATION_STAGE',
  mandat: false, signature: { lieu: 'Cagnes-sur-Mer', date: new Date() },
  signatureTags: true,
} as unknown as AgeficeFormData;

const pdf = await fillAgeficePdf(data);
writeFileSync(SORTIE, pdf);
console.log(`écrit : ${SORTIE} (${Math.round(pdf.length / 1024)} Ko)`);
