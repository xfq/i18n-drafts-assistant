import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getConfig } from '../config.js';
import { loadIndex } from '../db/store.js';
import { retrieve } from '../retrieval/hybrid.js';
import { answerFromRetrieval } from '../generation/answer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = getConfig();
  const index = await loadIndex(config.indexPath);
  const cases = JSON.parse(await readFile(join(__dirname, 'cases.json'), 'utf8'));
  const failures = [];

  for (const testCase of cases) {
    const retrieval = retrieve({
      query: testCase.question,
      language: testCase.language,
      statuses: testCase.statuses || ['published', 'review', 'draft'],
      includeObsolete: Boolean(testCase.includeObsolete),
      chunks: index.chunks,
      limit: 8
    });
    const answer = await answerFromRetrieval({
      question: testCase.question,
      language: testCase.language,
      retrieval,
      modelProvider: 'local'
    });
    const sourcePaths = new Set(answer.citations.map((citation) => citation.source_path));
    const warningTypes = new Set(answer.warnings.map((warning) => warning.type));
    const expectedStatuses = Array.isArray(testCase.expected_evidence_status)
      ? testCase.expected_evidence_status
      : [testCase.expected_evidence_status];

    if (!expectedStatuses.includes(answer.evidence_status)) {
      failures.push(`${testCase.question}: expected evidence ${expectedStatuses.join('|')}, got ${answer.evidence_status}`);
    }

    for (const sourcePath of testCase.required_source_paths || []) {
      if (!sourcePaths.has(sourcePath)) failures.push(`${testCase.question}: missing required source ${sourcePath}`);
    }

    for (const sourcePath of testCase.disallowed_source_paths || []) {
      if (sourcePaths.has(sourcePath)) failures.push(`${testCase.question}: used disallowed source ${sourcePath}`);
    }

    for (const warningType of testCase.expected_warning_types || []) {
      if (!warningTypes.has(warningType)) failures.push(`${testCase.question}: missing warning ${warningType}`);
    }
  }

  console.log(`Evaluated ${cases.length} cases against ${index.chunks.length} chunks.`);
  if (failures.length > 0) {
    console.error(`${failures.length} failures:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('All evaluation cases passed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
