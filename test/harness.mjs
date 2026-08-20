import fs from 'fs';

// Load a QML .js library into plain node by stripping the QML-only
// .pragma/.import directives and evaluating it with its dependencies injected.
export function load(file, deps = {}) {
  const src = fs.readFileSync(file, 'utf8')
    .replace(/^\s*\.pragma.*$/gm, '')
    .replace(/^\s*\.import.*$/gm, '');
  const names = Object.keys(deps);
  // Collect every top-level `var`/`function` binding into an exports object.
  const decls = [
    ...src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)
  ].map(m => m[1]);
  const unique = [...new Set(decls)];
  const tail = '\nreturn {' + unique.map(n => `${n}: ${n}`).join(', ') + '};';
  const fn = new Function(...names, src + tail);
  return fn(...names.map(n => deps[n]));
}

import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the game sources relative to this file so the suite runs from
// anywhere, including a fresh clone.
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'game');
export const Sprites = load(`${DIR}/Sprites.js`);
export const Engine = load(`${DIR}/Engine.js`, { Sprites });
