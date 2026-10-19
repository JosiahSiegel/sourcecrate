import { cp, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Explicit production allowlist: never publish tests, dependencies or repository files.
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'sponsors.html', 'favicon.svg', 'CNAME', 'sw.js', 'css', 'js']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
const revision = process.env.GITHUB_SHA || execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile('dist/version.json', JSON.stringify({ revision }, null, 2) + '\n');
await writeFile('dist/.nojekyll', '');
