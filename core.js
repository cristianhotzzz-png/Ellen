// Núcleo do app: estado, ícones, avisos, janelas (sheets) e cache de agendamentos.
import * as U from './util.js';
import { esc } from './util.js';

export const S = {
  cfg: null,
  session: null,
  settings: null,
  clients: [],
  clientMap: new Map(),
  stats: new Map(),
  services: [],
  appts: new Map(), // cache: id -> agendamento (qualquer período já carregado)
  route: 'inicio',
  agenda: { mode: 'dia', date: null, q: '', searchIds: [] },
  fin: { month: null },
  clientsQ: '',
  quoteIdx: 0,
  curioIdx: 0,
  faithIdx: 0,
};

// ganchos preenchidos pelo app.js (evita import circular)
export const R = { repaint() {}, reload() {} };

export const tz = () => (S.settings && S.settings.timezone) || U.TZ_DEFAULT;
export const today = () => U.todayStr(tz());

/* ---------- ícones (sprite no index.html) ---------- */
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

/* ---------- clientes e serviços ---------- */
export function setClients(list) {
  S.clients = list;
  S.clientMap = new Map(list.map((c) => [c.id, c]));
}
export function upsertClient(c) {
  const i = S.clients.findIndex((x) => x.id === c.id);
  if (i >= 0) S.clients[i] = c;
  else S.clients.push(c);
  S.clients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  S.clientMap = new Map(S.clients.map((x) => [x.id, x]));
}
export function removeClient(id) {
  S.clients = S.clients.filter((c) => c.id !== id);
  S.clientMap.delete(id);
  for (const [k, a] of S.appts) if (a.client_id === id) S.appts.delete(k);
}
export const clientName = (id) => (S.clientMap.get(id) || {}).name || 'Cliente removida';
export const serviceById = (id) => S.services.find((s) => s.id === id);

/* ---------- cache de agendamentos ---------- */
export function putAppts(list) {
  for (const a of list) S.appts.set(a.id, a);
}
/** Substitui, no cache, tudo que está no período pelo resultado novo do servidor. */
export function replaceRange(fromISO, toISO, list) {
  for (const [k, a] of S.appts) if (a.start_at >= fromISO && a.start_at < toISO) S.appts.delete(k);
  putAppts(list);
}
export const apptsBetween = (fromISO, toISO) =>
  [...S.appts.values()].filter((a) => a.start_at >= fromISO && a.start_at < toISO).sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
export const apptDate = (a) => U.localDateStr(a.start_at, tz());
export const apptsOnDate = (dateStr) => {
  const [f, t] = U.dayRangeISO(dateStr, tz());
  return apptsBetween(f, t);
};

export const STATUS = {
  scheduled: { label: 'Aguardando', cls: 'wait' },
  attended: { label: 'Compareceu', cls: 'ok' },
  missed: { label: 'Faltou', cls: 'miss' },
  cancelled: { label: 'Cancelado', cls: 'cancel' },
};

/* ---------- avisos (toasts) ---------- */
let toastTimer;
export function toast(message, { type = 'ok', action = null, ms } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  clearTimeout(toastTimer);
  box.innerHTML = '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      box.innerHTML = '';
      action.fn();
    });
    el.appendChild(b);
  }
  box.appendChild(el);
  toastTimer = setTimeout(() => (box.innerHTML = ''), ms || (action ? 7000 : type === 'error' ? 6000 : 3200));
}

/* ---------- janela principal (sheet) e confirmação ---------- */
const sheetEl = () => document.getElementById('sheet');
export function openSheet(html, { wide = false } = {}) {
  const d = sheetEl();
  d.innerHTML = html;
  d.classList.toggle('wide', wide);
  if (!d.open) d.showModal();
  document.body.classList.add('lock');
  const first = d.querySelector('[data-autofocus]');
  if (first) setTimeout(() => first.focus(), 60);
  d.scrollTop = 0;
  return d;
}
export function closeSheet() {
  const d = sheetEl();
  if (d && d.open) d.close();
  document.body.classList.remove('lock');
}
export const sheetOpen = () => {
  const d = sheetEl();
  return !!(d && d.open);
};

export function confirmDialog({ title, text = '', ok = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const d = document.getElementById('confirm');
    d.innerHTML = `<form method="dialog" class="confirm-box">
      <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="row end">
        <button type="submit" value="no" class="btn ghost">Voltar</button>
        <button type="submit" value="yes" class="btn ${danger ? 'danger' : 'primary'}" data-autofocus>${esc(ok)}</button>
      </div></form>`;
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
    d.returnValue = 'no';
    d.showModal();
  });
}

export function headerOf(title, sub = '') {
  return `<div class="sheet-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Fechar">${icon('x')}</button></div>`;
}

/** imagem do serviço (miniaturas do material da Ellen) */
export function serviceImg(name) {
  const n = U.norm(name);
  if (n.includes('f1') || n.includes('molde')) return 'svc-f1.jpg';
  if (n.includes('soft')) return 'svc-soft.jpg';
  if (n.includes('gel')) return 'svc-gel.jpg';
  if (n.includes('tradicional') || n.includes('simples') || n.includes('esmalt')) return 'svc-simples.jpg';
  return null;
}
