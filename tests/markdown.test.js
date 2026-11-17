import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, escapeHtml } from '../markdown.js';

test('escapes HTML instead of rendering it', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renders bold, inline code and http links', () => {
  const html = renderMarkdown('**bold** and `code` and [link](https://example.com/a?b=1&c=2)');
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<code>code</code>'));
  assert.ok(html.includes('href="https://example.com/a?b=1&amp;c=2"'));
  assert.ok(html.includes('target="_blank"'));
});

test('does not turn javascript: URLs into links', () => {
  const html = renderMarkdown('[x](javascript:alert(1))');
  assert.ok(!html.includes('<a '));
});

test('renders fenced code with language and escaped body', () => {
  const html = renderMarkdown('```js\nconst a = "<b>";\n```');
  assert.ok(html.includes('class="copy-code"'));
  assert.ok(html.includes('<span class="code-lang">js</span>'));
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('<pre class="code">'));
});

test('renders headings, lists and blockquotes', () => {
  const html = renderMarkdown('# Title\n\n- one\n- two\n\n> quote');
  assert.ok(html.includes('<h1>Title</h1>'));
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  assert.ok(html.includes('<blockquote>quote</blockquote>'));
});

test('a streaming partial code fence still renders safely', () => {
  const html = renderMarkdown('before\n```js\nconst a = 1;');
  assert.ok(html.includes('before'));
  assert.ok(html.includes('<pre class="code">'));
  assert.ok(html.includes('const a = 1;'));
});

test('escapeHtml handles quotes', () => {
  assert.equal(escapeHtml('"x" & <y>'), '&quot;x&quot; &amp; &lt;y&gt;');
});
