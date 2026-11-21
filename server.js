// Servidor mínimo (sem dependências) para o Render.
// Entrega só os arquivos do app e gera /config.js a partir das variáveis de ambiente.
// Nenhum segredo fica no código: SUPABASE_URL e SUPABASE_ANON_KEY são a chave PÚBLICA (anon).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const ALLOW = new Set([
  'index.html', 'app.css', 'app.js', 'core.js', 'api.js', 'actions.js', 'forms.js', 'views.js', 'util.js', 'content.js',
  'sw.js', 'manifest.webmanifest', 'logo.jpg', 'favicon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'mao.jpg', 'svc-f1.jpg', 'svc-gel.jpg', 'svc-simples.jpg', 'svc-soft.jpg',
]);
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

function configJs() {
  const cfg = { url: process.env.SUPABASE_URL || '', key: process.env.SUPABASE_ANON_KEY || '' };
  return `window.__APP_CONFIG__=${JSON.stringify(cfg).replace(/</g, '\\u003c')};`;
}

// Entrada automática (sem tela de login): o servidor entra no Supabase com o e-mail e a senha
// guardados nas variáveis APP_EMAIL e APP_PASSWORD (só no Render, nunca no código) e entrega
// ao navegador apenas os tokens da sessão. As regras (RLS) do banco continuam valendo.
const hits = [];
async function autoSession() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  const email = process.env.APP_EMAIL || '';
  const password = process.env.APP_PASSWORD || '';
  if (!base || !key || !email || !password) return { status: 500, body: { error: 'Faltam as variáveis APP_EMAIL e APP_PASSWORD no servidor.' } };
  const now = Date.now();
  while (hits.length && now - hits[0] > 60000) hits.shift();
  if (hits.length >= 20) return { status: 429, body: { error: 'Muitas tentativas. Aguarde um minuto.' } };
  hits.push(now);
  try {
    const r = await fetch(base + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) return { status: 502, body: { error: 'O Supabase recusou o e-mail/senha configurados no servidor.' } };
    return { status: 200, body: { access_token: j.access_token, refresh_token: j.refresh_token } };
  } catch (e) {
    return { status: 502, body: { error: 'Não consegui falar com o Supabase.' } };
  }
}

function send(req, res, status, body, type, cache) {
  const headers = {
    'Content-Type': type, 'Cache-Control': cache,
    'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000',
  };
  const compressible = /text|javascript|json|svg|manifest/.test(type);
  if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 600) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, Buffer.from('Método não permitido'), 'text/plain; charset=utf-8', 'no-store');
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = '/'; }
  if (p === '/healthz') return send(req, res, 200, Buffer.from('ok'), 'text/plain', 'no-store');
  if (p === '/session') {
    return autoSession().then((r) => send(req, res, r.status, Buffer.from(JSON.stringify(r.body)), 'application/json', 'no-store'));
  }
  if (p === '/config.js') return send(req, res, 200, Buffer.from(configJs()), TYPES['.js'], 'no-store');
  let name = p.replace(/^\/+/, '') || 'index.html';
  if (!ALLOW.has(name)) name = ALLOW.has(name) ? name : (path.extname(name) ? null : 'index.html');
  if (!name) return send(req, res, 404, Buffer.from('Não encontrado'), 'text/plain; charset=utf-8', 'no-store');
  fs.readFile(path.join(ROOT, name), (err, data) => {
    if (err) return send(req, res, 404, Buffer.from('Não encontrado'), 'text/plain; charset=utf-8', 'no-store');
    const type = TYPES[path.extname(name)] || 'application/octet-stream';
    const cache = name === 'sw.js' || name.endsWith('.html') || name.endsWith('.js') || name.endsWith('.css') ? 'no-cache' : 'public, max-age=86400';
    send(req, res, 200, data, type, cache);
  });
}).listen(PORT, () => console.log('Servidor ativo na porta ' + PORT));
