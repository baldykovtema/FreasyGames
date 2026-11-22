'use strict';
// FreasyGames in English. The site and the games are written in Russian; this script shows them in English.
// Include in <head> right after session.js:
//   site pages: <script src="shared/i18n.js?v=2"></script>
//   games:      <script src="../shared/i18n.js?v=2" data-game="prygun"></script>  (3D games: data-game="3d-prygun")
//
// It loads the dictionaries shared/i18n/en/common.js (+ shared/i18n/en/<game>.js for the games listed in GAMES)
// of the form {"Russian text": "English"} and translates text on the page as it appears: DOM text,
// button/field labels, canvas text, alert/confirm. Elements with translate="no" or data-i18n-skip
// (chat messages, player names) are left as they are.
(() => {
  const lang = 'en';
  const VERSION = '3';
  // games that have their own dictionary file in shared/i18n/en/
  const GAMES = new Set(["3d-balls", "3d-bashnya", "3d-bloki", "3d-brevno", "3d-gruzchik", "3d-hokkey", "3d-hotel", "3d-kirpichiki", "3d-klev", "3d-kolby", "3d-kubomir", "3d-labirint", "3d-liana", "3d-lunka", "3d-memecat", "3d-mostik", "3d-narezka", "3d-neograd", "3d-oblaka", "3d-orbita", "3d-patrul", "3d-posadka", "3d-prygun", "3d-pvz", "3d-rcfcg", "3d-sliyanie", "3d-specotryad", "3d-tankodrom", "3d-trassa", "3d-zmey", "balls", "bashnya", "bloki", "brevno", "burgernaya", "chelovechki", "chetyre", "gruzchik", "hokkey", "kirpichiki", "klev", "kolby", "labirint", "liana", "luchnik", "lunka", "memecat", "mines", "molniya", "morskoy-boy", "mostik", "narezka", "oblaka", "orbita", "pamyat", "patrul", "pchelka", "pinbol", "posadka", "prygun", "puzyri", "ritm", "samocvety", "sliyanie", "studio", "tankodrom", "trassa", "truboprovod", "ugadaykot", "verity", "zmey"]);

  const me = document.currentScript;
  const base = me && me.src ? me.src.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : 'shared/';
  const bucket = (me && me.dataset.game) || '';

  const root = document.documentElement;
  root.lang = 'en';

  const api = { lang, t: (s) => s, add() {} };
  window.FreasyI18n = api;

  // ---------- dictionary ----------
  const CYR = /[А-Яа-яЁё]/;
  const CYR_CHARS = 'А-Яа-яЁё';
  const dict = new Map();   // Russian (whitespace normalised) → translation
  const lower = new Map();  // lower-case Russian → translation
  const rev = new Map();    // translation → Russian (so game code that reads textContent still sees Russian)
  const cache = new Map();
  let re = null;

  function add(obj) {
    for (const k in obj) {
      const v = obj[k];
      if (typeof v !== 'string' || !v) continue;
      const key = k.replace(/\s+/g, ' ').trim();
      dict.set(key, v);
      lower.set(key.toLowerCase(), v);
      if (!rev.has(v)) rev.set(v, key);
    }
    re = null; cache.clear();
    if (document.body) sweep(document.documentElement);
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function regex() {
    if (re) return re;
    const keys = [...lower.keys()].filter((k) => k.length > 1).sort((a, b) => b.length - a.length);
    re = keys.length ? new RegExp(`(?<![${CYR_CHARS}])(?:${keys.map(esc).join('|')})(?![${CYR_CHARS}])`, 'giu') : /$^/;
    return re;
  }
  const isUpper = (s) => s === s.toUpperCase() && s !== s.toLowerCase();
  function fix(src, out) { return isUpper(src) && src.length > 1 ? out.toUpperCase() : out; }

  function t(s) {
    if (typeof s !== 'string' || !CYR.test(s)) return s;
    let r = cache.get(s);
    if (r !== undefined) return r;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const core = m[2].replace(/\s+/g, ' ');
    let out = dict.get(core);
    if (out === undefined) { const l = lower.get(core.toLowerCase()); if (l !== undefined) out = fix(core, l); }
    if (out === undefined) {
      // a phrase built in code ("Очки: " + n): translate every known piece inside it
      out = core.replace(regex(), (w) => { const v = lower.get(w.toLowerCase()); return v === undefined ? w : fix(w, v); });
    }
    r = m[1] + out + m[3];
    if (cache.size > 5000) cache.clear();
    cache.set(s, r);
    if (out !== core && !rev.has(out)) rev.set(out, core);
    return r;
  }
  function back(v) {
    if (!v || !rev.size || v.length > 300) return v;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(v);
    const o = rev.get(m[2]);
    return o === undefined ? v : m[1] + o + m[3];
  }
  api.t = t; api.add = add;

  // ---------- page text ----------
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE']);
  const SKIP_SEL = '[translate="no"],[data-i18n-skip],[contenteditable=""],[contenteditable="true"]';
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const skipped = (el) => !el || SKIP_TAGS.has(el.nodeName) || (el.closest && el.closest(SKIP_SEL));

  const tcDesc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  const dataDesc = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data');
  const getData = (n) => dataDesc.get.call(n);
  const setData = (n, v) => dataDesc.set.call(n, v);

  function textNode(n) {
    const v = getData(n);
    if (!CYR.test(v) || skipped(n.parentNode)) return;
    const r = t(v);
    if (r !== v) setData(n, r);
  }
  function attrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && CYR.test(v)) { const r = t(v); if (r !== v) el.setAttribute(a, r); }
    }
    if (el.nodeName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && CYR.test(el.value)) el.value = t(el.value);
  }
  function sweep(node) {
    if (node.nodeType === 3) { textNode(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) { if (skipped(node)) { if (node.nodeName === 'TEXTAREA' && !node.closest(SKIP_SEL)) attrs(node); return; } attrs(node); }
    const w = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1 || !skipped(n)) return NodeFilter.FILTER_ACCEPT;
        if (n.nodeName === 'TEXTAREA' && !n.closest(SKIP_SEL)) attrs(n); // its text is the player's, its placeholder is ours
        return NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') textNode(m.target);
      else if (m.type === 'attributes') { const el = m.target; if (el.nodeType === 1 && (!skipped(el) || (el.nodeName === 'TEXTAREA' && !el.closest(SKIP_SEL)))) attrs(el); }
      else for (const n of m.addedNodes) sweep(n);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // game code that compares texts (btn.textContent === 'Пауза') keeps working: reading returns the Russian original
  Object.defineProperty(Node.prototype, 'textContent', {
    configurable: true, enumerable: tcDesc.enumerable,
    get() { return back(tcDesc.get.call(this)); }, set(v) { tcDesc.set.call(this, v); },
  });
  const itDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
  if (itDesc && itDesc.get) Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true, enumerable: itDesc.enumerable,
    get() { return back(itDesc.get.call(this)); }, set(v) { itDesc.set.call(this, v); },
  });

  // ---------- canvas, dialogs ----------
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const f of ['fillText', 'strokeText', 'measureText']) {
      const orig = C.prototype[f];
      if (!orig) continue;
      C.prototype[f] = function (s, ...rest) { return orig.call(this, typeof s === 'string' ? t(s) : s, ...rest); };
    }
  }
  for (const f of ['alert', 'confirm', 'prompt']) {
    const orig = window[f];
    if (orig) window[f] = function (msg, ...rest) { return orig.call(this, typeof msg === 'string' ? t(msg) : msg, ...rest); };
  }

  // ---------- load dictionaries (synchronously while the page is still being parsed) ----------
  const files = ['common'];
  if (GAMES.has(bucket)) files.push(bucket);
  for (const f of files) {
    const src = `${base}i18n/${lang}/${f}.js?v=${VERSION}`;
    if (document.readyState === 'loading') document.write(`<script src="${src}"><\/script>`);
    else { const s = document.createElement('script'); s.src = src; document.head.appendChild(s); }
  }
  document.addEventListener('DOMContentLoaded', () => sweep(document.documentElement));
})();
