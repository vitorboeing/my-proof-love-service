# Memory Bloom - Backend API

Backend Node.js com Express e PostgreSQL para o Memory Bloom.

## 🚀 Setup

### 1. Instalar dependências

```bash
cd backend
npm install
```

### 2. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

Edite o `.env` com suas configurações:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/memory_bloom?schema=public"
JWT_SECRET="seu-jwt-secret-super-seguro-aqui"
PORT=3001
FRONTEND_URL="http://localhost:8080"
```

### 3. Configurar banco de dados

```bash
# Gerar Prisma Client
npm run db:generate

# Criar/atualizar schema no banco
npm run db:push

# (Ou usar migrations)
npm run db:migrate

# Popular dados iniciais (planos)
npm run db:seed
```

### 4. Iniciar servidor

```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm run build
npm start
```

## 📁 Estrutura

```
backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts       # Autenticação (login, register, magic link)
│   │   ├── moments.ts    # CRUD de momentos
│   │   ├── upload.ts     # Upload de imagens/mídia
│   │   └── qr.ts         # Geração de QR Codes
│   ├── middleware/
│   │   └── auth.ts       # Middleware de autenticação
│   ├── prisma/
│   │   └── seed.ts       # Seed do banco
│   └── server.ts         # Servidor Express
├── prisma/
│   └── schema.prisma     # Schema do banco
└── package.json
```

## 🔌 Endpoints

### Autenticação

- `POST /api/auth/register` - Registrar usuário
- `POST /api/auth/login` - Login
- `POST /api/auth/magic-link` - Enviar magic link
- `GET /api/auth/verify?token=...` - Verificar magic link
- `GET /api/auth/me` - Obter usuário atual (requer auth)

### Momentos

- `POST /api/moments` - Criar momento (requer auth)
- `GET /api/moments/my` - Listar meus momentos (requer auth)
- `GET /api/moments/:slug` - Obter momento por slug (público)
- `PUT /api/moments/:id` - Atualizar momento (requer auth)
- `DELETE /api/moments/:id` - Deletar momento (requer auth)
- `POST /api/moments/:id/publish` - Publicar momento (requer auth)
- `POST /api/moments/:id/blocks` - Adicionar bloco (requer auth)
- `PUT /api/moments/blocks/:blockId` - Atualizar bloco (requer auth)
- `DELETE /api/moments/blocks/:blockId` - Deletar bloco (requer auth)

### Upload

- `POST /api/upload/:momentId` - Upload de arquivo (requer auth)
- `DELETE /api/upload/:mediaId` - Deletar mídia (requer auth)

### QR Code

- `POST /api/qr/:momentId` - Gerar QR Code (requer auth)
- `GET /api/qr/:momentId` - Listar QR Codes do momento (requer auth)

## 🔐 Autenticação

Use o header `Authorization: Bearer <token>` nas requisições protegidas.

## 📊 Banco de Dados

O banco usa Prisma ORM. Para visualizar/editr dados:

```bash
npm run db:studio
```

## 🧪 Testes

```bash
# Em breve
npm test
```

## 🚢 Deploy

1. Configure variáveis de ambiente no servidor
2. Execute migrations: `npm run db:migrate`
3. Build: `npm run build`
4. Start: `npm start`

## 📝 Próximos passos

- [ ] Integração com Stripe
- [ ] Integração com Pix
- [ ] Upload para S3/R2
- [ ] Google OAuth
- [ ] Sistema de planos/paywall
- [ ] Analytics
- [ ] Rate limiting
- [ ] Testes automatizados

