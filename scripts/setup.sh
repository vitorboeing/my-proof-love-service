#!/bin/bash

echo "🚀 Setting up Memory Bloom Backend..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from env.example..."
    cp env.example .env
    echo "⚠️  Please edit .env with your database credentials!"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npm run db:generate

# Push schema to database
echo "💾 Pushing database schema..."
npm run db:push

# Seed database
echo "🌱 Seeding database..."
npm run db:seed

echo "✅ Setup complete!"
echo "📝 Don't forget to:"
echo "   1. Edit .env with your database URL"
echo "   2. Run 'npm run dev' to start the server"

