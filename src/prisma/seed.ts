import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create plans
  const annualPlan = await prisma.plan.upsert({
    where: { type: 'ANNUAL' },
    update: {},
    create: {
      type: 'ANNUAL',
      name: 'Plano Anual',
      price: 49.0,
      currency: 'BRL',
      description: 'Perfeito para surpreender ao longo do ano',
      features: [
        'Até 5 momentos ativos',
        'Todos os templates',
        'Galeria com até 50 fotos',
        'QR Code personalizado',
        'Contador de amor',
        'Timeline de momentos',
        'Suporte por email',
      ],
    },
  });

  const lifetimePlan = await prisma.plan.upsert({
    where: { type: 'LIFETIME' },
    update: {},
    create: {
      type: 'LIFETIME',
      name: 'Plano Vitalício',
      price: 99.0,
      currency: 'BRL',
      description: 'Uma vez, para sempre. O melhor custo-benefício.',
      features: [
        'Momentos ilimitados',
        'Todos os templates + exclusivos',
        'Galeria ilimitada',
        'QR Code em várias artes',
        'Cápsula do tempo',
        'Proteção por PIN',
        'Suporte prioritário',
        'Novos recursos inclusos',
      ],
    },
  });

  console.log('✅ Plans created:', { annualPlan, lifetimePlan });
  console.log('✨ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

