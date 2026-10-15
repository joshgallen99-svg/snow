// Builds the single self-contained index.html: three.js (inlined, wrapped in an
// IIFE so its top-level names stay private) + game sources + template.
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export function threeIIFE() {
  const src = fs.readFileSync(path.join(root, 'node_modules/three/build/three.module.min.js'), 'utf8');
  const m = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!m) throw new Error('three export statement not found');
  const body = src.slice(0, m.index);
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [a, b] = s.split(/\s+as\s+/);
    return b ? `${b}:${a}` : a;
  });
  return `const THREE=(()=>{${body}\nreturn {${names.join(',')}};})();\n`;
}
export function gameSources(filter) {
  const dir = path.join(root, 'src');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js') && (!filter || filter(f))).sort()
    .map((f) => `// ---- ${f} ----\n` + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const tpl = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
  const js = threeIIFE() + '\n' + gameSources();
  // keep "</script>" sequences inside strings from closing the tag
  const safe = js.replace(/<\/script/gi, '<\\/script');
  const out = tpl.replace('/*__GAME__*/', () => safe);
  fs.writeFileSync(path.join(root, 'index.html'), out);
  console.log('wrote index.html', (out.length / 1024).toFixed(0) + ' KB');
}
