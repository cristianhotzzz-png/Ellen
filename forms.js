// Formulários em janela: agendamento, cliente e serviço.
import * as API from './api.js';
import * as U from './util.js';
import { esc } from './util.js';
import {
  S, R, tz, today, icon, toast, openSheet, closeSheet, confirmDialog, headerOf, STATUS,
  upsertClient, removeClient, clientName, putAppts, apptDate, serviceImg,
} from './core.js';

const $ = (sel) => document.querySelector('#sheet ' + sel);
const val = (sel) => ($(sel) ? $(sel).value : '');

/* ====================================================================
   AGENDAMENTO
   ==================================================================== */
let F = null; // estado do formulário aberto

export function openApptForm({ id = null, date = null, time = '', clientId = null } = {}) {
  const editing = id ? S.appts.get(id) : null;
  const activeServices = S.services.filter((s) => s.active);
  if (!editing && !activeServices.length) {
    toast('Cadastre pelo menos um serviço antes de agendar.', { type: 'error' });
    location.hash = '#/servicos';
    return;
  }
  F = {
    id: editing ? editing.id : null,
    orig: editing,
    clientId: editing ? editing.client_id : clientId,
    occupied: [],
  };
  const d = editing ? U.localDateStr(editing.start_at, tz()) : date || (S.route === 'agenda' && S.agenda.date) || today();
  const t = editing ? U.localTimeStr(editing.start_at, tz()) : time;
  const services = [...activeServices];
  if (editing && editing.service_id && !services.some((s) => s.id === editing.service_id)) {
    const old = S.services.find((s) => s.id === editing.service_id);
    if (old) services.push(old);
  }
  const svcOptions = services.map((s) => `<option value="${s.id}" ${editing && editing.service_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const orphan = editing && !editing.service_id ? `<option value="" selected>${esc(editing.service_name)}</option>` : '<option value="">Selecione…</option>';

  const html = `<form data-form="appt" class="form" novalidate>
    ${headerOf(editing ? 'Editar / reagendar' : 'Novo agendamento')}
    <div id="f-client"></div>

    <div class="grid2">
      <label class="field">Data<input type="date" id="f-date" value="${d}" required></label>
      <label class="field">Horário<input type="time" id="f-time" value="${t}" step="300" required></label>
    </div>
    <div id="f-conflict" class="notice warn" hidden role="alert"></div>
    <div class="field">
      <span class="lbl">Horários livres neste dia</span>
      <div id="f-slots" class="slots" aria-live="polite"><span class="muted">Carregando…</span></div>
    </div>

    <label class="field">Serviço
      <select id="f-service" required>${orphan}${svcOptions}</select>
    </label>
    <div class="grid2">
      <label class="field">Duração (min)<input id="f-duration" type="number" inputmode="numeric" min="5" max="720" step="5" value="${editing ? editing.duration_min : ''}" placeholder="Ex.: 90"></label>
      <label class="field">Valor (R$)<input id="f-price" inputmode="decimal" value="${editing ? U.centsToInput(editing.price_cents) : ''}" placeholder="0,00"></label>
    </div>
    <label class="check hidden" id="f-savesvc-wrap"><input type="checkbox" id="f-savesvc"> <span>Guardar essa duração neste serviço para os próximos agendamentos</span></label>

    <div class="field">
      <span class="lbl">Pagamento</span>
      <div class="seg" role="radiogroup" aria-label="Pagamento">
        <label><input type="radio" name="f-payment" value="pending" ${!editing || editing.payment === 'pending' ? 'checked' : ''}><span>Pendente</span></label>
        <label><input type="radio" name="f-payment" value="paid" ${editing && editing.payment === 'paid' ? 'checked' : ''}><span>Pago</span></label>
      </div>
    </div>
    ${editing
      ? `<label class="field">Situação
        <select id="f-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${editing.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      </label>`
      : ''}
    <label class="field">Observações (opcional)<textarea id="f-notes" rows="2" maxlength="500" placeholder="Ex.: prefere cor nude, alergia a algum produto…">${esc(editing ? editing.notes || '' : '')}</textarea></label>

    <div id="f-error" class="notice err" role="alert" hidden></div>
    <div class="form-actions">
      <button type="submit" class="btn primary block">${icon('check')} ${editing ? 'Salvar alterações' : 'Salvar agendamento'}</button>
      ${editing ? `<button type="button" class="btn danger-ghost block" data-action="delete-appt" data-id="${editing.id}">${icon('trash')} Excluir agendamento</button>` : ''}
    </div>
  </form>`;
  openSheet(html);
  renderClientSection();
  if (!editing) $('#f-service').value = '';
  refreshSlots();
  showSaveSvc();
}

function renderClientSection() {
  const box = $('#f-client');
  if (!box) return;
  if (F.clientId) {
    const c = S.clientMap.get(F.clientId);
    box.innerHTML = `<div class="field"><span class="lbl">Cliente</span>
      <div class="client-chip"><div><b>${esc(c ? c.name : 'Cliente removida')}</b><span>${esc(c ? U.fmtPhone(c.whatsapp) : '')}</span></div>
      <button type="button" class="btn ghost small" data-action="clear-client">Trocar</button></div></div>
      ${c && !c.whatsapp_consent ? `<label class="check"><input type="checkbox" id="f-consent"> <span>A cliente autorizou receber lembretes por WhatsApp</span></label>` : ''}`;
  } else {
    box.innerHTML = `<label class="field">Nome completo da cliente
        <input id="f-name" autocomplete="off" autocapitalize="words" maxlength="120" placeholder="Digite para buscar ou cadastrar" data-autofocus>
      </label>
      <div id="f-suggest" class="suggest" hidden></div>
      <label class="field">WhatsApp (com DDD)<input id="f-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="(42) 90000-0000"></label>
      <label class="check"><input type="checkbox" id="f-consent"> <span>A cliente autorizou receber lembretes por WhatsApp</span></label>`;
    setTimeout(() => $('#f-name') && !F.id && $('#f-name').focus(), 80);
  }
}

function suggest(q) {
  const box = $('#f-suggest');
  if (!box) return;
  const n = U.norm(q);
  if (n.length < 2) {
    box.hidden = true;
    return;
  }
  const hits = S.clients.filter((c) => U.norm(c.name).includes(n)).slice(0, 5);
  box.hidden = !hits.length;
  box.innerHTML = hits.map((c) => `<button type="button" data-action="pick-client" data-id="${c.id}"><b>${esc(c.name)}</b><span>${esc(U.fmtPhone(c.whatsapp))}</span></button>`).join('');
}

async function refreshSlots() {
  const date = val('#f-date');
  const box = $('#f-slots');
  if (!box || !date) return;
  try {
    const [f, t] = U.dayRangeISO(date, tz());
    const list = await API.apptRange(f, t);
    putAppts(list);
    F.occupied = list
      .filter((a) => a.status !== 'cancelled' && a.id !== F.id)
      .map((a) => {
        const s = U.timeToMin(U.localTimeStr(a.start_at, tz()));
        return { s, e: s + a.duration_min, who: clientName(a.client_id) };
      });
  } catch (e) {
    F.occupied = [];
  }
  drawSlots();
  showConflict();
}

function dur() {
  const n = parseInt(val('#f-duration'), 10);
  return Number.isFinite(n) && n >= 5 ? n : 0;
}

function drawSlots() {
  const box = $('#f-slots');
  if (!box) return;
  const date = val('#f-date');
  const step = S.settings.slot_minutes;
  const ws = U.timeToMin(S.settings.work_start);
  const we = U.timeToMin(S.settings.work_end);
  const d = dur() || step;
  const nowMin = date === today() ? U.nowLocal(tz()).minutes : -1;
  const cur = val('#f-time');
  const chips = [];
  for (let t = ws; t + d <= we; t += step) {
    if (t < nowMin) continue;
    if (F.occupied.some((o) => t < o.e && t + d > o.s)) continue;
    const hhmm = U.minToTime(t);
    chips.push(`<button type="button" class="slot ${hhmm === cur ? 'on' : ''}" data-action="slot-pick" data-time="${hhmm}">${hhmm}</button>`);
  }
  box.innerHTML = chips.length
    ? chips.join('')
    : `<span class="muted">Nenhum horário livre dentro do expediente (${S.settings.work_start}–${S.settings.work_end}). Você ainda pode digitar outro horário.</span>`;
}

function showConflict() {
  const box = $('#f-conflict');
  if (!box) return;
  const date = val('#f-date');
  const time = val('#f-time');
  if (!date || !time) {
    box.hidden = true;
    return;
  }
  const s = U.timeToMin(time);
  const e = s + (dur() || 1);
  const hit = F.occupied.find((o) => s < o.e && e > o.s);
  box.hidden = !hit;
  if (hit) box.textContent = `Atenção: esse horário conflita com ${hit.who} (${U.minToTime(hit.s)}–${U.minToTime(hit.e)}).`;
}

function showSaveSvc() {
  const wrap = $('#f-savesvc-wrap');
  if (!wrap) return;
  const svc = S.services.find((s) => s.id === val('#f-service'));
  wrap.classList.toggle('hidden', !(svc && !svc.duration_min && dur() >= 5));
}

function formErr(msg) {
  const e = $('#f-error');
  e.textContent = msg;
  e.hidden = !msg;
  if (msg) e.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function onApptFormInput(e) {
  const id = e.target.id;
  if (id === 'f-name') suggest(e.target.value);
  else if (id === 'f-phone') e.target.value = U.maskPhoneInput(e.target.value);
  else if (id === 'f-date') refreshSlots();
  else if (id === 'f-time') {
    drawSlots();
    showConflict();
  } else if (id === 'f-duration') {
    drawSlots();
    showConflict();
    showSaveSvc();
  }
}
export function onApptFormChange(e) {
  if (e.target.id === 'f-service') {
    const svc = S.services.find((s) => s.id === e.target.value);
    if (svc) {
      $('#f-price').value = U.centsToInput(svc.price_cents);
      $('#f-duration').value = svc.duration_min || '';
    }
    drawSlots();
    showConflict();
    showSaveSvc();
  }
}
export function pickClient(id) {
  F.clientId = id;
  renderClientSection();
}
export function clearClient() {
  F.clientId = null;
  renderClientSection();
}
export function pickSlot(time) {
  $('#f-time').value = time;
  drawSlots();
  showConflict();
}

export async function saveApptForm() {
  formErr('');
  const btn = $('button[type=submit]');
  // ---- cliente
  let client = F.clientId ? S.clientMap.get(F.clientId) : null;
  let newClient = null;
  if (!client) {
    const name = val('#f-name').trim().replace(/\s+/g, ' ');
    const phone = U.normPhone(val('#f-phone'));
    if (name.length < 2) return formErr('Informe o nome da cliente.');
    if (!phone) return formErr('Informe um WhatsApp válido com DDD. Ex.: (42) 98404-3658.');
    const same = S.clients.find((c) => c.whatsapp === phone);
    if (same) client = same; // já existe uma cliente com esse número: usa o cadastro dela
    else newClient = { name, whatsapp: phone };
  }
  // ---- data, hora, serviço, duração, valor
  const date = val('#f-date');
  const time = val('#f-time');
  if (!date || !time) return formErr('Escolha a data e o horário.');
  const svc = S.services.find((s) => s.id === val('#f-service'));
  const keepName = F.orig && !val('#f-service') ? F.orig.service_name : null;
  if (!svc && !keepName) return formErr('Escolha o serviço.');
  const duration = dur();
  if (!duration || duration > 720) return formErr('Informe a duração do atendimento em minutos (de 5 a 720).');
  const price = val('#f-price').trim() === '' ? 0 : U.parseMoney(val('#f-price'));
  if (price === null) return formErr('Valor inválido. Use um formato como 80,00.');

  const startISO = U.zonedToUtcISO(date, time, tz());
  const endISO = new Date(new Date(startISO).getTime() + duration * 60000).toISOString();

  btn.disabled = true;
  try {
    const clash = await API.findConflicts(startISO, endISO, F.id);
    if (clash.length) {
      const o = clash[0];
      return formErr(`Esse horário conflita com ${clientName(o.client_id)} (${U.localTimeStr(o.start_at, tz())}–${U.localTimeStr(o.end_at, tz())}). Escolha outro horário.`);
    }
    // cliente nova
    if (newClient) {
      const wantsConsent = $('#f-consent') && $('#f-consent').checked;
      client = await API.insertClient({
        ...newClient,
        whatsapp_consent: !!wantsConsent,
        whatsapp_consent_at: wantsConsent ? new Date().toISOString() : null,
      });
      upsertClient(client);
    } else if ($('#f-consent') && $('#f-consent').checked && !client.whatsapp_consent) {
      client = await API.updateClient(client.id, { whatsapp_consent: true, whatsapp_consent_at: new Date().toISOString() });
      upsertClient(client);
    }
    const payload = {
      client_id: client.id,
      service_id: svc ? svc.id : F.orig ? F.orig.service_id : null,
      service_name: svc ? svc.name : keepName,
      start_at: startISO,
      duration_min: duration,
      price_cents: price,
      payment: document.querySelector('#sheet input[name=f-payment]:checked').value,
      notes: val('#f-notes').trim() || null,
    };
    if (F.id) {
      payload.status = val('#f-status') || F.orig.status;
      if (F.orig.start_at !== startISO) {
        // reagendado: a confirmação anterior não vale mais
        payload.confirmation_prepared_at = null;
        payload.confirmation_manual_at = null;
        payload.confirmation_api_at = null;
      }
    }
    const row = F.id ? await API.updateAppt(F.id, payload) : await API.insertAppt(payload);
    S.appts.set(row.id, row);
    if (svc && !svc.duration_min && $('#f-savesvc') && $('#f-savesvc').checked) {
      const upd = await API.updateService(svc.id, { duration_min: duration });
      S.services = S.services.map((s) => (s.id === upd.id ? upd : s));
    }
    closeSheet();
    toast(F.id ? 'Alterações salvas ✓' : same_msg(client, newClient));
    if (S.route === 'agenda') S.agenda.date = apptDate(row);
    R.reload();
  } catch (e) {
    formErr(e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
const same_msg = (client, newClient) => (newClient ? `Agendamento salvo ✓ — ${client.name} foi cadastrada` : 'Agendamento salvo ✓');

export async function deleteAppt(id) {
  const a = S.appts.get(id);
  if (!a) return;
  const ok = await confirmDialog({
    title: 'Excluir este agendamento?',
    text: `${clientName(a.client_id)} · ${U.fmtDateBR(apptDate(a))} às ${U.localTimeStr(a.start_at, tz())}. Essa ação não pode ser desfeita. Se a cliente só desmarcou, prefira "Cancelar".`,
    ok: 'Excluir', danger: true,
  });
  if (!ok) return;
  try {
    await API.deleteAppt(id);
    S.appts.delete(id);
    closeSheet();
    toast('Agendamento excluído');
    R.reload();
  } catch (e) {
    toast(e.message, { type: 'error' });
  }
}

/* ====================================================================
   CLIENTE
   ==================================================================== */
let CF = null;

export async function openClientForm(id = null) {
  const c = id ? S.clientMap.get(id) : null;
  CF = { id };
  const st = (id && S.stats.get(id)) || { attended: 0, missed: 0, cancelled: 0 };
  const html = `<form data-form="client" class="form" novalidate>
    ${headerOf(c ? c.name : 'Nova cliente')}
    ${c ? `<div class="mini-stats">
        <div><b>${st.attended || 0}</b><span>comparecimentos</span></div>
        <div><b>${st.missed || 0}</b><span>faltas</span></div>
        <div><b>${st.cancelled || 0}</b><span>cancelamentos</span></div></div>` : ''}
    <label class="field">Nome completo<input id="c-name" value="${esc(c ? c.name : '')}" maxlength="120" autocapitalize="words" ${c ? '' : 'data-autofocus'}></label>
    <label class="field">WhatsApp (com DDD)<input id="c-phone" type="tel" inputmode="tel" value="${esc(c ? U.fmtPhone(c.whatsapp) : '')}" placeholder="(42) 90000-0000"></label>
    <label class="field">Aniversário (opcional)<input id="c-birthday" type="date" value="${c && c.birthday ? c.birthday : ''}"></label>
    <label class="field">Observações<textarea id="c-notes" rows="3" maxlength="1000" placeholder="Preferências, cuidados, alergias que ela informou…">${esc(c ? c.notes || '' : '')}</textarea></label>
    <label class="check"><input type="checkbox" id="c-consent" ${c && c.whatsapp_consent ? 'checked' : ''}> <span>A cliente autorizou receber lembretes de agendamento por WhatsApp${c && c.whatsapp_consent && c.whatsapp_consent_at ? `<small>Autorização registrada em ${U.fmtDateBR(U.localDateStr(c.whatsapp_consent_at, tz()))}</small>` : ''}</span></label>
    <div id="c-error" class="notice err" role="alert" hidden></div>
    <div class="form-actions">
      <button type="submit" class="btn primary block">${icon('check')} Salvar cadastro</button>
      ${c ? `<button type="button" class="btn soft block" data-action="new-appt" data-client="${c.id}">${icon('calendar')} Novo agendamento para ela</button>
            <button type="button" class="btn danger-ghost block" data-action="delete-client" data-id="${c.id}">${icon('trash')} Excluir cliente</button>` : ''}
    </div>
    ${c ? `<h3 class="sub">Histórico de atendimentos</h3><div id="c-history" class="history"><span class="muted">Carregando…</span></div>` : ''}
  </form>`;
  openSheet(html);
  if (c) {
    try {
      const list = await API.apptsByClient(c.id);
      putAppts(list);
      const box = $('#c-history');
      if (!box) return;
      box.innerHTML = list.length
        ? list.map((a) => `<button type="button" class="hist-row" data-action="edit-appt" data-id="${a.id}">
            <span class="d">${U.fmtDateBR(apptDate(a))}<small>${U.localTimeStr(a.start_at, tz())}</small></span>
            <span class="s">${esc(a.service_name)}<small>${U.fmtBRL(a.price_cents)}${a.status === 'attended' ? ` · ${a.payment === 'paid' ? 'pago' : 'pagamento pendente'}` : ''}</small></span>
            <span class="chip ${STATUS[a.status].cls}">${STATUS[a.status].label}</span></button>`).join('')
        : '<span class="muted">Nenhum atendimento ainda.</span>';
    } catch (e) {
      const box = $('#c-history');
      if (box) box.innerHTML = `<span class="muted">${esc(e.message)}</span>`;
    }
  }
}

export function onClientFormInput(e) {
  if (e.target.id === 'c-phone') e.target.value = U.maskPhoneInput(e.target.value);
}

export async function saveClientForm() {
  const err = (m) => {
    const b = $('#c-error');
    b.textContent = m;
    b.hidden = !m;
  };
  err('');
  const name = val('#c-name').trim().replace(/\s+/g, ' ');
  const phone = U.normPhone(val('#c-phone'));
  if (name.length < 2) return err('Informe o nome da cliente.');
  if (!phone) return err('Informe um WhatsApp válido com DDD.');
  const dup = S.clients.find((c) => c.whatsapp === phone && c.id !== CF.id);
  if (dup) return err(`Esse número já está cadastrado para ${dup.name}.`);
  const old = CF.id ? S.clientMap.get(CF.id) : null;
  const consent = $('#c-consent').checked;
  const fields = {
    name, whatsapp: phone,
    birthday: val('#c-birthday') || null,
    notes: val('#c-notes').trim() || null,
    whatsapp_consent: consent,
    whatsapp_consent_at: consent ? (old && old.whatsapp_consent && old.whatsapp_consent_at ? old.whatsapp_consent_at : new Date().toISOString()) : null,
  };
  const btn = $('button[type=submit]');
  btn.disabled = true;
  try {
    const row = CF.id ? await API.updateClient(CF.id, fields) : await API.insertClient(fields);
    upsertClient(row);
    closeSheet();
    toast('Cadastro salvo ✓');
    R.reload();
  } catch (e) {
    err(e.message);
  } finally {
    btn.disabled = false;
  }
}

export async function deleteClientFlow(id) {
  const c = S.clientMap.get(id);
  if (!c) return;
  const st = S.stats.get(id);
  const total = st ? (st.attended || 0) + (st.missed || 0) + (st.cancelled || 0) : 0;
  const ok = await confirmDialog({
    title: `Excluir ${c.name}?`,
    text: total
      ? 'O cadastro e TODO o histórico dela (atendimentos e valores) serão apagados, inclusive do financeiro. Essa ação não pode ser desfeita.'
      : 'O cadastro e os agendamentos futuros dela serão apagados. Essa ação não pode ser desfeita.',
    ok: 'Excluir cliente', danger: true,
  });
  if (!ok) return;
  try {
    await API.deleteClient(id);
    removeClient(id);
    closeSheet();
    toast('Cliente excluída');
    R.reload();
  } catch (e) {
    toast(e.message, { type: 'error' });
  }
}

/* ====================================================================
   SERVIÇO
   ==================================================================== */
let SF = null;

export function openServiceForm(id = null) {
  const s = id ? S.services.find((x) => x.id === id) : null;
  SF = { id };
  const html = `<form data-form="service" class="form" novalidate>
    ${headerOf(s ? 'Editar serviço' : 'Novo serviço')}
    <label class="field">Nome do serviço<input id="s-name" maxlength="80" value="${esc(s ? s.name : '')}" ${s ? '' : 'data-autofocus'}></label>
    <div class="grid2">
      <label class="field">Valor (R$)<input id="s-price" inputmode="decimal" value="${s ? U.centsToInput(s.price_cents) : ''}" placeholder="0,00"></label>
      <label class="field">Duração (min)<input id="s-duration" type="number" inputmode="numeric" min="5" max="720" step="5" value="${s && s.duration_min ? s.duration_min : ''}" placeholder="Ex.: 90"></label>
    </div>
    <p class="hint">A duração é usada para bloquear o horário na agenda. Ela só é preenchida se você definir aqui.</p>
    <label class="check"><input type="checkbox" id="s-active" ${!s || s.active ? 'checked' : ''}> <span>Serviço ativo (aparece ao agendar)</span></label>
    <div id="s-error" class="notice err" role="alert" hidden></div>
    <div class="form-actions">
      <button type="submit" class="btn primary block">${icon('check')} Salvar serviço</button>
      ${s ? `<button type="button" class="btn danger-ghost block" data-action="delete-service" data-id="${s.id}">${icon('trash')} Excluir serviço</button>` : ''}
    </div>
  </form>`;
  openSheet(html);
}

export async function saveServiceForm() {
  const err = (m) => {
    const b = $('#s-error');
    b.textContent = m;
    b.hidden = !m;
  };
  err('');
  const name = val('#s-name').trim().replace(/\s+/g, ' ');
  if (!name) return err('Informe o nome do serviço.');
  const price = val('#s-price').trim() === '' ? 0 : U.parseMoney(val('#s-price'));
  if (price === null) return err('Valor inválido. Use um formato como 80,00.');
  const dRaw = val('#s-duration').trim();
  let duration = null;
  if (dRaw !== '') {
    duration = parseInt(dRaw, 10);
    if (!Number.isFinite(duration) || duration < 5 || duration > 720) return err('A duração deve ficar entre 5 e 720 minutos.');
  }
  const fields = { name, price_cents: price, duration_min: duration, active: $('#s-active').checked };
  const btn = $('button[type=submit]');
  btn.disabled = true;
  try {
    const row = SF.id ? await API.updateService(SF.id, fields) : await API.insertService(fields);
    S.services = SF.id ? S.services.map((s) => (s.id === row.id ? row : s)) : [...S.services, row];
    closeSheet();
    toast('Serviço salvo ✓');
    R.reload();
  } catch (e) {
    err(e.message);
  } finally {
    btn.disabled = false;
  }
}

export async function deleteServiceFlow(id) {
  const s = S.services.find((x) => x.id === id);
  if (!s) return;
  const ok = await confirmDialog({
    title: `Excluir o serviço "${s.name}"?`,
    text: 'Os atendimentos antigos continuam no histórico com o nome do serviço. Se preferir só tirar da lista, desmarque "Serviço ativo".',
    ok: 'Excluir serviço', danger: true,
  });
  if (!ok) return;
  try {
    await API.deleteService(id);
    S.services = S.services.filter((x) => x.id !== id);
    closeSheet();
    toast('Serviço excluído');
    R.reload();
  } catch (e) {
    toast(e.message, { type: 'error' });
  }
}
