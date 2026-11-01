const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'apps-script', 'RecentMenus.gs'),
  'utf8'
);

const values = new Map();
let lockReleased = 0;

const sandbox = {
  console: { warn() {} },
  Date,
  JSON,
  String,
  Array,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(key) {
          return values.has(key) ? values.get(key) : null;
        },
        setProperty(key, value) {
          values.set(key, value);
        },
        deleteProperty(key) {
          values.delete(key);
        }
      };
    }
  },
  LockService: {
    getScriptLock() {
      return {
        tryLock() { return true; },
        releaseLock() { lockReleased += 1; }
      };
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(_algorithm, value) {
      return [...crypto.createHash('sha256').update(value, 'utf8').digest()];
    },
    base64EncodeWebSafe(bytes) {
      return Buffer.from(bytes).toString('base64url');
    }
  },
  createLiffResponse(data) {
    return data;
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

assert.deepStrictEqual(
  [...sandbox.normalizeRecentMenusForServer([
    ' ลาเต้ ',
    'ลาเต้',
    'ชา  ไทย',
    'ชา ไทย',
    'A', 'B', 'C', 'D', 'E'
  ])],
  ['ลาเต้', 'ชา  ไทย', 'A', 'B', 'C']
);

['A', 'B', 'C', 'D', 'E', 'F'].forEach((menu) => {
  assert.strictEqual(
    sandbox.rememberRecentMenuForLineUser('line-user-a', menu),
    true
  );
});

assert.deepStrictEqual(
  [...sandbox.getRecentMenusForLineUser('line-user-a')],
  ['F', 'E', 'D', 'C', 'B']
);
assert.deepStrictEqual(
  [...sandbox.getRecentMenusForLineUser('line-user-b')],
  []
);
assert.strictEqual(values.size, 1);
assert.strictEqual(lockReleased, 6);
assert.deepStrictEqual(
  [...sandbox.getLiffRecentMenus('line-user-a', Date.now()).menus],
  ['F', 'E', 'D', 'C', 'B']
);

const storedKey = [...values.keys()][0];
assert(storedKey.startsWith('recent-menus-v1:'));
assert(!storedKey.includes('line-user-a'));

assert.strictEqual(
  sandbox.clearRecentMenusForLineUser('line-user-a'),
  true
);
assert.deepStrictEqual(
  [...sandbox.getRecentMenusForLineUser('line-user-a')],
  []
);

console.log('recent-menus server tests: PASS');
