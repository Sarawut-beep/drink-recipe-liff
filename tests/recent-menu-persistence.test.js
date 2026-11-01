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
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`unterminated ${name}`);
}

const readCookieSource = extractFunction(html, 'readRecentMenusCookie');
const saveCookieSource = extractFunction(html, 'saveRecentMenusCookie');
const clearCookieSource = extractFunction(html, 'clearRecentMenusCookie');
const document = { cookie: '' };
const consoleStub = { warn() {} };
const recentMenus = ['ลาเต้ร้อน (8oz.)', 'ชาไทยเย็น'];

const helpers = new Function(
  'document',
  'console',
  'recentMenus',
  `const RECENT_MENUS_COOKIE_KEY='drink_recipe_recent_menus_backup_v1';
   const RECENT_MENUS_COOKIE_MAX_AGE=365*24*60*60;
   ${readCookieSource}
   ${saveCookieSource}
   ${clearCookieSource}
   return {readRecentMenusCookie, saveRecentMenusCookie, clearRecentMenusCookie};`
)(document, consoleStub, recentMenus);

helpers.saveRecentMenusCookie();
assert.match(document.cookie, /Max-Age=31536000/);
assert.match(document.cookie, /Path=\/drink-recipe-liff\//);

document.cookie = document.cookie.split(';')[0];
assert.deepStrictEqual(helpers.readRecentMenusCookie(), recentMenus);

helpers.clearRecentMenusCookie();
assert.match(document.cookie, /Max-Age=0/);

console.log('recent-menu persistence tests: PASS');
