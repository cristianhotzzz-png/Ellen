// Telas do sistema. Cada tela desenha dentro de #view.
import * as API from './api.js';
import * as U from './util.js';
import { esc } from './util.js';
import { QUOTES, CURIOSITIES, FAITH, pickNoRepeat } from './content.js';
import {
  S, tz, today, icon, toast, STATUS, clientName, replaceRange, putAppts, apptsBetween, apptDate, apptsOnDate, serviceImg,
} from './core.js';
import { waMessageFor } from './actions.js';

const view = () => document.getElementById('view');
let token = 0;
let CO = false; // true = redesenhar só com o cache (sem buscar no servidor)
let logCache = null; // evita que uma tela antiga sobrescreva a atual
const loading = () => '<div class="loading" role="status"><span class="spinner"></span> Carregando…</div>';
const errBox = (e) => `<div class="notice err" role="alert">${esc(e.message || 'Erro ao carregar.')} <button class="btn small" data-action="reload">Tentar de novo</button></div>`;

export const TITLES = {
  inicio: 'Início', agenda: 'Agenda', clientes: 'Clientes', servicos: 'Serviços',
  financeiro: 'Financeiro', whatsapp: 'WhatsApp', config: 'Configurações', mais: 'Mais',
};

export async function renderView(route, fresh = false, cached = false) {
  const my = ++token;
  CO = cached;
  const v = view();
  const fn = { inicio, agenda, clientes, servicos, financeiro, whatsapp, config, mais }[route] || inicio;
  if (fresh) v.innerHTML = loading();
  try {
    const html = await fn(fresh);
    if (my !== token) return;
    v.innerHTML = html;
    if (route === 'agenda') agendaBody();
  } catch (e) {
    if (my !== token) return;
    v.innerHTML = errBox(e);
  }
}
/** Redesenha sem buscar de novo (usa o cache). */
export function repaint(route) {
  if (route === 'agenda') return agendaBody(true);
  return renderView(route, false, true);
}

/* ====================================================================
   Componentes
   ==================================================================== */
const hhmm = (iso) => U.localTimeStr(iso, tz());

function confState(a) {
  if (a.confirmation_api_at) return { k: 'api', label: 'Confirmação enviada pela API ✓', cls: 'ok' };
  if (a.confirmation_manual_at) return { k: 'manual', label: 'Marcada como enviada por você', cls: 'ok2' };
  if (a.confirmation_prepared_at) return { k: 'prep', label: 'Mensagem preparada · envio não confirmado', cls: 'wait' };
  return { k: 'none', label: 'Confirmação pendente', cls: 'none' };
}

export function apptCard(a, { showDate = false, showWa = true } = {}) {
  const st = STATUS[a.status];
  const c = S.clientMap.get(a.client_id);
  const when = showDate ? `<small>${U.fmtShortBR(apptDate(a))}</small>` : `<small>até ${hhmm(a.end_at)}</small>`;
  const isFuture = new Date(a.start_at) > new Date();
  let actions = '';
  if (a.status === 'cancelled') {
    actions = `<button class="btn soft small" data-action="reactivate" data-id="${a.id}">Reativar</button>`;
  } else {
    actions = `
      <button class="btn att ${a.status === 'attended' ? 'on' : ''}" data-action="status" data-to="attended" data-id="${a.id}" aria-pressed="${a.status === 'attended'}">✅ Compareceu</button>
      <button class="btn mis ${a.status === 'missed' ? 'on' : ''}" data-action="status" data-to="missed" data-id="${a.id}" aria-pressed="${a.status === 'missed'}">❌ Faltou</button>
      <button class="btn cnl" data-action="status" data-to="cancelled" data-id="${a.id}" aria-label="Cancelar agendamento" title="Cancelar">Cancelar</button>`;
  }
  const pay = a.status === 'attended'
    ? `<button class="chip pay ${a.payment === 'paid' ? 'paid' : 'pend'}" data-action="pay" data-id="${a.id}" title="Alternar pagamento">${a.payment === 'paid' ? '💰 Pago' : '⏳ Pagamento pendente'}</button>`
    : '';
  let wa = '';
  if (showWa && a.status === 'scheduled' && isFuture && c) {
    const cs = confState(a);
    wa = `<div class="wa-line"><span class="chip conf ${cs.cls}">${esc(cs.label)}</span>
      <button class="btn wa small" data-action="wa-prepare" data-id="${a.id}">${icon('whatsapp')} Enviar confirmação</button></div>`;
  }
  return `<article class="appt s-${st.cls}">
    <button type="button" class="appt-main" data-action="edit-appt" data-id="${a.id}" aria-label="Editar agendamento de ${esc(c ? c.name : '')}">
      <span class="time">${hhmm(a.start_at)}${when}</span>
      <span class="who"><b>${esc(c ? c.name : 'Cliente removida')}</b><small>${esc(a.service_name)} · ${U.fmtBRL(a.price_cents)}</small></span>
      <span class="chip ${st.cls}">${st.label}</span>
    </button>
    ${a.notes ? `<p class="appt-notes">${esc(a.notes)}</p>` : ''}
    <div class="appt-actions">${actions}${pay}</div>
    ${wa}
  </article>`;
}

const empty = (emoji, title, text, btn = '') =>
  `<div class="empty"><div class="empty-ic">${emoji}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn}</div>`;

const newBtn = (extra = '') => `<button class="btn primary" data-action="new-appt" ${extra}>${icon('plus')} Novo agendamento</button>`;

function pageHead(title, right = '') {
  return `<div class="page-head"><h1>${esc(title)}</h1>${right}</div>`;
}

/* ====================================================================
   INÍCIO
   ==================================================================== */
async function inicio(fresh) {
  if (fresh || !S.quoteIdx && S.quoteIdx !== 0) {
    S.quoteIdx = pickNoRepeat('ec_quote', QUOTES.length);
    S.curioIdx = pickNoRepeat('ec_curio', CURIOSITIES.length);
    S.faithIdx = pickNoRepeat('ec_faith', FAITH.length);
  }
  const now = U.nowLocal(tz());
  const [f, t] = U.dayRangeISO(now.date, tz());
  const horizon = U.zonedToUtcISO(U.addDays(now.date, 60), '00:00', tz());
  const nowISO0 = new Date().toISOString();
  const [todayList, ahead] = CO ? [apptsBetween(f, t), apptsBetween(nowISO0, horizon)] : await Promise.all([API.apptRange(f, t), API.apptRange(nowISO0, horizon)]);
  replaceRange(f, t, todayList);
  putAppts(ahead);
  const list = apptsOnDate(now.date);
  const active = list.filter((a) => a.status !== 'cancelled');
  const att = list.filter((a) => a.status === 'attended').length;
  const mis = list.filter((a) => a.status === 'missed').length;
  const nextA = ahead.find((a) => a.status === 'scheduled');
  const pendingConf = ahead.filter((a) => a.status === 'scheduled' && new Date(a.start_at) - Date.now() < 48 * 3600e3 && !a.confirmation_manual_at && !a.confirmation_api_at).length;
  const cur = CURIOSITIES[S.curioIdx];

  return `
  <section class="hero">
    <p class="hero-date">${esc(U.cap(U.fmtLongDate(now.date)))}</p>
    <h1>${U.greeting(now.hour)}, Ellen! <span aria-hidden="true">💅</span></h1>
    <blockquote class="quote">“${esc(QUOTES[S.quoteIdx])}”</blockquote>
  </section>

  <button class="cta" data-action="new-appt">${icon('plus')}<span><b>Novo agendamento</b><small>Marcar um horário agora</small></span></button>

  <section class="tiles" aria-label="Resumo de hoje">
    <div class="tile"><b>${active.length}</b><span>Agendados hoje</span></div>
    <div class="tile ok"><b>${att}</b><span>Compareceram</span></div>
    <div class="tile miss"><b>${mis}</b><span>Faltaram</span></div>
  </section>

  <section class="card">
    <h2>${icon('clock')} Próximo atendimento</h2>
    ${nextA ? apptCard(nextA, { showDate: true }) : empty('🌸', 'Nada marcado por enquanto', 'Quando você agendar, o próximo horário aparece aqui.')}
  </section>

  ${pendingConf ? `<a class="card link-card" href="#/whatsapp">${icon('whatsapp')}<span><b>${pendingConf} confirmaç${pendingConf > 1 ? 'ões pendentes' : 'ão pendente'}</b><small>Atendimentos nas próximas 48 horas sem confirmação enviada</small></span>${icon('chevR')}</a>` : ''}

  <section class="card">
    <div class="card-head"><h2>Agenda de hoje</h2><a href="#/agenda" class="link">Ver agenda</a></div>
    ${list.length ? list.map((a) => apptCard(a)).join('') : empty('☀️', 'Hoje está livre', 'Nenhum atendimento marcado para hoje.', newBtn())}
  </section>

  <section class="card soft-card">
    <div class="card-head"><h2>Um toque de conhecimento 💅</h2><button class="icon-btn" data-action="next-curio" aria-label="Outra curiosidade">${icon('refresh')}</button></div>
    <h3>${esc(cur.t)}</h3><p>${esc(cur.x)}</p>
    <a href="#/mais" class="link">Ver todas as curiosidades</a>
  </section>

  <section class="card faith">
    <h2>Fé que inspira ✨</h2>
    <p class="faith-msg">${icon('cross')} ${esc(FAITH[S.faithIdx])}</p>
  </section>`;
}

/* ====================================================================
   AGENDA
   ==================================================================== */
async function agenda() {
  const g = S.agenda;
  if (!g.date) g.date = today();
  const [f, t] = agendaRange();
  if (!CO) replaceRange(f, t, await API.apptRangeAll(f, t));
  return `
  ${pageHead('Agenda', newBtn())}
  <div class="agenda-tools">
    <div class="seg modes" role="tablist" aria-label="Visualização">
      ${['dia', 'semana', 'mes'].map((m) => `<button role="tab" aria-selected="${g.mode === m}" class="${g.mode === m ? 'on' : ''}" data-action="ag-mode" data-mode="${m}">${m === 'mes' ? 'Mês' : U.cap(m)}</button>`).join('')}
    </div>
    <label class="searchbox">${icon('search')}<input id="ag-search" type="search" placeholder="Buscar cliente pelo nome" value="${esc(g.q)}" autocomplete="off" aria-label="Buscar cliente"></label>
  </div>
  <div id="ag-body"></div>`;
}

function agendaRange() {
  const g = S.agenda;
  if (g.mode === 'dia') return U.dayRangeISO(g.date, tz());
  if (g.mode === 'semana') {
    const s = U.startOfWeek(g.date);
    return U.rangeISO(s, U.addDays(s, 7), tz());
  }
  const m = U.monthStart(g.date);
  return U.rangeISO(m, U.addMonths(m, 1), tz());
}

function nav(label) {
  return `<div class="datenav"><button class="icon-btn" data-action="ag-prev" aria-label="Anterior">${icon('chevL')}</button>
    <div class="datelabel"><b>${esc(label)}</b></div>
    <button class="icon-btn" data-action="ag-next" aria-label="Próximo">${icon('chevR')}</button>
    <button class="btn ghost small" data-action="ag-today">Hoje</button></div>`;
}

export async function searchAgenda(q) {
  S.agenda.q = q;
  const n = U.norm(q);
  if (n.length < 2) {
    S.agenda.searchIds = [];
    return agendaBody(true);
  }
  const ids = S.clients.filter((c) => U.norm(c.name).includes(n)).map((c) => c.id);
  S.agenda.searchIds = ids;
  try {
    if (ids.length) putAppts(await API.apptsByClients(ids));
  } catch (e) {
    toast(e.message, { type: 'error' });
  }
  agendaBody(true);
}

export function agendaBody() {
  const box = document.getElementById('ag-body');
  if (!box) return;
  const g = S.agenda;
  const n = U.norm(g.q);
  if (n.length >= 2) {
    const ids = new Set(g.searchIds);
    const res = [...S.appts.values()].filter((a) => ids.has(a.client_id)).sort((a, b) => (a.start_at < b.start_at ? 1 : -1));
    const nowISO = new Date().toISOString();
    const fut = res.filter((a) => a.start_at >= nowISO && a.status !== 'cancelled').reverse();
    const past = res.filter((a) => !(a.start_at >= nowISO && a.status !== 'cancelled'));
    box.innerHTML = `<h2 class="sub">Resultados para “${esc(g.q)}”</h2>
      ${!res.length ? empty('🔎', 'Nada encontrado', 'Confira o nome digitado ou cadastre a cliente ao agendar.') : ''}
      ${fut.length ? `<h3 class="sub">Próximos</h3>${fut.map((a) => apptCard(a, { showDate: true })).join('')}` : ''}
      ${past.length ? `<h3 class="sub">Histórico</h3>${past.map((a) => apptCard(a, { showDate: true, showWa: false })).join('')}` : ''}`;
    return;
  }
  if (g.mode === 'dia') box.innerHTML = dayView();
  else if (g.mode === 'semana') box.innerHTML = weekView();
  else box.innerHTML = monthView();
}

function freeSlotsFor(dateStr, list) {
  const step = S.settings.slot_minutes;
  const ws = U.timeToMin(S.settings.work_start);
  const we = U.timeToMin(S.settings.work_end);
  const busy = list.filter((a) => a.status !== 'cancelled').map((a) => {
    const s = U.timeToMin(hhmm(a.start_at));
    return [s, s + a.duration_min];
  });
  const nowMin = dateStr === today() ? U.nowLocal(tz()).minutes : dateStr < today() ? 1e9 : -1;
  const out = [];
  for (let m = ws; m + step <= we; m += step) {
    if (m < nowMin) continue;
    if (busy.some(([s, e]) => m < e && m + step > s)) continue;
    out.push(U.minToTime(m));
  }
  return out;
}

function dayView() {
  const d = S.agenda.date;
  const list = apptsOnDate(d);
  const free = freeSlotsFor(d, list);
  return `${nav(U.cap(U.fmtLongDate(d)))}
    <div class="day-list">${list.length ? list.map((a) => apptCard(a)).join('') : empty('🌿', 'Dia livre', 'Nenhum atendimento neste dia.', newBtn(`data-date="${d}"`))}</div>
    <section class="card"><h2>Horários livres</h2>
      ${free.length ? `<div class="slots">${free.map((t) => `<button class="slot" data-action="new-appt" data-date="${d}" data-time="${t}">${t}</button>`).join('')}</div>
      <p class="hint">Toque em um horário para agendar. Considera o expediente de ${S.settings.work_start} às ${S.settings.work_end}.</p>`
        : '<p class="muted">Sem horários livres dentro do expediente.</p>'}
    </section>`;
}

function weekView() {
  const s = U.startOfWeek(S.agenda.date);
  const days = Array.from({ length: 7 }, (_, i) => U.addDays(s, i));
  const label = `${U.fmtShortBR(days[0])} a ${U.fmtShortBR(days[6])}`;
  return `${nav('Semana · ' + label)}
    ${days.map((d) => {
      const list = apptsOnDate(d);
      const act = list.filter((a) => a.status !== 'cancelled').length;
      return `<section class="week-day ${d === today() ? 'is-today' : ''}">
        <header><button class="linklike" data-action="ag-goto" data-date="${d}"><b>${U.cap(U.DIAS[U.weekdayOf(d)])}</b> <span>${U.fmtShortBR(d)}</span></button>
          <span class="count">${act ? act + (act > 1 ? ' atendimentos' : ' atendimento') : 'livre'}</span>
          <button class="icon-btn" data-action="new-appt" data-date="${d}" aria-label="Novo agendamento em ${U.fmtShortBR(d)}">${icon('plus')}</button></header>
        ${list.map((a) => apptCard(a)).join('')}
      </section>`;
    }).join('')}`;
}

function monthView() {
  const m = U.monthStart(S.agenda.date);
  const first = U.weekdayOf(m);
  const total = U.daysInMonth(m);
  const [f, t] = U.rangeISO(m, U.addMonths(m, 1), tz());
  const byDay = {};
  for (const a of apptsBetween(f, t)) {
    if (a.status === 'cancelled') continue;
    (byDay[apptDate(a)] ||= []).push(a);
  }
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="cal-empty"></span>';
  for (let d = 1; d <= total; d++) {
    const ds = `${m.slice(0, 8)}${U.pad(d)}`;
    const n = (byDay[ds] || []).length;
    cells += `<button class="cal-day ${ds === today() ? 'is-today' : ''} ${ds === S.agenda.date ? 'sel' : ''} ${n ? 'has' : ''}" data-action="ag-goto" data-date="${ds}" aria-label="${U.fmtLongDate(ds)}${n ? ', ' + n + ' atendimento(s)' : ''}"><span>${d}</span>${n ? `<i>${n}</i>` : ''}</button>`;
  }
  const monthTotal = Object.values(byDay).reduce((s, l) => s + l.length, 0);
  return `${nav(U.cap(U.fmtMonthYear(m)))}
    <div class="cal"><div class="cal-head">${U.DIAS_CURTOS.map((d) => `<span>${d}</span>`).join('')}</div><div class="cal-grid">${cells}</div></div>
    <p class="hint">${monthTotal ? monthTotal + ' atendimento(s) neste mês. Toque em um dia para abrir.' : 'Nenhum atendimento neste mês.'}</p>`;
}

/** muda de dia/semana/mês e recarrega */
export function agendaMove(dir) {
  const g = S.agenda;
  if (dir === 0) g.date = today();
  else if (g.mode === 'dia') g.date = U.addDays(g.date, dir);
  else if (g.mode === 'semana') g.date = U.addDays(g.date, 7 * dir);
  else g.date = U.addMonths(U.monthStart(g.date), dir);
}

/* ====================================================================
   CLIENTES
   ==================================================================== */
async function clientes() {
  const q = U.norm(S.clientsQ);
  const list = S.clients.filter((c) => !q || U.norm(c.name).includes(q) || c.whatsapp.includes(q.replace(/\D/g, '') || '§'));
  return `${pageHead('Clientes', `<button class="btn primary" data-action="new-client">${icon('plus')} Nova cliente</button>`)}
    <label class="searchbox">${icon('search')}<input id="cl-search" type="search" placeholder="Buscar por nome ou telefone" value="${esc(S.clientsQ)}" autocomplete="off" aria-label="Buscar cliente"></label>
    <div id="cl-list">${clientList(list)}</div>`;
}
function clientList(list) {
  if (!S.clients.length) return empty('👩', 'Nenhuma cliente cadastrada', 'As clientes entram aqui automaticamente quando você faz um agendamento, ou você pode cadastrar agora.', `<button class="btn primary" data-action="new-client">${icon('plus')} Cadastrar cliente</button>`);
  if (!list.length) return empty('🔎', 'Nada encontrado', 'Tente outro nome.');
  return list.map((c) => {
    const st = S.stats.get(c.id) || {};
    return `<button class="client-row" data-action="edit-client" data-id="${c.id}">
      <span class="avatar" aria-hidden="true">${esc(c.name.trim()[0].toUpperCase())}</span>
      <span class="who"><b>${esc(c.name)}</b><small>${esc(U.fmtPhone(c.whatsapp))}</small></span>
      <span class="counts"><span class="chip ok" title="Comparecimentos">✅ ${st.attended || 0}</span><span class="chip miss" title="Faltas">❌ ${st.missed || 0}</span></span></button>`;
  }).join('');
}
export function filterClients(q) {
  S.clientsQ = q;
  const n = U.norm(q);
  const list = S.clients.filter((c) => !n || U.norm(c.name).includes(n) || c.whatsapp.includes(n.replace(/\D/g, '') || '§'));
  const box = document.getElementById('cl-list');
  if (box) box.innerHTML = clientList(list);
}

/* ====================================================================
   SERVIÇOS
   ==================================================================== */
async function servicos() {
  return `${pageHead('Serviços', `<button class="btn primary" data-action="new-service">${icon('plus')} Novo serviço</button>`)}
    ${S.services.some((s) => !s.duration_min) ? `<div class="notice info">Defina a <b>duração</b> de cada serviço (toque no serviço). Assim a agenda já preenche o tempo certo e bloqueia o horário.</div>` : ''}
    ${S.services.length ? S.services.map((s) => {
      const img = serviceImg(s.name);
      return `<button class="svc-row ${s.active ? '' : 'off'}" data-action="edit-service" data-id="${s.id}">
        ${img ? `<img src="${img}" alt="" width="52" height="52" loading="lazy">` : `<span class="avatar" aria-hidden="true">${icon('nail')}</span>`}
        <span class="who"><b>${esc(s.name)}</b><small>${s.duration_min ? s.duration_min + ' min' : '<em>duração não definida</em>'}${s.active ? '' : ' · inativo'}</small></span>
        <span class="price">${U.fmtBRL(s.price_cents)}</span></button>`;
    }).join('') : empty('💅', 'Nenhum serviço', 'Cadastre o primeiro serviço para poder agendar.')}`;
}

/* ====================================================================
   FINANCEIRO
   ==================================================================== */
async function financeiro() {
  const f = S.fin;
  if (!f.month) f.month = U.monthStart(today());
  const t0 = today();
  const wk = U.startOfWeek(t0);
  const from = [U.addMonths(f.month, -5), wk].sort()[0];
  const to = [U.addMonths(f.month, 1), U.addDays(wk, 7)].sort().reverse()[0];
  const [a, b] = U.rangeISO(from, to, tz());
  const [list, pend] = CO
    ? [apptsBetween(a, b), [...S.appts.values()].filter((x) => x.status === 'attended' && x.payment === 'pending').sort((x, y) => (x.start_at < y.start_at ? 1 : -1))]
    : await Promise.all([API.apptRangeAll(a, b), API.apptsPendingPayment()]);
  replaceRange(a, b, list);
  putAppts(pend);

  const paid = (x) => x.status === 'attended' && x.payment === 'paid';
  const sum = (arr) => arr.filter(paid).reduce((s, x) => s + x.price_cents, 0);
  const inDates = (d1, d2) => list.filter((x) => apptDate(x) >= d1 && apptDate(x) < d2);
  const nextM = U.addMonths(f.month, 1);
  const month = inDates(f.month, nextM);
  const week = inDates(wk, U.addDays(wk, 7));
  const day = inDates(t0, U.addDays(t0, 1));
  const att = month.filter((x) => x.status === 'attended');
  const paidN = att.filter(paid);
  const ticket = paidN.length ? Math.round(sum(month) / paidN.length) : 0;
  const miss = month.filter((x) => x.status === 'missed').length;
  const pendTotal = pend.reduce((s, x) => s + x.price_cents, 0);

  // gráfico dos últimos 6 meses
  const months = Array.from({ length: 6 }, (_, i) => U.addMonths(f.month, i - 5));
  const vals = months.map((m) => sum(inDates(m, U.addMonths(m, 1))));
  const chart = barChart(months, vals, f.month);
  const isCur = f.month === U.monthStart(t0);

  return `${pageHead('Financeiro')}
    <div class="datenav"><button class="icon-btn" data-action="fin-prev" aria-label="Mês anterior">${icon('chevL')}</button>
      <div class="datelabel"><b>${esc(U.cap(U.fmtMonthYear(f.month)))}</b></div>
      <button class="icon-btn" data-action="fin-next" aria-label="Próximo mês">${icon('chevR')}</button>
      ${isCur ? '' : '<button class="btn ghost small" data-action="fin-today">Mês atual</button>'}</div>
    <section class="tiles money">
      <div class="tile gold"><b>${U.fmtBRL(sum(month))}</b><span>Faturamento do mês</span></div>
      <div class="tile"><b>${U.fmtBRL(sum(week))}</b><span>Esta semana</span></div>
      <div class="tile"><b>${U.fmtBRL(sum(day))}</b><span>Hoje</span></div>
    </section>
    <section class="tiles">
      <div class="tile ok"><b>${att.length}</b><span>Atendimentos realizados</span></div>
      <div class="tile"><b>${U.fmtBRL(ticket)}</b><span>Ticket médio</span></div>
      <div class="tile miss"><b>${miss}</b><span>Faltas</span></div>
    </section>
    <p class="hint">Só entra no faturamento o atendimento que <b>compareceu</b> e está marcado como <b>pago</b>. Agendamentos futuros não contam.</p>
    <section class="card"><h2>Faturamento mensal</h2>${chart}</section>
    <section class="card"><div class="card-head"><h2>⏳ Pagamentos pendentes</h2><b>${U.fmtBRL(pendTotal)}</b></div>
      ${pend.length ? pend.slice(0, 30).map((x) => apptCard(x, { showDate: true, showWa: false })).join('') : empty('💰', 'Tudo recebido', 'Nenhum atendimento realizado com pagamento pendente.')}
      ${pend.length > 30 ? `<p class="hint">Mostrando os 30 mais recentes de ${pend.length}.</p>` : ''}
    </section>`;
}

function barChart(months, vals, sel) {
  const W = 320, H = 170, pl = 8, pb = 24, pt = 20;
  const max = Math.max(...vals, 1);
  const bw = (W - pl * 2) / months.length;
  const bars = months.map((m, i) => {
    const h = Math.round(((H - pb - pt) * vals[i]) / max);
    const x = pl + i * bw + bw * 0.15;
    const y = H - pb - h;
    const lbl = U.cap(U.MESES[Number(m.slice(5, 7)) - 1].slice(0, 3));
    return `<g><rect x="${x}" y="${y}" width="${bw * 0.7}" height="${Math.max(h, vals[i] ? 2 : 0)}" rx="4" class="${m === sel ? 'bar sel' : 'bar'}"/>
      <text x="${x + bw * 0.35}" y="${y - 5}" text-anchor="middle" class="bv">${vals[i] ? Math.round(vals[i] / 100) : ''}</text>
      <text x="${x + bw * 0.35}" y="${H - 7}" text-anchor="middle" class="bl">${lbl}</text></g>`;
  }).join('');
  const summary = months.map((m, i) => `${U.fmtMonthYear(m)}: ${U.fmtBRL(vals[i])}`).join('; ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento mensal. ${esc(summary)}">${bars}</svg>
    <p class="hint">Valores em reais (R$) por mês.</p>`;
}

/* ====================================================================
   WHATSAPP
   ==================================================================== */
async function whatsapp() {
  const nowISO = new Date().toISOString();
  const horizon = U.zonedToUtcISO(U.addDays(today(), 8), '00:00', tz());
  const [list, logs] = CO
    ? [apptsBetween(nowISO, horizon), logCache]
    : await Promise.all([API.apptRange(nowISO, horizon), API.listReminders().catch(() => null)]);
  putAppts(list);
  logCache = logs;
  const sched = list.filter((a) => a.status === 'scheduled');
  const done = (a) => a.confirmation_manual_at || a.confirmation_api_at;
  const pend = sched.filter((a) => !done(a));
  const ok = sched.filter(done);
  const row = (a) => {
    const c = S.clientMap.get(a.client_id);
    const cs = confState(a);
    const hrs = Math.round((new Date(a.start_at) - Date.now()) / 3600e3);
    return `<article class="card wa-card">
      <div class="wa-top"><div><b>${esc(c ? c.name : '—')}</b><small>${U.fmtShortBR(apptDate(a))} às ${hhmm(a.start_at)} · ${esc(a.service_name)}</small></div>
        <span class="chip ${hrs <= 24 ? 'miss' : 'wait'}">${hrs < 1 ? 'em breve' : 'em ' + (hrs < 48 ? hrs + ' h' : Math.round(hrs / 24) + ' dias')}</span></div>
      <p class="wa-preview">${esc(waMessageFor(a))}</p>
      <div class="wa-line"><span class="chip conf ${cs.cls}">${esc(cs.label)}</span></div>
      <div class="row">
        <button class="btn wa" data-action="wa-prepare" data-id="${a.id}">${icon('whatsapp')} Enviar confirmação pelo WhatsApp</button>
        <button class="btn ghost small" data-action="wa-manual" data-id="${a.id}">${a.confirmation_manual_at ? 'Desmarcar envio' : 'Marquei como enviada'}</button>
      </div>
      ${c && !c.whatsapp_consent ? '<p class="hint">Sem autorização registrada para lembretes automáticos (não afeta o envio manual).</p>' : ''}
    </article>`;
  };
  const apiOn = S.settings.auto_reminders;
  const logHtml = logs === null
    ? '<p class="muted">Não foi possível ler o registro (a tabela de lembretes pode não ter sido criada).</p>'
    : logs.length
      ? logs.map((r) => {
        const nm = r.appointments ? clientName(r.appointments.client_id) : '—';
        const lab = { sent: 'Aceita pela API ✓', failed: 'Falhou', skipped: 'Não enviada', sending: 'Enviando…' }[r.status] || r.status;
        return `<div class="log-row"><span><b>${esc(nm)}</b><small>${U.fmtDateBR(U.localDateStr(r.created_at, tz()))} ${hhmm(r.created_at)}${r.error ? ' · ' + esc(r.error) : ''}</small></span><span class="chip ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'miss' : 'wait'}">${lab}</span></div>`;
      }).join('')
      : '<p class="muted">Nenhum lembrete automático registrado até agora.</p>';

  return `${pageHead('WhatsApp')}
    <section class="card">
      <h2>Como funciona</h2>
      <p><b>Manual:</b> o botão abre o WhatsApp com a mensagem pronta. <b>Você</b> toca em enviar. O sistema só consegue saber que a mensagem foi <i>preparada</i>, não que foi enviada — por isso existe o botão “Marquei como enviada”.</p>
      <p><b>Automático (API oficial):</b> ${apiOn ? 'está <b>ligado</b> aqui nas configurações' : 'está <b>desligado</b>'}. Ele só funciona depois de configurar o WhatsApp Business oficial no servidor (veja o guia). Uma confirmação só aparece como “enviada pela API” quando existe registro abaixo. Se nada aparecer, nada foi enviado automaticamente.</p>
    </section>
    <h2 class="sub">Pendentes de confirmação (${pend.length})</h2>
    ${pend.length ? pend.map(row).join('') : empty('✅', 'Nada pendente', 'Nenhum atendimento dos próximos 7 dias aguardando confirmação.')}
    ${ok.length ? `<h2 class="sub">Já confirmadas (${ok.length})</h2>${ok.map(row).join('')}` : ''}
    <section class="card"><h2>Registro dos envios automáticos</h2>${logHtml}</section>`;
}

/* ====================================================================
   CONFIGURAÇÕES
   ==================================================================== */
const TZS = ['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Boa_Vista', 'America/Araguaina', 'America/Maceio', 'America/Noronha', 'America/Santarem', 'America/Eirunepe'];

async function config() {
  const s = S.settings;
  const zones = TZS.includes(s.timezone) ? TZS : [s.timezone, ...TZS];
  return `${pageHead('Configurações')}
  <form data-form="settings" class="form card" novalidate>
    <h2>Estúdio e agenda</h2>
    <label class="field">Nome do estúdio<input id="st-name" maxlength="80" value="${esc(s.studio_name)}"></label>
    <label class="field">Fuso horário<select id="st-tz">${zones.map((z) => `<option ${z === s.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
    <div class="grid2">
      <label class="field">Início do expediente<input id="st-start" type="time" value="${s.work_start}"></label>
      <label class="field">Fim do expediente<input id="st-end" type="time" value="${s.work_end}"></label>
    </div>
    <label class="field">Intervalo dos horários livres (min)
      <select id="st-slot">${[15, 20, 30, 45, 60, 90, 120].map((n) => `<option ${n === s.slot_minutes ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field">Mensagem de confirmação (WhatsApp manual)
      <textarea id="st-tpl" rows="6" maxlength="1000">${esc(s.manual_template || U.DEFAULT_TEMPLATE)}</textarea></label>
    <p class="hint">Use <code>{nome}</code>, <code>{dia}</code>, <code>{horario}</code> e <code>{estudio}</code>. Eles são trocados automaticamente.</p>
    <label class="check"><input type="checkbox" id="st-auto" ${s.auto_reminders ? 'checked' : ''}> <span>Ligar confirmação automática pela API oficial do WhatsApp
      <small>Só tem efeito depois de configurar o servidor (guia). Só envia para clientes com autorização registrada.</small></span></label>
    <div id="st-error" class="notice err" role="alert" hidden></div>
    <button class="btn primary block" type="submit">${icon('check')} Salvar configurações</button>
  </form>


  <section class="card">
    <h2>Instalar no celular</h2>
    <p><b>iPhone (Safari):</b> toque em Compartilhar ⬆️ e depois em “Adicionar à Tela de Início”.</p>
    <p><b>Android (Chrome):</b> menu ⋮ e “Instalar app” ou “Adicionar à tela inicial”.</p>
  </section>
  <section class="card">
    <h2>Seus dados</h2>
    <p>Os dados ficam no banco privado da sua conta (Supabase). Os telefones e anotações das clientes são tratados conforme a LGPD: registre a autorização de lembretes no cadastro de cada cliente e atenda pedidos de exclusão pelo botão “Excluir cliente”.</p>
    <button class="btn ghost block" data-action="export">${icon('download')} Baixar cópia dos dados (backup)</button>
  </section>
  `;
}

export async function saveSettings() {
  const err = (m) => {
    const b = document.getElementById('st-error');
    b.textContent = m;
    b.hidden = !m;
  };
  err('');
  const v = (id) => document.getElementById(id).value;
  const name = v('st-name').trim();
  if (!name) return err('Informe o nome do estúdio.');
  const ws = v('st-start');
  const we = v('st-end');
  if (!ws || !we || U.timeToMin(ws) >= U.timeToMin(we)) return err('O fim do expediente deve ser depois do início.');
  const tpl = v('st-tpl').trim();
  const fields = {
    studio_name: name, timezone: v('st-tz'), work_start: ws, work_end: we,
    slot_minutes: parseInt(v('st-slot'), 10),
    manual_template: tpl && tpl !== U.DEFAULT_TEMPLATE ? tpl : null,
    auto_reminders: document.getElementById('st-auto').checked,
  };
  try {
    S.settings = await API.saveSettings(S.session.user.id, fields);
    toast('Configurações salvas ✓');
  } catch (e) {
    err(e.message);
  }
}


export async function exportData() {
  try {
    const data = await API.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-ellen-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Backup baixado ✓');
  } catch (e) {
    toast(e.message, { type: 'error' });
  }
}

/* ====================================================================
   MAIS (atalhos + conhecimento + fé)
   ==================================================================== */
async function mais() {
  return `${pageHead('Mais')}
    <nav class="more-list" aria-label="Mais opções">
      <a href="#/servicos">${icon('nail')}<span>Serviços e preços</span>${icon('chevR')}</a>
      <a href="#/whatsapp">${icon('chat')}<span>WhatsApp</span>${icon('chevR')}</a>
      <a href="#/config">${icon('sliders')}<span>Configurações</span>${icon('chevR')}</a>
    </nav>
    <section class="card soft-card"><h2>Um toque de conhecimento 💅</h2>
      ${CURIOSITIES.map((c, i) => `<details><summary>${i + 1}. ${esc(c.t)}</summary><p>${esc(c.x)}</p></details>`).join('')}
    </section>
    <section class="card faith"><h2>Fé que inspira ✨</h2>
      ${FAITH.map((m) => `<p class="faith-msg">${icon('cross')} ${esc(m)}</p>`).join('')}
    </section>`;
}
