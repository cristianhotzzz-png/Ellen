// Funções utilitárias: fuso horário, datas, moeda, telefone e texto.
export const TZ_DEFAULT = 'America/Sao_Paulo';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pad = (n) => String(n).padStart(2, '0');

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/* ---------- fuso horário ---------- */
function partsInTz(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, ss: +o.second };
}
function tzOffsetMs(date, tz) {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}
/** 'YYYY-MM-DD' + 'HH:MM' no fuso tz -> ISO UTC */
export function zonedToUtcISO(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t).toISOString();
}
export function localDateStr(iso, tz) {
  const p = partsInTz(new Date(iso), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export function localTimeStr(iso, tz) {
  const p = partsInTz(new Date(iso), tz);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}
export function nowLocal(tz) {
  const p = partsInTz(new Date(), tz);
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.hh)}:${pad(p.mm)}`, hour: p.hh, minutes: p.hh * 60 + p.mm };
}
export const todayStr = (tz) => nowLocal(tz).date;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function addMonths(dateStr, n) {
  const [y, m] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}
export const weekdayOf = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
export const startOfWeek = (dateStr) => addDays(dateStr, -weekdayOf(dateStr)); // domingo
export const monthStart = (dateStr) => dateStr.slice(0, 7) + '-01';
export const daysInMonth = (dateStr) => {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const dayRangeISO = (dateStr, tz) => [zonedToUtcISO(dateStr, '00:00', tz), zonedToUtcISO(addDays(dateStr, 1), '00:00', tz)];
export const rangeISO = (fromDate, toDateExclusive, tz) => [zonedToUtcISO(fromDate, '00:00', tz), zonedToUtcISO(toDateExclusive, '00:00', tz)];

export const timeToMin = (t) => {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};
export const minToTime = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

/* ---------- formatação ---------- */
export const fmtDateBR = (dateStr) => {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};
export const fmtShortBR = (dateStr) => {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
};
export function fmtLongDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${DIAS[weekdayOf(dateStr)]}, ${d} de ${MESES[m - 1]} de ${y}`;
}
export function fmtMonthYear(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${y}`;
}
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtBRL = (cents) => BRL.format((cents || 0) / 100).replace(/ /g, ' ');
export const centsToInput = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',');
export function parseMoney(str) {
  let s = String(str ?? '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function greeting(hour) {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/* ---------- telefone / WhatsApp ---------- */
/** Retorna só dígitos no formato 55 + DDD + número, ou null se for inválido. */
export function normPhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  const ddd = d.slice(2, 4);
  if (ddd[0] === '0') return null;
  if (d.length === 13 && d[4] !== '9') return null; // celular com 9 dígitos começa com 9
  return d;
}
export function fmtPhone(d) {
  const n = String(d ?? '').replace(/\D/g, '').replace(/^55/, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return d || '';
}
export const maskPhoneInput = (v) => {
  const n = String(v).replace(/\D/g, '').replace(/^55(?=\d{10,})/, '').slice(0, 11);
  if (n.length <= 2) return n;
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
};
export const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

/** Palavra do dia usada na mensagem: hoje / amanhã / no dia 25/11 */
export function dayWord(apptDate, todayDate) {
  if (apptDate === todayDate) return 'hoje';
  if (apptDate === addDays(todayDate, 1)) return 'amanhã';
  return `no dia ${fmtShortBR(apptDate)}`;
}

export const DEFAULT_TEMPLATE =
  'Olá, {nome}! 💕 Passando para lembrar do seu horário {dia}, às {horario}, aqui no {estudio}. 💅✨ Te espero com muito carinho! Deus abençoe seu dia! ❤️';

export function buildMessage(template, { nome, dia, horario, estudio }) {
  return String(template || DEFAULT_TEMPLATE)
    .replaceAll('{nome}', nome)
    .replaceAll('{dia}', dia)
    .replaceAll('{horario}', horario)
    .replaceAll('{estudio}', estudio);
}
export const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || '';

/* ---------- texto ---------- */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
