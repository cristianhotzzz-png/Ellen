// Ponto de entrada: entrada automática, menu, rotas e eventos.
import * as API from './api.js';
import * as U from './util.js';
import { esc } from './util.js';
import {
  S, R, tz, today, icon, toast, closeSheet, sheetOpen, setClients,
} from './core.js';
import * as A from './actions.js';
import * as Fm from './forms.js';
import * as V from './views.js';
import { CURIOSITIES, pickNoRepeat } from './content.js';

const app = document.getElementById('app');
const boot = document.getElementById('boot');

const NAV = [
  ['inicio', 'Início', 'home'], ['agenda', 'Agenda', 'calendar'], ['clientes', 'Clientes', 'users'],
  ['servicos', 'Serviços', 'nail'], ['financeiro', 'Financeiro', 'wallet'], ['whatsapp', 'WhatsApp', 'chat'],
  ['config', 'Configurações', 'sliders'],
];
const TAB_ROUTES = { inicio: 'inicio', agenda: 'agenda', clientes: 'clientes', financeiro: 'financeiro' };
const ROUTES = [...NAV.map((n) => n[0]), 'mais'];

/* ---------------- ganchos ---------------- */
R.repaint = () => V.repaint(S.route);
R.reload = () => go(true);

function routeFromHash() {
  const r = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0];
  return ROUTES.includes(r) ? r : 'inicio';
}

async function go(fresh = true) {
  S.route = routeFromHash();
  paintNav();
  document.title = `${V.TITLES[S.route]} · Ellen Cristina Nail Designer`;
  await V.renderView(S.route, fresh);
}

/* ---------------- telas fixas ---------------- */
function showFatal(title, html) {
  boot.hidden = true;
  app.innerHTML = `<main class="login"><img src="logo.jpg" alt="Ellen Cristina Nail Designer" width="140" height="140"><h1>${esc(title)}</h1>${html}</main>`;
}

function shell() {
  boot.hidden = true;
  app.innerHTML = `
  <div class="layout">
    <aside class="sidebar" aria-label="Menu principal">
      <div class="brand"><img src="logo.jpg" alt="" width="56" height="56"><div><b>Ellen Cristina</b><small>Nail Designer</small></div></div>
      <nav>${NAV.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${icon(i)}<span>${l}</span></a>`).join('')}</nav>
      <button class="btn primary block" data-action="new-appt">${icon('plus')} Novo agendamento</button>
    </aside>
    <div class="main-col">
      <header class="topbar"><img src="favicon.png" alt="" width="34" height="34"><b>Ellen Cristina</b><span class="grow"></span>
        <button class="icon-btn" data-action="new-appt" aria-label="Novo agendamento">${icon('plus')}</button></header>
      <main id="view" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Menu">
      <a href="#/inicio" data-nav="inicio">${icon('home')}<span>Início</span></a>
      <a href="#/agenda" data-nav="agenda">${icon('calendar')}<span>Agenda</span></a>
      <button class="fab" data-action="new-appt" aria-label="Novo agendamento">${icon('plus')}</button>
      <a href="#/clientes" data-nav="clientes">${icon('users')}<span>Clientes</span></a>
      <a href="#/financeiro" data-nav="financeiro">${icon('wallet')}<span>Finanças</span></a>
      <a href="#/mais" data-nav="mais" data-more="1">${icon('more')}<span>Mais</span></a>
    </nav>
  </div>`;
}

function paintNav() {
  const r = S.route;
  const moreGroup = ['mais', 'servicos', 'whatsapp', 'config'];
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const k = a.dataset.nav;
    const on = a.dataset.more ? moreGroup.includes(r) : k === r;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ---------------- carga inicial dos dados ---------------- */
async function loadAll() {
  S.settings = await API.loadSettings();
  const [clients, services, stats] = await Promise.all([API.listClients(), API.listServices(), API.clientStats().catch(() => new Map())]);
  setClients(clients);
  S.services = services;
  S.stats = stats;
  S.agenda.date = today();
}

async function refreshStats() {
  try {
    S.stats = await API.clientStats();
  } catch (_) {}
}

async function enter(session) {
  S.session = session;
  boot.hidden = false;
  try {
    await loadAll();
  } catch (e) {
    return showFatal('Não foi possível carregar', `<div class="notice err">${esc(e.message)}</div><p class="hint">Confira se o banco de dados foi criado (arquivo SQL) e tente de novo.</p><button class="btn primary" data-action="reload-page">Tentar de novo</button>`);
  }
  shell();
  await go(true);
}

/* ---------------- eventos ---------------- */
const byId = (id) => document.getElementById(id);
const sheetForm = () => document.querySelector('#sheet form[data-form]');

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const d = el.dataset;
  switch (d.action) {
    case 'close-sheet': closeSheet(); break;
    case 'new-appt':
      if (sheetOpen()) closeSheet();
      Fm.openApptForm({ date: d.date || null, time: d.time || '', clientId: d.client || null });
      break;
    case 'edit-appt':
      if (sheetOpen() && !d.id) break;
      Fm.openApptForm({ id: d.id });
      break;
    case 'delete-appt': Fm.deleteAppt(d.id); break;
    case 'clear-client': Fm.clearClient(); break;
    case 'pick-client': Fm.pickClient(d.id); break;
    case 'slot-pick': Fm.pickSlot(d.time); break;
    case 'status': await A.setStatus(d.id, d.to); refreshStats(); break;
    case 'reactivate': A.reactivate(d.id); break;
    case 'pay': A.togglePay(d.id); break;
    case 'wa-prepare': A.prepareConfirmation(d.id); break; // precisa ser síncrono (abre o WhatsApp)
    case 'wa-manual': A.toggleManualSent(d.id); break;
    case 'new-client': Fm.openClientForm(null); break;
    case 'edit-client': Fm.openClientForm(d.id); break;
    case 'delete-client': Fm.deleteClientFlow(d.id); break;
    case 'new-service': Fm.openServiceForm(null); break;
    case 'edit-service': Fm.openServiceForm(d.id); break;
    case 'delete-service': Fm.deleteServiceFlow(d.id); break;
    case 'ag-mode': S.agenda.mode = d.mode; go(true); break;
    case 'ag-prev': V.agendaMove(-1); go(true); break;
    case 'ag-next': V.agendaMove(1); go(true); break;
    case 'ag-today': V.agendaMove(0); go(true); break;
    case 'ag-goto': S.agenda.date = d.date; S.agenda.mode = 'dia'; S.agenda.q = ''; go(true); break;
    case 'fin-prev': S.fin.month = U.addMonths(S.fin.month, -1); go(true); break;
    case 'fin-next': S.fin.month = U.addMonths(S.fin.month, 1); go(true); break;
    case 'fin-today': S.fin.month = U.monthStart(today()); go(true); break;
    case 'next-curio': S.curioIdx = (S.curioIdx + 1) % CURIOSITIES.length; R.repaint(); break;
    case 'reload': go(true); break;
    case 'reload-page': location.reload(); break;
    case 'export': V.exportData(); break;
    default: break;
  }
});

document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('form[data-form]');
  if (!f) return;
  ev.preventDefault();
  switch (f.dataset.form) {
    case 'appt': await Fm.saveApptForm(); refreshStats(); break;
    case 'client': await Fm.saveClientForm(); break;
    case 'service': await Fm.saveServiceForm(); break;
    case 'settings': await V.saveSettings(); break;
    default: break;
  }
});

const deb = U.debounce((q) => V.searchAgenda(q), 250);
document.addEventListener('input', (ev) => {
  const id = ev.target.id;
  if (id === 'ag-search') deb(ev.target.value);
  else if (id === 'cl-search') V.filterClients(ev.target.value);
  else if (sheetForm() && sheetForm().dataset.form === 'appt') Fm.onApptFormInput(ev);
  else if (sheetForm() && sheetForm().dataset.form === 'client') Fm.onClientFormInput(ev);
});
document.addEventListener('change', (ev) => {
  if (sheetForm() && sheetForm().dataset.form === 'appt') Fm.onApptFormChange(ev);
});
// fecha a janela ao tocar fora dela
byId('sheet').addEventListener('click', (ev) => { if (ev.target.id === 'sheet') closeSheet(); });
byId('sheet').addEventListener('close', () => document.body.classList.remove('lock'));
window.addEventListener('hashchange', () => { if (S.session) { closeSheet(); go(true); } });

// atualiza ao voltar para o app e a cada 2 minutos (agenda aberta em mais de um aparelho)
let lastRefresh = Date.now();
function softRefresh() {
  if (!S.session || sheetOpen() || document.hidden) return;
  if (Date.now() - lastRefresh < 60000) return;
  lastRefresh = Date.now();
  go(false);
}
document.addEventListener('visibilitychange', softRefresh);
setInterval(softRefresh, 120000);

/* ---------------- inicialização ---------------- */
async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const cfg = window.__APP_CONFIG__;
  if (!cfg || !cfg.url || !cfg.key) {
    return showFatal('Falta configurar', '<p>O endereço do banco de dados ainda não foi informado no servidor.</p><p class="hint">Veja no guia: variáveis <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b> no Render.</p>');
  }
  if (!window.supabase) {
    // o CDN principal falhou: tenta os reservas, um por vez
    const loadScript = (src) => new Promise((ok) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => ok(true);
      s.onerror = () => { s.remove(); ok(false); };
      document.head.appendChild(s);
    });
    const BACKUPS = [
      'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
      'https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.45.4/umd/supabase.min.js',
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
    ];
    for (const src of BACKUPS) {
      if (window.supabase) break;
      await loadScript(src);
    }
  }
  if (!window.supabase) {
    return showFatal('Sem conexão', '<p>Não consegui carregar o sistema. Verifique a internet.</p><button class="btn primary" data-action="reload-page">Tentar de novo</button>');
  }
  S.cfg = cfg;
  API.init(cfg);
  API.onAuth((event) => {
    if (event === 'SIGNED_OUT' && S.session) {
      S.session = null;
      boot.hidden = false;
      API.autoLogin().then(enter).catch((e) => showFatal('Não foi possível entrar', `<div class="notice err">${esc(e.message)}</div><button class="btn primary" data-action="reload-page">Tentar de novo</button>`));
    }
  });
  let session = null;
  try { session = await API.getSession(); } catch (_) {}
  if (!session) {
    try {
      session = await API.autoLogin();
    } catch (e) {
      return showFatal('Não foi possível entrar', `<div class="notice err">${esc(e.message)}</div><button class="btn primary" data-action="reload-page">Tentar de novo</button>`);
    }
  }
  await enter(session);
}
start();
