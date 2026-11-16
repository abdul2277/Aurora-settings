// Shared fakes so the Store/updater can be tested on any machine: fake GitHub source, fake network, fake Windows runner.
const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const baseDir = (id) => `manifests/${id[0].toLowerCase()}/${id.split('.').join('/')}`;

function fakePackage({ id = 'Test.App', versions }) { // versions: { '1.0.0': Buffer, ... } -> portable exe packages
  const files = new Map(); const urls = new Map();
  for (const [ver, buf] of Object.entries(versions)) {
    const url = `https://example.test/${id}/${ver}/app.exe`; urls.set(url, buf);
    const d = `${baseDir(id)}/${ver}/${id}`;
    files.set(d + '.installer.yaml', `PackageIdentifier: ${id}\nPackageVersion: ${ver}\nInstallerType: portable\nCommands: [testapp]\nInstallers:\n  - Architecture: x64\n    InstallerUrl: ${url}\n    InstallerSha256: ${sha(buf)}\n`);
    files.set(d + '.yaml', `PackageIdentifier: ${id}\nPackageVersion: ${ver}\nDefaultLocale: en-US\n`);
    files.set(d + '.locale.en-US.yaml', `PackageIdentifier: ${id}\nPackageVersion: ${ver}\nPackageName: Test App\nPublisher: Tester\nShortDescription: A test app\n`);
  }
  const source = {
    calls: 0, failWith: null,
    async list(dir) { source.calls++; if (source.failWith) throw source.failWith; return dir === baseDir(id) ? Object.keys(versions) : []; },
    async read(file) { source.calls++; if (source.failWith) throw source.failWith; return files.get(file) || null; }
  };
  const fetchFn = async (url) => { const b = urls.get(url); if (!b) return new Response('nope', { status: 404 }); return new Response(b, { status: 200, headers: { 'content-length': String(b.length) } }); };
  return { source, fetchFn, urls };
}
const fakeRunner = (over = {}) => ({ listInstalled: async () => [], signature: async () => null, run: async () => 0, expand: async () => {}, msixInstall: async () => {}, msixRemove: async () => {}, shortcut: async () => '', removeShortcut: async () => {}, ...over });
module.exports = { sha, fakePackage, fakeRunner, baseDir };
