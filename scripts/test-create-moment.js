// Script para testar criação de momento
import dotenv from 'dotenv';

dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 3001}`;

async function testCreateMoment() {
  console.log('🧪 Testando criação de momento...\n');

  try {
    // 1. Registrar usuário
    console.log('1️⃣ Registrando usuário de teste...');
    const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `teste${Date.now()}@example.com`,
        password: 'senha123',
        name: 'Usuário Teste',
      }),
    });

    if (!registerResponse.ok) {
      const error = await registerResponse.json();
      if (error.error?.includes('already exists')) {
        console.log('   ⚠️ Usuário já existe, tentando login...');
        // Tentar login
        const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'teste@example.com',
            password: 'senha123',
          }),
        });
        
        if (!loginResponse.ok) {
          throw new Error('Falha no login');
        }
        
        const loginData = await loginResponse.json();
        const token = loginData.token;
        console.log('   ✅ Login realizado');
        
        // Testar criação de momento
        await testMomentCreation(token);
        return;
      }
      throw new Error(JSON.stringify(error));
    }

    const registerData = await registerResponse.json();
    const token = registerData.token;
    console.log('   ✅ Usuário registrado e autenticado\n');

    // 2. Criar momento
    await testMomentCreation(token);

  } catch (error) {
    console.error('❌ Erro no teste:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function testMomentCreation(token) {
  console.log('2️⃣ Criando momento...');
  
  const momentData = {
    title: 'Meu Primeiro Momento',
    recipientName: 'Maria',
    senderName: 'João',
    introPhrase: 'Você é especial para mim',
    startDate: new Date('2020-02-14').toISOString(),
    locale: 'pt-BR',
  };

  const createResponse = await fetch(`${API_URL}/api/moments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(momentData),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json();
    throw new Error(`Erro ao criar momento: ${JSON.stringify(error, null, 2)}`);
  }

  const { moment } = await createResponse.json();
  console.log('   ✅ Momento criado com sucesso!');
  console.log(`   📝 ID: ${moment.id}`);
  console.log(`   🔗 Slug: ${moment.slug}`);
  console.log(`   👤 Usuário: ${moment.userId}`);
  console.log(`   📅 Data início: ${moment.startDate || 'Não definida'}`);
  console.log(`   📊 Status: ${moment.status}\n`);

  // 3. Listar momentos do usuário
  console.log('3️⃣ Listando momentos do usuário...');
  const listResponse = await fetch(`${API_URL}/api/moments/my`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!listResponse.ok) {
    throw new Error('Erro ao listar momentos');
  }

  const { moments } = await listResponse.json();
  console.log(`   ✅ Total de momentos: ${moments.length}`);
  moments.forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.title || 'Sem título'} (${m.slug})`);
  });

  console.log('\n✅ Todos os testes passaram!');
}

testCreateMoment();

