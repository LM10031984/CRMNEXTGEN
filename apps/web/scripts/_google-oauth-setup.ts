/**
 * Autorisation OAuth Google (une seule fois) → récupère un refresh token
 * et l'enregistre dans secrets/google-token.json (gitignored).
 * Le worker QualiOF réutilisera ce refresh token (app interne → ne périme pas).
 *
 * Usage : tsx scripts/_google-oauth-setup.ts  (puis ouvrir l'URL affichée et autoriser)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const SECRETS = path.resolve(process.cwd(), '../../secrets');
const client = JSON.parse(fs.readFileSync(path.join(SECRETS, 'oauth-client.json'), 'utf8'));
const { client_id, client_secret } = client.installed ?? client.web ?? client;

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(client_id, client_secret, REDIRECT);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/calendar'],
});

console.log('\n=== AUTORISATION GOOGLE CALENDAR ===');
console.log('Ouvre cette URL dans ton navigateur (connecté au compte qui gère « Rappel Formations ») :\n');
console.log(authUrl + '\n');
console.log('En attente du retour Google sur ' + REDIRECT + ' …\n');

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/?')) { res.writeHead(404); res.end(); return; }
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('Pas de code'); return; }
  try {
    const { tokens } = await oauth2.getToken(code);
    fs.writeFileSync(path.join(SECRETS, 'google-token.json'), JSON.stringify(tokens, null, 2), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>✅ Autorisation réussie</h2><p>Tu peux fermer cet onglet et revenir à QualiOF.</p>');
    console.log('✓ Tokens reçus. refresh_token présent :', !!tokens.refresh_token);
    console.log('✓ Enregistré dans secrets/google-token.json');
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  } catch (e) {
    res.writeHead(500); res.end('Erreur: ' + (e as Error).message);
    console.error('✗ Échange du code échoué :', (e as Error).message);
    server.close(); process.exit(1);
  }
});
server.listen(PORT);
