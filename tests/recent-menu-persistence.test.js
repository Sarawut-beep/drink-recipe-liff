const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.resolve(__dirname, '..', 'index.html'),
  'utf8'
);

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert(start >= 0, `missing ${name}`);
  const declarationStart =
    source.slice(start - 6, start) === 'async '
      ? start - 6
      : start;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(declarationStart, index + 1);
    }
  }

  throw new Error(`unterminated ${name}`);
}

assert(!html.includes('drink_recipe_recent_menus_backup_v1'));
assert(!html.includes('document.cookie'));
assert(/action:\s*'getRecentMenus'/.test(html));
assert(/action:\s*'clearRecentMenus'/.test(html));
assert(html.includes('scheduleRecentMenusRestore();'));

const restoreSource = extractFunction(
  html,
  'restoreRecentMenusFromServer'
);

const harness = new Function(
  'assert',
  `${restoreSource}
   let recentMenus = [];
   let recentMenusBackgroundTimer = null;
   let recentMenusRequestCompleted = false;
   let recentMenusRequestRunning = false;
   const currentIdToken = 'verified-token';
   const BACKGROUND_RECHECK_DELAY_MS = 3000;
   let saved = 0;
   let rendered = 0;
   function canStartBackgroundRequest(){ return true; }
   function scheduleRecentMenusRestore(){ throw new Error('unexpected reschedule'); }
   function normalizeRecentMenus(menus){ return [...new Set(menus)].slice(0, 5); }
   function saveRecentMenus(){ saved += 1; }
   function renderRecentMenus(){ rendered += 1; }
   async function callApi(payload){
     assert.strictEqual(payload.action, 'getRecentMenus');
     assert.strictEqual(payload.idToken, currentIdToken);
     recentMenus = ['เมนูที่เพิ่งเปิด'];
     return {success: true, menus: ['เมนูจากเซิร์ฟเวอร์', 'เมนูที่เพิ่งเปิด']};
   }
   return {
     run: restoreRecentMenusFromServer,
     state: () => ({recentMenus, saved, rendered, recentMenusRequestCompleted})
   };`
)(assert);

(async () => {
  await harness.run();
  assert.deepStrictEqual(
    harness.state(),
    {
      recentMenus: ['เมนูที่เพิ่งเปิด', 'เมนูจากเซิร์ฟเวอร์'],
      saved: 1,
      rendered: 1,
      recentMenusRequestCompleted: true
    }
  );
  console.log('recent-menu persistence tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
