/**
 * Minimal SSE (text/event-stream) parser.
 *
 * push(chunk) accepts decoded text and returns the events that became complete.
 * end() flushes a trailing event that was not followed by a blank line.
 *
 * An event is { event, id, data }. Comment-only blocks and blocks without any
 * `data:` field are skipped, matching the SSE spec's dispatch rules.
 */
export class SSEParser {
  constructor() {
    this.buffer = '';
  }

  push(chunk) {
    let data = this.buffer + chunk;
    // Keep a trailing CR so a CRLF split across two chunks is normalized as one
    // line break instead of turning into a false blank-line boundary.
    let tail = '';
    if (data.endsWith('\r')) {
      tail = '\r';
      data = data.slice(0, -1);
    }
    data = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = data.split('\n\n');
    this.buffer = blocks.pop() + tail;
    return blocks.map(parseBlock).filter(Boolean);
  }

  end() {
    const events = [];
    if (this.buffer.trim()) {
      const event = parseBlock(this.buffer);
      if (event) events.push(event);
    }
    this.buffer = '';
    return events;
  }
}

function parseBlock(block) {
  let event = 'message';
  let id = '';
  const dataLines = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') dataLines.push(value);
    else if (field === 'event') event = value || 'message';
    else if (field === 'id') id = value;
  }

  if (dataLines.length === 0) return null;
  return { event, id, data: dataLines.join('\n') };
}
