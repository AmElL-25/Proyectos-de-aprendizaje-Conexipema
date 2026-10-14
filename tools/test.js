const assert=require('assert');const T=require('../terms.js');const S=require('../schedule.js');
const F=['id','term','category','level','explanation','example','question','answer'];
const ids=new Set(),names=new Set();
T.forEach(t=>{F.forEach(f=>assert(t[f]!==undefined&&String(t[f]).trim(),`${t.id} falta ${f}`));assert([1,2,3].includes(t.level));
 assert(!ids.has(t.id),'id dup '+t.id);ids.add(t.id);const n=t.term.toLowerCase();assert(!names.has(n),'término dup '+t.term);names.add(n);});
const N=T.length;
for(let c=0;c<3;c++){const o=S.cycleOrder(T,c);assert.equal(new Set(o).size,N,'ciclo con repetidos');
 let prev=0;o.forEach(i=>{assert(T[i].level>=prev);prev=T[i].level;});}
const seen=new Set();for(let d=0;d<N;d++)seen.add(S.termIndexForDay(T,d));assert.equal(seen.size,N,'repite antes de agotar');
const at=s=>S.dayIndex(Date.parse(s));
assert.equal(at('2026-10-13T07:54:59-05:00'),-1);assert.equal(at('2026-10-13T07:55:00-05:00'),0);
assert.equal(at('2026-10-14T07:54:00-05:00'),0);assert.equal(at('2026-10-14T07:55:00-05:00'),1);
assert.equal(at('2026-10-14T01:00:00Z'),0);// 8pm Lima del 13
assert.equal(S.dateKeyForDay(0),'2026-10-13');assert.equal(S.dateKeyForDay(1),'2026-10-14');
assert.equal(S.termIndexForDay(T,0),S.termIndexForDay(T,0));
const c={};T.forEach(t=>c[t.category]=(c[t.category]||0)+1);console.log('OK',N,c);
console.log('Hoy:',T[S.termIndexForDay(T,S.dayIndex(Date.now()))].term);
