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

test('renders inline TeX with KaTeX', () => {
  const html = renderMarkdown('质能方程 $E=mc^2$ 很简洁。');
  assert.ok(html.includes('class="math-inline"'));
  assert.ok(html.includes('class="katex"'));
  assert.ok(!html.includes('$E=mc^2$'));
});

test('renders display math with $$ and \\[...\\]', () => {
  assert.ok(renderMarkdown('$$x^2$$').includes('class="math-block"'));
  assert.ok(renderMarkdown('\\[x^2\\]').includes('class="math-block"'));
  assert.ok(renderMarkdown('$$\n\\frac{1}{2}\n$$').includes('class="math-block"'));
});

test('renders \\(...\\) inline math', () => {
  const html = renderMarkdown('行内 \\(a+b\\) 公式');
  assert.ok(html.includes('class="math-inline"'));
});

test('renders equation and align environments', () => {
  const equation = renderMarkdown('\\begin{equation}\nE = mc^2\n\\end{equation}');
  assert.ok(equation.includes('class="math-block"'));
  const align = renderMarkdown('\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}');
  assert.ok(align.includes('class="math-block"'));
});

test('does not render math inside code', () => {
  assert.ok(!renderMarkdown('`$x$`').includes('katex'));
  assert.ok(!renderMarkdown('```\n$$x$$\n```').includes('katex'));
});

test('leaves unfinished math as text', () => {
  assert.ok(!renderMarkdown('$x').includes('katex'));
  assert.ok(!renderMarkdown('$$x').includes('katex'));
});

test('math can be disabled', () => {
  const html = renderMarkdown('$x^2$', { math: false });
  assert.ok(!html.includes('katex'));
  assert.ok(html.includes('$x^2$'));
});

test('unsupported TeX falls back to raw source', () => {
  const html = renderMarkdown('$\\notacommand{x}$');
  assert.ok(html.includes('class="math-raw"'));
  assert.ok(html.includes('notacommand'));
});
