"""Apply tested text transformations to local original Ellen repository sources.
Does not need passwords and does not touch Supabase data."""
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
app_file=root/'app.js'; server_file=root/'server.js'
assert app_file.exists() and server_file.exists(), 'Coloque este script na pasta do projeto original Ellen, com app.js e server.js.'
app=app_file.read_text(encoding='utf8'); server=server_file.read_text(encoding='utf8')

def change(src, old, new, label):
    count=src.count(old)
    if count!=1: raise RuntimeError(f'Não consegui localizar trecho {label}: encontrado {count} vezes. Não alterei os arquivos.')
    return src.replace(old,new)

old_show='''function showFatal(title, html) {
  boot.hidden = true;
  app.innerHTML = `<main class="login"><img src="logo.jpg" alt="Ellen Cristina Nail Designer" width="140" height="140"><h1>${esc(title)}</h1>${html}</main>`;
}'''
new_show='''function showFatal(title, html) {
  boot.hidden = true;
  app.innerHTML = `<main class="login"><img src="logo.jpg" alt="Ellen Cristina Nail Designer" width="140" height="140"><h1>${esc(title)}</h1>${html}</main>`;
}

function showLogin(message = '') {
  boot.hidden = true;
  S.session = null;
  app.innerHTML = `<main class="login">
    <img src="logo.jpg" alt="Ellen Cristina Nail Designer" width="140" height="140">
    <h1>Entrar no Ellen Gestão</h1>
    <p class="hint">Acesso exclusivo da Ellen</p>
    ${message ? `<div class="notice err" role="alert">${esc(message)}</div>` : ''}
    <form id="ellen-login">
      <label for="ellen-email">E-mail</label>
      <input id="ellen-email" name="email" type="email" autocomplete="username" required>
      <label for="ellen-password">Senha</label>
      <input id="ellen-password" name="password" type="password" autocomplete="current-password" required>
      <button class="btn primary block" type="submit">Entrar</button>
    </form>
  </main>`;
}'''
app=change(app,old_show,new_show,'tela de login')

old_start='''  API.onAuth((event) => {
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
  await enter(session);'''
new_start='''  API.onAuth((event) => {
    if (event === 'SIGNED_OUT' && S.session) showLogin();
  });
  let session = null;
  try { session = await API.getSession(); } catch (_) {}
  if (!session) return showLogin();
  await enter(session);'''
app=change(app,old_start,new_start,'inicialização')

addition='''document.addEventListener('submit', async (ev) => {
  const f = ev.target.closest('#ellen-login');
  if (!f) return;
  ev.preventDefault();
  const button = f.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const email = f.elements.email.value.trim();
    const password = f.elements.password.value;
    const session = await API.signIn(email, password);
    await enter(session);
  } catch (e) {
    showLogin(e.message || 'Não foi possível entrar. Tente novamente.');
  } finally {
    button.disabled = false;
  }
});

'''
app=change(app,"document.addEventListener('submit', async (ev) => {",addition+"document.addEventListener('submit', async (ev) => {",'evento de login')

start=server.index('// Entrada automática (sem tela de login)')
end=server.index('function send(req, res, status',start)
server=server[:start]+server[end:]
route='''  if (p === '/session') {
    return autoSession().then((r) => send(req, res, r.status, Buffer.from(JSON.stringify(r.body)), 'application/json', 'no-store'));
  }
'''
server=change(server,route,'','rota insegura de sessão')

for f,src in [(app_file,app),(server_file,server)]:
    f.with_suffix(f.suffix+'.backup').write_text(f.read_text(encoding='utf8'),encoding='utf8')
    f.write_text(src,encoding='utf8')
print('Aplicado: app.js e server.js corrigidos, backups .backup criados.')
