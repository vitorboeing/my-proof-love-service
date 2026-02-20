# 🔑 Credenciais de Teste

## Usuário Criado no Banco de Dados

```
Email:    teste@memorybloom.com
Senha:    senha123
Nome:     Usuário Teste
```

## 🚀 Como Usar

1. Acesse o frontend: `http://localhost:8080`
2. Clique em "Entrar" ou "Criar Momento"
3. Use as credenciais acima para fazer login

## 📝 Criar Mais Usuários de Teste

Execute o script:

```bash
cd backend
npm run db:create-user
```

Ou diretamente:

```bash
cd backend
npx tsx scripts/create-test-user.ts
```

## ⚙️ Modificar Credenciais

Edite o arquivo `backend/scripts/create-test-user.ts` e altere:

```typescript
const email = 'seu-email@teste.com';
const password = 'sua-senha';
const name = 'Seu Nome';
```

Depois execute o script novamente.

