import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../public/markdown.js';

test('renders common answer markdown as semantic HTML', () => {
  const html = markdownToHtml(`## Encoding

Use **UTF-8** for new content.

- Declare it early [1]
- Keep server headers consistent

\`\`\`html
<meta charset="utf-8">
\`\`\``);

  assert.match(html, /<h2>Encoding<\/h2>/);
  assert.match(html, /Use <strong>UTF-8<\/strong> for new content\./);
  assert.match(html, /<ul><li>Declare it early <a href="#citation-1" class="citation-ref" aria-label="Citation 1">\[1\]<\/a><\/li><li>Keep server headers consistent<\/li><\/ul>/);
  assert.match(html, /<pre><code class="language-html"><span class="token punctuation">&lt;<\/span><span class="token tag-name">meta<\/span>/);
  assert.match(html, /<span class="token attr-name">charset<\/span><span class="token punctuation">=<\/span><span class="token attr-value">&quot;utf-8&quot;<\/span>/);
});

test('escapes raw HTML instead of injecting it', () => {
  const html = markdownToHtml('Do not run <script>alert("x")</script> and keep `x < y` readable.');

  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /<code>x &lt; y<\/code>/);
});

test('renders emphasis that contains inline code', () => {
  const html = markdownToHtml('The value should be **the first child of `head`**.');

  assert.match(html, /<strong>the first child of <code>head<\/code><\/strong>/);
  assert.equal(html.includes('**'), false);
});

test('renders grouped API citation references as links to each source', () => {
  const html = markdownToHtml('Use the in-document declaration and keep the HTTP header consistent [1, 2].');

  assert.match(html, /<a href="#citation-1" class="citation-ref" aria-label="Citation 1">\[1\]<\/a>/);
  assert.match(html, /<a href="#citation-2" class="citation-ref" aria-label="Citation 2">\[2\]<\/a>/);
  assert.doesNotMatch(html, /\[1, 2\]/);
});

test('opens referenced external links in a new window', () => {
  const html = markdownToHtml('Read the [HTML standard](https://html.spec.whatwg.org/) or [send feedback](mailto:team@example.com).');

  assert.match(html, /<a href="https:\/\/html\.spec\.whatwg\.org\/" target="_blank">HTML standard<\/a>/);
  assert.match(html, /<a href="mailto:team@example\.com" target="_blank">send feedback<\/a>/);
});

test('highlights CSS selectors, properties, and values', () => {
  const html = markdownToHtml(`\`\`\`css
.answer {
  color: #123456;
  margin: 1rem;
}
\`\`\``);

  assert.match(html, /<span class="token selector">\.answer<\/span>/);
  assert.match(html, /<span class="token property">color<\/span><span class="token punctuation">:<\/span>/);
  assert.match(html, /<span class="token color">#123456<\/span>/);
  assert.match(html, /<span class="token number">1rem<\/span>/);
});

test('highlights nested CSS selectors inside at-rules', () => {
  const html = markdownToHtml(`\`\`\`css
@media (width > 40rem) {
  .answer {
    color: red;
  }
}
\`\`\``);

  assert.match(html, /<span class="token atrule">@media<\/span>/);
  assert.match(html, /<span class="token selector">\.answer<\/span>/);
  assert.match(html, /<span class="token property">color<\/span>/);
});

test('keeps unsupported fenced languages escaped without highlighting', () => {
  const html = markdownToHtml('```javascript\nconst value = "<safe>";\n```');

  assert.match(html, /<code class="language-javascript">const value = &quot;&lt;safe&gt;&quot;;<\/code>/);
  assert.equal(html.includes('class="token'), false);
});
