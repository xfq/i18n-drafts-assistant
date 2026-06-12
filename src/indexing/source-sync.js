import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function resolveSource(config) {
  if (config.sourceMode === 'local') {
    if (!config.sourceRepoPath) throw new Error('SOURCE_REPO_PATH is required when SOURCE_MODE=local');
    return {
      sourceRoot: resolve(config.sourceRepoPath),
      sourceCommit: await gitCommit(resolve(config.sourceRepoPath)).catch(() => '')
    };
  }

  if (config.sourceMode === 'git') {
    return syncGitSource(config);
  }

  throw new Error(`Unsupported SOURCE_MODE: ${config.sourceMode}`);
}

export async function resolveSources(config) {
  const sources = config.sources || [];
  const resolved = [];

  for (const source of sources) {
    const result = await resolveSingleSource(source);
    resolved.push({ ...source, ...result });
  }

  return resolved;
}

async function resolveSingleSource(source) {
  if (source.mode === 'local') {
    if (!source.repoPath) throw new Error(`repoPath is required for source "${source.id}" in local mode`);
    const sourceRoot = resolve(source.repoPath);
    return {
      sourceRoot,
      sourceCommit: await gitCommit(sourceRoot).catch(() => '')
    };
  }

  if (source.mode === 'git') {
    return syncGitSourceForSource(source);
  }

  throw new Error(`Unsupported source mode "${source.mode}" for source "${source.id}"`);
}

export async function syncGitSource(config) {
  const repoUrl = config.sourceRepoUrl || 'https://github.com/w3c/i18n-drafts.git';
  const ref = config.sourceRef || 'gh-pages';
  const cacheDir = resolve(config.sourceCacheDir || '.cache/source/i18n-drafts');
  await mkdir(dirname(cacheDir), { recursive: true });

  if (!existsSync(`${cacheDir}/.git`)) {
    await execFileAsync('git', [
      'clone',
      '--depth',
      String(config.sourceFetchDepth || 1),
      '--branch',
      ref,
      repoUrl,
      cacheDir
    ]);
  } else {
    await execFileAsync('git', ['-C', cacheDir, 'fetch', '--depth', String(config.sourceFetchDepth || 1), 'origin', ref]);
    await execFileAsync('git', ['-C', cacheDir, 'checkout', 'FETCH_HEAD']);
  }

  return {
    sourceRoot: cacheDir,
    sourceCommit: await gitCommit(cacheDir).catch(() => '')
  };
}

async function syncGitSourceForSource(source) {
  const repoUrl = source.repoUrl;
  const ref = source.ref || 'gh-pages';
  const cacheDir = resolve(source.cacheDir || `.cache/source/${source.id}`);
  await mkdir(dirname(cacheDir), { recursive: true });

  if (!existsSync(`${cacheDir}/.git`)) {
    await execFileAsync('git', [
      'clone',
      '--depth',
      String(source.fetchDepth || 1),
      '--branch',
      ref,
      repoUrl,
      cacheDir
    ]);
  } else {
    await execFileAsync('git', ['-C', cacheDir, 'fetch', '--depth', String(source.fetchDepth || 1), 'origin', ref]);
    await execFileAsync('git', ['-C', cacheDir, 'checkout', 'FETCH_HEAD']);
  }

  return {
    sourceRoot: cacheDir,
    sourceCommit: await gitCommit(cacheDir).catch(() => '')
  };
}

async function gitCommit(directory) {
  const { stdout } = await execFileAsync('git', ['-C', directory, 'rev-parse', 'HEAD']);
  return stdout.trim();
}
