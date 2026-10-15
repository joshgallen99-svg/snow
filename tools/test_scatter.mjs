import fs from 'fs';
const src = ['00_util.js','01_config.js','02_terrain_gen.js','03_world.js','04_scatter.js'].map(f=>fs.readFileSync('src/'+f,'utf8')).join('\n');
const M = new Function(src + '\nreturn {generateTerrain, World, Scatter, RUNS};')();
let t0=Date.now();
const g = M.generateTerrain(); for (const s of g.steps) s();
M.World.init(g.finish());
console.log('terrain', Date.now()-t0);
const steps=[]; M.Scatter.run(steps);
for (const [i,s] of steps.entries()){ const a=Date.now(); s(); console.log('scatter step',i,Date.now()-a,'ms'); }
const S=M.Scatter;
console.log('trees',S.trees.length,'birch',S.trees.filter(t=>t.type).length,'rocks',S.rocks.length,'lamps',S.lamps.length,'guns',S.guns.length,'tokens',S.tokens.length,'buildings',S.buildings.length,'colliders',M.World.colliders.length,'kickers',M.World.kickers.length,'grinds',M.World.grinds.length);
