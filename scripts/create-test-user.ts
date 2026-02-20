import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('🔧 Criando usuário de teste...\n');

    const email = 'teste@memorybloom.com';
    const password = 'senha123';
    const name = 'Usuário Teste';

    // Verificar se usuário já existe
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      console.log('⚠️  Usuário já existe! Atualizando senha...');
      
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          name,
          emailVerified: true,
        },
      });

      console.log('✅ Usuário atualizado com sucesso!\n');
    } else {
      // Criar novo usuário
      const passwordHash = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          provider: 'email',
          emailVerified: true,
        },
      });

      console.log('✅ Usuário criado com sucesso!\n');
    }

    console.log('📧 Credenciais de acesso:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Email:    ${email}`);
    console.log(`   Senha:    ${password}`);
    console.log(`   Nome:     ${name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Use essas credenciais para fazer login no frontend!\n');

  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();

