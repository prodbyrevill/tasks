/* =============================================================
   ЗАДАЧНИК — мини-апп для Telegram
   Логика и данные. Внешний вид — в styles.css.
   ============================================================= */
(() => {
  'use strict';

  // ---------------------------------------------------------------
  // Окружение
  // ---------------------------------------------------------------
  const tg = window.Telegram && window.Telegram.WebApp;
  const IN_TG = !!(tg && tg.initData);
  const API_URL = (window.APP_CONFIG || {}).API_URL || '';
  const DEMO = !IN_TG; // открыто в обычном браузере → демо-данные, ничего не сохраняется

  const QUADS = {
    1: { short: 'Срочно·важно', long: 'Срочно и важно', hint: 'Сделать сейчас' },
    2: { short: 'Важно', long: 'Важно, не срочно', hint: 'Запланировать' },
    3: { short: 'Срочно', long: 'Срочно, не важно', hint: 'Быстро закрыть' },
    4: { short: 'Потом', long: 'Не срочно, не важно', hint: 'Когда-нибудь' },
  };
  const PALETTE = ['#E5484D', '#F76B15', '#F5A524', '#30A46C', '#12A594', '#0090FF',
    '#3E63DD', '#8E4EC6', '#D6409F', '#A18072', '#6E56CF', '#8E8E93'];
  const REPEATS = [['', 'Не повторять'], ['daily', 'Каждый день'], ['weekly', 'Каждую неделю'],
    ['monthly', 'Каждый месяц'], ['days', 'Каждые N дней']];
  const TITLES = { today: 'Сегодня', inbox: 'Инбокс', all: 'Все задачи', week: 'Неделя' };
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  // ---------------------------------------------------------------
  // Состояние
  // ---------------------------------------------------------------
  const S = {
    tasks: [],
    projects: [],
    loaded: false,
    tab: 'today',
    search: '',
    filter: 'all',
    showDone: false,
    weekOffset: 0,
    lastSync: 0,
    fatal: null,
    triage: null, // очередь id при разборе инбокса
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $('#view');

  // ---------------------------------------------------------------
  // Утилиты
  // ---------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dstr(new Date());
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
  const addMonths = (s, n) => {
    const [y, m, d] = s.split('-').map(Number);
    const last = new Date(y, m - 1 + n + 1, 0).getDate();
    return dstr(new Date(y, m - 1 + n, Math.min(d, last)));
  };
  const mondayOf = s => addDays(s, -((parseD(s).getDay() + 6) % 7));
  const isoDay = iso => dstr(new Date(iso));
  const nowISO = () => new Date().toISOString();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function fmtMin(min) {
    min = Math.round(min || 0);
    if (!min) return '0 мин';
    const h = Math.floor(min / 60), m = min % 60;
    return (h ? h + ' ч' : '') + (h && m ? ' ' : '') + (m ? m + ' мин' : '');
  }

  function shortDate(s) {
    const td = today();
    if (s === td) return 'Сегодня';
    if (s === addDays(td, 1)) return 'Завтра';
    if (s === addDays(td, -1)) return 'Вчера';
    const d = parseD(s);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + (sameYear ? '' : ' ' + d.getFullYear()) + ', ' + WD_SHORT[d.getDay()];
  }

  function longDate(s) {
    const d = parseD(s);
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function rangeLabel(a, b) {
    const da = parseD(a), db = parseD(b);
    return da.getMonth() === db.getMonth()
      ? da.getDate() + '–' + db.getDate() + ' ' + MONTHS[db.getMonth()]
      : da.getDate() + ' ' + MONTHS_SHORT[da.getMonth()] + ' – ' + db.getDate() + ' ' + MONTHS_SHORT[db.getMonth()];
  }

  function ago(iso) {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
    if (days <= 0) return 'сегодня';
    if (days === 1) return 'вчера';
    return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
  }

  const proj = id => S.projects.find(p => p.id === id);
  const activeProjects = () => S.projects.filter(p => !p.archived).sort((a, b) => (a.order || 0) - (b.order || 0));

  function byPlan(a, b) {
    return (a.due_date || '9999').localeCompare(b.due_date || '9999') ||
      (a.quadrant || 5) - (b.quadrant || 5) ||
      (a.due_time || '99').localeCompare(b.due_time || '99') ||
      (a.created_at || '').localeCompare(b.created_at || '');
  }

  function parsePrefix(text) {
    const m = /^\s*([^:\n]{1,30}):\s*([\s\S]*)$/.exec(text);
    if (m) {
      const p = activeProjects().find(pr => pr.name.toLowerCase() === m[1].trim().toLowerCase());
      if (p) return { project: p.id, text: m[2] };
    }
    return { project: '', text };
  }

  function extractLinks(text) {
    const out = [];
    const re = /(https?:\/\/[^\s<>"']+)|(\bt\.me\/[^\s<>"']+)/g;
    let m;
    while ((m = re.exec(text || ''))) out.push(m[1] || 'https://' + m[2]);
    return [...new Set(out)];
  }

  function openUrl(u) {
    if (tg && IN_TG) {
      if (/^https?:\/\/t\.me\//.test(u)) tg.openTelegramLink(u);
      else tg.openLink(u);
    } else {
      window.open(u, '_blank');
    }
  }

  function hap(kind) {
    try {
      const h = tg && tg.HapticFeedback;
      if (!h) return;
      if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
      else if (kind === 'select') h.selectionChanged();
      else h.impactOccurred(kind || 'light');
    } catch (e) { /* старые клиенты */ }
  }

  function newTask(fields) {
    const now = nowISO();
    return Object.assign({
      id: uid(), title: '', note: '', project: '', status: 'inbox', due_date: '', due_time: '',
      quadrant: null, subtasks: [], repeat: null, created_at: now, updated_at: now, done_at: '',
      spent_min: null, postpone_count: 0, source: 'app',
    }, fields);
  }

  // ---------------------------------------------------------------
  // Локальное хранилище (кэш для мгновенного открытия + очередь несохранённого)
  // ---------------------------------------------------------------
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет места/запрещено */ } },
  };
  let queue = [];

  function saveCache() {
    if (DEMO) return;
    LS.set('tm_cache', { tasks: S.tasks, projects: S.projects });
  }
  function saveQueue() { if (!DEMO) LS.set('tm_queue', queue); }

  // ---------------------------------------------------------------
  // Сервер
  // ---------------------------------------------------------------
  const FATAL = {
    NO_OWNER: 'Бот ещё не знает, что ты его хозяин. Отправь боту /start и подожди минуту.',
    NOT_OWNER: 'Этот задачник привязан к другому аккаунту Telegram.',
    BAD_SIGNATURE: 'Токен в Apps Script не от этого бота. Проверь BOT_TOKEN и сделай новое развёртывание.',
    NO_INIT_DATA: 'Открой приложение через бота в Telegram.',
    BAD_RESPONSE: 'Сервер отвечает не так, как нужно. Проверь, что в развёртывании Apps Script доступ стоит «Все».',
    NO_API: 'В файле config.js не указана ссылка на Apps Script.',
  };

  async function api(action, payload) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action, payload: payload || {}, initData: tg ? tg.initData : '' }),
        redirect: 'follow',
      });
    } catch (e) {
      throw Object.assign(new Error('NETWORK'), { network: true });
    }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('BAD_RESPONSE'); }
    if (!j.ok) throw new Error(j.error || 'ERROR');
    return j.data;
  }

  let flushing = false;
  function enqueue(action, payload) {
    if (DEMO) return;
    queue.push({ action, payload });
    saveQueue();
    flush();
  }

  async function flush() {
    if (DEMO || flushing || S.fatal) return;
    if (!queue.length) { setSync('ok'); return; }
    flushing = true;
    setSync('saving');
    while (queue.length) {
      try {
        await api(queue[0].action, queue[0].payload);
        queue.shift();
        saveQueue();
      } catch (e) {
        flushing = false;
        if (FATAL[e.message]) { setFatal(e.message); return; }
        setSync(e.network ? 'offline' : 'error');
        setTimeout(flush, 8000);
        return;
      }
    }
    flushing = false;
    setSync('ok');
  }

  function applyQueueLocally() {
    queue.forEach(job => {
      if (job.action === 'saveTasks') job.payload.tasks.forEach(upsertLocal);
      if (job.action === 'deleteTask') S.tasks = S.tasks.filter(t => t.id !== job.payload.id);
      if (job.action === 'saveProjects') job.payload.projects.forEach(p => {
        const i = S.projects.findIndex(x => x.id === p.id);
        if (i >= 0) S.projects[i] = p; else S.projects.push(p);
      });
    });
  }

  async function load() {
    if (DEMO || S.fatal) return;
    setSync('saving');
    try {
      const data = await api('bootstrap');
      S.tasks = data.tasks || [];
      S.projects = data.projects || [];
      applyQueueLocally();
      S.loaded = true;
      S.lastSync = Date.now();
      saveCache();
      render();
      setSync(queue.length ? 'saving' : 'ok');
      flush();
    } catch (e) {
      if (FATAL[e.message]) { setFatal(e.message); return; }
      setSync(e.network ? 'offline' : 'error');
      if (!S.loaded) toast('Не получилось загрузить задачи. Нажми ↻ сверху, чтобы попробовать ещё раз.');
    }
  }

  function setFatal(code) {
    S.fatal = code;
    setSync('error');
    banner(FATAL[code] || code, 'error');
  }

  function setSync(state) {
    $('#sync').dataset.state = state;
    $('#sync').title = { ok: 'Всё сохранено', saving: 'Сохраняю…', error: 'Ошибка — нажми, чтобы повторить', offline: 'Нет связи — сохраню позже' }[state] || '';
  }

  function banner(text, kind) {
    const b = $('#banner');
    if (!text) { b.hidden = true; return; }
    b.hidden = false;
    b.className = kind || '';
    b.textContent = text;
  }

  // ---------------------------------------------------------------
  // Изменение данных
  // ---------------------------------------------------------------
  function upsertLocal(t) {
    const i = S.tasks.findIndex(x => x.id === t.id);
    if (i >= 0) S.tasks[i] = t; else S.tasks.push(t);
  }

  function saveTasks(list) {
    const now = nowISO();
    list = list.map(t => Object.assign(clone(t), { updated_at: now }));
    list.forEach(upsertLocal);
    saveCache();
    render();
    enqueue('saveTasks', { tasks: list });
  }

  function removeTask(id) {
    S.tasks = S.tasks.filter(t => t.id !== id);
    saveCache();
    render();
    enqueue('deleteTask', { id });
  }

  function saveProjects(list) {
    list.forEach(p => {
      const i = S.projects.findIndex(x => x.id === p.id);
      if (i >= 0) S.projects[i] = clone(p); else S.projects.push(clone(p));
    });
    saveCache();
    render();
    enqueue('saveProjects', { projects: clone(list) });
  }

  function nextDue(t) {
    const r = t.repeat;
    const td = today();
    const step = s => r.type === 'daily' ? addDays(s, 1)
      : r.type === 'weekly' ? addDays(s, 7)
        : r.type === 'days' ? addDays(s, Math.max(1, Number(r.n) || 1))
          : addMonths(s, 1);
    let d = step(t.due_date || td);
    let guard = 0;
    while (d <= td && guard++ < 1000) d = step(d);
    return d;
  }

  function completeTask(t) {
    askSpent(t, minutes => {
      const prev = clone(t);
      const done = Object.assign(clone(t), {
        status: 'done', done_at: nowISO(), spent_min: minutes == null ? t.spent_min : minutes,
      });
      const list = [done];
      let next = null;
      if (t.repeat && t.repeat.type) {
        next = Object.assign(clone(t), {
          id: uid(), status: 'active', due_date: nextDue(t), done_at: '', spent_min: null,
          postpone_count: 0, created_at: nowISO(), source: 'repeat',
          subtasks: (t.subtasks || []).map(s => Object.assign({}, s, { done: false })),
        });
        list.push(next);
      }
      saveTasks(list);
      hap('success');
      toast(next ? 'Готово. Следующая — ' + shortDate(next.due_date).toLowerCase() : 'Готово 👍', {
        label: 'Отменить',
        fn: () => { saveTasks([prev]); if (next) removeTask(next.id); },
      });
    });
  }

  function reopenTask(t) {
    saveTasks([Object.assign(clone(t), { status: 'active', done_at: '' })]);
    hap('light');
  }

  // ---------------------------------------------------------------
  // Компоненты
  // ---------------------------------------------------------------
  function projTag(p) {
    return p ? '<span class="tag"><i style="--c:' + esc(p.color) + '"></i>' + esc(p.name) + '</span>' : '';
  }

  function taskRow(t, o = {}) {
    const p = proj(t.project);
    const isDone = t.status === 'done';
    const overdue = !isDone && t.due_date && t.due_date < today();
    const subs = t.subtasks || [];
    const meta = [];
    if (o.showQuad !== false && t.quadrant && !isDone) meta.push('<span class="qtag q' + t.quadrant + '">' + QUADS[t.quadrant].short + '</span>');
    if (p) meta.push(projTag(p));
    if (o.showDate && t.due_date) meta.push('<span class="' + (overdue ? 'red' : '') + '">' + esc(shortDate(t.due_date)) + '</span>');
    if (t.due_time) meta.push('<span>' + esc(t.due_time) + '</span>');
    if (subs.length) meta.push('<span>☑ ' + subs.filter(s => s.done).length + '/' + subs.length + '</span>');
    if (t.repeat && t.repeat.type) meta.push('<span title="Повторяется">↻</span>');
    if (t.note) meta.push('<span title="Есть заметка">✎</span>');
    if (isDone && t.spent_min) meta.push('<span>⏱ ' + fmtMin(t.spent_min) + '</span>');
    if (o.showAge) meta.push('<span class="muted">' + (t.source === 'forward' ? '↪ ' : t.source === 'bot' ? '✈ ' : '') + ago(t.created_at) + '</span>');
    if (o.showPostponed && t.postpone_count) meta.push('<span class="red">перенос ×' + t.postpone_count + '</span>');

    return '<div class="task' + (isDone ? ' done' : '') + '" data-id="' + esc(t.id) + '">' +
      '<button class="check q' + (t.quadrant || 0) + '" data-act="toggle" aria-label="' + (isDone ? 'Вернуть' : 'Выполнено') + '"></button>' +
      '<div class="task-main" data-act="open">' +
      '<div class="task-title">' + esc(t.title || 'Без названия') + '</div>' +
      (meta.length ? '<div class="task-meta">' + meta.join('') + '</div>' : '') +
      '</div></div>';
  }

  function section(title, tasks, o = {}) {
    if (!tasks.length) return '';
    return '<section class="group' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<h2>' + title + ' <span class="count">' + tasks.length + '</span></h2>' +
      '<div class="card">' + tasks.map(t => taskRow(t, o)).join('') + '</div></section>';
  }

  function empty(icon, title, text, btn) {
    return '<div class="empty"><div class="empty-icon">' + icon + '</div><h3>' + title + '</h3>' +
      (text ? '<p>' + text + '</p>' : '') + (btn || '') + '</div>';
  }

  // ---------------------------------------------------------------
  // Экран «Сегодня»
  // ---------------------------------------------------------------
  function viewToday() {
    const td = today();
    const open = S.tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date <= td);
    const overdue = open.filter(t => t.due_date < td).sort(byPlan);
    const todays = open.filter(t => t.due_date === td).sort(byPlan);
    const doneToday = S.tasks.filter(t => t.status === 'done' && t.done_at && isoDay(t.done_at) === td)
      .sort((a, b) => b.done_at.localeCompare(a.done_at));
    const inboxN = S.tasks.filter(t => t.status === 'inbox').length;
    const total = open.length + doneToday.length;
    const pct = total ? Math.round(doneToday.length / total * 100) : 0;
    const minutes = doneToday.reduce((s, t) => s + (t.spent_min || 0), 0);

    let h = '<div class="hero">' +
      '<div class="hero-date">' + esc(longDate(td)) + '</div>' +
      '<div class="hero-row"><div class="hero-num">' + doneToday.length + '<small> / ' + total + '</small></div>' +
      '<div class="hero-label">' + (total ? 'сделано' + (minutes ? ' · ' + fmtMin(minutes) : '') : 'на сегодня пусто') + '</div></div>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div></div>';

    if (!open.length) {
      h += doneToday.length
        ? empty('🎉', 'Всё на сегодня сделано', 'Можно выдохнуть. Или взять что-то из списка.')
        : empty('☀️', 'На сегодня задач нет', inboxN ? 'В инбоксе ' + inboxN + ' ' + plural(inboxN, 'задача', 'задачи', 'задач') + ' — раскидай их по дням.' : 'Добавь задачу кнопкой + или напиши боту.',
          inboxN ? '<button class="btn primary" data-act="goto" data-tab="inbox">Разобрать инбокс</button>' : '');
    }

    h += section('Просрочено', overdue, { showDate: true, cls: 'overdue' });
    [1, 2, 3, 4, 0].forEach(q => {
      const list = todays.filter(t => (t.quadrant || 0) === q);
      if (!list.length) return;
      const title = q ? QUADS[q].long : 'Без приоритета';
      h += section(title, list, { showQuad: false, cls: 'q-group q' + q });
    });

    if (doneToday.length) {
      h += '<details class="group done-group"><summary><h2>Сделано сегодня <span class="count">' + doneToday.length + '</span></h2></summary>' +
        '<div class="card">' + doneToday.map(t => taskRow(t)).join('') + '</div></details>';
    }
    return h;
  }

  // ---------------------------------------------------------------
  // Экран «Инбокс»
  // ---------------------------------------------------------------
  function viewInbox() {
    const items = S.tasks.filter(t => t.status === 'inbox')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (!items.length) {
      return empty('📥', 'Инбокс пуст', 'Пиши или пересылай задачи боту в течение дня — вечером они будут ждать здесь.');
    }
    return '<div class="inbox-head"><p>' + items.length + ' ' + plural(items.length, 'задача ждёт', 'задачи ждут', 'задач ждут') + ' разбора</p>' +
      '<button class="btn primary" data-act="triage-all">Разобрать по очереди</button></div>' +
      '<div class="card">' + items.map(t => taskRow(t, { showAge: true, showDate: true })).join('') + '</div>';
  }

  // ---------------------------------------------------------------
  // Экран «Все задачи»
  // ---------------------------------------------------------------
  function viewAll() {
    const filters = [['all', 'Все'], ...activeProjects().map(p => [p.id, p.name]), ['none', 'Без проекта']];
    return '<div class="all-controls">' +
      '<input type="search" id="search" class="input search" placeholder="Поиск" value="' + esc(S.search) + '">' +
      '<div class="chips scroll">' + filters.map(([id, name]) => {
        const p = proj(id);
        return '<button class="chip' + (S.filter === id ? ' on' : '') + '" data-act="filter" data-pid="' + esc(id) + '">' +
          (p ? '<i class="dot" style="--c:' + esc(p.color) + '"></i>' : '') + esc(name) + '</button>';
      }).join('') + '</div>' +
      '<label class="switch-row"><input type="checkbox" id="show-done"' + (S.showDone ? ' checked' : '') + '> Показывать выполненные</label>' +
      '</div><div id="all-list">' + allList() + '</div>';
  }

  function allList() {
    const q = S.search.trim().toLowerCase();
    const match = t => (S.filter === 'all' || (S.filter === 'none' ? !t.project : t.project === S.filter)) &&
      (!q || (t.title + ' ' + t.note).toLowerCase().includes(q));
    const td = today(), tm = addDays(td, 1), sun = addDays(mondayOf(td), 6);
    const groups = { 'Просрочено': [], 'Сегодня': [], 'Завтра': [], 'На этой неделе': [], 'Позже': [], 'Без срока': [], 'Инбокс': [] };
    S.tasks.filter(t => t.status !== 'done' && match(t)).forEach(t => {
      let g;
      if (t.status === 'inbox') g = 'Инбокс';
      else if (!t.due_date) g = 'Без срока';
      else if (t.due_date < td) g = 'Просрочено';
      else if (t.due_date === td) g = 'Сегодня';
      else if (t.due_date === tm) g = 'Завтра';
      else if (t.due_date <= sun) g = 'На этой неделе';
      else g = 'Позже';
      groups[g].push(t);
    });
    let h = '';
    Object.keys(groups).forEach(g => {
      h += section(g, groups[g].sort(byPlan), { showDate: g !== 'Сегодня' && g !== 'Завтра' && g !== 'Без срока', cls: g === 'Просрочено' ? 'overdue' : '' });
    });
    if (S.showDone) {
      const done = S.tasks.filter(t => t.status === 'done' && match(t))
        .sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 100);
      h += section('Выполнено', done);
    }
    return h || empty('🔍', 'Ничего не нашлось', q ? 'Попробуй другой запрос.' : 'Здесь пока пусто.');
  }

  // ---------------------------------------------------------------
  // Экран «Неделя»
  // ---------------------------------------------------------------
  function weekStats(mon) {
    const sun = addDays(mon, 6);
    const done = S.tasks.filter(t => t.status === 'done' && t.done_at && isoDay(t.done_at) >= mon && isoDay(t.done_at) <= sun);
    const minutes = done.reduce((s, t) => s + (t.spent_min || 0), 0);
    const by = {};
    done.forEach(t => {
      const k = t.project || '';
      by[k] = by[k] || { n: 0, m: 0, tasks: [] };
      by[k].n++;
      by[k].m += t.spent_min || 0;
      by[k].tasks.push(t);
    });
    return { mon, sun, done, minutes, by };
  }

  function deltaBadge(d, isTime) {
    if (!d) return '<span class="delta">как на прошлой</span>';
    const v = isTime ? fmtMin(Math.abs(d)) : Math.abs(d);
    return '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + v + '</span>';
  }

  function viewWeek() {
    const mon = addDays(mondayOf(today()), S.weekOffset * 7);
    const cur = weekStats(mon);
    const prev = weekStats(addDays(mon, -7));
    const isCurrent = S.weekOffset === 0;

    let h = '<div class="week-nav">' +
      '<button class="icon-btn" data-act="week-prev" aria-label="Прошлая неделя"' + (S.weekOffset <= -15 ? ' disabled' : '') + '>‹</button>' +
      '<div><b>' + rangeLabel(cur.mon, cur.sun) + '</b><span>' + (isCurrent ? 'эта неделя' : S.weekOffset === -1 ? 'прошлая неделя' : '') + '</span></div>' +
      '<button class="icon-btn" data-act="week-next" aria-label="Следующая неделя"' + (isCurrent ? ' disabled' : '') + '>›</button></div>';

    h += '<div class="stats">' +
      '<div class="stat"><span>Закрыто</span><b>' + cur.done.length + '</b>' + deltaBadge(cur.done.length - prev.done.length) + '</div>' +
      '<div class="stat"><span>Время</span><b>' + (cur.minutes ? fmtMin(cur.minutes) : '—') + '</b>' + deltaBadge(cur.minutes - prev.minutes, true) + '</div>' +
      '</div>';

    const keys = Object.keys(cur.by).sort((a, b) => cur.by[b].m - cur.by[a].m || cur.by[b].n - cur.by[a].n);
    if (keys.length) {
      const maxM = Math.max(...keys.map(k => cur.by[k].m), 0);
      const maxN = Math.max(...keys.map(k => cur.by[k].n), 1);
      h += '<section class="group"><h2>По проектам</h2><div class="card bars">' + keys.map(k => {
        const p = proj(k);
        const b = cur.by[k];
        const pb = prev.by[k] || { n: 0, m: 0 };
        const w = maxM ? (b.m / maxM) * 100 : (b.n / maxN) * 100;
        return '<details class="bar-row"><summary>' +
          '<div class="bar-top"><span class="bar-name"><i class="dot" style="--c:' + esc(p ? p.color : '#8E8E93') + '"></i>' + esc(p ? p.name : 'Без проекта') + '</span>' +
          '<span class="bar-val">' + b.n + ' ' + plural(b.n, 'задача', 'задачи', 'задач') + (b.m ? ' · ' + fmtMin(b.m) : '') +
          (b.m - pb.m ? ' <em class="' + (b.m > pb.m ? 'up' : 'down') + '">' + (b.m > pb.m ? '↑' : '↓') + '</em>' : '') + '</span></div>' +
          '<div class="bar"><i style="width:' + Math.max(w, 3) + '%;--c:' + esc(p ? p.color : '#8E8E93') + '"></i></div></summary>' +
          '<div class="bar-tasks">' + b.tasks.sort((x, y) => (y.spent_min || 0) - (x.spent_min || 0)).map(t => taskRow(t)).join('') + '</div></details>';
      }).join('') + '</div></section>';
    } else {
      h += empty('📊', 'За эту неделю пока ничего не закрыто', isCurrent ? 'Закрывай задачи и указывай время — здесь появится картина по проектам.' : '');
    }

    if (isCurrent) {
      const td = today();
      const open = S.tasks.filter(t => t.status !== 'done');
      const overdue = open.filter(t => t.due_date && t.due_date < td).sort(byPlan);
      const postponed = open.filter(t => (t.postpone_count || 0) >= 2 && !(t.due_date && t.due_date < td));
      const stale = open.filter(t => t.status === 'inbox' && t.created_at && Date.now() - new Date(t.created_at).getTime() > 3 * 864e5);
      if (overdue.length || postponed.length || stale.length) {
        h += '<div class="stuck-title">🧊 Зависло</div>';
        h += section('Просрочено', overdue, { showDate: true, showPostponed: true, cls: 'overdue' });
        h += section('Переносил 2+ раза', postponed, { showDate: true, showPostponed: true });
        h += section('В инбоксе дольше 3 дней', stale, { showAge: true });
      }
    }
    return h;
  }

  // ---------------------------------------------------------------
  // Отрисовка
  // ---------------------------------------------------------------
  function render() {
    const inboxN = S.tasks.filter(t => t.status === 'inbox').length;
    const badge = $('#inbox-badge');
    badge.hidden = !inboxN;
    badge.textContent = inboxN > 99 ? '99+' : inboxN;
    $('#title').textContent = TITLES[S.tab];
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    $('#fab').hidden = S.tab === 'week';

    if (!S.loaded) {
      view.innerHTML = '<div class="skeleton"><i></i><i></i><i></i><i></i></div>';
      return;
    }
    const scroll = window.scrollY;
    const searchFocused = document.activeElement && document.activeElement.id === 'search';
    view.innerHTML = { today: viewToday, inbox: viewInbox, all: viewAll, week: viewWeek }[S.tab]();
    window.scrollTo(0, scroll);
    if (searchFocused) { const s = $('#search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  function setTab(tab) {
    if (S.tab === tab) return;
    S.tab = tab;
    hap('select');
    window.scrollTo(0, 0);
    render();
  }

  // ---------------------------------------------------------------
  // Нижние шторки (sheet)
  // ---------------------------------------------------------------
  let sheet = null;

  function openSheet(html, opts = {}) {
    closeSheet(true);
    const root = $('#sheet-root');
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="sheet-backdrop"></div><div class="sheet' + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog"><div class="sheet-handle"></div>' + html + '</div>';
    root.appendChild(wrap);
    sheet = { el: wrap, onClose: opts.onClose };
    wrap.querySelector('.sheet-backdrop').addEventListener('click', () => closeSheet());
    document.body.classList.add('sheet-open');
    if (tg && tg.BackButton) tg.BackButton.show();
    return wrap.querySelector('.sheet');
  }

  function closeSheet(silent) {
    if (!sheet) return;
    const s = sheet;
    sheet = null;
    if (!silent && s.onClose) s.onClose();
    s.el.classList.add('closing');
    setTimeout(() => s.el.remove(), 180);
    if (!sheet) {
      document.body.classList.remove('sheet-open');
      if (tg && tg.BackButton) tg.BackButton.hide();
    }
  }

  // ---------------------------------------------------------------
  // Быстрое добавление
  // ---------------------------------------------------------------
  function openQuickAdd() {
    let mode = S.tab === 'today' ? 'today' : 'inbox';
    const el = openSheet(
      '<div class="sheet-title">Новая задача</div>' +
      '<textarea class="input qa-input" rows="2" placeholder="Что сделать? «RVO: …» — сразу в проект" enterkeyhint="send"></textarea>' +
      '<div class="chips"><button class="chip" data-mode="inbox">В инбокс</button><button class="chip" data-mode="today">На сегодня</button></div>' +
      '<button class="btn primary wide" data-qa="add">Добавить</button>', { cls: 'quick' });
    const input = el.querySelector('.qa-input');
    const paint = () => el.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    paint();
    input.focus();

    const add = () => {
      const raw = input.value.trim();
      if (!raw) { input.focus(); return; }
      const parsed = parsePrefix(raw);
      const lines = parsed.text.split('\n');
      const t = newTask({
        title: lines[0].trim(), note: lines.slice(1).join('\n').trim(), project: parsed.project,
        status: mode === 'today' ? 'active' : 'inbox', due_date: mode === 'today' ? today() : '',
      });
      saveTasks([t]);
      hap('light');
      input.value = '';
      input.focus();
      toast(mode === 'today' ? 'Добавлено на сегодня' : 'Добавлено в инбокс');
    };
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-mode]');
      if (m) { mode = m.dataset.mode; paint(); hap('select'); input.focus(); }
      if (e.target.closest('[data-qa="add"]')) add();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); }
    });
  }

  // ---------------------------------------------------------------
  // Редактор задачи
  // ---------------------------------------------------------------
  function openEditor(task, opts = {}) {
    const orig = clone(task);
    const E = clone(task);
    E.subtasks = E.subtasks || [];
    let handled = false;
    const isInbox = orig.status === 'inbox';
    const isDone = orig.status === 'done';
    const triage = opts.triage;
    const left = triage ? S.triage.length : 0;

    const projChips = '<button class="chip" data-pid="">Без проекта</button>' +
      activeProjects().concat(S.projects.filter(p => p.archived && p.id === E.project)).map(p =>
        '<button class="chip" data-pid="' + esc(p.id) + '"><i class="dot" style="--c:' + esc(p.color) + '"></i>' + esc(p.name) + '</button>').join('');

    const nextMon = addDays(mondayOf(today()), 7);
    const actions = isDone
      ? '<button class="btn primary" data-ed="reopen">Вернуть в работу</button>'
      : isInbox
        ? '<button class="btn primary" data-ed="triage">' + (triage && left ? 'В работу → дальше (' + left + ')' : 'В работу ✓') + '</button>' +
          (triage && left ? '<button class="btn" data-ed="skip">Пропустить</button>' : '') +
          '<button class="btn" data-ed="done">Сразу выполнено</button>'
        : '<button class="btn primary" data-ed="done">Выполнено ✓</button>';

    const el = openSheet(
      '<div class="ed-head"><span class="kicker">' + (isInbox ? 'Инбокс' + (triage ? ' · разбор' : '') : isDone ? 'Выполнено' : 'Задача') + '</span>' +
      '<button class="icon-btn del" data-ed="delete" aria-label="Удалить">' +
      '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button></div>' +
      '<textarea class="ed-title" rows="1" placeholder="Что сделать?">' + esc(E.title) + '</textarea>' +

      '<div class="field"><div class="label">Проект</div><div class="chips scroll" data-group="project">' + projChips + '</div></div>' +

      '<div class="field"><div class="label">Срок</div>' +
      '<div class="chips" data-group="date">' +
      '<button class="chip" data-date="' + today() + '">Сегодня</button>' +
      '<button class="chip" data-date="' + addDays(today(), 1) + '">Завтра</button>' +
      '<button class="chip" data-date="' + nextMon + '">След. неделя</button>' +
      '<button class="chip" data-date="">Без срока</button></div>' +
      '<div class="row"><input type="date" class="input" data-f="due_date"><input type="time" class="input" data-f="due_time"></div></div>' +

      '<div class="field"><div class="label">Приоритет</div><div class="matrix">' +
      [1, 2, 3, 4].map(q => '<button class="mx q' + q + '" data-q="' + q + '"><b>' + QUADS[q].long + '</b><span>' + QUADS[q].hint + '</span></button>').join('') +
      '</div></div>' +

      '<div class="field"><div class="label">Подзадачи</div><div class="subs"></div>' +
      '<input class="input sub-add" placeholder="+ Добавить подзадачу" enterkeyhint="done"></div>' +

      '<div class="field"><div class="label">Заметка</div>' +
      '<textarea class="input note" data-f="note" rows="3" placeholder="Детали, ссылки, контакты">' + esc(E.note) + '</textarea>' +
      '<div class="links"></div></div>' +

      '<div class="field"><div class="label">Повтор</div><div class="row">' +
      '<select class="input" data-f="repeat">' + REPEATS.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('') + '</select>' +
      '<input type="number" inputmode="numeric" min="2" max="365" class="input small" data-f="repeat_n" placeholder="N"></div></div>' +

      '<div class="field spent-field"><div class="label">Затрачено времени</div><div class="row custom-time">' +
      '<label><input type="number" inputmode="numeric" min="0" class="input" data-f="spent_h" placeholder="0"> ч</label>' +
      '<label><input type="number" inputmode="numeric" min="0" class="input" data-f="spent_m" placeholder="0"> мин</label>' +
      '</div></div>' +

      '<div class="ed-info">' + edInfo(E) + '</div>' +
      '<div class="actions">' + actions + '</div>',
      { cls: 'editor', onClose: () => { if (!handled) commit(); S.triage = null; } }
    );

    const title = el.querySelector('.ed-title');
    const autosize = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    const f = name => el.querySelector('[data-f="' + name + '"]');

    function paint() {
      el.querySelectorAll('[data-pid]').forEach(b => b.classList.toggle('on', b.dataset.pid === (E.project || '')));
      el.querySelectorAll('[data-date]').forEach(b => b.classList.toggle('on', b.dataset.date === (E.due_date || '')));
      f('due_date').value = E.due_date || '';
      f('due_time').value = E.due_time || '';
      f('due_time').disabled = !E.due_date;
      el.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', Number(b.dataset.q) === E.quadrant));
      f('repeat').value = (E.repeat && E.repeat.type) || '';
      f('repeat_n').hidden = !(E.repeat && E.repeat.type === 'days');
      f('repeat_n').value = (E.repeat && E.repeat.n) || '';
      const sh = f('spent_h'), sm = f('spent_m');
      if (document.activeElement !== sh && document.activeElement !== sm) {
        sh.value = E.spent_min ? Math.floor(E.spent_min / 60) || '' : '';
        sm.value = E.spent_min ? E.spent_min % 60 || '' : '';
      }
      el.querySelector('.spent-field').hidden = !(isDone || orig.spent_min);
      paintSubs();
      paintLinks();
    }

    function paintSubs() {
      el.querySelector('.subs').innerHTML = E.subtasks.map(s =>
        '<div class="sub" data-sid="' + esc(s.id) + '">' +
        '<button class="sub-check' + (s.done ? ' on' : '') + '" data-sub="toggle" aria-label="Готово"></button>' +
        '<input class="sub-text" data-sub="text" value="' + esc(s.t) + '">' +
        '<button class="sub-del" data-sub="del" aria-label="Удалить">×</button></div>').join('');
    }

    function paintLinks() {
      const links = extractLinks(E.note);
      el.querySelector('.links').innerHTML = links.map(u =>
        '<button class="link-btn" data-url="' + esc(u) + '">↗ ' + esc(u.replace(/^https?:\/\//, '').slice(0, 48)) + '</button>').join('');
    }

    function finalTask() {
      const t = clone(E);
      t.title = (title.value || '').trim();
      t.subtasks = t.subtasks.filter(s => (s.t || '').trim());
      if (orig.status === 'active' && orig.due_date && t.due_date && t.due_date > orig.due_date) {
        t.postpone_count = (orig.postpone_count || 0) + 1;
      }
      if (!t.due_date) t.due_time = '';
      return t;
    }

    function commit(extra) {
      const t = Object.assign(finalTask(), extra || {});
      if (!t.title) {
        if (!S.tasks.some(x => x.id === t.id)) return null;
        t.title = orig.title || 'Без названия';
      }
      const changed = JSON.stringify(t) !== JSON.stringify(Object.assign(clone(orig), { subtasks: orig.subtasks || [] }));
      if (changed) saveTasks([t]);
      return t;
    }

    function nextInTriage() {
      const nextId = S.triage && S.triage.shift();
      const next = nextId && S.tasks.find(t => t.id === nextId && t.status === 'inbox');
      if (next) openEditor(next, { triage: true });
      else if (nextId) nextInTriage();
      else { S.triage = null; toast('Инбокс разобран 🎉'); }
    }

    // --- события
    title.addEventListener('input', () => autosize(title));
    el.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f === 'note') { E.note = t.value; paintLinks(); }
      if (t.dataset.f === 'spent_h' || t.dataset.f === 'spent_m') {
        const total = Math.round((parseFloat(String(f('spent_h').value).replace(',', '.')) || 0) * 60 + (parseInt(f('spent_m').value, 10) || 0));
        E.spent_min = total > 0 ? total : null;
      }
      if (t.dataset.f === 'repeat_n') E.repeat = { type: 'days', n: Math.max(1, parseInt(t.value, 10) || 0) || null };
      if (t.dataset.sub === 'text') {
        const s = E.subtasks.find(x => x.id === t.closest('.sub').dataset.sid);
        if (s) s.t = t.value;
      }
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.f === 'due_date') { E.due_date = t.value; paint(); }
      if (t.dataset.f === 'due_time') E.due_time = t.value;
      if (t.dataset.f === 'repeat') {
        E.repeat = t.value ? { type: t.value, n: t.value === 'days' ? 2 : null } : null;
        if (E.repeat && !E.due_date) E.due_date = today();
        paint();
      }
    });
    el.querySelector('.sub-add').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = e.target.value.trim();
      if (!v) return;
      E.subtasks.push({ id: uid(), t: v, done: false });
      e.target.value = '';
      paintSubs();
    });
    el.querySelector('.sub-add').addEventListener('blur', e => {
      const v = e.target.value.trim();
      if (v) { E.subtasks.push({ id: uid(), t: v, done: false }); e.target.value = ''; paintSubs(); }
    });

    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pid !== undefined) { E.project = b.dataset.pid; hap('select'); paint(); return; }
      if (b.dataset.date !== undefined) { E.due_date = b.dataset.date; hap('select'); paint(); return; }
      if (b.dataset.q) { const q = Number(b.dataset.q); E.quadrant = E.quadrant === q ? null : q; hap('select'); paint(); return; }
      if (b.dataset.url) { openUrl(b.dataset.url); return; }
      if (b.dataset.sub) {
        const sid = b.closest('.sub').dataset.sid;
        const i = E.subtasks.findIndex(x => x.id === sid);
        if (b.dataset.sub === 'toggle' && i >= 0) { E.subtasks[i].done = !E.subtasks[i].done; hap('light'); }
        if (b.dataset.sub === 'del' && i >= 0) E.subtasks.splice(i, 1);
        paintSubs();
        return;
      }
      switch (b.dataset.ed) {
        case 'triage': {
          handled = true;
          const t = commit({ status: 'active' });
          if (!t) { closeSheet(true); return; }
          hap('success');
          closeSheet(true);
          if (triage) nextInTriage(); else toast('Перенесено из инбокса');
          break;
        }
        case 'skip':
          handled = true;
          commit();
          closeSheet(true);
          nextInTriage();
          break;
        case 'done': {
          handled = true;
          const t = commit();
          closeSheet(true);
          if (t) completeTask(S.tasks.find(x => x.id === t.id) || t);
          break;
        }
        case 'reopen':
          handled = true;
          commit({ status: 'active', done_at: '' });
          closeSheet(true);
          break;
        case 'delete':
          confirmAsk('Удалить задачу?', ok => {
            if (!ok) return;
            handled = true;
            closeSheet(true);
            if (S.tasks.some(x => x.id === E.id)) {
              const backup = clone(orig);
              removeTask(E.id);
              hap('warning');
              toast('Задача удалена', { label: 'Вернуть', fn: () => saveTasks([backup]) });
            }
            if (triage) nextInTriage();
          });
          break;
      }
    });

    paint();
    autosize(title);
    if (!E.title) title.focus();
  }

  function edInfo(t) {
    const parts = [];
    if (t.created_at) parts.push('создана ' + ago(t.created_at));
    if (t.source === 'bot') parts.push('из бота');
    if (t.source === 'forward') parts.push('пересланное сообщение');
    if (t.source === 'repeat') parts.push('повтор');
    if (t.postpone_count) parts.push('переносилась ' + t.postpone_count + ' ' + plural(t.postpone_count, 'раз', 'раза', 'раз'));
    if (t.done_at) parts.push('выполнена ' + shortDate(isoDay(t.done_at)).toLowerCase());
    return esc(parts.join(' · '));
  }

  function confirmAsk(text, cb) {
    if (tg && IN_TG && tg.showConfirm) {
      try { tg.showConfirm(text, cb); return; } catch (e) { /* старый клиент */ }
    }
    cb(window.confirm(text));
  }

  // ---------------------------------------------------------------
  // «Сколько ушло времени?»
  // ---------------------------------------------------------------
  function askSpent(t, cb) {
    const presets = [15, 30, 45, 60, 90, 120, 180, 240];
    let done = false;
    const el = openSheet(
      '<div class="sheet-title">Сколько ушло времени?</div>' +
      '<div class="sheet-sub">' + esc(t.title) + '</div>' +
      '<div class="chips wrap presets">' + presets.map(m => '<button class="chip big" data-min="' + m + '">' + fmtMin(m) + '</button>').join('') + '</div>' +
      '<div class="row custom-time">' +
      '<label><input type="number" inputmode="numeric" min="0" class="input" data-h placeholder="0"> ч</label>' +
      '<label><input type="number" inputmode="numeric" min="0" class="input" data-m placeholder="0"> мин</label>' +
      '<button class="btn primary" data-sp="ok">Готово</button></div>' +
      '<button class="btn ghost wide" data-sp="skip">Не считать время</button>',
      { cls: 'spent', onClose: () => { /* закрыли без ответа — задачу не закрываем */ } });

    const finish = minutes => {
      if (done) return;
      done = true;
      closeSheet(true);
      cb(minutes);
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.min) finish(Number(b.dataset.min));
      if (b.dataset.sp === 'skip') finish(null);
      if (b.dataset.sp === 'ok') {
        const h = parseFloat(el.querySelector('[data-h]').value.replace(',', '.')) || 0;
        const m = parseInt(el.querySelector('[data-m]').value, 10) || 0;
        const total = Math.round(h * 60 + m);
        finish(total > 0 ? total : null);
      }
    });
  }

  // ---------------------------------------------------------------
  // Настройки и проекты
  // ---------------------------------------------------------------
  function openSettings() {
    let showArchived = false;
    let openPalette = null;
    const el = openSheet('<div class="settings"></div>', { cls: 'settings-sheet' });
    const box = el.querySelector('.settings');

    function paint() {
      const act = activeProjects();
      const arch = S.projects.filter(p => p.archived);
      box.innerHTML =
        '<div class="sheet-title">Проекты</div>' +
        '<div class="card proj-list">' + act.map((p, i) =>
          '<div class="proj-row" data-pid="' + esc(p.id) + '">' +
          '<button class="swatch" style="--c:' + esc(p.color) + '" data-st="palette" aria-label="Цвет"></button>' +
          '<input class="proj-name" data-st="name" value="' + esc(p.name) + '">' +
          '<button class="icon-btn small" data-st="up"' + (i === 0 ? ' disabled' : '') + ' aria-label="Выше">↑</button>' +
          '<button class="icon-btn small" data-st="archive" aria-label="В архив">⤓</button></div>' +
          (openPalette === p.id ? '<div class="palette">' + PALETTE.map(c =>
            '<button class="swatch' + (c === p.color ? ' on' : '') + '" style="--c:' + c + '" data-color="' + c + '" data-for="' + esc(p.id) + '"></button>').join('') + '</div>' : '')
        ).join('') + '</div>' +
        '<button class="btn wide" data-st="add">+ Новый проект</button>' +
        (arch.length ? '<button class="link-like" data-st="toggle-arch">' + (showArchived ? 'Скрыть' : 'Показать') + ' архив (' + arch.length + ')</button>' : '') +
        (showArchived ? '<div class="card proj-list">' + arch.map(p =>
          '<div class="proj-row archived" data-pid="' + esc(p.id) + '"><i class="swatch static" style="--c:' + esc(p.color) + '"></i>' +
          '<span class="proj-name">' + esc(p.name) + '</span><button class="btn small" data-st="unarchive">Вернуть</button></div>').join('') + '</div>' : '') +
        '<p class="hint">Архивные проекты не предлагаются для новых задач, но старые задачи и статистика остаются.</p>' +
        '<div class="sheet-title">Как добавлять задачи</div>' +
        '<p class="hint">Пиши боту или пересылай ему любые сообщения — всё падает в инбокс. ' +
        'Начни с названия проекта и двоеточия, чтобы сразу его проставить: <b>RVO: сделать ссылку кликабельной</b>. ' +
        'То же работает в кнопке «+».</p>' +
        '<div class="home-slot"></div>' +
        (DEMO ? '<p class="hint">Сейчас демо-режим: приложение открыто не из Telegram, изменения не сохраняются.</p>' : '');

      if (tg && IN_TG && tg.addToHomeScreen && tg.checkHomeScreenStatus) {
        try {
          tg.checkHomeScreenStatus(status => {
            const slot = box.querySelector('.home-slot');
            if (!slot) return;
            if (status === 'added') slot.innerHTML = '<p class="hint">✓ Иконка уже на главном экране.</p>';
            else if (status !== 'unsupported') slot.innerHTML = '<button class="btn wide" data-st="home">Добавить иконку на главный экран</button>';
          });
        } catch (e) { /* нет поддержки */ }
      }
    }

    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const row = b.closest('[data-pid]');
      const p = row && proj(row.dataset.pid);
      switch (b.dataset.st) {
        case 'palette': openPalette = openPalette === p.id ? null : p.id; paint(); return;
        case 'up': {
          const act = activeProjects();
          const i = act.findIndex(x => x.id === p.id);
          if (i > 0) {
            act.splice(i - 1, 0, act.splice(i, 1)[0]);
            const changed = act.map((x, k) => Object.assign(clone(x), { order: k }));
            saveProjects(changed);
            hap('select');
          }
          paint();
          return;
        }
        case 'archive':
          confirmAsk('Убрать «' + p.name + '» в архив?', ok => {
            if (!ok) return;
            saveProjects([Object.assign(clone(p), { archived: true })]);
            paint();
          });
          return;
        case 'unarchive':
          saveProjects([Object.assign(clone(p), { archived: false, order: activeProjects().length })]);
          paint();
          return;
        case 'toggle-arch': showArchived = !showArchived; paint(); return;
        case 'add': {
          const used = S.projects.map(x => x.color);
          const np = {
            id: 'p' + uid(), name: 'Новый проект', color: PALETTE.find(c => !used.includes(c)) || PALETTE[0],
            archived: false, order: activeProjects().length,
          };
          saveProjects([np]);
          paint();
          const inp = box.querySelector('[data-pid="' + np.id + '"] .proj-name');
          if (inp) { inp.focus(); inp.select(); }
          return;
        }
        case 'home':
          try { tg.addToHomeScreen(); } catch (err) { toast('Твой Telegram пока так не умеет'); }
          return;
      }
      if (b.dataset.color) {
        const target = proj(b.dataset.for);
        saveProjects([Object.assign(clone(target), { color: b.dataset.color })]);
        openPalette = null;
        hap('select');
        paint();
      }
    });
    box.addEventListener('change', e => {
      if (e.target.dataset.st !== 'name') return;
      const p = proj(e.target.closest('[data-pid]').dataset.pid);
      const name = e.target.value.trim();
      if (p && name && name !== p.name) saveProjects([Object.assign(clone(p), { name })]);
    });

    paint();
  }

  // ---------------------------------------------------------------
  // Тост
  // ---------------------------------------------------------------
  let toastTimer = null;
  function toast(text, action) {
    const el = $('#toast');
    el.innerHTML = '<span>' + esc(text) + '</span>' + (action ? '<button>' + esc(action.label) + '</button>' : '');
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (action) el.querySelector('button').onclick = () => { action.fn(); hideToast(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 5000 : 2200);
  }
  function hideToast() { const el = $('#toast'); el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 200); }

  // ---------------------------------------------------------------
  // События главного экрана
  // ---------------------------------------------------------------
  view.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const row = a.closest('.task');
    const t = row && S.tasks.find(x => x.id === row.dataset.id);
    switch (a.dataset.act) {
      case 'toggle':
        if (!t) return;
        if (t.status === 'done') reopenTask(t); else completeTask(t);
        break;
      case 'open':
        if (t) openEditor(t);
        break;
      case 'goto':
        setTab(a.dataset.tab);
        break;
      case 'triage-all': {
        const ids = S.tasks.filter(x => x.status === 'inbox')
          .sort((x, y) => (y.created_at || '').localeCompare(x.created_at || '')).map(x => x.id);
        S.triage = ids.slice(1);
        const first = S.tasks.find(x => x.id === ids[0]);
        if (first) openEditor(first, { triage: true });
        break;
      }
      case 'filter':
        S.filter = a.dataset.pid;
        hap('select');
        render();
        break;
      case 'week-prev': S.weekOffset = Math.max(-15, S.weekOffset - 1); render(); break;
      case 'week-next': S.weekOffset = Math.min(0, S.weekOffset + 1); render(); break;
    }
  });

  view.addEventListener('input', e => {
    if (e.target.id === 'search') {
      S.search = e.target.value;
      $('#all-list').innerHTML = allList();
    }
  });
  view.addEventListener('change', e => {
    if (e.target.id === 'show-done') { S.showDone = e.target.checked; $('#all-list').innerHTML = allList(); }
  });

  document.querySelector('.tabbar').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  $('#fab').addEventListener('click', () => { hap('light'); openQuickAdd(); });
  $('#settings-btn').addEventListener('click', openSettings);
  $('#sync').addEventListener('click', () => {
    if (DEMO) { toast('Демо-режим: данные не сохраняются'); return; }
    if (S.fatal) { S.fatal = null; banner(null); }
    flush();
    load();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || DEMO) return;
    if (queue.length) flush();
    if (Date.now() - S.lastSync > 20000) load();
  });
  window.addEventListener('online', () => flush());

  // Если открыли вечером, а сегодня уже наступило завтра — перерисовать
  let lastDay = today();
  setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);

  // ---------------------------------------------------------------
  // Демо-данные (для браузера и работы над дизайном)
  // ---------------------------------------------------------------
  function demoData() {
    const td = today();
    const ago = (days, h) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(h || 12); return d.toISOString(); };
    const P = [['p_rvo', 'RVO', '#E5484D'], ['p_alex', 'Алекс', '#F5A524'], ['p_stepa', 'Стёпа', '#30A46C'],
      ['p_mc', 'Music Club', '#3E63DD'], ['p_yt', 'Ютуб', '#D6409F'], ['p_life', 'Личное', '#12A594']]
      .map((p, i) => ({ id: p[0], name: p[1], color: p[2], archived: false, order: i }));
    const T = (o) => newTask(o);
    const tasks = [
      T({ title: 'Смонтировать запись МК «Докрутка крика» и залить на GetCourse', project: 'p_rvo', status: 'active', due_date: td, quadrant: 1, due_time: '14:00',
        subtasks: [{ id: 's1', t: 'Смонтировать', done: true }, { id: 's2', t: 'Залить на GetCourse', done: false }, { id: 's3', t: 'Проверить доступ', done: false }] }),
      T({ title: 'Перезвонить родителям после пробного занятия', project: 'p_mc', status: 'active', due_date: td, quadrant: 1, due_time: '18:30' }),
      T({ title: 'Решить, где принимать оплату с белорусской карты', project: 'p_alex', status: 'active', due_date: td, quadrant: 2, note: 'Варианты: https://example.com/pay' }),
      T({ title: 'Оплатить коммуналку', project: 'p_life', status: 'active', due_date: td, quadrant: 3, repeat: { type: 'monthly' } }),
      T({ title: 'Внести оплаты клиентов в финучёт', project: 'p_alex', status: 'active', due_date: addDays(td, -2), quadrant: 2, postpone_count: 2 }),
      T({ title: 'Напомнить Артёму про доплату 18к', project: 'p_alex', status: 'active', due_date: addDays(td, 4), quadrant: 1, due_time: '12:00' }),
      T({ title: 'Смонтировать ролик по Active Matter', project: 'p_yt', status: 'active', due_date: addDays(td, 2), quadrant: 2 }),
      T({ title: 'Обновить описание курса «Опора внутри»', project: 'p_stepa', status: 'active', due_date: '', quadrant: 4 }),
      T({ title: 'Сделать кликабельной ссылку на чат в уроке', project: 'p_rvo', status: 'inbox', created_at: ago(0, 10), source: 'bot' }),
      T({ title: 'Мама Вани: Здравствуйте, можно перенести занятие на пятницу?', status: 'inbox', created_at: ago(0, 16), source: 'forward', note: 'Переслано от: Мама Вани\n\nЗдравствуйте, можно перенести занятие на пятницу?' }),
      T({ title: 'Договориться про второй вебинар (Дима Рубановский или Кирилл)', project: 'p_alex', status: 'inbox', created_at: ago(4), source: 'bot' }),
      T({ title: 'Нарезать шортсы из стрима', project: 'p_yt', status: 'done', done_at: ago(0, 11), spent_min: 45 }),
      T({ title: 'Созвон с Кириллом по воронке', project: 'p_rvo', status: 'done', done_at: ago(1), spent_min: 60 }),
      T({ title: 'Залить урок 4', project: 'p_rvo', status: 'done', done_at: ago(2), spent_min: 90 }),
      T({ title: 'Выставить счёт Алексу', project: 'p_alex', status: 'done', done_at: ago(1), spent_min: 20 }),
      T({ title: 'Медитация: монтаж вступления', project: 'p_stepa', status: 'done', done_at: ago(3), spent_min: 120 }),
      T({ title: 'Обзвон лидов', project: 'p_mc', status: 'done', done_at: ago(8), spent_min: 150 }),
      T({ title: 'Монтаж урока 3', project: 'p_rvo', status: 'done', done_at: ago(9), spent_min: 180 }),
    ];
    return { tasks, projects: P };
  }

  // ---------------------------------------------------------------
  // Старт
  // ---------------------------------------------------------------
  function startTab() {
    const q = new URLSearchParams(location.search).get('tab');
    const sp = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    const t = q || sp;
    return TITLES[t] ? t : 'today';
  }

  function init() {
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
        if (tg.setBackgroundColor) tg.setBackgroundColor('secondary_bg_color');
        if (tg.setBottomBarColor) tg.setBottomBarColor('secondary_bg_color');
        tg.BackButton.onClick(() => closeSheet());
      } catch (e) { /* старые клиенты */ }
    }
    S.tab = startTab();

    if (DEMO) {
      const d = demoData();
      S.tasks = d.tasks;
      S.projects = d.projects;
      S.loaded = true;
      banner('Демо-режим: открыто не из Telegram, изменения не сохраняются.', 'demo');
      setSync('ok');
      render();
      return;
    }
    if (!API_URL || API_URL.indexOf('ВСТАВЬ') === 0) {
      S.loaded = true;
      setFatal('NO_API');
      render();
      return;
    }

    queue = LS.get('tm_queue') || [];
    const cache = LS.get('tm_cache');
    if (cache && cache.tasks) {
      S.tasks = cache.tasks;
      S.projects = cache.projects || [];
      applyQueueLocally();
      S.loaded = true;
    }
    render();
    load();
  }

  init();
})();
