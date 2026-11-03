// 나의 할 일 — 동작
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DURATION_LABELS = { 15: '15분', 30: '30분', 60: '1시간', 120: '2시간', 180: '3시간 이상' };
const DURATION_CLASSES = { 15: 'chip--sky', 30: 'chip--lime', 60: 'chip--pink', 120: 'chip--peach', 180: 'chip--green' };
const MAX_BATCH = 200; // 한 번에 만들 수 있는 할 일 개수
const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';
const CHECK_SM_SVG = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';
const HANDLE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"></path></svg>';
const UP_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6"></path></svg>';
const DOWN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>';

const $ = (id) => document.getElementById(id);

// ---------- 날짜 도우미 ----------
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function todayYmd() { return ymd(new Date()); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function addMonths(s, n) {
  const d = parseYmd(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, dim));
  return ymd(t);
}
function formatDate(s) { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; }
function formatDateWeekday(s) { return `${formatDate(s)} ${WEEKDAYS[parseYmd(s).getDay()]}요일`; }
function formatDateShort(s) { return `${formatDate(s)} (${WEEKDAYS[parseYmd(s).getDay()]})`; }

function formatMinutes(min) {
  if (!min) return '0분';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 상태 ----------
const state = {
  todos: [],
  loaded: false,
  viewYear: new Date().getFullYear(),
  viewMonth: new Date().getMonth(), // 0 = 1월
  selected: todayYmd(),
  editingId: null,
  pickedMinutes: null,
  mode: 'single', // single | multi | repeat
  pick: { year: 0, month: 0, dates: new Set() },
  repeat: { kind: 'daily', weekdays: new Set(), endMode: 'until' },
  reorder: false, // 순서 바꾸기 모드
  drag: null,
};

let entered = false;

// ---------- 화면 전환 / 알림 / 확인 창 ----------
function showView(name) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

// 확인 창: 제목과 버튼 목록을 보여주고, 누른 버튼의 value를 돌려준다 (바깥을 누르면 null)
function ask(title, actions) {
  return new Promise((resolve) => {
    const dlg = $('dialog');
    const box = $('dialog-actions');
    $('dialog-title').textContent = title;
    box.innerHTML = actions
      .map((a, i) => `<button type="button" class="btn ${a.danger ? 'btn--danger' : 'btn--outline'}" data-i="${i}">${escapeHtml(a.label)}</button>`)
      .join('');
    const close = (v) => { dlg.hidden = true; dlg.onclick = null; box.onclick = null; resolve(v); };
    box.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) close(actions[Number(b.dataset.i)].value);
    };
    dlg.onclick = (e) => { if (e.target === dlg) close(null); };
    dlg.hidden = false;
    const first = box.querySelector('button');
    if (first) first.focus();
  });
}

function goToDate(date) {
  state.selected = date;
  const d = parseYmd(date);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
}

// ---------- 데이터 ----------
function sortTodos() {
  state.todos.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.due_date.localeCompare(b.due_date));
}

async function loadTodos() {
  const { data, error } = await sb.from('todos').select('*').order('created_at', { ascending: true });
  if (error) { toast('불러오지 못했어요: ' + error.message); return; }
  state.todos = data;
  sortTodos();
  state.loaded = true;
}

function todosOn(date) {
  return state.todos.filter((t) => t.due_date === date);
}

// 하루 안의 순서: 직접 정한 순서(sort_order)가 먼저, 아직 안 정한 것은 만든 순서대로 뒤에
function byOrder(a, b) {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  return ao - bo || a.created_at.localeCompare(b.created_at);
}

function openTodosOn(date) {
  return todosOn(date).filter((t) => !t.completed).sort(byOrder);
}

function overdueTodos() {
  const today = todayYmd();
  return state.todos
    .filter((t) => !t.completed && t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at));
}

async function updateTodo(id, fields) {
  const { data, error } = await sb.from('todos').update(fields).eq('id', id).select().single();
  if (error) throw error;
  const i = state.todos.findIndex((t) => t.id === data.id);
  if (i >= 0) state.todos[i] = data;
  return data;
}

async function insertTodos(rows) {
  const { data, error } = await sb.from('todos').insert(rows).select();
  if (error) throw error;
  state.todos.push(...data);
  sortTodos();
  return data;
}

async function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  render();
  const { error } = await sb.from('todos').update({ completed: t.completed }).eq('id', id);
  if (error) {
    t.completed = !t.completed;
    render();
    toast('저장하지 못했어요: ' + error.message);
  }
}

async function deleteTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  const siblings = t.series_id ? state.todos.filter((x) => x.series_id === t.series_id) : [t];

  let choice;
  if (siblings.length > 1) {
    choice = await ask('지울까요?', [
      { label: '이것만 지우기', value: 'one', danger: true },
      { label: `같이 만든 ${siblings.length}개 모두 지우기`, value: 'all', danger: true },
      { label: '취소', value: null },
    ]);
  } else {
    choice = await ask('정말 지울까요?', [
      { label: '지우기', value: 'one', danger: true },
      { label: '취소', value: null },
    ]);
  }
  if (!choice) return;

  const ids = choice === 'all' ? siblings.map((x) => x.id) : [id];
  const { error } = await sb.from('todos').delete().in('id', ids);
  if (error) { toast('지우지 못했어요: ' + error.message); return; }
  state.todos = state.todos.filter((x) => !ids.includes(x.id));
  if (ids.length > 1) toast(`${ids.length}개를 지웠어요.`);
  render();
  showView('home');
}

// ---------- 순서 바꾸기 ----------
function setReorder(on) {
  state.reorder = on;
  if (!on) endDrag(false);
  renderDay();
}

// ids 순서대로 sort_order를 다시 매기고 저장한다
async function applyOrder(ids) {
  const changed = [];
  ids.forEach((id, i) => {
    const t = state.todos.find((x) => x.id === id);
    const v = (i + 1) * 10;
    if (t && t.sort_order !== v) { t.sort_order = v; changed.push(t); }
  });
  renderDay();
  if (!changed.length) return;
  const results = await Promise.all(changed.map((t) => sb.from('todos').update({ sort_order: t.sort_order }).eq('id', t.id)));
  const failed = results.find((r) => r.error);
  if (failed) {
    toast(/sort_order/.test(failed.error.message)
      ? '보관함 업데이트가 필요해요. Supabase에서 supabase/update-2-sort.sql을 실행해 주세요.'
      : '순서를 저장하지 못했어요: ' + failed.error.message);
  }
}

function moveBy(id, delta) {
  const open = openTodosOn(state.selected);
  const i = open.findIndex((t) => t.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= open.length) return;
  [open[i], open[j]] = [open[j], open[i]];
  applyOrder(open.map((t) => t.id));
}

// 손잡이를 끌어서 옮기기 (휴대폰 터치와 마우스 모두)
function startDrag(e, handle) {
  const card = handle.closest('.todo');
  if (!card || state.drag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  state.drag = { card, handle, pointerId: e.pointerId, startY: e.clientY, list: $('todo-list') };
  card.classList.add('is-dragging');
}

function moveDrag(e) {
  const d = state.drag;
  if (!d || e.pointerId !== d.pointerId) return;
  const y = e.clientY;
  d.card.style.transform = `translateY(${y - d.startY}px)`;

  // 아래 카드의 중간을 지나면 그 뒤로, 위 카드의 중간을 지나면 그 앞으로
  const next = d.card.nextElementSibling;
  const prev = d.card.previousElementSibling;
  let target = null;
  let after = false;
  if (next && next.classList.contains('is-open')) {
    const r = next.getBoundingClientRect();
    if (y > r.top + r.height / 2) { target = next; after = true; }
  }
  if (!target && prev && prev.classList.contains('is-open')) {
    const r = prev.getBoundingClientRect();
    if (y < r.top + r.height / 2) { target = prev; after = false; }
  }
  if (!target) return;

  const before = d.card.getBoundingClientRect().top;
  if (after) target.after(d.card); else target.before(d.card);
  const now = d.card.getBoundingClientRect().top;
  d.startY += now - before; // 자리가 바뀌어도 손가락 아래에 그대로 있게
  d.card.style.transform = `translateY(${y - d.startY}px)`;
}

function endDrag(save = true) {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  d.card.classList.remove('is-dragging');
  d.card.style.transform = '';
  try { d.handle.releasePointerCapture(d.pointerId); } catch (_) { /* 이미 풀린 경우 */ }
  if (save) applyOrder([...d.list.querySelectorAll('.todo.is-open')].map((c) => c.dataset.id));
}

async function moveToToday(ids) {
  if (!ids.length) return;
  const today = todayYmd();
  const { error } = await sb.from('todos').update({ due_date: today }).in('id', ids);
  if (error) { toast('옮기지 못했어요: ' + error.message); return; }
  for (const t of state.todos) if (ids.includes(t.id)) t.due_date = today;
  toast(ids.length === 1 ? '오늘로 옮겼어요.' : `${ids.length}개를 오늘로 옮겼어요.`);
  if (overdueTodos().length === 0) {
    goToDate(today);
    render();
    showView('home');
  } else {
    render();
    renderOverdue();
  }
}

// ---------- 그리기: 홈 ----------
function render() {
  renderOverdueBanner();
  renderCalendar();
  renderDay();
  $('loading').hidden = state.loaded;
}

function renderOverdueBanner() {
  const n = overdueTodos().length;
  $('overdue-banner').hidden = n === 0;
  $('overdue-count-text').textContent = `밀린 할 일 ${n}개`;
}

// 달력 한 달 그리기. cell(date, dow) 가 각 날짜 칸의 HTML을 돌려준다.
function monthGrid(y, m, cell) {
  const firstDow = new Date(y, m, 1).getDay();
  const dayCount = new Date(y, m + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="cal__blank"></div>';
  for (let d = 1; d <= dayCount; d++) {
    html += cell(`${y}-${pad(m + 1)}-${pad(d)}`, (firstDow + d - 1) % 7, d);
  }
  return html;
}

function renderCalendar() {
  const y = state.viewYear;
  const m = state.viewMonth;
  const today = todayYmd();
  $('cal-title').textContent = `${y}년 ${m + 1}월`;

  $('cal-grid').innerHTML = monthGrid(y, m, (date, dow, d) => {
    const list = todosOn(date);
    const remaining = list.filter((t) => !t.completed).length;

    const cls = ['cal__day'];
    if (date === today) cls.push('is-today');
    if (date === state.selected) cls.push('is-selected');
    if (date < today) cls.push('is-past');
    if (dow === 0) cls.push('is-sun');

    let badge = '';
    if (list.length && remaining === 0) {
      badge = `<span class="cal__check">${CHECK_SM_SVG}</span>`;
    } else if (remaining) {
      badge = `<span class="cal__badge${date < today ? ' cal__badge--late' : ''}">${remaining}</span>`;
    }

    const label = `${m + 1}월 ${d}일` + (remaining ? `, 남은 할 일 ${remaining}개` : list.length ? ', 다 끝냄' : '');
    return `<button type="button" class="${cls.join(' ')}" data-date="${date}" aria-pressed="${date === state.selected}" aria-label="${label}"><span class="cal__num">${d}</span>${badge}</button>`;
  });
}

function renderDay() {
  const today = todayYmd();
  const s = state.selected;
  let prefix = '';
  if (s === today) prefix = '오늘 · ';
  else if (s === addDays(today, -1)) prefix = '어제 · ';
  else if (s === addDays(today, 1)) prefix = '내일 · ';
  $('day-title').textContent = prefix + formatDateWeekday(s);

  const list = todosOn(s);
  const open = openTodosOn(s);
  const done = list.filter((t) => t.completed).sort(byOrder);
  const minutes = open.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);

  if (open.length < 2) state.reorder = false;
  const btn = $('btn-reorder');
  btn.hidden = open.length < 2;
  btn.textContent = state.reorder ? '순서 바꾸기 끝' : '순서 바꾸기';
  btn.classList.toggle('is-on', state.reorder);
  btn.setAttribute('aria-pressed', String(state.reorder));

  $('chip-time').textContent = `남은 예상 시간 ${formatMinutes(minutes)}`;
  $('chip-count').textContent = `${open.length}개 남음`;
  $('todo-list').innerHTML = [
    ...open.map((t, i) => (state.reorder ? reorderCard(t, i, open.length) : todoCard(t))),
    ...done.map(todoCard),
  ].join('');
  $('day-empty').hidden = !(state.loaded && list.length === 0);
  $('day-done').hidden = !(state.loaded && list.length > 0 && open.length === 0);
}

function reorderCard(t, i, n) {
  return `<article class="todo is-open todo--reorder" data-id="${t.id}">
    <button type="button" class="todo__handle" data-action="drag" aria-label="끌어서 순서 바꾸기">${HANDLE_SVG}</button>
    <div class="todo__body">
      <span class="todo__title">${escapeHtml(t.title)}</span>
      <span class="todo__desc">${escapeHtml(t.description)}</span>
    </div>
    <div class="todo__arrows">
      <button type="button" class="arrow" data-action="up" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${UP_SVG}</button>
      <button type="button" class="arrow" data-action="down" aria-label="아래로" ${i === n - 1 ? 'disabled' : ''}>${DOWN_SVG}</button>
    </div>
  </article>`;
}

function durationChip(t) {
  if (!t.estimated_minutes) return '';
  const cls = t.completed ? 'chip--muted' : DURATION_CLASSES[t.estimated_minutes];
  return `<span class="chip chip--sm ${cls}">${DURATION_LABELS[t.estimated_minutes]}</span>`;
}

function todoCard(t) {
  return `<article class="todo${t.completed ? ' is-done' : ' is-open'}" data-id="${t.id}">
    <button type="button" class="todo__check" data-action="toggle" aria-label="${t.completed ? '완료 취소' : '완료 표시'}" aria-pressed="${t.completed}">${t.completed ? CHECK_SVG : ''}</button>
    <button type="button" class="todo__body" data-action="edit">
      <span class="todo__title">${escapeHtml(t.title)}</span>
      <span class="todo__desc">${escapeHtml(t.description)}</span>
    </button>
    ${durationChip(t)}
  </article>`;
}

// ---------- 그리기: 밀린 할 일 ----------
function renderOverdue() {
  const list = overdueTodos();
  $('overdue-lead').textContent = list.length
    ? `어제까지 못 끝낸 할 일이 ${list.length}개 있어요. 오늘로 옮기거나 그냥 둘 수 있어요.`
    : '밀린 할 일이 없어요.';
  $('overdue-list').innerHTML = list.map((t) => `<article class="todo" data-id="${t.id}">
    <button type="button" class="todo__body" data-action="edit">
      <span class="todo__title">${escapeHtml(t.title)}</span>
      <span class="todo__meta">${durationChip(t)}<span class="todo__date">${formatDateShort(t.due_date)}</span><span class="todo__desc">· ${escapeHtml(t.description)}</span></span>
    </button>
    <button type="button" class="btn btn--outline btn--sm" data-action="move">오늘로</button>
  </article>`).join('');
  $('btn-move-all').disabled = list.length === 0;
}

// ---------- 추가 / 고치기 화면 ----------
function openEdit(todo, date) {
  if (state.reorder) setReorder(false);
  state.editingId = todo ? todo.id : null;
  state.pickedMinutes = todo ? todo.estimated_minutes : null;
  $('edit-title').textContent = todo ? '할 일 고치기' : '새 할 일';
  $('f-title').value = todo ? todo.title : '';
  $('f-desc').value = todo ? todo.description : '';
  $('f-date').value = todo ? todo.due_date : date;
  $('btn-delete').hidden = !todo;
  $('mode-pills').hidden = !!todo; // 고칠 때는 하루 날짜만 바꾼다

  // 새 할 일: 날짜 방식 초기화
  state.mode = 'single';
  const d = parseYmd(date);
  state.pick = { year: d.getFullYear(), month: d.getMonth(), dates: new Set() };
  state.repeat = { kind: 'daily', weekdays: new Set([d.getDay()]), endMode: 'until' };
  $('r-start').value = date;
  $('r-until').value = addMonths(date, 1);
  $('r-count').value = '10';
  $('r-every').value = '3';

  updateCounters();
  renderPills();
  renderMode();
  showView('edit');
  if (!todo) $('f-title').focus();
}

function updateCounters() {
  $('count-title').textContent = `${$('f-title').value.length}/50`;
  $('count-desc').textContent = `${$('f-desc').value.length}/100`;
}

function renderPills() {
  for (const b of $('f-duration').querySelectorAll('.pill')) {
    const on = Number(b.dataset.minutes) === state.pickedMinutes;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function setPressed(container, attr, value) {
  for (const b of container.querySelectorAll(`[data-${attr}]`)) {
    const on = b.dataset[attr] === String(value);
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function renderMode() {
  setPressed($('mode-pills'), 'mode', state.mode);
  $('mode-single').hidden = state.mode !== 'single';
  $('mode-multi').hidden = state.mode !== 'multi';
  $('mode-repeat').hidden = state.mode !== 'repeat';
  if (state.mode === 'multi') renderPicker();
  if (state.mode === 'repeat') renderRepeat();
}

// 여러 날 고르기 달력
function renderPicker() {
  const { year: y, month: m, dates } = state.pick;
  const today = todayYmd();
  $('pick-title').textContent = `${y}년 ${m + 1}월`;
  $('pick-grid').innerHTML = monthGrid(y, m, (date, dow, d) => {
    const cls = ['cal__day', 'cal__day--pick'];
    if (date === today) cls.push('is-today');
    if (date < today) cls.push('is-past');
    if (dow === 0) cls.push('is-sun');
    if (dates.has(date)) cls.push('is-picked');
    return `<button type="button" class="${cls.join(' ')}" data-pick="${date}" aria-pressed="${dates.has(date)}" aria-label="${m + 1}월 ${d}일"><span class="cal__num">${d}</span></button>`;
  });

  const list = [...dates].sort();
  $('multi-summary').textContent = list.length
    ? `${list.length}일 선택: ` + list.slice(0, 4).map(formatDate).join(', ') + (list.length > 4 ? ` 외 ${list.length - 4}일` : '')
    : '날짜를 눌러서 고르세요. 여러 개 고를 수 있어요.';
}

// 반복 규칙으로 날짜 목록 만들기
function computeRepeatDates() {
  const start = $('r-start').value;
  if (!start) return { dates: [], error: '시작일을 골라 주세요.' };
  const { kind, weekdays, endMode } = state.repeat;
  const every = Math.floor(Number($('r-every').value) || 0);
  const until = $('r-until').value;
  const count = Math.floor(Number($('r-count').value) || 0);

  if (kind === 'weekly' && weekdays.size === 0) return { dates: [], error: '요일을 하나 이상 골라 주세요.' };
  if (kind === 'every' && every < 1) return { dates: [], error: '며칠마다 반복할지 적어 주세요.' };
  if (endMode === 'until' && !until) return { dates: [], error: '종료 날짜를 골라 주세요.' };
  if (endMode === 'until' && until < start) return { dates: [], error: '종료 날짜는 시작일보다 뒤여야 해요.' };
  if (endMode === 'count' && count < 1) return { dates: [], error: '횟수를 1 이상으로 적어 주세요.' };

  const limit = endMode === 'count' ? Math.min(count, MAX_BATCH) : MAX_BATCH;
  const dates = [];
  let capped = false;

  if (kind === 'monthly') {
    const s = parseYmd(start);
    const day = s.getDate();
    for (let k = 0; ; k++) {
      const first = new Date(s.getFullYear(), s.getMonth() + k, 1);
      const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const d = ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(day, dim)));
      if (endMode === 'until' && d > until) break;
      dates.push(d);
      if (dates.length >= limit) { capped = endMode === 'until'; break; }
    }
  } else {
    const step = kind === 'every' ? every : 1;
    for (let d = start; ; d = addDays(d, step)) {
      if (endMode === 'until' && d > until) break;
      if (kind === 'weekly' && !weekdays.has(parseYmd(d).getDay())) continue;
      dates.push(d);
      if (dates.length >= limit) { capped = endMode === 'until'; break; }
    }
  }
  return { dates, capped };
}

function describeRepeat() {
  const { kind, weekdays } = state.repeat;
  if (kind === 'daily') return '매일';
  if (kind === 'every') return `${Math.floor(Number($('r-every').value) || 0)}일마다`;
  if (kind === 'weekly') return '매주 ' + [...weekdays].sort().map((d) => WEEKDAYS[d]).join('·');
  const start = $('r-start').value;
  return start ? `매월 ${parseYmd(start).getDate()}일` : '매월';
}

function renderRepeat() {
  const { kind, weekdays, endMode } = state.repeat;
  setPressed($('r-kind'), 'kind', kind);
  setPressed($('r-end'), 'end', endMode);
  $('r-weekdays').hidden = kind !== 'weekly';
  $('r-every-wrap').hidden = kind !== 'every';
  $('r-until-wrap').hidden = endMode !== 'until';
  $('r-count-wrap').hidden = endMode !== 'count';
  for (const b of $('r-weekdays').querySelectorAll('.wd')) {
    const on = weekdays.has(Number(b.dataset.dow));
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }

  const r = computeRepeatDates();
  const el = $('repeat-summary');
  if (r.error) { el.textContent = r.error; return; }
  const start = $('r-start').value;
  const end = endMode === 'until' ? `${formatDate($('r-until').value)}까지` : `${Math.floor(Number($('r-count').value) || 0)}번`;
  el.textContent = `${formatDate(start)}부터 ${describeRepeat()}, ${end} → ${r.dates.length}개 만들어요.` + (r.capped ? ` (한 번에 ${MAX_BATCH}개까지만 만들어요)` : '');
}

async function submitEdit(e) {
  e.preventDefault();
  const title = $('f-title').value.trim();
  const description = $('f-desc').value.trim();

  if (!title) { toast('제목을 적어 주세요.'); $('f-title').focus(); return; }
  if (!description) { toast('한 줄 설명을 적어 주세요.'); $('f-desc').focus(); return; }

  // 날짜 목록 정하기
  let dates;
  if (state.editingId || state.mode === 'single') {
    const due_date = $('f-date').value;
    if (!due_date) { toast('날짜를 골라 주세요.'); $('f-date').focus(); return; }
    dates = [due_date];
  } else if (state.mode === 'multi') {
    dates = [...state.pick.dates].sort();
    if (!dates.length) { toast('날짜를 하나 이상 골라 주세요.'); return; }
  } else {
    const r = computeRepeatDates();
    if (r.error) { toast(r.error); return; }
    if (!r.dates.length) { toast('만들어질 날짜가 없어요. 규칙을 확인해 주세요.'); return; }
    dates = r.dates;
  }

  const btn = $('edit-submit');
  btn.disabled = true;
  try {
    const base = { title, description, estimated_minutes: state.pickedMinutes };
    if (state.editingId) {
      await updateTodo(state.editingId, { ...base, due_date: dates[0] });
    } else {
      // 혼자 만든 할 일에는 묶음 번호를 붙이지 않는다
      const series_id = dates.length > 1 ? crypto.randomUUID() : null;
      await insertTodos(dates.map((due_date) => (series_id ? { ...base, due_date, series_id } : { ...base, due_date })));
      if (dates.length > 1) toast(`${dates.length}개를 만들었어요.`);
    }
    goToDate(dates[0]);
    render();
    showView('home');
  } catch (err) {
    if (/series_id/.test(err.message)) {
      toast('보관함 업데이트가 필요해요. Supabase에서 supabase/update-1-series.sql을 실행해 주세요.');
    } else {
      toast('저장하지 못했어요: ' + err.message);
    }
  } finally {
    btn.disabled = false;
  }
}

// ---------- 로그인 ----------
async function sendLink(e) {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  if (!email) { $('auth-email').focus(); return; }
  const btn = $('auth-submit');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  btn.disabled = false;
  if (error) { toast('메일을 보내지 못했어요: ' + error.message); return; }
  $('auth-form').hidden = true;
  $('auth-sent').hidden = false;
}

async function enter() {
  if (entered) return;
  entered = true;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  showView('home');
  render();
  await loadTodos();
  render();
}

function leave() {
  entered = false;
  state.todos = [];
  state.loaded = false;
  $('auth-form').hidden = false;
  $('auth-sent').hidden = true;
  showView('auth');
}

// ---------- 이벤트 연결 ----------
function wireEvents() {
  $('auth-form').addEventListener('submit', sendLink);

  $('btn-add-top').addEventListener('click', () => openEdit(null, state.selected));
  $('btn-add').addEventListener('click', () => openEdit(null, state.selected));
  $('btn-logout').addEventListener('click', async () => {
    const ok = await ask('로그아웃할까요? 다시 들어오려면 이메일 인증을 한 번 더 해야 해요.', [
      { label: '로그아웃', value: 'yes', danger: true },
      { label: '취소', value: null },
    ]);
    if (ok) await sb.auth.signOut();
  });

  $('cal-prev').addEventListener('click', () => {
    state.viewMonth -= 1;
    if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear -= 1; }
    renderCalendar();
  });
  $('cal-next').addEventListener('click', () => {
    state.viewMonth += 1;
    if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear += 1; }
    renderCalendar();
  });
  $('cal-title').addEventListener('click', () => { goToDate(todayYmd()); render(); });
  $('cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (!b) return;
    state.selected = b.dataset.date;
    state.reorder = false;
    render();
  });

  $('todo-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const id = b.closest('.todo').dataset.id;
    if (b.dataset.action === 'toggle') toggleTodo(id);
    if (b.dataset.action === 'edit') openEdit(state.todos.find((t) => t.id === id), state.selected);
    if (b.dataset.action === 'up') moveBy(id, -1);
    if (b.dataset.action === 'down') moveBy(id, 1);
  });

  // 순서 바꾸기: 손잡이 끌기
  $('btn-reorder').addEventListener('click', () => setReorder(!state.reorder));
  const list = $('todo-list');
  list.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-action="drag"]');
    if (h) startDrag(e, h);
  });
  list.addEventListener('pointermove', moveDrag);
  list.addEventListener('pointerup', () => endDrag(true));
  list.addEventListener('pointercancel', () => endDrag(true));

  $('overdue-banner').addEventListener('click', () => { setReorder(false); renderOverdue(); showView('overdue'); });
  $('overdue-back').addEventListener('click', () => showView('home'));
  $('overdue-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const id = b.closest('.todo').dataset.id;
    if (b.dataset.action === 'move') moveToToday([id]);
    if (b.dataset.action === 'edit') openEdit(state.todos.find((t) => t.id === id), state.selected);
  });
  $('btn-move-all').addEventListener('click', () => moveToToday(overdueTodos().map((t) => t.id)));

  // 추가 / 고치기
  $('edit-back').addEventListener('click', () => showView('home'));
  $('edit-form').addEventListener('submit', submitEdit);
  $('f-title').addEventListener('input', updateCounters);
  $('f-desc').addEventListener('input', updateCounters);
  $('f-duration').addEventListener('click', (e) => {
    const b = e.target.closest('.pill');
    if (!b) return;
    const minutes = Number(b.dataset.minutes);
    state.pickedMinutes = state.pickedMinutes === minutes ? null : minutes;
    renderPills();
  });
  $('btn-delete').addEventListener('click', () => { if (state.editingId) deleteTodo(state.editingId); });

  // 날짜 방식: 하루 / 여러 날 / 반복
  $('mode-pills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    state.mode = b.dataset.mode;
    renderMode();
  });

  // 여러 날 고르기
  $('pick-prev').addEventListener('click', () => {
    state.pick.month -= 1;
    if (state.pick.month < 0) { state.pick.month = 11; state.pick.year -= 1; }
    renderPicker();
  });
  $('pick-next').addEventListener('click', () => {
    state.pick.month += 1;
    if (state.pick.month > 11) { state.pick.month = 0; state.pick.year += 1; }
    renderPicker();
  });
  $('pick-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const date = b.dataset.pick;
    if (state.pick.dates.has(date)) state.pick.dates.delete(date);
    else if (state.pick.dates.size >= MAX_BATCH) { toast(`한 번에 ${MAX_BATCH}일까지 고를 수 있어요.`); return; }
    else state.pick.dates.add(date);
    renderPicker();
  });

  // 반복
  $('r-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    state.repeat.kind = b.dataset.kind;
    if (state.repeat.kind === 'weekly' && state.repeat.weekdays.size === 0 && $('r-start').value) {
      state.repeat.weekdays.add(parseYmd($('r-start').value).getDay());
    }
    renderRepeat();
  });
  $('r-weekdays').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dow]');
    if (!b) return;
    const dow = Number(b.dataset.dow);
    if (state.repeat.weekdays.has(dow)) state.repeat.weekdays.delete(dow);
    else state.repeat.weekdays.add(dow);
    renderRepeat();
  });
  $('r-end').addEventListener('click', (e) => {
    const b = e.target.closest('[data-end]');
    if (!b) return;
    state.repeat.endMode = b.dataset.end;
    renderRepeat();
  });
  $('r-start').addEventListener('change', () => {
    const start = $('r-start').value;
    if (start && (!$('r-until').value || $('r-until').value < start)) $('r-until').value = addMonths(start, 1);
    renderRepeat();
  });
  for (const id of ['r-until', 'r-count', 'r-every']) $(id).addEventListener('input', renderRepeat);
}

// ---------- 시작 ----------
async function init() {
  wireEvents();
  sb.auth.onAuthStateChange((event, session) => {
    if (session) enter();
    else if (event === 'SIGNED_OUT') leave();
  });
  const { data: { session } } = await sb.auth.getSession();
  if (session) enter();
  else showView('auth');
}

init();
