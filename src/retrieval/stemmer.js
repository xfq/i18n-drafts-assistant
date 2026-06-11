const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

const SUFFIX_SET_1A = new Set(['sses', 'ies', 'ss', 's']);
const SUFFIX_SET_1B_EXTRA = new Set(['at', 'bl', 'iz']);

const DOUBLES = new Set(['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt']);

const SUFFIX_SET_2 = new Map([
  ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
  ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'],
  ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'],
  ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
  ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
]);

const SUFFIX_SET_3 = new Map([
  ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
  ['ical', 'ic'], ['ful', ''], ['ness', ''],
]);

const SUFFIX_SET_4 = new Set([
  'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement',
  'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
]);

function isConsonant(word, index) {
  const char = word[index];
  if (VOWELS.has(char)) return false;
  if (char === 'y') return index === 0 ? true : !isConsonant(word, index - 1);
  return true;
}

function measure(word, end) {
  let count = 0;
  let index = 0;
  while (index < end && isConsonant(word, index)) index++;
  while (index < end) {
    while (index < end && !isConsonant(word, index)) index++;
    if (index < end) {
      count++;
      while (index < end && isConsonant(word, index)) index++;
    }
  }
  return count;
}

function hasVowel(word, end) {
  for (let index = 0; index < end; index++) {
    if (!isConsonant(word, index)) return true;
  }
  return false;
}

function endsWithDoubleConsonant(word, end) {
  if (end < 2) return false;
  if (word[end - 1] !== word[end - 2]) return false;
  return isConsonant(word, end - 1);
}

function endsCVC(word, end) {
  if (end < 3) return false;
  if (!isConsonant(word, end - 1)) return false;
  if (isConsonant(word, end - 2)) return false;
  if (!isConsonant(word, end - 3)) return false;
  const last = word[end - 1];
  return last !== 'w' && last !== 'x' && last !== 'y';
}

function replaceSuffix(word, suffix, replacement) {
  return word.slice(0, word.length - suffix.length) + replacement;
}

function step1a(word) {
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ies')) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function step1b(word) {
  if (word.endsWith('eed')) {
    const stem = word.slice(0, -3);
    return measure(stem, stem.length) > 0 ? word.slice(0, -1) : word;
  }

  let changed = false;
  let stem = word;

  if (word.endsWith('ed')) {
    stem = word.slice(0, -2);
    if (!hasVowel(stem, stem.length)) return word;
    changed = true;
  } else if (word.endsWith('ing')) {
    stem = word.slice(0, -3);
    if (!hasVowel(stem, stem.length)) return word;
    changed = true;
  }

  if (!changed) return word;

  const tail = stem.slice(-2);
  if (SUFFIX_SET_1B_EXTRA.has(tail)) return stem + 'e';
  if (tail !== 'll' && endsWithDoubleConsonant(stem, stem.length)) return stem.slice(0, -1);
  if (measure(stem, stem.length) === 1 && endsCVC(stem, stem.length)) return stem + 'e';
  return stem;
}

function step1c(word) {
  if (word.length <= 2) return word;
  if (word[word.length - 1] === 'y' && isConsonant(word, word.length - 2)) {
    return word.slice(0, -1) + 'i';
  }
  return word;
}

function step2(word) {
  for (const [suffix, replacement] of SUFFIX_SET_2) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, word.length - suffix.length);
      if (measure(stem, stem.length) > 0) return stem + replacement;
      return word;
    }
  }
  return word;
}

function step3(word) {
  for (const [suffix, replacement] of SUFFIX_SET_3) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, word.length - suffix.length);
      if (measure(stem, stem.length) > 0) return stem + replacement;
      return word;
    }
  }
  return word;
}

function step4(word) {
  for (const suffix of SUFFIX_SET_4) {
    if (word.endsWith(suffix)) {
      const stem = word.slice(0, word.length - suffix.length);
      if (suffix === 'ion') {
        if (stem.length > 0 && measure(stem, stem.length) > 1 &&
            (stem[stem.length - 1] === 's' || stem[stem.length - 1] === 't')) {
          return stem;
        }
      } else if (measure(stem, stem.length) > 1) {
        return stem;
      }
      return word;
    }
  }
  return word;
}

function step5a(word) {
  if (word.endsWith('e')) {
    const stem = word.slice(0, -1);
    const m = measure(stem, stem.length);
    if (m > 1 || (m === 1 && !endsCVC(stem, stem.length))) return stem;
  }
  return word;
}

function step5b(word) {
  if (measure(word, word.length) > 1 &&
      endsWithDoubleConsonant(word, word.length) &&
      word[word.length - 1] === 'l') {
    return word.slice(0, -1);
  }
  return word;
}

export function stem(word) {
  if (word.length <= 2) return word;
  let result = step1a(word);
  result = step1b(result);
  result = step1c(result);
  result = step2(result);
  result = step3(result);
  result = step4(result);
  result = step5a(result);
  result = step5b(result);
  return result;
}
