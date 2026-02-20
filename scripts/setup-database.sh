#!/bin/bash

# Script bash para configurar o banco de dados automaticamente

DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}

echo "🗄️  Configurando banco de dados Memory Bloom..."

# Verificar se psql está disponível
if ! command -v psql &> /dev/null; then
    echo "❌ psql não encontrado no PATH"
    echo "💡 Instale o PostgreSQL ou adicione ao PATH"
    echo "💡 Ou crie o banco manualmente: CREATE DATABASE memory_bloom;"
    exit 1
fi

# Criar banco de dados
echo "📦 Criando banco de dados 'memory_bloom'..."
export PGPASSWORD=$DB_PASSWORD

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE memory_bloom;" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Banco de dados criado com sucesso!"
elif echo "$result" | grep -q "already exists"; then
    echo "⚠️  Banco de dados já existe, continuando..."
else
    echo "❌ Erro ao criar banco"
    exit 1
fi

echo ""
echo "✅ Próximos passos:"
echo "   1. Configure o .env com a DATABASE_URL:"
echo "      DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/memory_bloom?schema=public\""
echo "   2. Execute: npm run db:generate"
echo "   3. Execute: npm run db:push"
echo "   4. Execute: npm run db:seed"

