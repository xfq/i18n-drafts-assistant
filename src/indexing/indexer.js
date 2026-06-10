import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.js';
import { saveIndex } from '../db/store.js';
import { discoverContentFilesDetailed } from './discover.js';
import { parseHtmlPage } from './parse-html.js';
import { parseTranslationsFile, EMPTY_TRANSLATIONS } from './parse-translations.js';
import { translationDataPathForSourcePath } from './canonical-url.js';
import { chunkHtmlPage } from './chunk.js';
import { resolveSource } from './source-sync.js';

export async function buildIndex({
  sourceRoot,
  publicBaseUrl = 'https://www.w3.org/International',
  sourceMode = 'local',
  sourceRef = '',
  sourceCommit = '',
  write = true,
  indexPath = '.data/index.json'
}) {
  const root = resolve(sourceRoot);
  const discovered = await discoverContentFilesDetailed(root);
  const documents = [];
  const chunks = [];
  const warnings = [];
  const errors = [];
  const startedAt = new Date().toISOString();

  for (const sourcePath of discovered.files) {
    try {
      const html = await readFile(join(root, sourcePath), 'utf8');
      const translations = await readTranslations(root, sourcePath);
      const document = parseHtmlPage({
        html,
        sourcePath,
        publicBaseUrl,
        translations,
        sourceMode,
        sourceRef,
        sourceCommit
      });
      const documentChunks = chunkHtmlPage(document, { publicBaseUrl });
      documents.push(document);
      chunks.push(...documentChunks);
    } catch (error) {
      errors.push({ source_path: sourcePath, message: error.message });
    }
  }

  const finishedAt = new Date().toISOString();
  const index = {
    version: 1,
    source: {
      mode: sourceMode,
      ref: sourceRef,
      commit: sourceCommit,
      root
    },
    summary: {
      started_at: startedAt,
      finished_at: finishedAt,
      document_count: documents.length,
      chunk_count: chunks.length,
      skipped: discovered.skipped,
      warning_count: warnings.length,
      error_count: errors.length
    },
    index_runs: [
      {
        id: startedAt,
        started_at: startedAt,
        finished_at: finishedAt,
        status: errors.length > 0 ? 'completed_with_errors' : 'completed',
        source_mode: sourceMode,
        source_ref: sourceRef,
        source_commit: sourceCommit,
        document_count: documents.length,
        chunk_count: chunks.length,
        skipped_count: discovered.skipped,
        warning_count: warnings.length,
        error_count: errors.length,
        error_message: errors.map((error) => error.message).join('; ')
      }
    ],
    documents,
    chunks,
    warnings,
    errors
  };

  if (write) await saveIndex(index, indexPath);
  return index;
}

async function readTranslations(sourceRoot, sourcePath) {
  const translationPath = translationDataPathForSourcePath(sourcePath);
  try {
    const content = await readFile(join(sourceRoot, translationPath), 'utf8');
    return parseTranslationsFile(content);
  } catch {
    return { ...EMPTY_TRANSLATIONS };
  }
}

export async function runIndexer(config = getConfig()) {
  const { sourceRoot, sourceCommit } = await resolveSource(config);
  const index = await buildIndex({
    sourceRoot,
    publicBaseUrl: config.publicBaseUrl,
    sourceMode: config.sourceMode,
    sourceRef: config.sourceRef,
    sourceCommit: sourceCommit || config.sourceCommit,
    write: true,
    indexPath: config.indexPath
  });

  printSummary(index);
  return index;
}

function printSummary(index) {
  console.log(`Source mode: ${index.source.mode}`);
  console.log(`Source ref: ${index.source.ref}`);
  console.log(`Source commit: ${index.source.commit}`);
  console.log(`Indexed ${index.documents.length} documents`);
  console.log(`Indexed ${index.chunks.length} chunks`);
  console.log(`Skipped ${index.summary.skipped} support/example files`);
  console.log(`Warnings: ${index.summary.warning_count}`);
  console.log(`Errors: ${index.summary.error_count}`);
}

function parseArgs(argv) {
  const updates = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [rawKey, ...valueParts] = arg.slice(2).split('=');
    const value = valueParts.length > 0 ? valueParts.join('=') : 'true';
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    updates[key] = value;
  }
  return updates;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const config = getConfig(parseArgs(process.argv.slice(2)));
  runIndexer(config).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
