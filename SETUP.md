# 🚀 Guia Rápido de Setup

## Passo a Passo

### 1. Configure o banco PostgreSQL

Certifique-se de que o PostgreSQL está rodando localmente e crie o banco:

```sql
CREATE DATABASE memory_bloom;
```

### 2. Configure as variáveis de ambiente

Copie o arquivo de exemplo e edite:

```bash
# Windows PowerShell
Copy-Item env.example .env

# Linux/Mac
cp env.example .env
```

Edite o `.env` e configure sua `DATABASE_URL`:

```env
DATABASE_URL="postgresql://seu_usuario:sua_senha@localhost:5432/memory_bloom?schema=public"
JWT_SECRET="gere-um-secret-aleatorio-aqui"
```

**Dica:** Para gerar um JWT_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Instale as dependências

```bash
npm install
```

### 4. Configure o Prisma

```bash
# Gerar Prisma Client
npm run db:generate

# Criar tabelas no banco
npm run db:push

# Popular dados iniciais (planos)
npm run db:seed
```

### 5. Inicie o servidor

```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3001`

## ✅ Verificar se está funcionando

Acesse: `http://localhost:3001/health`

Deve retornar:
```json
{
  "status": "ok",
  "timestamp": "2024-..."
}
```

## 🧪 Testar a API

### Registrar usuário

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "password": "senha123",
    "name": "Teste"
  }'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "password": "senha123"
  }'
```

### Criar momento (com token)

```bash
curl -X POST http://localhost:3001/api/moments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "title": "Meu Primeiro Momento",
    "recipientName": "Maria",
    "senderName": "João",
    "introPhrase": "Você é especial"
  }'
```

## 📊 Visualizar banco de dados

```bash
npm run db:studio
```

Isso abrirá o Prisma Studio em `http://localhost:5555`

## 🔧 Comandos úteis

- `npm run dev` - Inicia servidor em modo desenvolvimento
- `npm run build` - Compila TypeScript
- `npm start` - Inicia servidor em produção
- `npm run db:generate` - Gera Prisma Client
- `npm run db:push` - Atualiza schema no banco
- `npm run db:migrate` - Cria migration
- `npm run db:studio` - Abre Prisma Studio
- `npm run db:seed` - Popula dados iniciais

## ⚠️ Problemas comuns

### Erro de conexão com banco

- Verifique se o PostgreSQL está rodando
- Confirme usuário/senha no `.env`
- Teste a conexão: `psql -U seu_usuario -d memory_bloom`

### Erro "Prisma Client not generated"

Execute: `npm run db:generate`

### Porta já em uso

Altere `PORT` no `.env` ou mate o processo:
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3001 | xargs kill
```

