import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

// Extract database name from DATABASE_URL or use default
const dbName = process.env.DATABASE_URL?.match(/\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)?.[5] || 'memory_bloom';

// Connect to postgres database to create the new database
const adminClient = new Client({
  connectionString: connectionString.replace(/\/[^/]+$/, '/postgres'),
});

async function createDatabase() {
  try {
    await adminClient.connect();
    console.log('📦 Conectado ao PostgreSQL...');

    // Check if database exists
    const checkResult = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkResult.rows.length > 0) {
      console.log(`✅ Banco de dados '${dbName}' já existe!`);
      await adminClient.end();
      return;
    }

    // Create database
    await adminClient.query(`CREATE DATABASE ${dbName}`);
    console.log(`✅ Banco de dados '${dbName}' criado com sucesso!`);
    
    await adminClient.end();
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`✅ Banco de dados '${dbName}' já existe!`);
    } else {
      console.error('❌ Erro ao criar banco de dados:', error.message);
      console.error('\n💡 Dica: Crie o banco manualmente:');
      console.error(`   CREATE DATABASE ${dbName};`);
      process.exit(1);
    }
  }
}

createDatabase();

