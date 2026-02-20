# Script completo de setup do Memory Bloom Backend
# Execute após configurar o .env com suas credenciais

Write-Host "🚀 Memory Bloom - Setup Completo" -ForegroundColor Cyan
Write-Host ""

# Verificar se .env existe
if (-not (Test-Path .env)) {
    Write-Host "❌ Arquivo .env não encontrado!" -ForegroundColor Red
    Write-Host "💡 Copie env.example para .env e configure suas credenciais" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Arquivo .env encontrado" -ForegroundColor Green
Write-Host ""

# 1. Gerar Prisma Client
Write-Host "📦 1/4 - Gerando Prisma Client..." -ForegroundColor Yellow
try {
    npm run db:generate 2>&1 | Out-Null
    Write-Host "   ✅ Prisma Client gerado" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Erro ao gerar (pode estar já gerado)" -ForegroundColor Yellow
}

Write-Host ""

# 2. Criar tabelas
Write-Host "🗄️  2/4 - Criando tabelas no banco..." -ForegroundColor Yellow
try {
    $result = npm run db:push 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Tabelas criadas com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Erro ao criar tabelas:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Verifique:" -ForegroundColor Yellow
        Write-Host "   - Se o banco 'memory_bloom' foi criado" -ForegroundColor Yellow
        Write-Host "   - Se as credenciais no .env estão corretas" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "   ❌ Erro ao executar db:push" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Popular dados iniciais
Write-Host "🌱 3/4 - Populando dados iniciais (planos)..." -ForegroundColor Yellow
try {
    $result = npm run db:seed 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Dados iniciais criados!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Erro ao popular dados (pode estar já populado)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Erro ao executar seed" -ForegroundColor Yellow
}

Write-Host ""

# 4. Verificar
Write-Host "🔍 4/4 - Verificando instalação..." -ForegroundColor Yellow
if (Test-Path "node_modules\.prisma\client") {
    Write-Host "   ✅ Prisma Client instalado" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Prisma Client não encontrado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Setup completo!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Para iniciar o servidor:" -ForegroundColor Cyan
Write-Host "   npm run dev" -ForegroundColor Yellow
Write-Host ""
Write-Host "📊 Para ver o banco de dados:" -ForegroundColor Cyan
Write-Host "   npm run db:studio" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan

