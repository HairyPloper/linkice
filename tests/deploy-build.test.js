const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const verify = require('../scripts/verify-build.cjs');

test('deployment rejects unrewritten source tags, missing bundles and invalid JavaScript', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkice-build-'));
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  fs.mkdirSync(path.join(dir,'js'));
  const html = text => fs.writeFileSync(path.join(dir,'index.html'),text);
  html('<script src="js/main.js"></script>');
  assert.throws(()=>verify(dir),/exactly one local bundle/);
  html('<script src="https://cdn.example/sdk.js"></script><script src="js/bundle.min.js"></script>');
  assert.throws(()=>verify(dir),/ENOENT/);
  fs.writeFileSync(path.join(dir,'js/bundle.min.js'),'const broken = ;');
  assert.throws(()=>verify(dir),SyntaxError);
  fs.writeFileSync(path.join(dir,'js/bundle.min.js'),'window.appReady = true;');
  assert.equal(verify(dir),true);
});
