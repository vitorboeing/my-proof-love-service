# 🚀 Quick Start - Configuração Rápida

## Passo 1: Criar o Banco de Dados

Você tem 3 opções:

### Opção A: Via Interface Gráfica (mais fácil)
1. Abra seu cliente PostgreSQL (pgAdmin, DBeaver, etc.)
2. Conecte-se ao servidor `localhost:5432`
3. Clique com botão direito em "Databases" → "Create" → "Database"
4. Nome: `memory_bloom`
5. Clique em "Save"

### Opção B: Via SQL
Execute no seu cliente SQL:
```sql
CREATE DATABASE memory_bloom;
```

### Opção C: Via linha de comando
```powershell
# Configure suas credenciais
$env:PGPASSWORD = "sua_senha"
psql -U postgres -h localhost -c "CREATE DATABASE memory_bloom;"
```

## Passo 2: Configurar o .env

Edite o arquivo `backend/.env` e configure:

```env
DATABASE_URL="postgresql://postgres:sua_senha@localhost:5432/memory_bloom?schema=public"
JWT_SECRET="gere-um-secret-aleatorio-aqui"
PORT=3001
FRONTEND_URL="http://localhost:8080"
```

**Importante:** 
- Substitua `postgres` pelo seu usuário do PostgreSQL
- Substitua `sua_senha` pela sua senha
- Para gerar um JWT_SECRET seguro, execute:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

## Passo 3: Instalar Dependências (se ainda não fez)

```powershell
cd backend
npm install
```

## Passo 4: Gerar Prisma Client

```powershell
npm run db:generate
```

## Passo 5: Criar Tabelas no Banco

```powershell
npm run db:push
```

Este comando vai:
- ✅ Criar todas as tabelas (users, plans, moments, etc.)
- ✅ Criar relacionamentos
- ✅ Criar índices

## Passo 6: Popular Dados Iniciais (Planos)

```powershell
npm run db:seed
```

Este comando cria os planos (Anual e Vitalício) no banco.

## Passo 7: Verificar se Funcionou

```powershell
npm run db:studio
```

Isso abre o Prisma Studio onde você pode ver todas as tabelas criadas.

## Passo 8: Iniciar o Servidor

```powershell
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

## 🐛 Problemas Comuns

### Erro: "database does not exist"
- Certifique-se de que criou o banco `memory_bloom`
- Verifique a DATABASE_URL no `.env`

### Erro: "password authentication failed"
- Verifique usuário e senha no `.env`
- Teste a conexão: `psql -U postgres -h localhost`

### Erro: "Prisma Client not generated"
- Execute: `npm run db:generate`

### Erro: "relation already exists"
- As tabelas já existem, tudo certo!
- Se quiser recriar, delete o banco e execute `npm run db:push` novamente

