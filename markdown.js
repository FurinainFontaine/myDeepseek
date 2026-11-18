/**
 * Small, dependency-free Markdown renderer for chat messages.
 *
 * Security model: text is HTML-escaped before markup is emitted. Links are only
 * created for http(s) URLs. KaTeX renders math to HTML with `trust: false`, so
 * TeX commands such as \href or \htmlClass cannot inject markup.
 *
 * Supports: fenced code, headings, lists, blockquotes, horizontal rules,
 * bold, italic, strikethrough, inline code, links, and TeX math via KaTeX:
 *   - display: $$...$$, \[...\], \begin{equation|align|gather|alignat|multline}
 *   - inline:  $...$, \(...\)
 */

import katex from './vendor/katex/katex.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const DEFAULT_MACROS = {};
const BLOCK_ENVIRONMENTS = /^\s*\\begin\{(equation\*?|align\*?|gather\*?|alignat\*?)\}/;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function renderMath(tex, displayMode, macros) {
  const source = String(tex ?? '').trim();
  if (!source) return '';
  try {
    const html = katex.renderToString(source, {
      displayMode: Boolean(displayMode),
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      output: 'htmlAndMathml',
      macros: macros && typeof macros === 'object' ? macros : DEFAULT_MACROS,
    });
    return displayMode ? `<div class="math-block">${html}</div>` : `<span class="math-inline">${html}</span>`;
  } catch {
    return `<code class="math-raw" title="KaTeX 无法渲染，已显示原始 TeX">${escapeHtml(source)}</code>`;
  }
}

function extractInlineMath(text, store, macros) {
  let out = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, tex) => {
    store.push(renderMath(tex, false, macros));
    return `\u0000M${store.length - 1}\u0000`;
  });
  out = out.replace(/(?<!\\)\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<!\\)\$(?![\d$])/g, (_match, tex) => {
    store.push(renderMath(tex, false, macros));
    return `\u0000M${store.length - 1}\u0000`;
  });
  return out;
}

function renderInline(text, mathEnabled, macros) {
  let out = String(text ?? '').replace(/\u0000/g, '');

  const codeSpans = [];
  out = out.replace(/`([^`\n]+)`/g, (_match, code) => {
    codeSpans.push(code);
    return `\u0000C${codeSpans.length - 1}\u0000`;
  });

  const mathSpans = [];
  if (mathEnabled) out = extractInlineMath(out, mathSpans, macros);

  out = escapeHtml(out);

  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  out = out.replace(/\u0000C(\d+)\u0000/g, (_match, index) => `<code>${escapeHtml(codeSpans[Number(index)])}</code>`);
  out = out.replace(/\u0000M(\d+)\u0000/g, (_match, index) => mathSpans[Number(index)] || '');
  return out;
}

function isFence(line) {
  return /^\s*```(\S*)\s*$/.test(line);
}

function readBlockMath(lines, index, macros) {
  const line = lines[index];

  if (/^\s*\$\$/.test(line)) {
    const rest = line.slice(line.indexOf('$$') + 2);
    const sameLine = rest.indexOf('$$');
    if (sameLine !== -1) {
      if (rest.slice(sameLine + 2).trim()) return null;
      const body = rest.slice(0, sameLine);
      if (!body.trim()) return null;
      return { html: renderMath(body, true, macros), next: index + 1 };
    }
    const body = [rest];
    for (let j = index + 1; j < lines.length; j += 1) {
      const close = lines[j].indexOf('$$');
      if (close !== -1) {
        if (lines[j].slice(close + 2).trim()) return null;
        body.push(lines[j].slice(0, close));
        if (!body.join('\n').trim()) return null;
        return { html: renderMath(body.join('\n'), true, macros), next: j + 1 };
      }
      body.push(lines[j]);
    }
    return null;
  }

  if (/^\s*\\\[/.test(line)) {
    const rest = line.slice(line.indexOf('\\[') + 2);
    const sameLine = rest.indexOf('\\]');
    if (sameLine !== -1) {
      if (rest.slice(sameLine + 2).trim()) return null;
      const body = rest.slice(0, sameLine);
      if (!body.trim()) return null;
      return { html: renderMath(body, true, macros), next: index + 1 };
    }
    const body = [rest];
    for (let j = index + 1; j < lines.length; j += 1) {
      const close = lines[j].indexOf('\\]');
      if (close !== -1) {
        if (lines[j].slice(close + 2).trim()) return null;
        body.push(lines[j].slice(0, close));
        if (!body.join('\n').trim()) return null;
        return { html: renderMath(body.join('\n'), true, macros), next: j + 1 };
      }
      body.push(lines[j]);
    }
    return null;
  }

  const environment = line.match(BLOCK_ENVIRONMENTS);
  if (environment) {
    const name = environment[1];
    const start = line.indexOf('\\begin{');
    const rest = line.slice(start);
    const endToken = `\\end{${name}}`;
    const sameLine = rest.indexOf(endToken);
    if (sameLine !== -1) {
      if (rest.slice(sameLine + endToken.length).trim()) return null;
      const body = rest.slice(0, sameLine + endToken.length);
      return { html: renderMath(body, true, macros), next: index + 1 };
    }
    const body = [rest];
    for (let j = index + 1; j < lines.length; j += 1) {
      const close = lines[j].indexOf(endToken);
      if (close !== -1) {
        if (lines[j].slice(close + endToken.length).trim()) return null;
        body.push(lines[j].slice(0, close + endToken.length));
        return { html: renderMath(body.join('\n'), true, macros), next: j + 1 };
      }
      body.push(lines[j]);
    }
    return null;
  }

  return null;
}

export function renderMarkdown(source, options = {}) {
  const mathEnabled = options.math !== false;
  const macros = options.macros && typeof options.macros === 'object' ? options.macros : DEFAULT_MACROS;
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const blockCache = new Map();

  const blockAt = (index) => {
    if (!mathEnabled) return null;
    if (!blockCache.has(index)) blockCache.set(index, readBlockMath(lines, index, macros));
    return blockCache.get(index);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const block = blockAt(i);
    if (block) {
      out.push(block.html);
      i = block.next;
      continue;
    }

    if (isFence(line)) {
      const lang = line.match(/^\s*```(\S*)\s*$/)[1];
      const body = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (/^\s*```\s*$/.test(lines[i])) {
          closed = true;
          i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      const language = lang || 'text';
      out.push(
        `<pre class="code"><div class="code-head"><span class="code-lang">${escapeHtml(language)}</span>` +
          `<button type="button" class="copy-code" data-copy-code>复制</button></div>` +
          `<code>${escapeHtml(body.join('\n'))}</code></pre>`,
      );
      if (!closed) break;
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2], mathEnabled, macros)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${quote.map((item) => renderInline(item, mathEnabled, macros)).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      out.push(`<ul>${items.map((item) => `<li>${renderInline(item, mathEnabled, macros)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      out.push(`<ol>${items.map((item) => `<li>${renderInline(item, mathEnabled, macros)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !isFence(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !blockAt(i)
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${paragraph.map((item) => renderInline(item, mathEnabled, macros)).join('<br>')}</p>`);
  }

  return out.join('');
}
