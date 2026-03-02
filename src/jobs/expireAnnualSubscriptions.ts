import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Marca como expiradas as assinaturas anuais cuja data de renovação já passou.
 * Deve ser executada diariamente (ex.: ao subir o servidor e a cada 24h).
 */
export async function expireAnnualSubscriptions(): Promise<number> {
  const now = new Date();
  const expired = await prisma.subscription.findMany({
    where: {
      status: 'active',
      plan: { type: 'ANNUAL' },
      renewalDate: { lt: now },
    },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  await prisma.subscription.updateMany({
    where: { id: { in: expired.map((s) => s.id) } },
    data: { status: 'expired' },
  });

  return expired.length;
}

/**
 * Agenda a execução diária: uma vez na inicialização e depois a cada 24h.
 */
export function scheduleExpireAnnualSubscriptions(): void {
  const run = () => {
    expireAnnualSubscriptions()
      .then((count) => {
        if (count > 0) {
          console.log(`[cron] ${count} assinatura(s) anual(is) marcada(s) como expirada(s).`);
        }
      })
      .catch((err) => console.error('[cron] Erro ao expirar assinaturas anuais:', err));
  };

  run();
  setInterval(run, MS_PER_DAY);
}
