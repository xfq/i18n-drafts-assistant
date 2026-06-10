export function canonicalUrlForSourcePath(sourcePath, publicBaseUrl, sectionId = '') {
  const base = String(publicBaseUrl || 'https://www.w3.org/International').replace(/\/+$/, '');
  const normalizedPath = String(sourcePath || '').replace(/^\/+/, '');
  const withoutLanguage = normalizedPath.replace(/\.([a-z]{2,3}(?:-[a-z0-9]+)*)\.html$/i, '.html');
  let canonicalPath;

  if (/\/index\.html$/i.test(withoutLanguage)) {
    canonicalPath = withoutLanguage.replace(/index\.html$/i, '');
  } else {
    canonicalPath = withoutLanguage.replace(/\.html$/i, '');
  }

  const url = `${base}/${canonicalPath}`;
  return sectionId ? `${url}#${encodeURIComponent(sectionId)}` : url;
}

export function sourcePathWithoutLanguage(sourcePath) {
  return String(sourcePath || '').replace(/\.([a-z]{2,3}(?:-[a-z0-9]+)*)\.html$/i, '.html');
}

export function translationDataPathForSourcePath(sourcePath) {
  const withoutLanguage = sourcePathWithoutLanguage(sourcePath);
  const htmlRemoved = withoutLanguage.replace(/\.html$/i, '');
  return `${htmlRemoved}-data/translations.js`;
}
