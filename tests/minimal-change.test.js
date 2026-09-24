const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const appsRoot = path.resolve(repoRoot, '..', 'apps-script');
const liffApi = fs.readFileSync(path.join(appsRoot, 'liff api.gs'), 'utf8');
const logGs = fs.readFileSync(path.join(appsRoot, 'Log.gs'), 'utf8');

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

function extractFunctionAt(source, start) {
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error('unterminated anonymous function');
}

function inlineAppScript() {
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((text) => text.trim());
  return blocks[blocks.length - 1];
}

const appScript = inlineAppScript();

function createSessionFactory(windowObject, mathObject = Math, now = 1700000000000) {
  const source = extractFunction(appScript, 'createSessionId');
  return new Function('window', 'Math', 'Date', 'console', `${source}; return createSessionId;`)(
    windowObject,
    mathObject,
    { now: () => now },
    { warn() {} }
  );
}

function inputHarness(resultCount) {
  const listenerStart = appScript.indexOf("'input',");
  assert(listenerStart >= 0, 'missing input listener');
  const functionStart = appScript.indexOf('function()', listenerStart);
  const listenerSource = extractFunctionAt(appScript, functionStart);
  const jobs = new Map();
  let nextTimer = 1;
  const logs = [];
  let now = 100;
  const factory = new Function(
    'setTimeout', 'clearTimeout', 'performance', 'clearSuggestions',
    'markForegroundActivity', 'runLocalSearch', 'sendRecipeLog', 'document',
    `let searchTimer=null, searchStatusTimer=null, searchGeneration=0;
     let searchStartTime=null, pageLoadTime=250;
     const sessionId='input-session';
     const handler=${listenerSource};
     return {handler, getGeneration:()=>searchGeneration};`
  );
  const api = factory(
    (callback, delay) => {
      const id = nextTimer++;
      jobs.set(id, { callback, delay, active: true });
      return id;
    },
    (id) => { if (jobs.has(id)) jobs.get(id).active = false; },
    { now: () => now },
    () => {},
    () => {},
    () => Array.from({ length: resultCount }, (_, index) => ({ index })),
    (payload) => { logs.push(payload); return Promise.resolve(true); },
    { getElementById: () => input }
  );
  const input = { value: '' };
  return {
    type(value) { input.value = value; now += 50; api.handler.call(input); },
    run(delay) {
      for (const job of jobs.values()) {
        if (job.active && job.delay === delay) {
          job.active = false;
          now += delay;
          job.callback();
        }
      }
    },
    logs,
    jobs
  };
}

function openRecipeHarness(callApiImpl, sessionId = 'session-test') {
  const source = extractFunction(appScript, 'openRecipe').replace(/^function /, 'async function ');
  const calls = { api: 0, logs: [], sequence: [] };
  const searchMessage = { innerHTML: '' };
  const factory = new Function(
    'callApiImpl', 'calls', 'searchMessage', 'sessionId',
    `${source};
     let now=1000;
     let isLoadingRecipe=false, searchStatusTimer=null, searchGeneration=0;
     let searchStartTime=900, searchTaskTime=0, totalRetrievalTime=0, pageLoadTime=300;
     const currentIdToken='token';
     const DEBUG_MODE=false;
     const pageDiagnostics={recipeOpen:{}};
     function clearTimeout(){}
     function markForegroundActivity(){}
     function updateDebugPanel(){}
     function saveBackendDiagnostics(){}
     function showRegisterScreen(){}
     function clearSuggestions(){}
     function resetSearchTiming(){searchStartTime=null; searchTaskTime=0; totalRetrievalTime=0;}
     function displayRecipe(){calls.sequence.push('display');}
     async function waitForNextPaint(){calls.sequence.push('paint');}
     async function callApi(payload){calls.api+=1; return callApiImpl(payload);}
     async function sendRecipeLog(payload){calls.sequence.push('log'); calls.logs.push(payload); return true;}
     const performance={now:()=>{now+=10; return now;}};
     const console={warn(){},log(){},error(){}};
     const document={getElementById:()=>searchMessage};
     return {openRecipe, isLoading:()=>isLoadingRecipe, apiCount:()=>calls.api, logs:calls.logs, sequence:calls.sequence};`
  );
  return factory(callApiImpl, calls, searchMessage, sessionId);
}

function logHarness(initialHeaders) {
  const functions = [
    extractFunction(logGs, 'writeLog'),
    extractFunction(logGs, 'ensureLogAnalyticsHeaders'),
    extractFunction(logGs, 'getLogTimeValue')
  ].join('\n');
  const headers = initialHeaders.slice();
  const rows = [];
  const sheet = {
    getRange(row, column) {
      return {
        getDisplayValues: () => [headers.slice(0, 2)],
        setValue(value) { headers[column - 12] = value; }
      };
    },
    appendRow(row) { rows.push(row); }
  };
  const factory = new Function(
    'sheet', 'rows', 'headers',
    `${functions}
     const LOG_SHEET_NAME='Log';
     const Session={getScriptTimeZone:()=> 'Asia/Bangkok'};
     const Utilities={formatDate:(date,tz,format)=>format==='dd/MM/yyyy'?'24/09/2026':'12:34:56'};
     const console={error(){}};
     const spreadsheet={getSheetByName:()=>sheet};
     return {writeLog, rows, headers, spreadsheet};`
  );
  return factory(sheet, rows, headers);
}

async function run() {
  assert.strictEqual(
    createSessionFactory({ crypto: { randomUUID: () => 'uuid-value' } })(),
    'uuid-value'
  );
  const fallback = createSessionFactory({ crypto: undefined }, { random: () => 0.25 })();
  assert.match(fallback, /^session-/);
  const nextPageFallback = createSessionFactory({ crypto: undefined }, { random: () => 0.75 }, 1700000001000)();
  assert.notStrictEqual(fallback, nextPageFallback);

  const noResult = inputHarness(0);
  noResult.type('zz');
  noResult.type('zzz');
  noResult.run(5000);
  assert.strictEqual(noResult.logs.length, 1, 'typing before 5s must cancel the old timer');
  assert.strictEqual(noResult.logs[0].searchStatus, 'ไม่พบสูตร');

  const hasResult = inputHarness(2);
  hasResult.type('ลาเต้');
  hasResult.run(5000);
  assert.strictEqual(hasResult.logs.length, 0, 'results must not be logged as not found');

  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const rapid = openRecipeHarness(() => pending);
  const first = rapid.openRecipe('ลาเต้');
  const second = rapid.openRecipe('ลาเต้');
  assert.strictEqual(rapid.isLoading(), true);
  assert.strictEqual(rapid.openRecipe && true, true);
  release({ success: true, recipe: { menuName: 'ลาเต้', steps: [] }, responseTime: 42 });
  await Promise.all([first, second]);
  assert.strictEqual(rapid.isLoading(), false);
  assert.strictEqual(rapid.apiCount(), 1, 'rapid double click must create one getRecipe request');
  assert.strictEqual(rapid.logs.length, 1, 'one recipe opening must create one log request');

  const multi = openRecipeHarness(async (payload) => ({
    success: true,
    recipe: { menuName: payload.menuName, steps: [] },
    responseTime: 50
  }), 'same-session');
  await multi.openRecipe('ลาเต้');
  await multi.openRecipe('มอคค่า');
  assert.strictEqual(multi.logs.length, 2);
  assert.deepStrictEqual(multi.logs.map((item) => item.sessionId), ['same-session', 'same-session']);
  assert.deepStrictEqual(multi.logs.map((item) => item.searchStatus), ['สำเร็จ', 'สำเร็จ']);
  assert.deepStrictEqual(multi.sequence.slice(0, 3), ['display', 'paint', 'log']);

  const failed = openRecipeHarness(async () => { throw new Error('slow/error'); });
  await failed.openRecipe('ลาเต้');
  assert.strictEqual(failed.isLoading(), false);
  assert.strictEqual(failed.logs.length, 1, 'failed recipe opening must create one outcome log');
  assert.strictEqual(failed.logs[0].menuName, 'ลาเต้');
  assert.strictEqual(failed.logs[0].intent, 'เปิดสูตร');
  assert.strictEqual(failed.logs[0].searchStatus, 'ยกเลิก/ไม่มีปฏิสัมพันธ์');
  assert.strictEqual(failed.logs[0].sessionId, 'session-test');
  assert.strictEqual(
    failed.logs[0].totalRetrievalTime,
    failed.logs[0].pageLoadTime + failed.logs[0].searchTaskTime
  );

  const oldCaller = logHarness(['', '']);
  const ok = oldCaller.writeLog(oldCaller.spreadsheet, 'E1', 'U1', 'Name', 'Menu', 'เปิดสูตร', 10, 20, 30, 50);
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(oldCaller.rows[0].slice(2, 11), ['E1', 'U1', 'Name', 'Menu', 'เปิดสูตร', 10, 20, 30, 50]);
  assert.deepStrictEqual(oldCaller.rows[0].slice(11), ['', '']);
  assert.deepStrictEqual(oldCaller.headers, ['Search Status', 'Session ID']);

  const existingHeaders = logHarness(['Existing L', 'Existing M']);
  existingHeaders.writeLog(existingHeaders.spreadsheet, 'E1', 'U1', 'Name', 'Menu', 'เปิดสูตร', 10, 20, 30, 50, 'สำเร็จ', 'S1');
  assert.deepStrictEqual(existingHeaders.headers, ['Existing L', 'Existing M']);
  assert.deepStrictEqual(existingHeaders.rows[0].slice(11), ['สำเร็จ', 'S1']);

  const normalizeStatus = new Function(
    `${extractFunction(liffApi, 'normalizeSearchStatus')}; return normalizeSearchStatus;`
  )();
  assert.strictEqual(normalizeStatus('สำเร็จ'), 'สำเร็จ');
  assert.strictEqual(normalizeStatus('invalid'), '');

  assert(html.replace(/\r/g, '').includes('totalRetrievalTime =\n        pageLoadTime +\n        searchTaskTime;'));
  console.log('minimal-change tests: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
