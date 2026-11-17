import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSources, describeCall } from '../websearch.js';

test('describes a search call', () => {
  assert.equal(describeCall({ action: { type: 'search', queries: ['a', 'b'] } }), '正在搜索：a、b');
  assert.equal(describeCall({ action: { type: 'search', queries: [] } }), '正在搜索…');
});

test('describes read and find calls', () => {
  assert.equal(describeCall({ action: { type: 'read_link', url: 'https://example.com' } }), '正在读取：https://example.com');
  assert.equal(describeCall({ action: { type: 'find_in_page', pattern: '330' } }), '正在页面内查找：330');
});

test('collects and dedupes sources from annotations and calls', () => {
  const annotations = [
    { url_citation: { url: 'https://a.example', title: 'A' } },
    { url_citation: { url: 'https://b.example', title: 'B' } },
  ];
  const serverToolCalls = [
    {
      calls: [
        {
          sources: [
            { url: 'https://a.example', title: 'A2', site_name: 'Site A' },
            { url: 'https://c.example', title: 'C', site_name: 'Site C' },
          ],
        },
      ],
    },
  ];
  const sources = collectSources(annotations, serverToolCalls, []);
  assert.deepEqual(
    sources.map((item) => item.url),
    ['https://a.example', 'https://b.example', 'https://c.example'],
  );
  assert.equal(sources[0].title, 'A');
  assert.equal(sources[0].siteName, 'Site A');
});

test('includes read_link pages from live calls', () => {
  const sources = collectSources([], [], [
    { page: { url: 'https://read.example', title: 'Read' }, sources: [] },
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, 'https://read.example');
  assert.equal(sources[0].title, 'Read');
});

test('ignores malformed entries', () => {
  assert.deepEqual(collectSources(null, null, null), []);
  assert.deepEqual(collectSources([{}], [{ calls: [{}] }], [{}]), []);
});
