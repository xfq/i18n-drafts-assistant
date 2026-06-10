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
  assert.match(html, /<pre><code class="language-html">&lt;meta charset=&quot;utf-8&quot;&gt;<\/code><\/pre>/);
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
