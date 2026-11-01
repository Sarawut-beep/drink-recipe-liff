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

const source = extractFunction(html, 'shouldShowCoffeeShotWarning');
const shouldShowCoffeeShotWarning = new Function(
  `${source}; return shouldShowCoffeeShotWarning;`
)();

assert.strictEqual(
  shouldShowCoffeeShotWarning({
    steps: [{ text: 'Single Shot ปุ่ม A น้ำกาแฟ 1 oz.' }]
  }),
  true
);

assert.strictEqual(
  shouldShowCoffeeShotWarning({
    steps: [{ text: 'ส่วน TOP น้ำกาแฟ (Double Shot) 2 oz.' }]
  }),
  true
);

assert.strictEqual(
  shouldShowCoffeeShotWarning({
    steps: [{ text: 'Double Shot ปุ่มชง E กดน้ำชา 3 oz.' }]
  }),
  false
);

assert.strictEqual(
  shouldShowCoffeeShotWarning({
    steps: [{ text: 'Double Shots ใบชาเขียว ปุ่ม E น้ำชา 4 oz.' }]
  }),
  false
);

assert.strictEqual(
  shouldShowCoffeeShotWarning({
    steps: [{ text: 'นมสด 6 oz.' }]
  }),
  false
);

console.log('coffee-shot warning tests: PASS');
