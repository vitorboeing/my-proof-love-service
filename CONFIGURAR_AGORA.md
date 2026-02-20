# ⚙️ Configuração Necessária

## 🔑 Passo 1: Configure suas credenciais do PostgreSQL

Edite o arquivo `backend/.env` e ajuste a linha `DATABASE_URL` com suas credenciais reais:

```env
DATABASE_URL="postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/memory_bloom?schema=public"
```

**Exemplo:**
- Se seu usuário é `postgres` e senha é `123456`:
  ```env
  DATABASE_URL="postgresql://postgres:123456@localhost:5432/memory_bloom?schema=public"
  ```

## 🗄️ Passo 2: Crie o banco de dados

No seu cliente PostgreSQL (pgAdmin, DBeaver, etc.), execute:

```sql
CREATE DATABASE memory_bloom;
```

Ou use a interface gráfica:
- Clique direito em "Databases" → "Create" → "Database"
- Nome: `memory_bloom`

## ✅ Passo 3: Execute os comandos

Depois de configurar o `.env` e criar o banco, execute:

```powershell
cd backend

# Gerar Prisma Client (pode dar erro de permissão, mas tente)
npm run db:generate

# Criar todas as tabelas
npm run db:push

# Popular dados iniciais
npm run db:seed
```

## 🎯 Depois disso, tudo estará pronto!

O servidor pode ser iniciado com:
```powershell
npm run dev
```

