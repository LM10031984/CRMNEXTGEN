import fs from 'node:fs'; import path from 'node:path';
import { google } from 'googleapis';
const SECRETS = path.resolve(process.cwd(), '../../secrets');
const c = JSON.parse(fs.readFileSync(path.join(SECRETS,'oauth-client.json'),'utf8'));
const { client_id, client_secret } = c.installed ?? c.web ?? c;
const tok = JSON.parse(fs.readFileSync(path.join(SECRETS,'google-token.json'),'utf8'));
const auth = new google.auth.OAuth2(client_id, client_secret);
auth.setCredentials({ refresh_token: tok.refresh_token });
const cal = google.calendar({ version:'v3', auth });

const list = await cal.calendarList.list();
const cals = (list.data.items||[]).map(x=>({id:x.id, summary:x.summary, access:x.accessRole}));
console.log('Agendas accessibles :');
for (const x of cals) console.log(`  [${x.access}] ${x.summary} — ${x.id}`);
const rappel = cals.find(x=>/rappel formation/i.test(x.summary||''));
if (!rappel) { console.log('\n⚠ « Rappel Formations » introuvable via l\'API'); process.exit(0); }
console.log(`\n→ Cible : ${rappel.summary} (${rappel.id})`);

const ev = await cal.events.insert({ calendarId: rappel.id!, sendUpdates:'none', requestBody:{
  summary:'[TEST API] Connexion QualiOF OK — à supprimer',
  start:{ date:'2026-07-01' }, end:{ date:'2026-07-02' },
  description:'Test de connexion OAuth QualiOF → Google Calendar. Sera supprimé automatiquement.',
}});
console.log('✓ Événement témoin créé :', ev.data.id);
await cal.events.delete({ calendarId: rappel.id!, eventId: ev.data.id!, sendUpdates:'none' });
console.log('✓ Événement témoin supprimé (test propre).');
console.log('\n=== CONNEXION OPÉRATIONNELLE ✅ ===');
