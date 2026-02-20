# Script PowerShell para configurar o banco de dados automaticamente
# Requer: psql no PATH ou variável PGPASSWORD configurada

param(
    [string]$DbUser = "postgres",
    [string]$DbPassword = "",
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432"
)

Write-Host "🗄️  Configurando banco de dados Memory Bloom..." -ForegroundColor Cyan

# Criar string de conexão
$connectionString = "postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/postgres"

# Verificar se psql está disponível
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql não encontrado no PATH" -ForegroundColor Red
    Write-Host "💡 Instale o PostgreSQL ou adicione ao PATH" -ForegroundColor Yellow
    Write-Host "💡 Ou crie o banco manualmente:" -ForegroundColor Yellow
    Write-Host "   CREATE DATABASE memory_bloom;" -ForegroundColor Gray
    exit 1
}

# Criar banco de dados
Write-Host "📦 Criando banco de dados 'memory_bloom'..." -ForegroundColor Cyan
$env:PGPASSWORD = $DbPassword
$createDbQuery = "CREATE DATABASE memory_bloom;"
$result = psql -h $DbHost -p $DbPort -U $DbUser -d postgres -c $createDbQuery 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Banco de dados criado com sucesso!" -ForegroundColor Green
} elseif ($result -match "already exists") {
    Write-Host "⚠️  Banco de dados já existe, continuando..." -ForegroundColor Yellow
} else {
    Write-Host "❌ Erro ao criar banco:" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Próximos passos:" -ForegroundColor Green
Write-Host "   1. Configure o .env com a DATABASE_URL:" -ForegroundColor Yellow
Write-Host "      DATABASE_URL=`"postgresql://${DbUser}:${DbPassword}@${DbHost}:${DbPort}/memory_bloom?schema=public`"" -ForegroundColor Gray
Write-Host "   2. Execute: npm run db:generate" -ForegroundColor Yellow
Write-Host "   3. Execute: npm run db:push" -ForegroundColor Yellow
Write-Host "   4. Execute: npm run db:seed" -ForegroundColor Yellow

