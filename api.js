// Comunicação com o Supabase (login + banco de dados). Usa apenas a chave PÚBLICA;
// a proteção dos dados é feita pelas regras (RLS) do banco.
let sb = null;

export class AppError extends Error {
  constructor(message, code, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function friendly(err) {
  const code = err && err.code;
  const msg = String((err && err.message) || '');
  if (code === '23P01') return 'Esse horário conflita com outro atendimento.';
  if (code === '23505') return 'Já existe um registro igual.';
  if (code === '23514') return 'Algum dado está fora do permitido. Confira os campos.';
  if (code === '23503') return 'Esse registro está ligado a outros dados.';
  if (code === '42501' || code === 'PGRST301') return 'Sem permissão. Saia e entre novamente.';
  if (/failed to fetch|networkerror|load failed|network request/i.test(msg)) return 'Sem conexão com a internet. Tente de novo.';
  if (/jwt|expired/i.test(msg)) return 'Sua sessão expirou. Entre novamente.';
  return 'Não foi possível concluir. Tente novamente.';
}

async function run(query) {
  let res;
  try {
    res = await query;
  } catch (e) {
    throw new AppError(friendly(e), e && e.code, e && e.message);
  }
  if (res.error) throw new AppError(friendly(res.error), res.error.code, res.error.message);
  return res.data;
}

export function init(cfg) {
  sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

/* ---------- login ---------- */
export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data && data.session ? data.session : null;
}
/** Entrada automática: pede ao servidor uma sessão pronta (sem tela de login). */
export async function autoLogin() {
  let r;
  try {
    r = await fetch('/session', { cache: 'no-store' });
  } catch (e) {
    throw new AppError('Sem conexão com a internet. Tente de novo.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError(j.error || 'Não foi possível entrar no sistema.');
  const { data, error } = await sb.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
  if (error || !data.session) throw new AppError('Não foi possível iniciar a sessão.');
  return data.session;
}
export async function signIn(email, password) {
  let res;
  try {
    res = await sb.auth.signInWithPassword({ email, password });
  } catch (e) {
    throw new AppError(friendly(e));
  }
  if (res.error) {
    if (/invalid login|invalid credentials/i.test(res.error.message || '')) throw new AppError('E-mail ou senha incorretos.');
    if (/not confirmed/i.test(res.error.message || '')) throw new AppError('E-mail ainda não confirmado no Supabase.');
    throw new AppError(friendly(res.error));
  }
  return res.data.session;
}
export const signOut = () => sb.auth.signOut();
export const onAuth = (fn) => sb.auth.onAuthStateChange((event, session) => fn(event, session));
export async function updatePassword(password) {
  const res = await sb.auth.updateUser({ password });
  if (res.error) throw new AppError(/same|different/i.test(res.error.message) ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível trocar a senha.');
}

/* ---------- configurações ---------- */
const DEFAULT_SERVICES = [
  { name: 'Alongamento F1', price_cents: 10000 },
  { name: 'Soft Gel', price_cents: 8000 },
  { name: 'Gel', price_cents: 4000 },
  { name: 'Tradicional', price_cents: 3000 },
];

const cleanSettings = (s) => ({ ...s, work_start: String(s.work_start).slice(0, 5), work_end: String(s.work_end).slice(0, 5) });

export async function loadSettings() {
  let row = await run(sb.from('settings').select('*').maybeSingle());
  if (!row) row = await run(sb.from('settings').insert({}).select().single());
  if (!row.seeded) {
    // primeiro acesso: cadastra os 4 serviços iniciais (sem duração, para ela definir)
    const existing = await run(sb.from('services').select('id').limit(1));
    if (!existing || !existing.length) await run(sb.from('services').insert(DEFAULT_SERVICES));
    row = await run(sb.from('settings').update({ seeded: true }).eq('user_id', row.user_id).select().single());
  }
  return cleanSettings(row);
}
export async function saveSettings(userId, fields) {
  return cleanSettings(await run(sb.from('settings').update(fields).eq('user_id', userId).select().single()));
}

/* ---------- clientes ---------- */
export const listClients = () => fetchAll('clients', 'name');
export const insertClient = (c) => run(sb.from('clients').insert(c).select().single());
export const updateClient = (id, c) => run(sb.from('clients').update(c).eq('id', id).select().single());
export const deleteClient = (id) => run(sb.from('clients').delete().eq('id', id));
export async function clientStats() {
  const rows = await fetchAll('client_stats', 'client_id');
  return new Map(rows.map((r) => [r.client_id, r]));
}

/* ---------- serviços ---------- */
export const listServices = () => run(sb.from('services').select('*').order('created_at', { ascending: true }));
export const insertService = (s) => run(sb.from('services').insert(s).select().single());
export const updateService = (id, s) => run(sb.from('services').update(s).eq('id', id).select().single());
export const deleteService = (id) => run(sb.from('services').delete().eq('id', id));

/* ---------- agendamentos ---------- */
export const apptRange = (fromISO, toISO) =>
  run(sb.from('appointments').select('*').gte('start_at', fromISO).lt('start_at', toISO).order('start_at', { ascending: true }));
export async function apptRangeAll(fromISO, toISO) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await run(sb.from('appointments').select('*').gte('start_at', fromISO).lt('start_at', toISO).order('start_at', { ascending: true }).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
export const apptsByClients = (ids) =>
  ids.length ? run(sb.from('appointments').select('*').in('client_id', ids).order('start_at', { ascending: false }).limit(150)) : Promise.resolve([]);
export const apptsByClient = (id, limit = 60) =>
  run(sb.from('appointments').select('*').eq('client_id', id).order('start_at', { ascending: false }).limit(limit));
export const apptsPendingPayment = () =>
  run(sb.from('appointments').select('*').eq('status', 'attended').eq('payment', 'pending').order('start_at', { ascending: false }).limit(300));
export const findConflicts = (startISO, endISO, excludeId) => {
  let q = sb.from('appointments').select('*').lt('start_at', endISO).gt('end_at', startISO).neq('status', 'cancelled');
  if (excludeId) q = q.neq('id', excludeId);
  return run(q);
};
export const insertAppt = (a) => run(sb.from('appointments').insert(a).select().single());
export const updateAppt = (id, fields) => run(sb.from('appointments').update(fields).eq('id', id).select().single());
export const deleteAppt = (id) => run(sb.from('appointments').delete().eq('id', id));

/* ---------- lembretes automáticos (registro) ---------- */
export const listReminders = () =>
  run(sb.from('reminders').select('*, appointments(client_id, service_name)').order('created_at', { ascending: false }).limit(30));

/* ---------- backup ---------- */
async function fetchAll(table, order = 'created_at') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await run(sb.from(table).select('*').order(order, { ascending: true }).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
export async function exportAll() {
  const [clients, services, appointments, reminders] = await Promise.all([
    fetchAll('clients'), fetchAll('services'), fetchAll('appointments', 'start_at'), fetchAll('reminders'),
  ]);
  return { exportado_em: new Date().toISOString(), clients, services, appointments, reminders };
}
