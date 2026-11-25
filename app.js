(() => {
  'use strict';

  const SEED = window.SEED || { builtAt: null, sourceIds: [], sourceNames: [], classics: [], pinned: [], fresh: [], ko: {} };
  const { TOPICS, TRENDS, JOBS, SELECT, ABS_MAX, classify, relevant, compact } = window.STL;
  const TOPIC = Object.fromEntries(TOPICS.map(t => [t.id, t]));
  const KO = SEED.ko || {};

  const DAY = 86400000;
  const STALE_AFTER = 3 * 3600000;
  const THROTTLE = 2 * 60000;
  const PAGE = 20;
  const MAX_WEIGHT = 6;
  const QUOTE_MAX = 600;

  // 아이콘은 Lucide(ISC 라이선스)의 선 아이콘이다
  const ICON = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    note: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
    link: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };

  // ---------- 저장소 ----------

  const STORE_KEY = 'supertimeline.v1';
  const store = Object.assign(
    { likes: {}, notes: {}, saved: {}, weights: {}, added: [], cache: null, seen: {}, tr: {}, apiKey: '', lastFetch: 0 },
    readStore()
  );
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 저장 공간이 없어도 화면은 그대로 동작한다 */ }
  }

  // ---------- 상태 ----------

  const state = { view: 'home', tab: 'for', topic: 'all', q: '', shuffle: Date.now(), shown: PAGE, pending: null, open: new Set(), expanded: new Set(), author: null, trend: null };
  const authorCache = {};
  let papers = [];
  let byId = new Map();
  let list = [];

  // ---------- 작은 도구들 ----------

  const $ = id => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  function icon(name) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ic');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICON[name];
    return s;
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const pad = n => String(n).padStart(2, '0');
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const stamp = ts => { const d = new Date(ts); return `${isoDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const offsetDay = n => isoDay(new Date(Date.now() + n * DAY));
  const dateMs = p => (p.date ? Date.parse(p.date) : 0) || 0;
  const num = n => Number(n || 0).toLocaleString('ko-KR');
  const byDate = (a, b) => dateMs(b) - dateMs(a);

  function ago(p) {
    const ms = dateMs(p);
    if (!ms) return '';
    const days = Math.floor((Date.now() - ms) / DAY);
    if (days < 0) return '게재 예정';
    if (days === 0) return '오늘';
    if (days < 7) return `${days}일 전`;
    if (days < 35) return `${Math.floor(days / 7)}주 전`;
    if (days < 365) return `${Math.floor(days / 30)}개월 전`;
    return `${new Date(ms).getFullYear()}년`;
  }
  function who(p) {
    const first = (p.authors && p.authors[0]) || '저자 미상';
    const rest = (p.nAuthors || (p.authors || []).length) - 1;
    return rest > 0 ? `${first} 외 ${rest}명` : first;
  }
  function initialsOf(name) {
    const parts = String(name || '').trim().split(/\s+/);
    const last = parts[parts.length - 1] || '?';
    const head = parts.length > 1 ? parts[0][0] : '';
    return (head + last[0]).toUpperCase();
  }
  function safeUrl(p) {
    if (p.doi) return 'https://doi.org/' + p.doi;
    return /^https:\/\//.test(p.url || '') ? p.url : 'https://openalex.org/' + p.id;
  }
  const shownUrl = p => safeUrl(p).replace(/^https:\/\//, '').replace(/\/$/, '');

  // 한국어 표시: 미리 써 둔 요약이 먼저, 없으면 브라우저 번역 결과
  function koOf(p) {
    const k = KO[p.id];
    if (k) return { t: k.t, s: k.s || p.note || '', r: k.r || '', mt: false };
    if (p.note) return { t: '', s: p.note, r: '', mt: false };
    const m = store.tr[p.id];
    if (m) return { t: m.t, s: m.a, r: '', mt: true };
    return null;
  }

  // ---------- 병합 ----------

  function rebuildPapers() {
    const out = new Map();
    const live = (store.cache && store.cache.items) || null;
    // 시드에는 초록 원문이 없다. OpenAlex에서 받아온 것이 있으면 거기서 채운다.
    const liveAbs = new Map((live || []).map(p => [p.id, p.abs]));
    const put = p => {
      if (!p || !p.id || out.has(p.id)) return;
      out.set(p.id, !p.abs && liveAbs.get(p.id) ? { ...p, abs: liveAbs.get(p.id) } : p);
    };
    for (const p of store.added) put({ ...p, pinned: true, added: true });
    for (const p of SEED.pinned || []) put(p);
    for (const p of SEED.classics || []) put(p);
    // 시드 항목은 주제가 미리 정해져 있고, 새로 받아온 항목은 여기서 걸러 분류한다
    for (const p of live || SEED.fresh || []) if (p.topic || relevant(p)) put(p.topic ? p : { ...p, topic: classify(p) });
    // 좋아요나 의견을 남긴 논문은 목록에서 빠져도 계속 보인다
    for (const id in store.saved) put(store.saved[id]);
    byId = out;
    papers = [...out.values()];
    const now = Date.now();
    const first = !Object.keys(store.seen).length;
    const seen = {};
    const tr = {};
    for (const p of papers) {
      seen[p.id] = store.seen[p.id] != null ? store.seen[p.id] : (first ? 0 : now);
      if (store.tr[p.id]) tr[p.id] = store.tr[p.id];
    }
    store.seen = seen;
    store.tr = tr;
  }
  const isNew = p => !p.classic && store.seen[p.id] > Date.now() - 2 * DAY;
  const hasTrend = (p, i) => (p.kw && !p.abs ? p.kw.includes(i) : TRENDS[i][1].test(p.title + ' ' + (p.abs || '')));

  // ---------- 지분 ----------

  function baseWeight(id) { return store.weights[id] != null ? store.weights[id] : TOPIC[id].base; }
  function effWeights() {
    const likes = {};
    for (const id in store.likes) { const p = byId.get(id); if (p) likes[p.topic] = (likes[p.topic] || 0) + 1; }
    const w = {};
    for (const t of TOPICS) {
      const b = baseWeight(t.id);
      w[t.id] = b > 0 ? b + Math.min(1.5, 0.25 * (likes[t.id] || 0)) : 0;
    }
    return w;
  }

  // 주제별 줄을 만들고, 지분 비율대로 한 편씩 꺼내 섞는다 (smooth weighted round-robin)
  function recommended(pool) {
    const rnd = mulberry32(state.shuffle);
    const w = effWeights();
    if (state.topic !== 'all' && !(w[state.topic] > 0)) w[state.topic] = 1;
    const queue = {};
    for (const t of TOPICS) {
      if (!(w[t.id] > 0)) continue;
      const mine = pool.filter(p => p.topic === t.id);
      if (!mine.length) continue;
      const pins = mine.filter(p => p.pinned);
      const fresh = mine.filter(p => !p.classic && !p.pinned).map(p => [dateMs(p) + rnd() * 45 * DAY, p]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
      const classic = shuffled(mine.filter(p => p.classic && !p.pinned), rnd);
      const out = pins.slice();
      let i = 0;
      while (fresh.length || classic.length) {
        if (i % 3 === 2 && classic.length) out.push(classic.shift());
        else if (fresh.length) out.push(fresh.shift());
        else out.push(classic.shift());
        i++;
      }
      queue[t.id] = out;
    }
    const cur = {};
    const res = [];
    let ids = Object.keys(queue);
    while (ids.length) {
      let total = 0, best = null;
      for (const id of ids) {
        cur[id] = (cur[id] || 0) + w[id];
        total += w[id];
        if (best === null || cur[id] > cur[best]) best = id;
      }
      cur[best] -= total;
      res.push(queue[best].shift());
      if (!queue[best].length) ids = ids.filter(x => x !== best);
    }
    return res;
  }

  function matches(p, q) {
    if (!q) return true;
    const k = koOf(p) || {};
    const hay = [p.title, k.t, k.s, k.r, p.abs, p.venue, (p.authors || []).join(' '), p.doi].filter(Boolean).join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
  }
  function byAuthor(a) {
    const local = papers.filter(p => (a.id ? (p.aids || []).includes(a.id) : false) || (p.authors || []).includes(a.name));
    const seen = new Set(local.map(p => p.id));
    const extra = ((a.id && authorCache[a.id]) || []).filter(p => !seen.has(p.id));
    return [...local, ...extra].sort(byDate);
  }

  function computeList() {
    if (state.view === 'likes') {
      return Object.keys(store.likes).map(id => byId.get(id)).filter(Boolean).filter(p => matches(p, state.q)).sort((a, b) => store.likes[b.id] - store.likes[a.id]);
    }
    if (state.view === 'notes') {
      const last = id => Math.max(...store.notes[id].map(n => n.ts));
      return Object.keys(store.notes).filter(id => store.notes[id].length).map(id => byId.get(id)).filter(Boolean).filter(p => matches(p, state.q)).sort((a, b) => last(b.id) - last(a.id));
    }
    if (state.view === 'author') return byAuthor(state.author).filter(p => matches(p, state.q));
    if (state.view === 'trend') return papers.filter(p => hasTrend(p, state.trend.i) && matches(p, state.q)).sort(byDate);
    const pool = papers.filter(p => (state.topic === 'all' || p.topic === state.topic) && matches(p, state.q));
    if (state.tab === 'new') return pool.filter(p => !p.classic).sort(byDate);
    if (state.tab === 'classic') return pool.filter(p => p.classic).sort((a, b) => b.cites - a.cites);
    return recommended(pool);
  }

  // ---------- 브라우저 번역 (Chrome, Edge의 내장 번역 기능) ----------

  const TR = { api: self.Translator || null, inst: null, avail: 'unknown', auto: false, queue: [], running: false };
  const needsTr = p => !koOf(p) && /[A-Za-z]{3}/.test(p.title || '');
  async function trInit() {
    if (!TR.api) { TR.avail = 'unavailable'; return; }
    try { TR.avail = await TR.api.availability({ sourceLanguage: 'en', targetLanguage: 'ko' }); } catch { TR.avail = 'unavailable'; }
    if (TR.avail === 'available') TR.auto = true;
  }
  async function trGet() {
    if (!TR.inst) TR.inst = await TR.api.create({ sourceLanguage: 'en', targetLanguage: 'ko' });
    return TR.inst;
  }
  function trEnqueue(p) {
    if (!TR.queue.includes(p)) TR.queue.push(p);
    trRun();
  }
  async function trRun() {
    if (TR.running) return;
    TR.running = true;
    try {
      while (TR.queue.length) {
        const p = TR.queue.shift();
        if (!needsTr(p)) continue;
        const t = await trGet();
        store.tr[p.id] = { t: await t.translate(p.title), a: p.abs ? await t.translate(p.abs) : '' };
        save();
        repaint(p);
      }
    } catch {
      TR.auto = false; TR.queue = [];
      notice('번역을 하지 못했습니다 · Chrome이나 Edge 최신 버전에서 다시 해 보세요');
    } finally { TR.running = false; }
  }
  function trStart() {
    TR.auto = true;
    document.querySelectorAll('.post').forEach(el => { if (el._p && needsTr(el._p)) trEnqueue(el._p); });
  }
  function googleTranslateUrl(p) {
    return 'https://translate.google.com/?sl=en&tl=ko&op=translate&text=' + encodeURIComponent((p.title + '\n\n' + (p.abs || '')).slice(0, 1800));
  }

  // ---------- 글 하나 ----------

  function claudeUrl(p, quote, question) {
    const lines = [
      '아래 논문에 대해 질문합니다. 논문 원문을 근거로 한국어로 답해 주세요.', '',
      `논문: ${p.title}`,
      `저자: ${who(p)}${p.venue ? ' · ' + p.venue : ''}${p.date ? ' · ' + p.date : ''}`,
      `원문: ${safeUrl(p)}`,
    ];
    if (quote) lines.push('', '인용한 부분:', `"${quote}"`);
    lines.push('', `질문: ${question}`);
    return 'https://claude.ai/new?q=' + encodeURIComponent(lines.join('\n'));
  }

  function renderPost(p) {
    const topic = TOPIC[p.topic] || TOPIC.gen;
    const ko = koOf(p);
    const tag = p.pinned ? '직접 추가' : p.classic ? '고전' : isNew(p) ? '새로 들어옴' : '';
    const href = safeUrl(p);
    const author = { name: (p.authors && p.authors[0]) || '', id: (p.aids && p.aids[0]) || '' };
    const openAuthor = () => author.name && go('author', { author });

    const body = h('div', { class: 'post-body' },
      h('div', { class: 'byline' },
        h('button', { class: 'who', type: 'button', title: author.name ? `${author.name}의 논문 보기` : null, onclick: openAuthor }, who(p)),
        p.venue && h('span', { class: 'sep' }, '·'),
        p.venue && h('span', { class: 'venue', title: p.venue }, p.venue),
        h('span', { class: 'sep' }, '·'),
        h('span', { class: 'when', title: p.date || '' }, ago(p)),
        tag && h('span', { class: 'tag' + (p.classic && !p.pinned ? ' quiet' : '') }, tag)
      )
    );

    if (ko && ko.t) {
      body.append(
        h('a', { class: 'title quotable', href, target: '_blank', rel: 'noopener noreferrer' }, ko.t),
        h('p', { class: 'orig quotable', lang: 'en' }, p.title)
      );
    } else {
      body.append(h('a', { class: 'title quotable', href, target: '_blank', rel: 'noopener noreferrer', lang: 'en' }, p.title));
    }

    const absText = p.abs ? p.abs + (p.abs.length >= ABS_MAX ? ' …' : '') : '';
    if (ko && ko.s) {
      const sum = h('p', { class: 'note quotable' + (ko.mt ? ' clamp' : '') }, ko.s);
      body.append(sum);
      if (ko.r) body.append(h('p', { class: 'result quotable' }, h('span', { class: 'k' }, '결과'), ko.r));
      const links = h('div', { class: 'more-row' });
      if (ko.mt) {
        const more = h('button', { class: 'text-btn', type: 'button', onclick: () => { sum.classList.toggle('clamp'); more.textContent = sum.classList.contains('clamp') ? '더 보기' : '접기'; } }, '더 보기');
        links.append(more);
      }
      if (absText) {
        const abs = h('p', { class: 'abs quotable', lang: 'en', hidden: !state.expanded.has(p.id) }, absText);
        const toggle = h('button', { class: 'text-btn', type: 'button', onclick: () => {
          abs.hidden = !abs.hidden;
          if (abs.hidden) state.expanded.delete(p.id); else state.expanded.add(p.id);
          toggle.textContent = abs.hidden ? '원문 초록 보기' : '원문 초록 접기';
        } }, abs.hidden ? '원문 초록 보기' : '원문 초록 접기');
        links.append(toggle);
        body.append(links, abs);
      } else if (links.childNodes.length) body.append(links);
    } else if (absText) {
      const abs = h('p', { class: 'abs quotable' + (state.expanded.has(p.id) ? '' : ' clamp'), lang: 'en' }, absText);
      const more = h('button', { class: 'text-btn', type: 'button', onclick: () => {
        abs.classList.toggle('clamp');
        const open = !abs.classList.contains('clamp');
        if (open) state.expanded.add(p.id); else state.expanded.delete(p.id);
        more.textContent = open ? '접기' : '더 보기';
      } }, state.expanded.has(p.id) ? '접기' : '더 보기');
      const links = h('div', { class: 'more-row' }, more);
      if (needsTr(p)) {
        if (TR.auto) links.append(h('span', { class: 'text-btn idle' }, '번역하는 중'));
        else if (TR.api && TR.avail !== 'unavailable') links.append(h('button', { class: 'text-btn', type: 'button', onclick: e => { e.currentTarget.textContent = '번역 준비 중'; trStart(); } }, '한국어로 번역'));
        else links.append(h('a', { class: 'text-btn', href: googleTranslateUrl(p), target: '_blank', rel: 'noopener noreferrer' }, 'Google 번역으로 보기'));
      }
      body.append(abs, links);
    }

    body.append(h('div', { class: 'evidence' },
      h('span', { class: 'tp' }, h('i', { class: 'dot' + (topic.mine ? ' mine' : '') }), topic.name),
      p.date && h('time', { datetime: p.date }, p.date),
      h('a', { class: 'src', href, target: '_blank', rel: 'noopener noreferrer', title: '원문 주소' }, shownUrl(p)),
      ko && ko.mt && h('span', { class: 'mt' }, '기계 번역')
    ));

    const notes = () => store.notes[p.id] || [];
    const noteBtn = h('button', { class: 'act', type: 'button', 'aria-expanded': 'false', onclick: () => toggleThread() });
    const likeBtn = h('button', { class: 'act', type: 'button', onclick: () => toggleLike(p) });
    const paintActions = () => {
      const n = notes().length;
      noteBtn.replaceChildren(icon('note'), h('span', { class: 'lbl' }, '의견'));
      if (n > 0) noteBtn.append(h('span', { class: 'fig' }, n));
      noteBtn.classList.toggle('has', n > 0);
      const on = !!store.likes[p.id];
      likeBtn.replaceChildren(icon('heart'), h('span', { class: 'lbl' }, on ? '좋아함' : '좋아요'));
      likeBtn.classList.toggle('on', on);
      likeBtn.setAttribute('aria-pressed', String(on));
    };
    body.append(h('div', { class: 'actions' },
      noteBtn,
      h('span', { class: 'act', title: `OpenAlex 기준 인용 ${num(p.cites)}회` }, icon('quote'), h('span', { class: 'lbl' }, '인용'), h('span', { class: 'fig' }, num(p.cites))),
      likeBtn,
      h('a', { class: 'act', href, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), h('span', { class: 'lbl' }, '원문'))
    ));

    // 의견 타래. 드래그한 문장은 인용으로 붙고, 질문은 Claude 새 대화로 넘긴다.
    const thread = h('div', { class: 'thread', hidden: true });
    const draft = { quote: '', ask: false, text: '' };
    function addNote(kind) {
      const area = $('memo-' + p.id);
      const text = area.value.trim();
      if (!text) { area.focus(); return null; }
      const note = { text, ts: Date.now() };
      if (draft.quote) note.quote = draft.quote;
      if (kind) note.kind = kind;
      (store.notes[p.id] = store.notes[p.id] || []).push(note);
      store.saved[p.id] = p;
      draft.quote = ''; draft.ask = false; draft.text = '';
      save(); paintThread(); paintActions(); renderNav();
      return note;
    }
    function paintThread() {
      const area = h('textarea', { rows: '2', placeholder: draft.ask ? '이 부분에 대해 묻고 싶은 것' : '이 논문에 대한 의견', 'aria-label': '의견 쓰기', id: 'memo-' + p.id });
      area.value = draft.text;
      area.addEventListener('input', () => { draft.text = area.value; });
      area.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote(); });
      const ask = () => {
        const q = area.value.trim();
        if (!q) return area.focus();
        const url = claudeUrl(p, draft.quote, q);
        if (addNote('q')) window.open(url, '_blank', 'noopener');
      };
      thread.replaceChildren(
        ...notes().map((n, i) => h('div', { class: 'memo' },
          h('div', { class: 'memo-main' },
            n.quote && h('p', { class: 'quote' }, n.quote),
            h('p', null, n.kind === 'q' && h('span', { class: 'k' }, '질문'), n.text)
          ),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': '의견 지우기', title: '지우기', onclick: () => {
            store.notes[p.id].splice(i, 1);
            if (!store.notes[p.id].length) delete store.notes[p.id];
            dropSavedIfUnused(p.id);
            save(); paintThread(); paintActions(); renderNav();
          } }, icon('x')),
          h('div', { class: 'memo-meta' },
            h('time', { datetime: new Date(n.ts).toISOString() }, stamp(n.ts)),
            n.kind === 'q' && h('a', { class: 'text-btn', href: claudeUrl(p, n.quote, n.text), target: '_blank', rel: 'noopener noreferrer' }, 'Claude에서 다시 묻기')
          )
        )),
        draft.quote && h('div', { class: 'draft-quote' },
          h('p', { class: 'quote' }, draft.quote),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': '인용 빼기', title: '인용 빼기', onclick: () => { draft.quote = ''; paintThread(); } }, icon('x'))
        ),
        h('div', { class: 'composer' },
          area,
          h('div', { class: 'composer-actions' },
            h('button', { class: 'btn', type: 'button', title: 'Claude 새 대화에 논문 정보와 질문을 넣어 엽니다', onclick: ask }, 'Claude에 묻기'),
            h('button', { class: 'btn-primary', type: 'button', onclick: () => { if (addNote()) $('memo-' + p.id).focus(); } }, '남기기')
          )
        )
      );
    }
    function toggleThread(force) {
      const open = force != null ? force : thread.hidden;
      thread.hidden = !open;
      noteBtn.setAttribute('aria-expanded', String(open));
      if (open) { state.open.add(p.id); paintThread(); } else state.open.delete(p.id);
    }
    body.append(thread);
    paintActions();
    if (state.open.has(p.id) || (state.view === 'notes' && notes().length)) toggleThread(true);

    const post = h('article', { class: 'post', 'data-id': p.id },
      h('button', { class: 'avatar', type: 'button', 'aria-label': author.name ? `${author.name}의 논문 보기` : '저자', onclick: openAuthor }, initialsOf(author.name)),
      body);
    post._p = p;
    post._paint = paintActions;
    post._quote = (text, ask) => {
      draft.quote = text.slice(0, QUOTE_MAX);
      draft.ask = ask;
      toggleThread(true);
      $('memo-' + p.id).focus();
    };
    if (TR.auto && needsTr(p)) trEnqueue(p);
    return post;
  }
  function repaint(p) {
    document.querySelectorAll('.post').forEach(el => { if (el._p && el._p.id === p.id) el.replaceWith(renderPost(el._p)); });
  }

  function dropSavedIfUnused(id) {
    if (!store.likes[id] && !(store.notes[id] && store.notes[id].length)) delete store.saved[id];
  }
  function toggleLike(p) {
    if (store.likes[p.id]) delete store.likes[p.id];
    else { store.likes[p.id] = Date.now(); store.saved[p.id] = p; }
    dropSavedIfUnused(p.id);
    save();
    if (!byId.has(p.id) && store.saved[p.id]) { byId.set(p.id, p); papers.push(p); }
    renderNav(); renderShares();
    if (state.view === 'likes') return renderFeed(true);
    document.querySelectorAll('.post').forEach(el => { if (el._p && el._p.id === p.id && el._paint) el._paint(); });
  }

  // ---------- 드래그한 문장에 뜨는 버튼 ----------

  const pop = h('div', { class: 'popover', hidden: true, role: 'toolbar', 'aria-label': '선택한 문장' });
  let picked = null;
  pop.append(
    h('button', { type: 'button', onmousedown: e => e.preventDefault(), onclick: () => usePick(false) }, '인용해 의견'),
    h('button', { type: 'button', onmousedown: e => e.preventDefault(), onclick: () => usePick(true) }, 'Claude에 질문')
  );
  document.body.append(pop);
  function usePick(ask) {
    if (!picked) return;
    const { post, text } = picked;
    hidePop();
    window.getSelection().removeAllRanges();
    post._quote(text, ask);
  }
  function hidePop() { pop.hidden = true; picked = null; }
  function checkSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hidePop();
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const region = node && node.closest('.quotable');
    const post = region && region.closest('.post');
    if (!post || text.length < 2 || !post.contains(sel.focusNode)) return hidePop();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    picked = { post, text };
    pop.hidden = false;
    const w = pop.offsetWidth, ht = pop.offsetHeight;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = rect.top - ht - 8 < 8 ? rect.bottom + 8 : rect.top - ht - 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  document.addEventListener('mouseup', () => setTimeout(checkSelection, 0));
  document.addEventListener('touchend', () => setTimeout(checkSelection, 0));
  document.addEventListener('keyup', e => { if (e.shiftKey || e.key === 'Shift') checkSelection(); });
  document.addEventListener('mousedown', e => { if (!pop.contains(e.target)) hidePop(); });
  window.addEventListener('scroll', hidePop, { passive: true });

  // ---------- 피드 ----------

  const EMPTY = {
    likes: '좋아요를 누른 논문이 여기에 모입니다',
    notes: '의견을 남긴 논문이 여기에 모입니다',
    author: '이 저자의 논문을 찾지 못했습니다',
    home: '조건에 맞는 논문이 없습니다',
  };
  function renderFeed(keepScroll) {
    list = computeList();
    if (!keepScroll) state.shown = PAGE;
    const feed = $('feed');
    feed.replaceChildren(...list.slice(0, state.shown).map(renderPost));
    if (!list.length) feed.append(h('p', { class: 'empty' }, EMPTY[state.view] || EMPTY.home));
  }
  function showMore() {
    if (state.shown >= list.length) return;
    const next = list.slice(state.shown, state.shown + PAGE);
    state.shown += next.length;
    $('feed').append(...next.map(renderPost));
  }

  // ---------- 내비게이션 ----------

  const VIEWS = [
    { id: 'home', name: '홈', icon: 'home' },
    { id: 'likes', name: '좋아요', icon: 'heart', count: () => Object.keys(store.likes).length },
    { id: 'notes', name: '내 의견', icon: 'note', count: () => Object.values(store.notes).reduce((s, a) => s + a.length, 0) },
    { id: 'settings', name: '지분', icon: 'sliders', narrow: true },
  ];
  const TABS = [{ id: 'for', name: '추천' }, { id: 'new', name: '최신' }, { id: 'classic', name: '고전' }];

  function go(view, opts) {
    if (view === 'home' && state.view === 'home') state.shuffle = Date.now();
    state.view = view;
    state.author = (opts && opts.author) || null;
    state.trend = (opts && opts.trend) || null;
    document.body.dataset.view = view;
    hidePop();
    renderNav(); renderHead();
    if (view !== 'settings') renderFeed();
    window.scrollTo({ top: 0 });
    if (view === 'author') loadAuthor(state.author);
  }
  async function loadAuthor(a) {
    if (!a.id || authorCache[a.id]) return;
    try {
      const u = new URL('https://api.openalex.org/works');
      u.searchParams.set('filter', 'authorships.author.id:' + a.id);
      u.searchParams.set('sort', 'publication_date:desc');
      u.searchParams.set('per-page', '25');
      u.searchParams.set('select', SELECT);
      if (store.apiKey) u.searchParams.set('api_key', store.apiKey);
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      authorCache[a.id] = ((await r.json()).results || []).map(compact).filter(p => p.title).map(p => ({ ...p, topic: classify(p) }));
    } catch { authorCache[a.id] = []; a.failed = true; }
    if (state.view === 'author' && state.author === a) { renderHead(); renderFeed(true); }
  }
  function renderNav() {
    const item = (v, cls) => {
      const n = v.count ? v.count() : 0;
      return h('button', { class: cls + (v.narrow ? ' only-narrow' : ''), type: 'button', 'aria-current': state.view === v.id ? 'page' : null, onclick: () => go(v.id) },
        icon(v.icon), h('span', null, v.name), cls === 'nav-item' && n > 0 && h('span', { class: 'n' }, num(n)));
    };
    $('nav').replaceChildren(...VIEWS.map(v => item(v, 'nav-item')));
    $('tabbar').replaceChildren(...VIEWS.map(v => item(v, 'tab-item')));
  }
  function renderHead() {
    const v = VIEWS.find(x => x.id === state.view);
    const sub = state.view === 'author' || state.view === 'trend';
    $('viewTitle').textContent = v ? v.name : state.view === 'author' ? '저자' : '동향';
    $('back').hidden = !sub;
    const home = state.view === 'home';
    $('tabs').hidden = !home;
    $('tabs').replaceChildren(...TABS.map(t => h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(state.tab === t.id), onclick: () => { state.tab = t.id; renderHead(); renderFeed(); window.scrollTo({ top: 0 }); } }, t.name)));

    const profile = $('profile');
    profile.hidden = !sub;
    if (state.view === 'author') {
      const a = state.author;
      const local = papers.filter(p => (a.id && (p.aids || []).includes(a.id)) || (p.authors || []).includes(a.name)).length;
      const fetched = a.id ? authorCache[a.id] : [];
      const status = !a.id ? '' : !fetched ? ' · 다른 논문을 불러오는 중' : a.failed ? ' · 다른 논문은 불러오지 못했습니다' : ` · 최근 논문 ${num(byAuthor(a).length)}편`;
      profile.replaceChildren(
        h('div', { class: 'avatar big', 'aria-hidden': 'true' }, initialsOf(a.name)),
        h('div', { class: 'profile-main' },
          h('h2', null, a.name),
          h('p', null, `이 피드에 ${num(local)}편${status}`),
          a.id && h('a', { class: 'src', href: 'https://openalex.org/authors/' + a.id, target: '_blank', rel: 'noopener noreferrer' }, 'openalex.org/authors/' + a.id)
        )
      );
    } else if (state.view === 'trend') {
      const t = state.trend;
      profile.replaceChildren(h('div', { class: 'profile-main' }, h('h2', null, t.name), h('p', null, `최근 90일 ${num(t.n)}편 · ${t.delta}`)));
    }
    renderTopics();
  }
  function renderTopics() {
    const counts = {};
    for (const p of papers) counts[p.topic] = (counts[p.topic] || 0) + 1;
    const pick = id => { state.topic = id; if (state.view !== 'home') go('home'); else { renderTopics(); renderFeed(); window.scrollTo({ top: 0 }); } };
    const rows = [{ id: 'all', name: '전체', n: papers.length }, ...TOPICS.map(t => ({ ...t, n: counts[t.id] || 0 }))];
    $('topics').replaceChildren(...rows.map(t => h('button', { class: 'topic', type: 'button', 'aria-pressed': String(state.topic === t.id), onclick: () => pick(t.id) },
      h('span', { class: 'dot-box' }, t.id !== 'all' && h('i', { class: 'dot' + (t.mine ? ' mine' : '') })), h('span', null, t.name), h('span', { class: 'n' }, num(t.n)))));
    $('topicStrip').replaceChildren(...rows.map(t => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.topic === t.id), onclick: () => pick(t.id) },
      t.id !== 'all' && h('i', { class: 'dot' + (t.mine ? ' mine' : '') }), t.name)));
  }

  // ---------- 오른쪽 패널 ----------

  function renderShares() {
    const w = effWeights();
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    const top = Math.max(...Object.values(w), 1);
    $('shares').replaceChildren(...TOPICS.map(t => {
      const b = baseWeight(t.id);
      const set = v => { store.weights[t.id] = v; save(); renderShares(); if (state.view === 'home' && state.tab === 'for') renderFeed(); };
      const fill = h('i', { class: 'fill' });
      fill.style.transform = `scaleX(${(w[t.id] / top).toFixed(3)})`;
      return h('div', { class: 'share' + (t.mine ? ' is-mine' : '') },
        h('span', { class: 'nm' }, h('i', { class: 'dot' + (t.mine ? ' mine' : '') }), h('span', null, t.name)),
        h('span', { class: 'pct' }, Math.round((w[t.id] / total) * 100) + '%'),
        h('span', { class: 'stepper' },
          h('button', { type: 'button', 'aria-label': `${t.name} 지분 줄이기`, disabled: b <= 0, onclick: () => set(Math.max(0, b - 1)) }, icon('minus')),
          h('output', null, b),
          h('button', { type: 'button', 'aria-label': `${t.name} 지분 늘리기`, disabled: b >= MAX_WEIGHT, onclick: () => set(Math.min(MAX_WEIGHT, b + 1)) }, icon('plus'))
        ),
        h('span', { class: 'track' }, fill)
      );
    }));
  }

  // 최근 26주 동안 게재된 논문 수. 포렌식 타임라인 분석의 히스토그램과 같은 모양이다.
  function renderChart() {
    const WEEKS = 26, WEEK = 7 * DAY;
    const end = Date.now();
    const start = end - WEEKS * WEEK;
    const weeks = Array.from({ length: WEEKS }, (_, i) => ({ from: start + i * WEEK, mine: 0, rest: 0 }));
    for (const p of papers) {
      const ms = dateMs(p);
      if (p.classic || ms <= start || ms > end) continue;
      const wk = weeks[Math.min(WEEKS - 1, Math.floor((ms - start) / WEEK))];
      if (TOPIC[p.topic] && TOPIC[p.topic].mine) wk.mine++; else wk.rest++;
    }
    const peak = Math.max(...weeks.map(m => m.mine + m.rest), 1);
    const step = peak <= 4 ? 2 : peak <= 10 ? 5 : peak <= 20 ? 10 : 25;
    const top = Math.ceil(peak / step) * step;
    const W = 310, H = 148, L = 24, T = 8, B = 124;
    const slot = (W - L) / WEEKS, bw = slot - 3;
    const y = v => B - (v / top) * (B - T);
    const el = (name, attrs, text) => { const e = document.createElementNS(SVG_NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '최근 26주 주별 논문 수' });
    for (const v of [0, top / 2, top]) {
      svg.append(el('line', { class: 'grid', x1: L, x2: W, y1: y(v), y2: y(v) }));
      svg.append(el('text', { class: 'axis', x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, v));
    }
    let lastMonth = -1;
    weeks.forEach((m, i) => {
      const x = L + i * slot + 1.5;
      const d = new Date(m.from);
      const g = el('g', {});
      g.append(el('title', {}, `${isoDay(d)}부터 한 주 · 내 분야 ${m.mine}편, 그 외 ${m.rest}편`));
      if (m.rest) g.append(el('rect', { class: 'b-rest', x, y: y(m.mine + m.rest), width: bw, height: Math.max(1, y(m.mine) - y(m.mine + m.rest) - (m.mine ? 1 : 0)), rx: 1.5 }));
      if (m.mine) g.append(el('rect', { class: 'b-mine', x, y: y(m.mine), width: bw, height: Math.max(1, B - y(m.mine)), rx: 1.5 }));
      svg.append(g);
      const month = new Date(m.from + WEEK - DAY).getMonth();
      if (month !== lastMonth && i > 0 && i < WEEKS - 1) svg.append(el('text', { class: 'axis ko', x, y: H - 6 }, `${month + 1}월`));
      lastMonth = month;
    });
    $('chart').replaceChildren(svg);
    const mine = weeks.reduce((s, m) => s + m.mine, 0), all = mine + weeks.reduce((s, m) => s + m.rest, 0);
    $('chartHint').textContent = `최근 26주에 게재된 ${num(all)}편 가운데 ${num(mine)}편이 내 분야입니다`;
  }

  // 최근 90일에 많이 나온 주제어. 직전 90일과 비교한다.
  function renderTrends() {
    const now = Date.now();
    const recent = [], prev = [];
    for (const p of papers) {
      const ms = dateMs(p);
      if (p.classic || !ms) continue;
      const age = (now - ms) / DAY;
      if (age <= 90) recent.push(p); else if (age <= 180) prev.push(p);
    }
    const count = (arr, i) => arr.reduce((s, p) => s + (hasTrend(p, i) ? 1 : 0), 0);
    const rows = TRENDS.map(([name], i) => ({ name, i, n: count(recent, i), m: count(prev, i) }))
      .filter(r => r.n > 0).sort((a, b) => b.n - a.n || (b.n - b.m) - (a.n - a.m)).slice(0, 7);
    for (const r of rows) {
      const d = r.n - r.m;
      r.delta = d > 0 ? `직전 90일보다 ${d}편 많음` : d < 0 ? `직전 90일보다 ${-d}편 적음` : '직전 90일과 같음';
    }
    $('trends').replaceChildren(...rows.map((r, i) => h('button', { class: 'trend', type: 'button', onclick: () => go('trend', { trend: r }) },
      h('span', { class: 'rank' }, i + 1),
      h('span', { class: 'trend-main' }, h('span', { class: 'nm' }, r.name), h('span', { class: 'sub' }, r.delta)),
      h('span', { class: 'fig' }, `${num(r.n)}편`))));
  }

  function lastSync() { return (store.cache && store.cache.at) || (SEED.builtAt ? Date.parse(SEED.builtAt) : 0); }
  function renderStatus() {
    const at = lastSync();
    const line = at ? `마지막 수집 ${stamp(at)}` : '아직 수집 전';
    $('sideFoot').textContent = line;
    $('dataStatus').textContent = `${line} · OpenAlex · 심사 저널과 arXiv ${SEED.sourceIds.length}곳 · 전체 ${num(papers.length)}편`;
  }

  // ---------- 새로고침 ----------

  let noticeTimer = 0;
  function notice(text, action) {
    clearTimeout(noticeTimer);
    const box = $('notice');
    if (!text && !action) return box.replaceChildren();
    box.replaceChildren(action || h('span', { class: 'msg' }, text));
    if (!action) noticeTimer = setTimeout(() => box.replaceChildren(), 6000);
  }

  async function fetchLive() {
    const src = SEED.sourceIds.join('|');
    const out = new Map();
    for (const [expr, from, per] of JOBS) {
      const u = new URL('https://api.openalex.org/works');
      u.searchParams.set('filter', `title_and_abstract.search:${expr},primary_location.source.id:${src},from_publication_date:${offsetDay(from)},to_publication_date:${offsetDay(45)},has_abstract:true`);
      u.searchParams.set('sort', 'publication_date:desc');
      u.searchParams.set('per-page', String(per));
      u.searchParams.set('select', SELECT);
      if (store.apiKey) u.searchParams.set('api_key', store.apiKey);
      const r = await fetch(u);
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      for (const w of (await r.json()).results || []) { const p = compact(w); if (p.title && !out.has(p.id)) out.set(p.id, p); }
    }
    return [...out.values()];
  }
  function applyFresh(items) {
    store.cache = { at: Date.now(), items };
    save();
    state.pending = null;
    state.shuffle = Date.now();
    refreshAll();
  }
  function refreshAll() {
    rebuildPapers(); save();
    renderNav(); renderHead(); renderShares(); renderChart(); renderTrends(); renderStatus();
    if (state.view !== 'settings') renderFeed();
  }

  let busy = false;
  async function refresh(manual) {
    if (busy) return;
    if (manual && Date.now() - store.lastFetch < THROTTLE) {
      state.shuffle = Date.now();
      if (state.pending) applyFresh(state.pending); else renderFeed();
      window.scrollTo({ top: 0 });
      return notice('방금 확인했습니다 · 피드를 다시 섞었습니다');
    }
    busy = true;
    $('refresh').classList.add('busy');
    try {
      const items = await fetchLive();
      store.lastFetch = Date.now();
      const fresh = items.filter(p => relevant(p) && !byId.has(p.id)).length;
      if (manual) {
        applyFresh(items);
        window.scrollTo({ top: 0 });
        notice(fresh ? `새 논문 ${fresh}편을 받아왔습니다` : '새 논문은 없습니다 · 피드를 다시 섞었습니다');
      } else if (fresh) {
        state.pending = items;
        save();
        notice('', h('button', { class: 'btn-primary', type: 'button', onclick: () => { applyFresh(items); notice(''); window.scrollTo({ top: 0 }); } }, `새 논문 ${fresh}편 보기`));
      } else {
        store.cache = { at: Date.now(), items };
        save(); renderStatus();
      }
    } catch (e) {
      if (manual) { state.shuffle = Date.now(); renderFeed(); }
      if (e.status === 429) notice('오늘 무료 조회 한도를 다 썼습니다 · 내일 다시 받아오거나 OpenAlex 키를 넣으세요');
      else if (manual) notice('받아오지 못했습니다 · 저장된 목록을 다시 섞었습니다');
    } finally {
      busy = false;
      $('refresh').classList.remove('busy');
    }
  }
  // 열어 둔 동안에도 3시간마다 새 논문이 있는지 본다
  function autoCheck() {
    if (document.visibilityState === 'visible' && Date.now() - Math.max(lastSync(), store.lastFetch) > STALE_AFTER) refresh(false);
  }

  // ---------- DOI로 추가, 키, 백업 ----------

  async function addByDoi(raw) {
    const doi = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return notice('DOI 형식이 아닙니다 · 10.으로 시작하는 번호를 넣으세요');
    const u = new URL('https://api.openalex.org/works');
    u.searchParams.set('filter', 'doi:' + doi);
    u.searchParams.set('select', SELECT);
    if (store.apiKey) u.searchParams.set('api_key', store.apiKey);
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const w = ((await r.json()).results || [])[0];
      if (!w) return notice('OpenAlex에서 이 DOI를 찾지 못했습니다');
      const p = compact(w);
      p.topic = classify(p);
      store.added = [p, ...store.added.filter(x => x.id !== p.id)];
      save();
      $('doi').value = '';
      state.shuffle = Date.now();
      refreshAll();
      notice(`추가했습니다 · ${TOPIC[p.topic].name} 주제의 맨 앞에 나옵니다`);
    } catch { notice('논문 정보를 받아오지 못했습니다 · 잠시 뒤 다시 해 보세요'); }
  }

  function exportData() {
    const data = { app: 'supertimeline', at: new Date().toISOString(), likes: store.likes, notes: store.notes, saved: store.saved, weights: store.weights, added: store.added };
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: `supertimeline-${isoDay(new Date())}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importData(file) {
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'supertimeline') throw new Error('다른 파일');
      Object.assign(store.likes, d.likes || {});
      Object.assign(store.saved, d.saved || {});
      Object.assign(store.weights, d.weights || {});
      for (const id in d.notes || {}) {
        const have = new Set((store.notes[id] || []).map(n => n.ts));
        store.notes[id] = [...(store.notes[id] || []), ...d.notes[id].filter(n => !have.has(n.ts))];
      }
      const ids = new Set(store.added.map(p => p.id));
      store.added.push(...(d.added || []).filter(p => p && p.id && !ids.has(p.id)));
      save(); refreshAll();
      notice('백업을 가져왔습니다');
    } catch { notice('가져올 수 없는 파일입니다 · 이 사이트에서 내보낸 파일을 고르세요'); }
  }

  // ---------- 시작 ----------

  $('brand').addEventListener('click', e => { e.preventDefault(); go('home'); });
  $('back').addEventListener('click', () => go('home'));
  $('refresh').addEventListener('click', () => refresh(true));
  const paintTheme = () => {
    const black = document.documentElement.dataset.theme === 'black';
    $('theme').title = black ? '화이트 테마로' : '블랙 테마로';
    $('themeColor').content = black ? '#000000' : '#ffffff';
  };
  $('theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'black' ? 'white' : 'black';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('supertimeline.theme', next); } catch { /* 저장이 안 돼도 이번 화면에서는 바뀐다 */ }
    paintTheme();
  });
  paintTheme();
  let qTimer = 0;
  $('q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); if (state.view === 'settings') return; renderFeed(); }, 160); });
  $('resetWeights').addEventListener('click', () => { store.weights = {}; save(); renderShares(); if (state.view === 'home' && state.tab === 'for') renderFeed(); });
  $('addForm').addEventListener('submit', e => { e.preventDefault(); addByDoi($('doi').value); });
  $('apiKey').value = store.apiKey || '';
  $('apiKey').addEventListener('change', e => { store.apiKey = e.target.value.trim(); save(); });
  $('exportBtn').addEventListener('click', exportData);
  $('importFile').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) showMore(); }, { rootMargin: '600px' }).observe($('sentinel'));

  rebuildPapers(); save();
  renderNav(); renderHead(); renderShares(); renderChart(); renderTrends(); renderStatus(); renderFeed();
  trInit().then(() => { if (TR.avail !== 'unknown' && state.view !== 'settings') renderFeed(true); });
  autoCheck();
  setInterval(autoCheck, 30 * 60000);
  document.addEventListener('visibilitychange', autoCheck);
})();
