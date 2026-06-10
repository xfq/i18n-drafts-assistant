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

async function gitCommit(directory) {
  const { stdout } = await execFileAsync('git', ['-C', directory, 'rev-parse', 'HEAD']);
  return stdout.trim();
}
