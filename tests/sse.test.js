import test from 'node:test';
import assert from 'node:assert/strict';
import { SSEParser } from '../sse.js';

test('parses one complete event', () => {
  const parser = new SSEParser();
  const events = parser.push('data: {"a":1}\n\n');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { event: 'message', id: '', data: '{"a":1}' });
});

test('keeps an incomplete event until its blank line arrives', () => {
  const parser = new SSEParser();
  assert.deepEqual(parser.push('data: hel'), []);
  assert.deepEqual(parser.push('lo\n'), []);
  const events = parser.push('\n');
  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'hello');
});

test('handles CRLF split across chunks', () => {
  const parser = new SSEParser();
  assert.deepEqual(parser.push('data: one\r'), []);
  const events = parser.push('\n\r\n');
  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'one');
});

test('joins multiple data lines with a newline', () => {
  const parser = new SSEParser();
  const events = parser.push('event: delta\ndata: line1\ndata: line2\n\n');
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'delta');
  assert.equal(events[0].data, 'line1\nline2');
});

test('ignores comment-only blocks', () => {
  const parser = new SSEParser();
  assert.deepEqual(parser.push(': keep-alive\n\n'), []);
});

test('end() flushes a trailing event without a blank line', () => {
  const parser = new SSEParser();
  parser.push('data: [DONE]');
  const events = parser.end();
  assert.equal(events.length, 1);
  assert.equal(events[0].data, '[DONE]');
});
