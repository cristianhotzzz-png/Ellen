// Ações sobre agendamentos: presença, pagamento e confirmação pelo WhatsApp.
// Atualizam a tela na hora e salvam no banco; se der erro, voltam ao estado anterior.
import * as API from './api.js';
import * as U from './util.js';
import { S, R, tz, today, toast, apptDate } from './core.js';

async function patch(id, fields) {
  const old = S.appts.get(id);
  if (!old) return null;
  S.appts.set(id, { ...old, ...fields });
  R.repaint();
  try {
    const row = await API.updateAppt(id, fields);
    S.appts.set(id, row);
    R.repaint();
    return row;
  } catch (e) {
    S.appts.set(id, old);
    R.repaint();
    toast(e.message, { type: 'error' });
    return null;
  }
}

export async function setStatus(id, target) {
  const a = S.appts.get(id);
  if (!a) return;
  const prev = a.status;
  const next = prev === target ? 'scheduled' : target;
  const row = await patch(id, { status: next });
  if (!row) return;
  const undo = { label: 'Desfazer', fn: () => patch(id, { status: prev }) };
  if (next === 'attended') {
    toast('Marcada como compareceu ✓', row.payment === 'pending' ? { action: { label: 'Marcar como pago', fn: () => patch(id, { payment: 'paid' }) } } : { action: undo });
  } else if (next === 'missed') toast('Marcada como faltou', { action: undo });
  else if (next === 'cancelled') toast('Agendamento cancelado', { action: undo });
  else toast('Voltou para aguardando', {});
}

export async function reactivate(id) {
  const row = await patch(id, { status: 'scheduled' });
  if (row) toast('Agendamento reativado');
}

export async function togglePay(id) {
  const a = S.appts.get(id);
  if (!a) return;
  const next = a.payment === 'paid' ? 'pending' : 'paid';
  const row = await patch(id, { payment: next });
  if (row) toast(next === 'paid' ? 'Pagamento marcado como pago ✓' : 'Pagamento voltou para pendente');
}

/** Texto da mensagem de confirmação (modelo editável em Configurações). */
export function waMessageFor(a) {
  const c = S.clientMap.get(a.client_id);
  return U.buildMessage(S.settings.manual_template, {
    nome: U.firstName(c ? c.name : ''),
    dia: U.dayWord(apptDate(a), today()),
    horario: U.localTimeStr(a.start_at, tz()),
    estudio: S.settings.studio_name,
  });
}

/** Abre o WhatsApp com a mensagem pronta. Isso NÃO confirma o envio: apenas registra que foi preparada. */
export function prepareConfirmation(id) {
  const a = S.appts.get(id);
  const c = a && S.clientMap.get(a.client_id);
  const phone = c && U.normPhone(c.whatsapp);
  if (!phone) {
    toast('O número de WhatsApp dessa cliente é inválido. Corrija no cadastro.', { type: 'error' });
    return;
  }
  window.open(U.waLink(phone, waMessageFor(a)), '_blank', 'noopener'); // precisa ocorrer direto no toque
  patch(id, { confirmation_prepared_at: new Date().toISOString() });
}

/** Ellen marca por conta própria que enviou (ou desmarca). */
export async function toggleManualSent(id) {
  const a = S.appts.get(id);
  if (!a) return;
  const next = a.confirmation_manual_at ? null : new Date().toISOString();
  const row = await patch(id, { confirmation_manual_at: next });
  if (row) toast(next ? 'Marcada como enviada por você ✓' : 'Marcação removida');
}

export function openWhatsAppChat(clientId) {
  const c = S.clientMap.get(clientId);
  const phone = c && U.normPhone(c.whatsapp);
  if (!phone) return toast('Número de WhatsApp inválido.', { type: 'error' });
  window.open(`https://wa.me/${phone}`, '_blank', 'noopener');
}
