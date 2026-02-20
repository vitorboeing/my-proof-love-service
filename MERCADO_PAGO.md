# Integração Mercado Pago

## Configuração

### 1. Obter credenciais

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
2. Crie uma aplicação ou use uma existente
3. Em **Credenciais de produção** (ou teste), copie o **Access Token**

### 2. Variáveis de ambiente

Adicione ao `backend/.env`:

```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Chave pública - necessária para Checkout Transparente (cartão sem redirecionamento)
MERCADO_PAGO_PUBLIC_KEY=APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# URLs para callbacks e webhooks (obrigatório em produção)
FRONTEND_URL=https://seusite.com
API_BASE_URL=https://api.seusite.com
```

> **Nota:** Access Token e Public Key são credenciais diferentes. No painel do Mercado Pago, em Credenciais, você verá ambas listadas.

Para testes locais com ngrok (ver seção 4 abaixo):

```env
MERCADO_PAGO_ACCESS_TOKEN=TEST-xxxx...  # Use credenciais de teste
FRONTEND_URL=https://xxx.ngrok-free.app
API_BASE_URL=https://yyy.ngrok-free.app
```

### 3. Webhook em produção

O Mercado Pago envia notificações para `API_BASE_URL/api/payments/webhook/mercadopago`.

### 4. Usar ngrok para testes locais (obrigatório)

O Mercado Pago exige **URLs públicas** (domínio nomeado) para as `back_urls`. O `localhost` não funciona. Use [ngrok](https://ngrok.com) para expor seu app local na internet.

#### Passo 1: Instalar o ngrok

- **Windows**: `winget install ngrok` ou baixe em [ngrok.com/download](https://ngrok.com/download)
- **Mac**: `brew install ngrok`
- Crie conta gratuita em [ngrok.com](https://ngrok.com) e copie seu authtoken em [dashboard.ngrok.com/get-started/your-authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
- Configure: `ngrok config add-authtoken SEU_TOKEN`

#### Passo 2: Subir frontend e backend

Em terminais separados:

```bash
# Terminal 1 – frontend
cd c:\dev\memory-bloom
npm run dev
# Rodando em http://localhost:8080

# Terminal 2 – backend
cd c:\dev\memory-bloom\backend
npm run dev
# Rodando em http://localhost:3001
```

#### Passo 3: Abrir dois túneis ngrok

Você precisa de **duas URLs públicas** (uma para o frontend e outra para o backend).

**Terminal 3 – túnel do frontend:**
```bash
ngrok http 8080
```
Anote a URL gerada, ex: `https://abc123.ngrok-free.app`

**Terminal 4 – túnel do backend:**
```bash
ngrok http 3001
```
Anote a URL gerada, ex: `https://xyz789.ngrok-free.app`

> **Conta gratuita do ngrok:** Permite apenas **1 túnel** por vez. Para ter os dois ao mesmo tempo, use [localtunnel](https://localtunnel.github.io/www/) no segundo: `npx localtunnel --port 3001` (gera uma URL como `https://xxx.loca.lt`). Use essa URL como `API_BASE_URL`.

#### Passo 4: Configurar o `.env` do backend

No arquivo `backend/.env`:

```env
MERCADO_PAGO_ACCESS_TOKEN=TEST-xxxx...   # Credenciais de teste

# URLs do ngrok (substitua pelas suas URLs)
FRONTEND_URL=https://abc123.ngrok-free.app
API_BASE_URL=https://xyz789.ngrok-free.app
```

#### Passo 5: Reiniciar o backend

Após alterar o `.env`:

```bash
# No terminal do backend, Ctrl+C e depois:
npm run dev
```

#### Passo 6: Acessar o app pela URL do ngrok

Abra no navegador a URL do **frontend** (ex: `https://abc123.ngrok-free.app`), não o localhost. Assim o Mercado Pago consegue redirecionar corretamente após o pagamento.

---

**Resumo rápido:**

| O que | Comando / Valor |
|-------|-----------------|
| Instalar ngrok | `winget install ngrok` (Windows) |
| Túnel frontend | `ngrok http 8080` → FRONTEND_URL |
| Túnel backend | `ngrok http 3001` → API_BASE_URL |
| Testar | Acesse a URL do ngrok do frontend, não localhost |

## Fluxos

- **Pix**: QR Code exibido no checkout. Pagamento confirmado via webhook.
- **Cartão**: Redirecionamento para Checkout Pro do Mercado Pago. Retorno para `/checkout/success` ou `/checkout/pending`.

## Credenciais de teste

- [Usuários de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/test-users) – para simular compradores
- [Cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/cards) – use na página do Mercado Pago ao pagar com cartão

**Aprovado**: Nome `APRO`, CPF `12345678909`

## Erro ao criar checkout – Checklist

1. **Token no .env**  
   Verifique se `MERCADO_PAGO_ACCESS_TOKEN` está em `backend/.env` (sem aspas extras, sem espaço antes/depois).

2. **Reiniciar o backend**  
   Depois de alterar o `.env`, pare e suba de novo: `npm run dev`.

3. **Planos no banco**  
   Execute `npm run db:seed` no backend para criar os planos ANNUAL e LIFETIME.

4. **Token de teste**  
   Use credenciais de **teste** (`TEST-...`) e não as de produção para desenvolvimento.

5. **Ver o erro completo**  
   Olhe o terminal do backend ao tentar pagar. O log `[Checkout MP] Erro:` mostra o motivo.

6. **Erros comuns do Mercado Pago**
   - `invalid_access_token` → Token inválido ou expirado; gere um novo no painel.
   - `invalid_params` → Problema nos dados (por exemplo, `unit_price`); confira o plano no banco.
   - `unauthorized` → Token incorreto ou app não autorizada.

## Se o Pix não gerar QR Code

1. Verifique se `MERCADO_PAGO_ACCESS_TOKEN` está no `backend/.env`
2. Rode `npm run db:seed` no backend (planos precisam existir no banco)
3. Reinicie o backend após alterar o `.env`

## Se o pagamento com cartão não funcionar (Checkout Transparente)

1. **MERCADO_PAGO_PUBLIC_KEY** – É obrigatória e diferente do Access Token. No painel do Mercado Pago:
   - Acesse [developers.mercadopago.com](https://www.mercadopago.com.br/developers)
   - Sua aplicação → **Credenciais** → Credenciais de teste (ou produção)
   - Copie a **Chave pública** (Public Key) e adicione no `.env`:
   ```env
   MERCADO_PAGO_PUBLIC_KEY=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

2. **Plano no banco** – Rode `npm run db:seed` no backend

3. **Usuário logado** – O pagamento com cartão exige autenticação (registro/login no Step 5)

4. **Reiniciar o backend** após alterar o `.env`
