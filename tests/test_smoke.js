const E=require('../src/engine.js');
const cfg=E.defaults();
let t=Date.now();
const r=E.runBatch(cfg,20000,1);
console.log('ms',Date.now()-t);
console.log(JSON.stringify({pWin:r.pWin,cWin:r.cWin,draw:r.draw,avgRounds:r.avgRounds,avgHpP:r.avgHpP,avgHpC:r.avgHpC,paraPct:r.paraPct,vowPct:r.vowPct,se:r.se}));
console.log('dmgP',r.dmgP);console.log('dmgC',r.dmgC);
for(const k of Object.keys(E.SWEEPS)){
  const rows=E.sweepRun(cfg,k,4000,1);
  console.log(E.SWEEPS[k].label);
  rows.forEach(x=>console.log('  ',x.name.padEnd(32),x.pWin.toFixed(1),x.cWin.toFixed(1),x.draw.toFixed(1),x.avgRounds.toFixed(2)));
}
console.log(E.analytic(cfg).map(x=>x.name+' '+x.p.toFixed(0)+' '+x.rnd.toFixed(1)+' '+x.rounds.toFixed(1)).join('\n'));
const s=E.singleLog(cfg,7);console.log(s.lines.join('\n'));
