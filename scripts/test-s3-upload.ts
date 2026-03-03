/**
 * Teste local: envia um arquivo de teste para o S3.
 * Rode a partir da pasta backend: npx tsx scripts/test-s3-upload.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const MOMENT_ID_TEST = 'test-local-' + Date.now();

async function main() {
  const { isS3Configured, uploadToS3 } = await import('../src/lib/s3.js');
  console.log('Verificando configuração S3...');
  console.log('  S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME ? '***' : '(não definido)');
  console.log('  S3_REGION:', process.env.S3_REGION || '(default us-east-1)');
  console.log('  S3_ACCESS_KEY_ID:', process.env.S3_ACCESS_KEY_ID ? '***' : '(não definido)');
  console.log('  S3_SECRET_ACCESS_KEY:', process.env.S3_SECRET_ACCESS_KEY ? '***' : '(não definido)');

  if (!isS3Configured()) {
    console.error('\nErro: S3 não está configurado. Defina no .env:');
    console.error('  S3_BUCKET_NAME, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  console.log('\nEnviando arquivo de teste para o S3...');

  // Imagem PNG mínima (1x1 pixel transparente) em base64
  const minimalPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(minimalPngBase64, 'base64');

  const url = await uploadToS3({
    momentId: MOMENT_ID_TEST,
    buffer,
    originalName: 'teste-s3.png',
    mimeType: 'image/png',
  });

  console.log('\nSucesso! Arquivo enviado para o S3.');
  console.log('URL pública:', url);
  console.log('\nAbra a URL no navegador para confirmar que a imagem carrega (bucket com leitura pública).');
}

main().catch((err) => {
  console.error('Erro no teste S3:', err.message);
  if (err.$metadata) console.error('Detalhes AWS:', err.$metadata);
  process.exit(1);
});
