import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { isLikelyContentPage } from './parse-html.js';

export const CONTENT_ROOTS = new Set([
  'articles',
  'questions',
  'tutorials',
  'getting-started',
  'quicktips',
  'pages',
  'techniques',
  'glossaries'
]);

const IGNORED_SEGMENTS = new Set(['node_modules', '.git', '.cache', '.data', 'dist', 'build']);

export async function discoverContentFiles(sourceRoot) {
  const detailed = await discoverContentFilesDetailed(sourceRoot);
  return detailed.files;
}

export async function discoverContentFilesDetailed(sourceRoot) {
  const files = [];
  let skipped = 0;

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const relativePath = normalizePath(relative(sourceRoot, absolutePath));
      const segments = relativePath.split('/');

      if (entry.isDirectory()) {
        if (IGNORED_SEGMENTS.has(entry.name)) continue;
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      if (!CONTENT_ROOTS.has(segments[0])) continue;
      if (segments.some((segment) => /-data$/i.test(segment))) {
        skipped += 1;
        continue;
      }

      const html = await readFile(absolutePath, 'utf8');
      if (isLikelyContentPage(html)) {
        files.push(relativePath);
      } else {
        skipped += 1;
      }
    }
  }

  await walk(sourceRoot);
  files.sort((a, b) => a.localeCompare(b));
  return { files, skipped };
}

export function normalizePath(path) {
  return String(path).replaceAll('\\', '/');
}
