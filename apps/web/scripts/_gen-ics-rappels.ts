import fs from 'node:fs';
const { prisma } = await import('@qualiof/db');

const CGV = 'https://drive.google.com/file/d/11mfi7rl8BQFhETty4vGat3GmoGclBuFx/view';
const RI = 'https://drive.google.com/file/d/1o44Zg9dXdbyJpQ-U5Tpfbx8lZjcm-Qyf/view';
const CHARTE = 'https://drive.google.com/file/d/1HxT_uy6UNIZBYGSl9gchT0sS9_DaidNM/view';
const C7I30 = 'https://drive.google.com/file/d/1uNEa7QemfEYKyYf5ywGIdvyshWTjhYjd/view';

const sessions = await prisma.trainingSession.findMany({
  where: { startDate: { gte: new Date('2025-03-01') } },
  select: {
    code:true, startDate:true, endDate:true,
    product: { select: { title:true, durationHours:true } },
    location: { select: { name:true, address:true } },
    participants: { select: { person: { select: { firstName:true, lastName:true } } } },
    trainers: { select: { isPrimary:true, person: { select: { firstName:true, lastName:true, email:true } } } },
  },
  orderBy: { startDate: 'asc' },
});

const esc = (s:string) => (s||'').replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
const ymd = (d:Date) => d.toISOString().slice(0,10).replace(/-/g,'');
const dtLocal = (d:Date, h:number, m:number) => {
  const y=d.getUTCFullYear(), mo=String(d.getUTCMonth()+1).padStart(2,'0'), da=String(d.getUTCDate()).padStart(2,'0');
  return `${y}${mo}${da}T${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}00`;
};
const addDays = (d:Date,n:number)=>{const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x;};
const addMonths = (d:Date,n:number)=>{const x=new Date(d); x.setUTCMonth(x.getUTCMonth()+n); return x;};
const fr = (d:Date)=>`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
const STAMP = '20260625T060000Z';

const out: string[] = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Start Academy//Rappels Formations//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];

function addrText(a:any){ if(!a) return ''; if(typeof a==='string') return a; return [a.street,a.postalCode,a.city].filter(Boolean).join(' '); }
function isSiege(loc:any){ const t=(loc?.name||'')+' '+addrText(loc?.address); return /jean maurel/i.test(t) || /\bvence\b/i.test(t); }

function vevent(uid:string, opts:{allDay?:boolean,start:string,end:string,summary:string,location:string,desc:string,attendees:{n:string,e:string}[],rrule?:string,alarmMin?:number}) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${STAMP}`];
  if (opts.allDay) { lines.push(`DTSTART;VALUE=DATE:${opts.start}`, `DTEND;VALUE=DATE:${opts.end}`); }
  else { lines.push(`DTSTART;TZID=Europe/Paris:${opts.start}`, `DTEND;TZID=Europe/Paris:${opts.end}`); }
  if (opts.rrule) lines.push(`RRULE:${opts.rrule}`);
  lines.push(`SUMMARY:${esc(opts.summary)}`);
  if (opts.location) lines.push(`LOCATION:${esc(opts.location)}`);
  lines.push(`DESCRIPTION:${esc(opts.desc)}`);
  for (const a of opts.attendees) if (a.e) lines.push(`ATTENDEE;CN=${esc(a.n)};RSVP=FALSE:mailto:${a.e}`);
  if (opts.alarmMin!=null) lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Rappel',`TRIGGER:-PT${opts.alarmMin}M`,'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

let nForm=0,nRappel=0,nFroid=0;
for (const s of sessions) {
  if (!s.startDate) continue;
  const start=s.startDate, end=s.endDate??s.startDate;
  const titre=s.product?.title??s.code;
  const duree=s.product?.durationHours? `${s.product.durationHours/8|0} journées (${s.product.durationHours}h)`:'';
  const loc=addrText(s.location?.address) || s.location?.name || '';
  const formateur=s.trainers.find(t=>t.isPrimary)?.person ?? s.trainers[0]?.person;
  const formateurNom=formateur?`${formateur.firstName} ${formateur.lastName}`:'';
  // Règle Laurent : NE PAS inviter les apprenants. Inviter UNIQUEMENT le formateur.
  const formateurAtt = formateur?.email ? [{n:formateurNom+' (formateur)', e:formateur.email}] : [];
  const partNames = s.participants.map(p=>`${p.person.firstName} ${p.person.lastName}`).join(', ');
  const siege=isSiege(s.location);
  const accessBlock = siege ? `\n🛣️ Accès transports : Cannes https://maps.app.goo.gl/s5KgRixyx2JLNut76 · Menton https://maps.app.goo.gl/FwbStuapPLrejoKJ9\n🚌 Accès route : Cannes https://maps.app.goo.gl/HQfYZeSWCJZrCk4h6 · Menton https://maps.app.goo.gl/bpU7iYeoCHqFT7Fn7\n🍽️ Restauration : le NEOSUD (6 place du Grand Jardin) · Le VIETNAM-&-Sushi-Là (14 av. Henri Isnard) · Les Petits Tabliers (7 av. Marcellin Maurel)\n🛏️ Hébergement : https://www.booking.com/city/fr/vence.fr.html\n` : '';
  const rappelDesc = `Rappel – Votre formation ${titre} commence bientôt !\n\nBonjour,\n\nNous vous rappelons que votre formation ${titre} débutera le ${fr(start)} à 8h00${end>start?` et se terminera le ${fr(end)} à 18h`:''}.\n\n📍 Lieu : ${loc}\n⏳ Durée : ${duree}\n👨‍🏫 Formateur : ${formateurNom}\n👥 Participants : ${partNames}\n${accessBlock}\nPour un bon déroulement, merci de :\n✔️ Vérifier que vous avez reçu tous les documents\n✔️ Préparer votre matériel (ordinateur, cahier, stylo)\n✔️ Anticiper votre trajet\n\nDocuments à lire :\nCharte accueil handicap : ${CHARTE}\nRèglement intérieur : ${RI}\nConditions générales de vente : ${CGV}\n\nQuestion ? formation@start-academy.fr — 07 80 91 95 31\n\nÀ très bientôt à l'Académie de Start !\nEmma de Start Academy`;

  out.push(...vevent(`${s.code}-formation@start-academy.fr`, { allDay:true, start:ymd(start), end:ymd(addDays(end,1)), summary:`Formation ${titre} — ${s.code}`, location:loc, desc:rappelDesc, attendees:formateurAtt })); nForm++;
  const j15=addDays(start,-15);
  out.push(...vevent(`${s.code}-rappel@start-academy.fr`, { start:dtLocal(j15,8,0), end:dtLocal(j15,8,15), rrule:'FREQ=DAILY;COUNT=15', summary:`⏰ Rappel — ${titre} débute le ${fr(start)} (${s.code})`, location:loc, desc:rappelDesc, attendees:formateurAtt, alarmMin:0 })); nRappel++;
  const froidDesc = `Bonjour,\n\nQuestionnaire de satisfaction « à froid » : on aimerait connaître votre ressenti sur la formation, maintenant que vous avez un peu de recul. Quelques minutes suffisent — ouvrez le lien pour compléter.\n\nParticipants : ${partNames}\nQuestionnaire : ${C7I30}\n\nMerci ! L'équipe Start Academy`;
  const froidDates:[Date,string][] = [[addMonths(end,1),'1 mois'],[addDays(addMonths(end,1),15),'1 mois 15 j'],[addMonths(end,2),'2 mois']];
  froidDates.forEach(([d,lbl],i)=>{ out.push(...vevent(`${s.code}-froid${i+1}@start-academy.fr`, { start:dtLocal(d,9,0), end:dtLocal(d,9,30), summary:`📩 Satisfaction à froid (${lbl}) — ${titre} (${s.code})`, location:loc, desc:froidDesc, attendees:[], alarmMin:0 })); nFroid++; });
}
out.push('END:VCALENDAR');

const path='/Users/laurentmarx/Documents/CRM Next gen/Rappels-Formations-depuis-mars2025.ics';
fs.writeFileSync(path, out.join('\r\n'),'utf8');
console.log(`✓ ICS écrit : ${path}`);
console.log(`Sessions: ${sessions.length} | formation: ${nForm} | rappels quotidiens: ${nRappel} | relances froid: ${nFroid}`);
console.log(`Invités : formateur uniquement (apprenants NON invités, juste listés).`);
const withTrainerEmail = sessions.filter(s=>{const f=s.trainers.find(t=>t.isPrimary)?.person??s.trainers[0]?.person; return f?.email;}).length;
console.log(`Sessions avec email formateur (donc formateur invité) : ${withTrainerEmail}/${sessions.length}`);
console.log(`Sessions au siège Vence (template accès étendu) : ${sessions.filter(s=>isSiege(s.location)).length}`);
await prisma.$disconnect();
