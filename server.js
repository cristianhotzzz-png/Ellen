'use strict';
/**
 * Servidor do site da Ellen Cristina · Nail Designer
 * - Serve a página única (public/index.html)
 * - POST /api/try-on: recebe a foto + cor, chama a API de edição de imagens da OpenAI
 *   e devolve a imagem gerada. A chave da API fica SOMENTE aqui, no servidor.
 * - Nada é gravado em disco: as fotos existem apenas na memória durante a requisição.
 * Requer Node 18+ (usa fetch, FormData e Blob nativos). Sem dependências npm.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------- .env simples (sem dependências) ----------
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
})();

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const MODEL = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1').trim();
const QUALITY = (process.env.OPENAI_IMAGE_QUALITY || 'medium').trim(); // low | medium | high
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 5; // gerações por IP...
const RATE_WINDOW_MS = (Number(process.env.RATE_LIMIT_WINDOW_MIN) || 10) * 60 * 1000; // ...nesta janela
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 150; // teto diário de gerações (controle de custo)
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const API_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COLORS = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'colors.json'), 'utf8'));
const COLOR_BY_ID = new Map(COLORS.map((c) => [c.id, c]));

const MAX_BODY_BYTES = 7 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- limites de uso ----------
const hits = new Map(); // ip -> [timestamps]
let daily = { day: today(), count: 0 };

function today() {
  return new Date().toISOString().slice(0, 10);
}
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    const fresh = list.filter((t) => now - t < RATE_WINDOW_MS);
    if (fresh.length) hits.set(ip, fresh);
    else hits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ---------- utilidades ----------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('too_large'), { code: 'too_large' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

function buildPrompt(color) {
  return [
    `Edit this photo of a real person's hand. Paint ONLY the fingernails with a glossy gel nail polish in the color "${color.name}" (approximately ${color.hex}).`,
    'Apply the polish smoothly and evenly to every visible nail, covering the whole nail plate up to the cuticle and the free edge, with natural highlights and soft reflections that match the lighting of the photo.',
    'Keep everything else exactly as in the original photo: the same hand, fingers, skin texture, skin tone, pose, rings and jewelry, clothing, background, framing and camera angle. Keep the same nail shape and length.',
    'Do not add nail art, stickers, designs, or extra fingers. Do not retouch or smooth the skin. The result must look like a real, unedited photograph.',
  ].join(' ');
}

// ---------- chamada à API de imagens ----------
async function generateWithOpenAI(buf, img, color) {
  const form = new FormData();
  form.append('model', MODEL);
  form.append('prompt', buildPrompt(color));
  form.append('image', new Blob([buf], { type: img.mime }), `mao.${img.ext}`);
  form.append('n', '1');
  form.append('size', 'auto');
  form.append('quality', QUALITY);
  form.append('output_format', 'jpeg');
  // Fidelidade alta: preserva melhor a mão original (suportado pela família gpt-image-1)
  if (/^gpt-image-1/.test(MODEL) && !/mini/.test(MODEL) && process.env.OPENAI_INPUT_FIDELITY !== 'off') {
    form.append('input_fidelity', 'high');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 150000);
  try {
    const r = await fetch(`${API_BASE}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const err = new Error((data && data.error && data.error.message) || `HTTP ${r.status}`);
      err.status = r.status;
      err.apiCode = data && data.error && (data.error.code || data.error.type);
      throw err;
    }
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) throw Object.assign(new Error('empty_result'), { status: 502 });
    return `data:image/jpeg;base64,${b64}`;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- rotas ----------
async function handleTryOn(req, res) {
  if (!API_KEY) {
    return sendJson(res, 503, {
      code: 'not_configured',
      error: 'A prova de esmalte ainda não está ativada neste site. Fale com a Ellen pelo WhatsApp para agendar.',
    });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return sendJson(res, 429, { code: 'rate_limited', error: 'Você já fez várias tentativas. Aguarde alguns minutos e tente de novo.' });
  }
  if (daily.day !== today()) daily = { day: today(), count: 0 };
  if (daily.count >= DAILY_LIMIT) {
    return sendJson(res, 429, { code: 'daily_limit', error: 'A prova de esmalte atingiu o limite de hoje. Tente novamente amanhã.' });
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (e) {
    const tooBig = e && e.code === 'too_large';
    return sendJson(res, tooBig ? 413 : 400, {
      code: tooBig ? 'too_large' : 'bad_request',
      error: tooBig ? 'A foto é grande demais. Tente outra foto.' : 'Pedido inválido. Atualize a página e tente de novo.',
    });
  }

  if (!payload || payload.consent !== true) {
    return sendJson(res, 400, { code: 'no_consent', error: 'Autorize o envio da foto para continuar.' });
  }
  const color = COLOR_BY_ID.get(String(payload.colorId || ''));
  if (!color) return sendJson(res, 400, { code: 'bad_color', error: 'Escolha uma das cores da lista.' });

  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(payload.image || ''));
  if (!m) return sendJson(res, 400, { code: 'bad_image', error: 'Não foi possível ler a foto. Use uma imagem JPG ou PNG.' });
  const buf = Buffer.from(m[1], 'base64');
  const img = detectImage(buf);
  if (!img || buf.length > MAX_IMAGE_BYTES) {
    return sendJson(res, 400, { code: 'bad_image', error: 'Não foi possível ler a foto. Use uma imagem JPG ou PNG.' });
  }

  daily.count += 1;
  try {
    const image = await generateWithOpenAI(buf, img, color);
    console.log(`[try-on] ok cor=${color.id} bytes_in=${buf.length}`);
    return sendJson(res, 200, { image, color: { id: color.id, name: color.name } });
  } catch (err) {
    console.error(`[try-on] erro status=${err.status || '-'} code=${err.apiCode || '-'} msg=${String(err.message).slice(0, 200)}`);
    if (err.name === 'AbortError') {
      return sendJson(res, 504, { code: 'timeout', error: 'A geração demorou mais que o esperado. Tente novamente.' });
    }
    if (err.status === 429) {
      return sendJson(res, 503, { code: 'busy', error: 'O serviço está muito ocupado agora. Tente novamente em instantes.' });
    }
    if (err.status === 400 && /moderation|safety|content_policy/i.test(`${err.apiCode} ${err.message}`)) {
      return sendJson(res, 422, {
        code: 'rejected',
        error: 'Não conseguimos editar essa foto. Tente outra, com a mão bem visível e sem outras pessoas.',
      });
    }
    if (err.status === 401 || err.status === 403 || err.status === 404) {
      // Problema de configuração (chave, permissão, modelo): o detalhe fica só no log do servidor.
      return sendJson(res, 503, { code: 'service_unavailable', error: 'A prova de esmalte está indisponível no momento. Fale com a Ellen pelo WhatsApp.' });
    }
    return sendJson(res, 502, { code: 'failed', error: 'Não foi possível gerar a imagem agora. Tente novamente em instantes.' });
  }
}

function serveStatic(req, res) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400, SECURITY_HEADERS);
    return res.end();
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Página não encontrada');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/try-on') {
    if (req.method !== 'POST') {
      res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'POST' });
      return res.end();
    }
    return handleTryOn(req, res).catch((e) => {
      console.error('[try-on] erro inesperado', e && e.message);
      if (!res.headersSent) sendJson(res, 500, { code: 'server_error', error: 'Algo deu errado. Tente novamente.' });
    });
  }
  if (url === '/healthz') return sendJson(res, 200, { ok: true, aiConfigured: Boolean(API_KEY) });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD' });
    return res.end();
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Site no ar: http://localhost:${PORT}`);
  console.log(API_KEY ? `IA ativada (modelo ${MODEL}, qualidade ${QUALITY})` : 'ATENÇÃO: OPENAI_API_KEY não definida — a prova de esmalte ficará desativada.');
});
