/**
 * Helpers for DeepSeek's server-side web tools (Chat Completions).
 *
 * The Host performs the search/fetch; the client only declares the tools and
 * renders the progress events, sources and citations that come back.
 */

export function describeCall(call) {
  const action = call && call.action ? call.action : {};
  switch (action.type) {
    case 'search': {
      const queries = Array.isArray(action.queries) ? action.queries.filter(Boolean) : [];
      return queries.length > 0 ? `正在搜索：${queries.join('、')}` : '正在搜索…';
    }
    case 'open_page':
    case 'read_link':
      return action.url ? `正在读取：${action.url}` : '正在读取网页…';
    case 'find_in_page':
      return action.pattern ? `正在页面内查找：${action.pattern}` : '正在页面内查找…';
    default:
      return '正在联网…';
  }
}

/**
 * Merge sources from final annotations, the final server_tool_calls snapshot,
 * and the live call events, deduplicated by URL.
 */
export function collectSources(annotations, serverToolCalls, webCalls) {
  const found = new Map();

  const add = (url, title, siteName) => {
    if (!url || typeof url !== 'string') return;
    const existing = found.get(url);
    if (existing) {
      if (!existing.title && title) existing.title = title;
      if (!existing.siteName && siteName) existing.siteName = siteName;
      return;
    }
    found.set(url, { url, title: title || '', siteName: siteName || '' });
  };

  const addCall = (call) => {
    if (!call) return;
    for (const source of Array.isArray(call.sources) ? call.sources : []) {
      add(source.url, source.title, source.site_name);
    }
    if (call.page && call.page.url) add(call.page.url, call.page.title);
  };

  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    const citation = annotation && annotation.url_citation ? annotation.url_citation : annotation;
    if (citation && citation.url) add(citation.url, citation.title);
  }

  for (const step of Array.isArray(serverToolCalls) ? serverToolCalls : []) {
    for (const call of Array.isArray(step && step.calls) ? step.calls : []) addCall(call);
  }

  for (const call of Array.isArray(webCalls) ? webCalls : []) addCall(call);

  return [...found.values()];
}
