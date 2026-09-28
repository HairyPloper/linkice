const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function verifyBuild(directory) {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(match => match[1]).filter(src => !/^(?:https?:)?\/\//i.test(src));
  if (scripts.length !== 1 || scripts[0].split('?')[0] !== 'js/bundle.min.js') {
    throw new Error(`Deployment must load exactly one local bundle. Found: ${scripts.join(', ')}`);
  }
  const bundle = fs.readFileSync(path.join(directory, 'js/bundle.min.js'), 'utf8');
  if (!bundle.trim()) throw new Error('Deployment bundle is empty');
  new vm.Script(bundle, { filename: 'bundle.min.js' });
  return true;
}
module.exports = verifyBuild;
if (require.main === module) {
  verifyBuild(process.argv[2] || 'dist');
  console.log('Verified deployed HTML and JavaScript bundle.');
}
