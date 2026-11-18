import { SSEParser } from './sse.js';
import { renderMarkdown } from './markdown.js';
import { collectSources, describeCall } from './websearch.js';

const API_BASE = 'https://api.deepseek.com';
const STORAGE = {
  key: 'dsc.key',
  settings: 'dsc.settings',
  active: 'dsc.active',
};
const MODELS = {
  'deepseek-flash': 'Flash',
  'deepseek-v4-pro': 'V4 Pro',
};
const DEFAULT_SETTINGS = {
  model: 'deepseek-flash',
  thinking: true,
  effort: 'high',
  systemPrompt: '',
  theme: 'auto',
  webSearch: false,
  renderMath: true,
};

const $ = (selector) => document.querySelector(selector);

const els = {
  sidebar: $('#sidebar'),
  overlay: $('#overlay'),
  sessionList: $('#sessionList'),
  messages: $('#messages'),
  input: $('#input'),
  sendBtn: $('#sendBtn'),
  stopBtn: $('#stopBtn'),
  newChatBtn: $('#newChatBtn'),
  settingsBtn: $('#settingsBtn'),
  settingsBtn2: $('#settingsBtn2'),
  menuBtn: $('#menuBtn'),
  themeBtn: $('#themeBtn'),
  modelBadge: $('#modelBadge'),
  keyState: $('#keyState'),
  keyNotice: $('#keyNotice'),
  noticeSettings: $('#noticeSettings'),
  webBtn: $('#webBtn'),
  hint: $('#hint'),
  installBtn: $('#installBtn'),
  dialog: $('#settingsDialog'),
  settingsForm: $('#settingsForm'),
  keyInput: $('#keyInput'),
  toggleKey: $('#toggleKey'),
  testKeyBtn: $('#testKeyBtn'),
  testKeyStatus: $('#testKeyStatus'),
  modelInput: $('#modelInput'),
  thinkingInput: $('#thinkingInput'),
  effortInput: $('#effortInput'),
  mathInput: $('#mathInput'),
  systemInput: $('#systemInput'),
  clearAllBtn: $('#clearAllBtn'),
  cancelSettingsBtn: $('#cancelSettingsBtn'),
  toast: $('#toast'),
};

const state = {
  settings: loadSettings(),
  key: localStorage.getItem(STORAGE.key) || '',
  sessions: [],
  activeId: null,
  busy: false,
  controller: null,
  toastTimer: 0,
  installPrompt: null,
};

let dbPromise = null;
let syncFrame = 0;

init();

async function init() {
  applyTheme();
  updateKeyUi();
  updateModelBadge();
  updateWebButton();
  updateHint();
  // Paint the shell immediately; a slow or unavailable IndexedDB then cannot
  // leave the page blank.
  renderSessionList();
  renderMessages();

  await loadSessions();

  bindEvents();
  renderSessionList();
  renderMessages();
  registerServiceWorker();
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.settings) || '{}');
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!(settings.model in MODELS)) settings.model = DEFAULT_SETTINGS.model;
    if (!['low', 'high', 'max'].includes(settings.effort)) settings.effort = DEFAULT_SETTINGS.effort;
    if (!['auto', 'light', 'dark'].includes(settings.theme)) settings.theme = DEFAULT_SETTINGS.theme;
    settings.webSearch = Boolean(settings.webSearch);
    settings.renderMath = settings.renderMath !== false;
    if (settings.webSearch && settings.model !== 'deepseek-flash') settings.webSearch = false;
    settings.thinking = Boolean(settings.thinking);
    settings.systemPrompt = typeof settings.systemPrompt === 'string' ? settings.systemPrompt : '';
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(state.settings));
}

function persistKey() {
  if (state.key) localStorage.setItem(STORAGE.key, state.key);
  else localStorage.removeItem(STORAGE.key);
}

function updateKeyUi() {
  const hasKey = Boolean(state.key);
  els.keyState.textContent = hasKey ? 'API Key 已保存在本机' : '尚未设置 API Key';
  els.keyNotice.hidden = hasKey;
}

function updateModelBadge() {
  els.modelBadge.textContent = MODELS[state.settings.model] || state.settings.model;
}

function updateWebButton() {
  els.webBtn.classList.toggle('active', Boolean(state.settings.webSearch));
  els.webBtn.setAttribute('aria-pressed', String(Boolean(state.settings.webSearch)));
  els.webBtn.title = state.settings.webSearch ? '联网搜索已开启（仅 DeepSeek Flash）' : '开启联网搜索（仅 DeepSeek Flash）';
}

function updateHint() {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  els.hint.textContent = finePointer
    ? 'Enter 发送 · Shift+Enter 换行 · 内容只保存在本机'
    : '点发送 · 内容只保存在本机';
}

function applyTheme() {
  const setting = state.settings.theme;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = setting === 'dark' || (setting === 'auto' && prefersDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  els.themeBtn.textContent = dark ? '☀️' : '🌙';
  els.themeBtn.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
}

function openSettings() {
  if (els.dialog.open) return;
  els.keyInput.value = state.key;
  els.keyInput.type = 'password';
  els.toggleKey.textContent = '显示';
  els.testKeyStatus.textContent = '';
  els.testKeyStatus.className = 'test-status';
  els.modelInput.value = state.settings.model;
  els.thinkingInput.checked = Boolean(state.settings.thinking);
  els.effortInput.value = state.settings.effort;
  els.effortInput.disabled = !state.settings.thinking;
  els.mathInput.checked = state.settings.renderMath !== false;
  els.systemInput.value = state.settings.systemPrompt || '';
  closeSidebar();
  if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
  else els.dialog.setAttribute('open', '');
  if (!state.key) setTimeout(() => els.keyInput.focus(), 30);
}

function closeSettings() {
  if (typeof els.dialog.close === 'function') els.dialog.close();
  else els.dialog.removeAttribute('open');
}

function saveSettingsFromDialog() {
  state.settings.model = els.modelInput.value in MODELS ? els.modelInput.value : DEFAULT_SETTINGS.model;
  let notice = '设置已保存';
  if (state.settings.model !== 'deepseek-flash' && state.settings.webSearch) {
    state.settings.webSearch = false;
    notice = '设置已保存；联网搜索已关闭（仅支持 Flash）';
  }
  state.settings.thinking = els.thinkingInput.checked;
  state.settings.effort = ['low', 'high', 'max'].includes(els.effortInput.value) ? els.effortInput.value : 'high';
  state.settings.renderMath = els.mathInput.checked;
  state.settings.systemPrompt = els.systemInput.value.trim();
  state.key = els.keyInput.value.trim();
  persistSettings();
  persistKey();
  updateKeyUi();
  updateModelBadge();
  updateWebButton();
  closeSettings();
  if (!state.busy) renderMessages();
  toast(notice);
}

async function testConnection() {
  const key = els.keyInput.value.trim();
  if (!key) {
    setTestStatus('请先输入 API Key', 'bad');
    return;
  }
  els.testKeyBtn.disabled = true;
  setTestStatus('正在连接…', '');
  try {
    const res = await fetch(`${API_BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) {
      setTestStatus('Key 无效（401）', 'bad');
      return;
    }
    if (!res.ok) {
      setTestStatus(`连接失败（HTTP ${res.status}）`, 'bad');
      return;
    }
    const data = await res.json();
    const info = (data.balance_infos || []).find((item) => item.currency === 'CNY') || (data.balance_infos || [])[0];
    if (info) {
      const stateText = data.is_available ? '可用' : '不可用（余额不足？）';
      setTestStatus(`连接成功 · 余额 ${info.total_balance} ${info.currency} · ${stateText}`, data.is_available ? 'ok' : 'bad');
    } else {
      setTestStatus('连接成功', 'ok');
    }
  } catch {
    setTestStatus('网络请求失败（检查网络或代理）', 'bad');
  } finally {
    els.testKeyBtn.disabled = false;
  }
}

function setTestStatus(text, kind) {
  els.testKeyStatus.textContent = text;
  els.testKeyStatus.className = `test-status${kind ? ` ${kind}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持本地数据库'));
      return;
    }
    const request = indexedDB.open('deepseek-chat', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function idbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly');
    const request = tx.objectStore('sessions').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(session) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSessions() {
  try {
    const sessions = await Promise.race([
      idbAll(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB timeout')), 1500)),
    ]);
    // A stream cut by a reload or a crash never resumes: show it as stopped.
    for (const session of sessions) {
      for (const message of session.messages || []) {
        if (message.status === 'streaming') message.status = 'stopped';
      }
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    state.sessions = sessions;
    const savedActive = localStorage.getItem(STORAGE.active);
    if (savedActive && sessions.some((item) => item.id === savedActive)) state.activeId = savedActive;
    else if (sessions.length > 0) state.activeId = sessions[0].id;
  } catch {
    state.sessions = [];
    toast('本地数据库不可用，本次对话不会保存');
  }
}

function persistSession(session) {
  if (session.deleted) return;
  idbPut(session).catch(() => toast('保存会话失败'));
}

/* ------------------------------------------------------------------ */
/* sessions                                                            */
/* ------------------------------------------------------------------ */

function getActiveSession() {
  return state.sessions.find((item) => item.id === state.activeId) || null;
}

function createSession() {
  const session = {
    id: uid('s'),
    title: '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  state.sessions.unshift(session);
  state.activeId = session.id;
  localStorage.setItem(STORAGE.active, session.id);
  renderSessionList();
  renderMessages();
  renderModelBadgeSafe();
  closeSidebar();
  els.input.focus();
  return session;
}

function selectSession(id) {
  if (state.busy) stopStreaming();
  state.activeId = id;
  localStorage.setItem(STORAGE.active, id);
  renderSessionList();
  renderMessages();
  closeSidebar();
}

async function deleteSession(id) {
  if (!window.confirm('删除这个会话？')) return;
  const wasActive = state.activeId === id;
  if (wasActive && state.busy) stopStreaming();
  const target = state.sessions.find((item) => item.id === id);
  if (target) target.deleted = true;
  state.sessions = state.sessions.filter((item) => item.id !== id);
  try {
    await idbDelete(id);
  } catch {
    toast('删除失败');
  }
  if (wasActive) {
    state.activeId = state.sessions[0]?.id || null;
    if (state.activeId) localStorage.setItem(STORAGE.active, state.activeId);
    else localStorage.removeItem(STORAGE.active);
  }
  renderSessionList();
  renderMessages();
}

function renderModelBadgeSafe() {
  updateModelBadge();
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function renderSessionList() {
  els.sessionList.textContent = '';
  const sessions = [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const session of sessions) {
    const row = document.createElement('div');
    row.className = `session-row${session.id === state.activeId ? ' active' : ''}`;

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'session-main';
    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = session.title || '新对话';
    const meta = document.createElement('span');
    meta.className = 'session-meta';
    meta.textContent = `${session.messages.length} 条 · ${formatTime(session.updatedAt)}`;
    main.append(title, meta);
    main.addEventListener('click', () => selectSession(session.id));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'session-del';
    del.title = '删除会话';
    del.setAttribute('aria-label', '删除会话');
    del.textContent = '✕';
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteSession(session.id);
    });

    row.append(main, del);
    els.sessionList.append(row);
  }
}

function renderMessages() {
  els.messages.textContent = '';
  const session = getActiveSession();
  if (!session || session.messages.length === 0) {
    els.messages.append(emptyState());
    return;
  }
  for (const message of session.messages) {
    els.messages.append(messageEl(message));
  }
  scrollToBottom(true);
}

function emptyState() {
  const wrap = document.createElement('div');
  wrap.className = 'empty';

  const logo = document.createElement('div');
  logo.className = 'empty-logo';
  logo.textContent = 'D';

  const heading = document.createElement('h1');
  heading.textContent = '开始新的对话';

  const text = document.createElement('p');
  text.textContent = state.key
    ? '你正在使用自己的 API Key，消息只保存在这台设备上。'
    : '先在设置里填入 DeepSeek API Key，然后就可以开始了。';

  const chips = document.createElement('div');
  chips.className = 'chips';
  const suggestions = [
    '用一句话解释量子纠缠',
    '帮我写一封请假邮件',
    '这段代码为什么报错？',
    '把这段话改得更简洁',
  ];
  for (const suggestion of suggestions) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = suggestion;
    chip.addEventListener('click', () => {
      els.input.value = suggestion;
      autoGrow();
      els.input.focus();
    });
    chips.append(chip);
  }

  wrap.append(logo, heading, text, chips);
  return wrap;
}

function messageEl(message) {
  if (message.role === 'user') {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.dataset.id = message.id;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = message.content;
    el.append(bubble);
    return el;
  }

  const el = document.createElement('div');
  el.className = 'msg assistant';
  el.dataset.id = message.id;

  const body = document.createElement('div');
  body.className = 'body';

  const head = document.createElement('div');
  head.className = 'msg-head';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.textContent = 'D';
  const name = document.createElement('span');
  name.textContent = 'DeepSeek';
  const webBadge = document.createElement('span');
  webBadge.className = 'web-badge';
  webBadge.textContent = '联网';
  webBadge.hidden = true;
  head.append(avatar, name, webBadge);

  const thinking = document.createElement('details');
  thinking.className = 'thinking';
  thinking.hidden = true;
  const summary = document.createElement('summary');
  summary.textContent = '思考过程';
  const thinkingBody = document.createElement('div');
  thinkingBody.className = 'thinking-body';
  thinking.append(summary, thinkingBody);

  const webStatus = document.createElement('div');
  webStatus.className = 'web-status';
  webStatus.hidden = true;

  const md = document.createElement('div');
  md.className = 'md';

  const sourcesBox = document.createElement('div');
  sourcesBox.className = 'sources';
  sourcesBox.hidden = true;

  const foot = document.createElement('div');
  foot.className = 'msg-foot';

  body.append(head, thinking, webStatus, md, sourcesBox, foot);
  el.append(body);

  syncAssistantEl(el, message);
  return el;
}

function syncAssistantEl(el, message) {
  const stick = isNearBottom();
  const thinking = el.querySelector('.thinking');
  const summary = el.querySelector('.thinking summary');
  const thinkingBody = el.querySelector('.thinking-body');
  const webBadge = el.querySelector('.web-badge');
  const webStatus = el.querySelector('.web-status');
  const md = el.querySelector('.md');
  const sourcesBox = el.querySelector('.sources');
  const foot = el.querySelector('.msg-foot');

  const showThinking = Boolean(message.reasoning) || (message.status === 'streaming' && state.settings.thinking && !message.content);
  thinking.hidden = !showThinking;
  if (showThinking) {
    thinkingBody.textContent = message.reasoning || '';
    summary.textContent = message.status === 'streaming' && !message.reasoning ? '正在思考…' : '思考过程';
    if (message.status === 'streaming' && !thinking.dataset.opened) {
      thinking.open = true;
      thinking.dataset.opened = '1';
    }
    if (message.status === 'streaming' && thinking.open) thinkingBody.scrollTop = thinkingBody.scrollHeight;
  }

  const sources = collectSources(message.annotations, message.serverToolCalls, message.webCalls);
  const usedWeb = sources.length > 0 || (Array.isArray(message.webCalls) && message.webCalls.length > 0) || (Array.isArray(message.serverToolCalls) && message.serverToolCalls.length > 0);
  webBadge.hidden = !usedWeb;

  if (message.status === 'streaming' && message.webPhase) {
    webStatus.hidden = false;
    webStatus.textContent = '';
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    const text = document.createElement('span');
    text.textContent = message.webPhase;
    webStatus.append(spinner, text);
  } else if (message.status !== 'streaming' && sources.length > 0) {
    webStatus.hidden = false;
    webStatus.textContent = `已联网检索 · ${sources.length} 个来源`;
  } else {
    webStatus.hidden = true;
  }

  if (message.content) {
    md.innerHTML = renderMarkdown(message.content, { math: state.settings.renderMath !== false });
  } else if (message.status === 'streaming') {
    md.innerHTML = '<span class="dots">正在生成</span>';
  } else {
    md.textContent = '';
  }

  sourcesBox.hidden = sources.length === 0;
  if (sources.length > 0) {
    const signature = sources.map((source) => source.url).join('\n');
    if (sourcesBox.dataset.signature !== signature) {
      sourcesBox.dataset.signature = signature;
      sourcesBox.textContent = '';
      const heading = document.createElement('h4');
      heading.textContent = '来源';
      const list = document.createElement('ol');
      for (const source of sources) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title || source.url;
        item.append(link);
        if (source.siteName && source.siteName !== source.title) {
          const site = document.createElement('span');
          site.className = 'site';
          site.textContent = ` · ${source.siteName}`;
          item.append(site);
        }
        list.append(item);
      }
      sourcesBox.append(heading, list);
    }
  }

  foot.textContent = '';
  const status = document.createElement('span');
  status.className = 'status';
  if (message.status === 'streaming') {
    status.innerHTML = '<span class="dots">正在生成</span>';
  } else if (message.status === 'stopped') {
    status.textContent = '已停止';
  } else if (message.status === 'error') {
    status.className = 'status error';
    status.textContent = message.error || '请求失败';
  } else if (message.finishReason === 'content_filter') {
    status.textContent = '内容审核拒绝';
  } else if (message.finishReason === 'length') {
    status.textContent = '已达到输出上限';
  }
  if (status.textContent || status.innerHTML) foot.append(status);

  if (message.content && message.status !== 'streaming') {
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = '复制';
    copy.addEventListener('click', () => copyText(message.content));
    foot.append(copy);
  }

  const session = getActiveSession();
  const isLast = session && session.messages[session.messages.length - 1]?.id === message.id;
  if (isLast && (message.status === 'error' || message.status === 'stopped')) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重试';
    retry.addEventListener('click', () => retryMessage(message.id));
    foot.append(retry);
  }

  if (stick) scrollToBottom(true);
}

function scheduleSync(message) {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    const el = document.querySelector(`.msg.assistant[data-id="${message.id}"]`);
    if (el) syncAssistantEl(el, message);
  });
}

function isNearBottom() {
  const box = els.messages;
  return box.scrollHeight - box.scrollTop - box.clientHeight < 140;
}

function scrollToBottom(force) {
  const box = els.messages;
  if (force || isNearBottom()) box.scrollTop = box.scrollHeight;
}

/* ------------------------------------------------------------------ */
/* chat                                                                */
/* ------------------------------------------------------------------ */

async function sendCurrentInput() {
  const text = els.input.value.trim();
  if (!text) return;
  if (state.busy) return;
  if (!state.key) {
    toast('请先在设置里填入 API Key');
    openSettings();
    return;
  }

  let session = getActiveSession();
  if (!session) session = createSession();

  els.input.value = '';
  autoGrow();

  const userMessage = { id: uid('m'), role: 'user', content: text, createdAt: Date.now() };
  session.messages.push(userMessage);
  if (session.title === '新对话' || !session.title) {
    session.title = text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }
  const assistant = {
    id: uid('m'),
    role: 'assistant',
    content: '',
    reasoning: '',
    status: 'streaming',
    createdAt: Date.now(),
    webCalls: [],
    webPhase: '',
    serverToolCalls: [],
    annotations: [],
  };
  session.messages.push(assistant);
  session.updatedAt = Date.now();
  persistSession(session);

  renderSessionList();
  renderMessages();
  scrollToBottom(true);
  await streamCompletion(session, assistant);
}

function buildMessages(session, assistant) {
  const messages = [];
  if (state.settings.systemPrompt) messages.push({ role: 'system', content: state.settings.systemPrompt });
  for (const message of session.messages) {
    if (message.id === assistant.id) break;
    if (message.role === 'user' && message.content) {
      messages.push({ role: 'user', content: message.content });
    } else if (message.role === 'assistant' && message.content) {
      const entry = { role: 'assistant', content: message.content };
      if (Array.isArray(message.serverToolCalls) && message.serverToolCalls.length > 0) {
        entry.server_tool_calls = message.serverToolCalls;
      }
      messages.push(entry);
    }
  }
  return messages;
}

async function streamCompletion(session, assistant) {
  state.busy = true;
  setStreamingUi(true);
  const controller = new AbortController();
  state.controller = controller;

  try {
    const body = {
      model: state.settings.model,
      messages: buildMessages(session, assistant),
      stream: true,
    };
    if (state.settings.thinking) {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = state.settings.effort;
    } else {
      body.thinking = { type: 'disabled' };
    }
    if (state.settings.webSearch && state.settings.model === 'deepseek-flash') {
      body.tools = [{ type: 'deepseek_web_search' }, { type: 'deepseek_read_url' }];
    }

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.key}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) throw await apiError(response);
    if (!response.body) throw new Error('当前浏览器不支持流式读取响应');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();
    let done = false;

    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const events = parser.push(decoder.decode(chunk.value, { stream: true }));
      for (const event of events) {
        if (handleSseEvent(event, assistant)) {
          done = true;
          break;
        }
      }
    }
    if (!done) {
      const tail = decoder.decode();
      if (tail) {
        for (const event of parser.push(tail)) handleSseEvent(event, assistant);
      }
      for (const event of parser.end()) handleSseEvent(event, assistant);
    }
    reader.cancel().catch(() => {});

    if (assistant.status === 'streaming') assistant.status = 'done';
    if (!assistant.content && !assistant.reasoning) {
      assistant.status = 'error';
      assistant.error = '模型没有返回内容';
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      assistant.status = 'stopped';
    } else {
      assistant.status = 'error';
      assistant.error = error.name === 'TypeError' ? '网络连接失败，请检查网络或代理' : error.message || '请求失败';
    }
  } finally {
    state.busy = false;
    state.controller = null;
    setStreamingUi(false);
    assistant.finishedAt = Date.now();
    session.updatedAt = Date.now();
    persistSession(session);
    renderSessionList();
    const el = document.querySelector(`.msg.assistant[data-id="${assistant.id}"]`);
    if (el) syncAssistantEl(el, assistant);
    scrollToBottom();
  }
}

function handleSseEvent(event, assistant) {
  if (event.data.trim() === '[DONE]') return true;
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch {
    return false;
  }
  if (payload.error) {
    assistant.status = 'error';
    assistant.error = payload.error.message || '请求失败';
    return true;
  }
  const choice = payload.choices && payload.choices[0];
  if (!choice) return false;
  const delta = choice.delta || {};
  let changed = false;
  if (choice.server_tool_event) {
    handleServerToolEvent(choice.server_tool_event, assistant);
    changed = true;
  }
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
    assistant.reasoning += delta.reasoning_content;
    changed = true;
  }
  if (typeof delta.content === 'string' && delta.content) {
    assistant.content += delta.content;
    changed = true;
  }
  if (Array.isArray(delta.server_tool_calls)) {
    assistant.serverToolCalls = delta.server_tool_calls;
    changed = true;
  }
  if (Array.isArray(delta.annotations)) {
    assistant.annotations = delta.annotations;
    changed = true;
  }
  if (choice.finish_reason) assistant.finishReason = choice.finish_reason;
  if (changed) scheduleSync(assistant);
  return false;
}

function handleServerToolEvent(event, assistant) {
  if (!event || typeof event !== 'object') return;
  const step = Number.isInteger(event.step) ? event.step : 0;
  const call = event.call;
  if (!call) return;
  const key = `${step}:${call.id || call.index || 'call'}`;
  if (!Array.isArray(assistant.webCalls)) assistant.webCalls = [];

  if (event.type === 'call_started') {
    assistant.webCalls = assistant.webCalls.filter((item) => item.key !== key);
    assistant.webCalls.push({ key, step, ...call, status: call.status || 'running' });
    assistant.webPhase = describeCall(call);
  } else if (event.type === 'call_completed') {
    const existing = assistant.webCalls.find((item) => item.key === key);
    if (existing) Object.assign(existing, call, { status: call.status || 'completed' });
    else assistant.webCalls.push({ key, step, ...call, status: call.status || 'completed' });
    const running = assistant.webCalls.find((item) => item.status === 'running' || item.status === 'searching' || item.status === 'in_progress');
    assistant.webPhase = running ? describeCall(running) : '';
  }
}

async function apiError(response) {
  let detail = '';
  try {
    const data = await response.json();
    detail = data?.error?.message || '';
  } catch {
    /* ignore */
  }
  const known = {
    401: 'API Key 无效或已过期，请在设置里检查',
    402: '账户余额不足，请到 platform.deepseek.com 充值',
    429: '请求太频繁，请稍后再试',
    500: 'DeepSeek 服务暂时不可用，请稍后重试',
    503: 'DeepSeek 服务繁忙，请稍后重试',
  };
  const message = known[response.status] || `请求失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
  const error = new Error(message);
  error.status = response.status;
  return error;
}

async function retryMessage(id) {
  const session = getActiveSession();
  if (!session || state.busy) return;
  const index = session.messages.findIndex((message) => message.id === id);
  if (index < 0) return;
  session.messages.splice(index);
  const assistant = {
    id: uid('m'),
    role: 'assistant',
    content: '',
    reasoning: '',
    status: 'streaming',
    createdAt: Date.now(),
    webCalls: [],
    webPhase: '',
    serverToolCalls: [],
    annotations: [],
  };
  session.messages.push(assistant);
  session.updatedAt = Date.now();
  renderMessages();
  await streamCompletion(session, assistant);
}

function stopStreaming() {
  if (state.controller) state.controller.abort();
}

function setStreamingUi(busy) {
  els.sendBtn.hidden = busy;
  els.stopBtn.hidden = !busy;
  els.sendBtn.disabled = busy;
  els.input.disabled = false;
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  els.newChatBtn.addEventListener('click', () => {
    if (state.busy) stopStreaming();
    const session = getActiveSession();
    if (session && session.messages.length === 0) {
      els.input.focus();
      closeSidebar();
      return;
    }
    createSession();
  });

  els.sendBtn.addEventListener('click', sendCurrentInput);
  els.stopBtn.addEventListener('click', stopStreaming);

  els.input.addEventListener('input', () => {
    autoGrow();
  });

  els.input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if ((event.ctrlKey || event.metaKey) || (finePointer && !event.shiftKey)) {
      event.preventDefault();
      sendCurrentInput();
    }
  });

  els.menuBtn.addEventListener('click', () => {
    els.sidebar.classList.add('open');
    els.overlay.hidden = false;
  });

  els.overlay.addEventListener('click', closeSidebar);

  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsBtn2.addEventListener('click', openSettings);
  els.noticeSettings.addEventListener('click', openSettings);

  els.themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    state.settings.theme = dark ? 'light' : 'dark';
    persistSettings();
    applyTheme();
  });

  els.webBtn.addEventListener('click', () => {
    if (!state.settings.webSearch && state.settings.model !== 'deepseek-flash') {
      state.settings.model = 'deepseek-flash';
      updateModelBadge();
      toast('联网搜索需要 Flash 模型，已自动切换');
    }
    state.settings.webSearch = !state.settings.webSearch;
    persistSettings();
    updateWebButton();
  });

  els.toggleKey.addEventListener('click', () => {
    const show = els.keyInput.type === 'password';
    els.keyInput.type = show ? 'text' : 'password';
    els.toggleKey.textContent = show ? '隐藏' : '显示';
  });

  els.testKeyBtn.addEventListener('click', testConnection);
  els.thinkingInput.addEventListener('change', () => {
    els.effortInput.disabled = !els.thinkingInput.checked;
  });

  els.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSettingsFromDialog();
  });

  els.cancelSettingsBtn.addEventListener('click', closeSettings);

  els.clearAllBtn.addEventListener('click', async () => {
    if (!window.confirm('清除所有会话、设置和 API Key？此操作不可恢复。')) return;
    try {
      await idbClear();
    } catch {
      /* ignore */
    }
    localStorage.removeItem(STORAGE.key);
    localStorage.removeItem(STORAGE.settings);
    localStorage.removeItem(STORAGE.active);
    location.reload();
  });

  els.messages.addEventListener('click', (event) => {
    const copyCode = event.target.closest('[data-copy-code]');
    if (copyCode) {
      const code = copyCode.closest('pre')?.querySelector('code')?.textContent || '';
      copyText(code);
      return;
    }
    const chip = event.target.closest('.chip');
    if (chip) return;
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'auto') applyTheme();
  });

  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) closeSettings();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    try {
      await state.installPrompt.userChoice;
    } catch {
      /* ignore */
    }
    state.installPrompt = null;
    els.installBtn.hidden = true;
  });

  window.addEventListener('pagehide', () => {
    const session = getActiveSession();
    if (session && session.messages.length > 0) persistSession(session);
  });
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.overlay.hidden = true;
}

function autoGrow() {
  els.input.style.height = 'auto';
  const max = Math.max(48, Math.round(window.innerHeight * 0.32));
  els.input.style.height = `${Math.min(els.input.scrollHeight, max)}px`;
}

/* ------------------------------------------------------------------ */
/* misc                                                                */
/* ------------------------------------------------------------------ */

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast('已复制');
    } catch {
      toast('复制失败');
    }
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (date.toDateString() === new Date().toDateString()) {
    return date.toTimeString().slice(0, 5);
  }
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
