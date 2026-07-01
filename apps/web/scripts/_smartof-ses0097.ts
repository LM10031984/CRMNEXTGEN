const { listSessions } = await import('../src/lib/smartof/client');
const raw: any = await listSessions();
const sessions = (raw.sessions ?? raw.data ?? raw.items ?? []) as any[];
console.log('Total sessions SmartOF :', sessions.length);
const hit = sessions.filter(s => JSON.stringify(s).match(/097/) || (s.customId||'').includes('0097') || (s.code||'').includes('0097'));
console.log('Correspondances « 097 » :', hit.length);
for (const s of hit) {
  console.log('\n===== SESSION =====');
  console.log(JSON.stringify(s, null, 2));
}
if (!hit.length) {
  // fallback : montrer les 5 plus récentes par startDate
  const sorted = [...sessions].sort((a,b)=> String(b.startDate||b.createdAt||'').localeCompare(String(a.startDate||a.createdAt||'')));
  console.log('\nAucune 097 — 5 sessions les plus récentes :');
  for (const s of sorted.slice(0,5)) console.log(`  ${s.customId||s.code||s.id} | ${s.name||s.title} | ${s.startDate}`);
}
