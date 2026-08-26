/*
 * compare-charset.js — validate our unminted animation charset against the real contract.
 *
 * The Terraforms renderer exists in TWO on-chain versions with different charset code:
 *   Format A (v2): has BIOMECODE, classIds=[a..i], originalChars=BIOMECODE,
 *                  mainSet=BIOMECODE.reverse(), plus bladeRailSequencer / Y-seed / xtraPattern.
 *   Format B (v1): minified, classIds=[i..a], originalChars read from the DOM grid,
 *                  mainSet=originalChars.reverse(), simple seed branches, no blade/Y/xtra.
 *
 * Our frontend TerraformAnimation.buildMainSet() is a port of Format B (v1). Unminted parcels
 * are all mode-0 terrain and render via our replica (no on-chain HTML), so this checks that
 * our output reproduces the version a given token actually uses, and shows the v1-vs-v2 gap.
 *
 * Usage (from backend/):
 *   node --env-file=.env scripts/compare-charset.js [tokenId ...]
 */
const { ethers } = require('ethers');

const TERRAFORMS_ADDRESS = '0x4E1f41613c9084FdB9E34E11fAE9412427480e56';
const ABI = ['function tokenHTML(uint256) view returns (string)'];
const DEFAULT_IDS = [1, 42, 100, 1000, 5000, 7777, 9911];

/* ───────── OUR production logic (verbatim from frontend TerraformAnimation.js) ───────── */
const UNI = [9600,9610,9620,3900,9812,9120,9590,143345,48,143672,143682,143692,
             143702,820,8210,8680,9573,142080,142085,142990,143010,143030,9580,
             9540,1470,143762,143790,143810];
function ourMakeSet(start) { const c = []; for (let i = start; i < start + 10; i++) c.push(String.fromCharCode(i)); return c; }
const CLASS_IDS = ['i','h','g','f','e','d','c','b','a'];
const FALLBACK_CHAR = '▆';
function buildMainSet(seed, chars) {
  const SEED = parseInt(seed);
  const originalChars = CLASS_IDS.map(c => chars?.[c] || FALLBACK_CHAR);
  const charSet = [...originalChars];
  if (SEED > 9970) { for (const u of UNI) charSet.push(...ourMakeSet(u)); }
  else if (SEED > 5000) { charSet.push(...ourMakeSet(UNI[SEED % 3])); }
  const mainSet = [...originalChars].reverse();
  return SEED > 9950 ? charSet : mainSet;
}

/* ───────── shared helpers ───────── */
function makeSet(start) { const c = []; for (let i = start; i < start + 10; i++) c.push(String.fromCharCode(i)); return c; }
function posMod(v, d) { return d <= 0 ? 0 : ((v % d) + d) % d; }
function uniq(a) { return Array.from(new Set(a)); }
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (e, b) => {
    const n = b.toLowerCase();
    if (n === 'lt') return '<'; if (n === 'gt') return '>'; if (n === 'amp') return '&';
    if (n === 'quot') return '"'; if (n === 'apos') return "'";
    if (n.startsWith('#x')) return String.fromCodePoint(parseInt(n.slice(2), 16));
    if (n.startsWith('#')) return String.fromCodePoint(parseInt(n.slice(1), 10));
    return e;
  });
}
// boundary-aware extractors (tolerate verbose `let X=` and minified `,X=`)
function numConst(s, name) { const m = s.match(new RegExp(`(?:^|[^A-Za-z0-9_])${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`)); return m ? Number(m[1]) : undefined; }
function strConst(s, name) { const m = s.match(new RegExp(`(?:^|[^A-Za-z0-9_])${name}\\s*=\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`)); return m ? m[2] : undefined; }
function boolConst(s, name) { const m = s.match(new RegExp(`(?:^|[^A-Za-z0-9_])${name}\\s*=\\s*(!0|!1|true|false)`)); return m ? (m[1] === '!0' || m[1] === 'true') : undefined; }
function arrayLiteral(s, name) {
  const at = s.search(new RegExp(`(?:^|[^A-Za-z0-9_])${name}\\s*=\\s*\\[`));
  if (at === -1) return undefined;
  const start = s.indexOf('[', at);
  let depth = 0, quote, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === quote) quote = undefined; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '[') depth++;
    if (ch === ']') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return undefined;
}
function strArray(s, name) {
  const lit = arrayLiteral(s, name); if (!lit) return [];
  const out = []; let quote, buf = '', esc = false;
  for (let i = 0; i < lit.length; i++) {
    const ch = lit[i];
    if (!quote) { if (ch === "'" || ch === '"' || ch === '`') { quote = ch; buf = ''; esc = false; } continue; }
    if (esc) { buf += (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch); esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === quote) { out.push(buf); quote = undefined; buf = ''; continue; }
    buf += ch;
  }
  return out;
}
function numArray(s, name) { const lit = arrayLiteral(s, name); return lit ? Array.from(lit.matchAll(/-?\d+/g)).map(m => Number(m[0])) : []; }

// first textContent for each class letter, from the initial <p> grid
function gridCharsByClass(script) {
  const byClass = {};
  for (const m of script.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const cm = (m[1] || '').match(/class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const cls = cm ? (cm[1] ?? cm[2] ?? cm[3]) : '';
    const txt = decodeEntities((m[2] || '').replace(/<[^>]*>/g, ''));
    if (cls && byClass[cls] === undefined) byClass[cls] = txt;
  }
  return byClass; // { a:'🖳', b:'⛓', ... }
}

/* ───────── per-format REAL mainSet (faithful to on-chain runtime) ───────── */
const COUNT_PATTERN_SETS = [
  [16,16,16,2,2,2,2,4,4,4,4],[16,32,8,16,2,2,2,2,4,4,4,4],[2,4,2,4,2,24,8,8,8,8,4,4,2],
  [2,2,2,2,2,8,8,8,8,4,4,4],[12,4,2,8,8,4,4,4,8,4,4,4],[24,4,4,2],[8,4,4,2],
  [2,8,2,2,8,2,2,2,8,4,4,4],[5,5,5,5],[7,7,7,7],
];
function realMainSetA(script) { // Format A / v2
  const SEED = numConst(script, 'SEED') ?? 0;
  const BIOME = numConst(script, 'BIOME') ?? 0;
  const MODE = numConst(script, 'MODE') ?? 0;
  const ANTENNA = numConst(script, 'ANTENNA') ?? 0;
  const bCore = strArray(script, 'BIOMECODE');
  const uni = numArray(script, 'uni');
  const blade = strArray(script, 'bladeRailSequencer');
  const isOrigin = MODE === 3 || MODE === 4;
  const isDaydream = MODE === 1 || MODE === 3, isTerraformed = MODE === 2 || MODE === 4;
  const isXSeed = isOrigin ? SEED > 9000 : SEED > 9970;
  const isYSeed = SEED > 9950 && SEED <= 9970;
  let core = [...bCore];
  if (BIOME === 0 && MODE > 0 && ANTENNA === 1) core.push(' ', ' ', ' ', ' ', ' ');
  if (ANTENNA === 0 && MODE > 0) core = uniq(core);
  const seedSet = [];
  if (isOrigin) { if (isXSeed) { for (const v of uni) seedSet.push(makeSet(v)); } else { seedSet.push(makeSet(uni[posMod(Math.floor(SEED), uni.length)])); } }
  else if (isXSeed) { for (const v of uni) seedSet.push(makeSet(v)); }
  else if (isYSeed) { seedSet.push(makeSet(uni[posMod(Math.floor(SEED), 3)]).reverse()); }
  else { const bi = posMod(BIOME + SEED, blade.length); seedSet.push(Array.from(blade[bi] ?? '').map(c => c === '▰' ? '░' : c)); }
  if (isOrigin && !isXSeed && (isDaydream || isTerraformed)) {
    const cp = COUNT_PATTERN_SETS[posMod(SEED, COUNT_PATTERN_SETS.length)] ?? [];
    const xtra = []; let i = 0;
    for (const count of cp) { for (let j = 0; j < count; j++) { const set = seedSet[posMod(SEED, seedSet.length)] ?? []; const ch = set[posMod(SEED + i, set.length)]; if (ch !== undefined) xtra.push(ch); } i++; }
    seedSet.push(xtra);
  }
  const charSet = [...core, ...seedSet.flat()];
  const mainSet = [...core].reverse();
  return { SEED, BIOME, MODE, ANTENNA, uni, mainSet: SEED > 9950 ? charSet : mainSet, baseMain: mainSet };
}
function realMainSetB(script) { // Format B / v1
  const SEED = numConst(script, 'SEED') ?? 0;
  const classIds = strArray(script, 'classIds');
  const uni = numArray(script, 'uni');
  const isOrigin = boolConst(script, 'isOrigin') ?? false;
  const byClass = gridCharsByClass(script);
  const originalChars = classIds.map(c => byClass[c]).filter(c => c !== undefined);
  const charSet = [originalChars];
  if (isOrigin) { if (SEED > 9000) { for (const v of uni) charSet.push(makeSet(v)); } else { charSet.push(makeSet(uni[posMod(Math.floor(SEED), uni.length)])); } }
  else if (SEED > 9970) { for (const v of uni) charSet.push(makeSet(v)); }
  else if (SEED > 5000) { charSet.push(makeSet(uni[posMod(Math.floor(SEED), 3)])); }
  const flat = charSet.flat();
  const mainSet = [...originalChars].reverse();
  return { SEED, isOrigin, classIds, uni, mainSet: SEED > 9950 ? flat : mainSet, baseMain: mainSet };
}

/* ───────── compare ───────── */
const SP = '␣';
const show = a => a.map(c => (c === ' ' ? SP : c)).join('');
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const revEq = (a, b) => eq(a, [...b].reverse());

function detectFormat(script) { return /(?:^|[^A-Za-z0-9_])BIOMECODE\s*=/.test(script) ? 'A' : 'B'; }

function compareToken(id, html) {
  const script = decodeEntities(html);
  const fmt = detectFormat(script);
  const byClass = gridCharsByClass(script);
  const SEED = numConst(script, 'SEED') ?? 0;
  const MODE = numConst(script, 'MODE');
  const ours = buildMainSet(SEED, byClass); // our code keys chars by class letter a..i
  const real = fmt === 'A' ? realMainSetA(script) : realMainSetB(script);
  // Unminted parcels are all MODE-0 terrain with a full 9-class grid. Daydream/origin tokens
  // collapse their INITIAL grid to height 0 (only class 'a'), so a DOM-based comparison is N/A.
  const classes = Object.keys(byClass).sort().join('');
  const comparable = classes.includes('abcdefghi') || classes.length >= 9;

  console.log(`\n══════════ TOKEN #${id} — Format ${fmt} (${fmt === 'A' ? 'v2' : 'v1'}), MODE=${MODE ?? '?'} ══════════`);
  console.log(`SEED=${SEED}  grid classes: ${classes}${comparable ? '' : '  ← collapsed daydream grid, terrain comparison N/A'}`);
  if (!comparable) return { id, fmt, comparable: false, match: null };
  console.log(`  real mainSet: ${show(real.mainSet).slice(0, 100)}${real.mainSet.length > 100 ? '…' : ''}`);
  console.log(`  our  mainSet: ${show(ours).slice(0, 100)}${ours.length > 100 ? '…' : ''}`);
  const match = eq(ours, real.mainSet);
  console.log(`  OURS == REAL: ${match}${!match && revEq(ours, real.mainSet) ? '  ← reverse-equal (v1↔v2 palette flip)' : ''}`);
  return { id, fmt, comparable: true, match };
}

(async () => {
  const args = process.argv.slice(2);
  const ids = args.filter(a => /^\d+$/.test(a)).map(Number);
  const useIds = ids.length ? ids : DEFAULT_IDS;
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set — run with --env-file=.env');
  const contract = new ethers.Contract(TERRAFORMS_ADDRESS, ABI, new ethers.JsonRpcProvider(process.env.RPC_URL));

  const results = [];
  for (const id of useIds) {
    let html;
    try { html = await contract.tokenHTML(id); } catch (e) { console.log(`\n#${id} fetch error: ${e.message}`); continue; }
    results.push(compareToken(id, html));
  }
  console.log(`\n══════════ SUMMARY (terrain / full-grid tokens only) ══════════`);
  const cmp = results.filter(r => r.comparable);
  const bT = cmp.filter(r => r.fmt === 'B'), aT = cmp.filter(r => r.fmt === 'A');
  for (const r of cmp) console.log(`  #${r.id}: Format ${r.fmt} (${r.fmt === 'A' ? 'v2' : 'v1'}) — ours ${r.match ? 'MATCHES real' : 'DIFFERS'}`);
  console.log(`\n  Format B (v1) terrain — ours matches: ${bT.filter(r => r.match).length}/${bT.length}  (we are a v1 port → should be 100%)`);
  console.log(`  Format A (v2) terrain — ours matches: ${aT.filter(r => r.match).length}/${aT.length}  (reversed palette + blade/Y/xtra → expected to differ)`);
  console.log(`  Skipped (collapsed daydream grids): ${results.filter(r => !r.comparable).map(r => '#' + r.id).join(', ') || 'none'}`);
})();
