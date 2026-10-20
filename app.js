// 나의 할 일 — 동작
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DURATION_LABELS = { 15: '15분', 30: '30분', 60: '1시간', 120: '2시간', 180: '3시간 이상' };
const DURATION_CLASSES = { 15: 'chip--sky', 30: 'chip--lime', 60: 'chip--pink', 120: 'chip--peach', 180: 'chip--green' };
const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';
const CHECK_SM_SVG = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';

const $ = (id) => document.getElementById(id);

// ---------- 날짜 도우미 ----------
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function todayYmd() { return ymd(new Date()); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
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
};

let entered = false;

// ---------- 화면 전환 / 알림 ----------
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

function goToDate(date) {
  state.selected = date;
  const d = parseYmd(date);
  state.viewYear = d.getFullYear();
  state.viewMonth = d.getMonth();
}

// ---------- 데이터 ----------
async function loadTodos() {
  const { data, error } = await sb.from('todos').select('*').order('created_at', { ascending: true });
  if (error) { toast('불러오지 못했어요: ' + error.message); return; }
  state.todos = data;
  state.loaded = true;
}

function todosOn(date) {
  return state.todos.filter((t) => t.due_date === date);
}

function overdueTodos() {
  const today = todayYmd();
  return state.todos
    .filter((t) => !t.completed && t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at));
}

async function saveTodo(fields) {
  if (state.editingId) {
    const { data, error } = await sb.from('todos').update(fields).eq('id', state.editingId).select().single();
    if (error) throw error;
    const i = state.todos.findIndex((t) => t.id === data.id);
    if (i >= 0) state.todos[i] = data;
    return data;
  }
  const { data, error } = await sb.from('todos').insert(fields).select().single();
  if (error) throw error;
  state.todos.push(data);
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
  if (!window.confirm('정말 지울까요?')) return;
  const { error } = await sb.from('todos').delete().eq('id', id);
  if (error) { toast('지우지 못했어요: ' + error.message); return; }
  state.todos = state.todos.filter((t) => t.id !== id);
  render();
  showView('home');
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

function renderCalendar() {
  const y = state.viewYear;
  const m = state.viewMonth;
  const today = todayYmd();
  $('cal-title').textContent = `${y}년 ${m + 1}월`;

  const firstDow = new Date(y, m, 1).getDay();
  const dayCount = new Date(y, m + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="cal__blank"></div>';

  for (let d = 1; d <= dayCount; d++) {
    const date = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = todosOn(date);
    const remaining = list.filter((t) => !t.completed).length;
    const dow = (firstDow + d - 1) % 7;

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
    html += `<button type="button" class="${cls.join(' ')}" data-date="${date}" aria-pressed="${date === state.selected}" aria-label="${label}"><span class="cal__num">${d}</span>${badge}</button>`;
  }
  $('cal-grid').innerHTML = html;
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
  const open = list.filter((t) => !t.completed);
  const done = list.filter((t) => t.completed);
  const minutes = open.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);

  $('chip-time').textContent = `남은 예상 시간 ${formatMinutes(minutes)}`;
  $('chip-count').textContent = `${open.length}개 남음`;
  $('todo-list').innerHTML = [...open, ...done].map(todoCard).join('');
  $('day-empty').hidden = !(state.loaded && list.length === 0);
  $('day-done').hidden = !(state.loaded && list.length > 0 && open.length === 0);
}

function durationChip(t) {
  if (!t.estimated_minutes) return '';
  const cls = t.completed ? 'chip--muted' : DURATION_CLASSES[t.estimated_minutes];
  return `<span class="chip chip--sm ${cls}">${DURATION_LABELS[t.estimated_minutes]}</span>`;
}

function todoCard(t) {
  return `<article class="todo${t.completed ? ' is-done' : ''}" data-id="${t.id}">
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
  state.editingId = todo ? todo.id : null;
  state.pickedMinutes = todo ? todo.estimated_minutes : null;
  $('edit-title').textContent = todo ? '할 일 고치기' : '새 할 일';
  $('f-title').value = todo ? todo.title : '';
  $('f-desc').value = todo ? todo.description : '';
  $('f-date').value = todo ? todo.due_date : date;
  $('btn-delete').hidden = !todo;
  updateCounters();
  renderPills();
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

async function submitEdit(e) {
  e.preventDefault();
  const title = $('f-title').value.trim();
  const description = $('f-desc').value.trim();
  const due_date = $('f-date').value;

  if (!title) { toast('제목을 적어 주세요.'); $('f-title').focus(); return; }
  if (!description) { toast('한 줄 설명을 적어 주세요.'); $('f-desc').focus(); return; }
  if (!due_date) { toast('날짜를 골라 주세요.'); $('f-date').focus(); return; }

  const btn = $('edit-submit');
  btn.disabled = true;
  try {
    const saved = await saveTodo({ title, description, due_date, estimated_minutes: state.pickedMinutes });
    goToDate(saved.due_date);
    render();
    showView('home');
  } catch (err) {
    toast('저장하지 못했어요: ' + err.message);
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
    if (!window.confirm('로그아웃할까요? 다시 들어오려면 이메일 인증을 한 번 더 해야 해요.')) return;
    await sb.auth.signOut();
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
    render();
  });

  $('todo-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const id = b.closest('.todo').dataset.id;
    if (b.dataset.action === 'toggle') toggleTodo(id);
    if (b.dataset.action === 'edit') openEdit(state.todos.find((t) => t.id === id), state.selected);
  });

  $('overdue-banner').addEventListener('click', () => { renderOverdue(); showView('overdue'); });
  $('overdue-back').addEventListener('click', () => showView('home'));
  $('overdue-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const id = b.closest('.todo').dataset.id;
    if (b.dataset.action === 'move') moveToToday([id]);
    if (b.dataset.action === 'edit') openEdit(state.todos.find((t) => t.id === id), state.selected);
  });
  $('btn-move-all').addEventListener('click', () => moveToToday(overdueTodos().map((t) => t.id)));

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
