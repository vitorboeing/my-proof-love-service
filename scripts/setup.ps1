# PowerShell setup script for Windows

Write-Host "🚀 Setting up Memory Bloom Backend..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "📝 Creating .env file from env.example..." -ForegroundColor Yellow
    Copy-Item env.example .env
    Write-Host "⚠️  Please edit .env with your database credentials!" -ForegroundColor Yellow
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm install

# Generate Prisma Client
Write-Host "🔧 Generating Prisma Client..." -ForegroundColor Cyan
npm run db:generate

# Push schema to database
Write-Host "💾 Pushing database schema..." -ForegroundColor Cyan
npm run db:push

# Seed database
Write-Host "🌱 Seeding database..." -ForegroundColor Cyan
npm run db:seed

Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host "📝 Don't forget to:" -ForegroundColor Yellow
Write-Host "   1. Edit .env with your database URL" -ForegroundColor Yellow
Write-Host "   2. Run 'npm run dev' to start the server" -ForegroundColor Yellow

