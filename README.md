# Site da Ellen Cristina · Nail Designer

Página única com **prova de esmalte por IA** e botão de agendamento pelo WhatsApp.

```
server.js          servidor (Node 18+, sem dependências) — guarda a chave da IA
public/index.html  a página (visual + simulador)
public/colors.json cores de esmalte (edite aqui para adicionar/remover)
.env.example       modelo de configuração
```

## Como ativar a IA (obrigatório para gerar as imagens)

A geração usa a API de edição de imagens da OpenAI (`gpt-image-1`). Sem a chave, o site abre normalmente, mas a prova de esmalte mostra um aviso amigável.

1. Crie uma conta em https://platform.openai.com e adicione crédito (Billing).
2. Em **API keys**, crie uma chave. O modelo `gpt-image-1` pode exigir a **verificação da organização** (Settings → Organization → Verify).
3. Em Billing → Limits, defina um **limite mensal de gasto** (ex.: US$ 20).
4. Copie `.env.example` para `.env` e cole a chave em `OPENAI_API_KEY=`.
5. Rode: `node server.js` e abra http://localhost:3000

A chave fica só no servidor (`.env`). Nunca vai para o navegador nem para o código da página.

## Custos

- **IA:** a OpenAI cobra por imagem gerada. Com qualidade `medium`, costuma ficar em poucos centavos de dólar por imagem; `high` custa mais e `low` menos. Os valores mudam: confira em https://openai.com/api/pricing.
- **Proteções de custo já embutidas:** limite por visitante (5 gerações a cada 10 min) e teto diário (150). Ajuste no `.env`.
- **Hospedagem:** precisa de um servidor Node (não funciona como site estático). Opções: Render, Railway, Fly.io, uma VPS, ou o "Setup Node.js App" do cPanel se o plano oferecer Node 18+. Planos gratuitos podem "dormir" e demorar no primeiro acesso.

## Publicar

1. Envie a pasta inteira (sem o `.env`) para o serviço de hospedagem.
2. Comando de início: `node server.js`.
3. Cadastre `OPENAI_API_KEY` (e `TRUST_PROXY=1`) nas variáveis de ambiente do serviço.
4. Use HTTPS (necessário para a câmera funcionar no celular).

## Privacidade

- A cliente precisa marcar a autorização antes de enviar a foto.
- O servidor não grava as fotos em disco, não guarda histórico e só registra no log a cor e o tamanho do arquivo.
- A foto é enviada à OpenAI apenas para gerar a imagem (consulte a política de retenção de dados da API da OpenAI).

## Ajustes rápidos

- **Cores:** edite `public/colors.json` (`id`, `name`, `hex`).
- **Qualidade/modelo:** `OPENAI_IMAGE_QUALITY` e `OPENAI_IMAGE_MODEL` no `.env`.
- **WhatsApp:** link no botão `#wa` do `public/index.html`.
