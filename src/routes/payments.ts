import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { isS3Configured, uploadToS3 } from '../lib/s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const prisma = new PrismaClient();

// Pendentes: momento em memória até confirmação do pagamento (Pix/Cartão)
interface PendingMomentDto {
  title?: string;
  recipientName?: string;
  senderName?: string;
  introPhrase?: string;
  startDate?: string | null;
  blocks: { type: string; content: Record<string, unknown>; order: number }[];
  images?: { caption?: string; base64: string }[];
}
const pendingMoments = new Map<string, { userId: string; momentDto: PendingMomentDto }>();

// SSE: clientes aguardando confirmação por momentId (legado) ou pendingId
const sseClients = new Map<string, Set<express.Response>>();
const ssePendingClients = new Map<string, Set<express.Response>>();

function notifyPaymentApproved(momentId: string, slug: string) {
  const clients = sseClients.get(momentId);
  if (!clients) return;
  const data = JSON.stringify({ slug });
  clients.forEach((res) => {
    try {
      res.write(`event: payment_approved\ndata: ${data}\n\n`);
      res.end();
    } catch (_) { /* ignore */ }
  });
  sseClients.delete(momentId);
}

function notifyPaymentApprovedByPendingId(pendingId: string, slug: string) {
  const clients = ssePendingClients.get(pendingId);
  if (!clients) return;
  const data = JSON.stringify({ slug });
  clients.forEach((res) => {
    try {
      res.write(`event: payment_approved\ndata: ${data}\n\n`);
      res.end();
    } catch (_) { /* ignore */ }
  });
  ssePendingClients.delete(pendingId);
}

function generateSlug(title?: string): string {
  if (title) {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, 50);
  }
  return `moment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

const uploadsDir = path.join(__dirname, '../../uploads');

/** Cria o momento no banco a partir do payload guardado em memória (após pagamento aprovado) */
async function createMomentFromPayload(userId: string, dto: PendingMomentDto): Promise<{ id: string; slug: string }> {
  const slug = generateSlug(dto.title);
  const existing = await prisma.moment.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const moment = await prisma.moment.create({
    data: {
      userId,
      slug: finalSlug,
      status: 'published',
      locale: 'pt-BR',
      title: dto.title,
      recipientName: dto.recipientName,
      senderName: dto.senderName,
      introPhrase: dto.introPhrase,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
    },
  });

  for (const block of dto.blocks) {
    await prisma.momentBlock.create({
      data: {
        momentId: moment.id,
        type: block.type,
        content: block.content as object,
        order: block.order,
      },
    });
  }

  if (dto.images?.length) {
    const useS3 = isS3Configured();
    if (useS3) {
      for (const img of dto.images) {
        const base64 = img.base64.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        const url = await uploadToS3({
          momentId: moment.id,
          buffer: buf,
          originalName: `image-${Date.now()}.png`,
          mimeType: 'image/png',
        });
        await prisma.media.create({
          data: {
            momentId: moment.id,
            url,
            type: 'image',
            size: buf.length,
            caption: img.caption || undefined,
          },
        });
      }
    } else {
      await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});
      for (const img of dto.images) {
        const base64 = img.base64.replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
        const filePath = path.join(uploadsDir, filename);
        await fs.writeFile(filePath, buf);
        await prisma.media.create({
          data: {
            momentId: moment.id,
            url: `/uploads/${filename}`,
            type: 'image',
            size: buf.length,
            caption: img.caption || undefined,
          },
        });
      }
    }
  }

  return { id: moment.id, slug: moment.slug };
}

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const frontendUrl = process.env.FRONTEND_URL || 'https://jeanett-canvaslike-martine.ngrok-free.dev';
const apiBaseUrl = (process.env.API_BASE_URL || 'https://strong-donuts-hug.loca.lt').trim();

// https://fifty-steaks-grab.loca.lt

const mpConfig = accessToken ? new MercadoPagoConfig({ accessToken }) : null;
const paymentClient = mpConfig ? new Payment(mpConfig) : null;
const preferenceClient = mpConfig ? new Preference(mpConfig) : null;

// Validation schema
const createCheckoutSchema = z.object({
  planId: z.string(),
  momentId: z.string().optional(),
});

function getMercadoPagoClient() {
  if (!accessToken || !paymentClient || !preferenceClient) {
    throw new Error(
      'Mercado Pago não configurado. Adicione MERCADO_PAGO_ACCESS_TOKEN ao .env'
    );
  }
  return { paymentClient, preferenceClient };
}

function getPaymentClientOnly() {
  if (!accessToken || !paymentClient) {
    throw new Error(
      'Mercado Pago não configurado. Adicione MERCADO_PAGO_ACCESS_TOKEN ao .env'
    );
  }
  return paymentClient;
}

async function resolvePlan(planId: string) {
  let plan = await prisma.plan.findUnique({
    where: { id: planId },
  });
  if (!plan) {
    plan = await prisma.plan.findFirst({
      where: { type: planId.toUpperCase() },
    });
  }
  return plan;
}

// SSE: frontend conecta e recebe evento quando o webhook confirma o pagamento
// Health check: GET /api/payments/stream/health → 200 (para testar se a rota existe em produção)
router.get('/stream/health', (_req, res) => {
  res.status(200).json({ ok: true, message: 'SSE stream disponível' });
});

// Polling: frontend consulta se o pagamento do momento já foi aprovado (fallback quando SSE não entrega, ex. múltiplas instâncias)
router.get('/pending-status', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const momentId = req.query.momentId as string | undefined;
    if (!momentId) {
      return res.status(400).json({ error: 'momentId required' });
    }
    const moment = await prisma.moment.findFirst({
      where: { id: momentId, userId: req.userId! },
      select: { status: true, slug: true },
    });
    if (!moment) {
      return res.json({ approved: false });
    }
    res.json({
      approved: moment.status === 'published',
      slug: moment.status === 'published' ? moment.slug : undefined,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/stream', (req, res) => {
  const momentId = req.query.momentId as string | undefined;
  const pendingId = req.query.pendingId as string | undefined;
  const key = pendingId || momentId;
  if (!key) {
    return res.status(400).json({ error: 'momentId or pendingId required' });
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (pendingId) {
    if (!ssePendingClients.has(pendingId)) ssePendingClients.set(pendingId, new Set());
    ssePendingClients.get(pendingId)!.add(res);
    res.write(': connected\n\n');
    req.on('close', () => {
      const set = ssePendingClients.get(pendingId);
      if (set) {
        set.delete(res);
        if (set.size === 0) ssePendingClients.delete(pendingId);
      }
    });
  } else {
    if (!sseClients.has(momentId!)) sseClients.set(momentId!, new Set());
    sseClients.get(momentId!)!.add(res);
    res.write(': connected\n\n');
    req.on('close', () => {
      const set = sseClients.get(momentId!);
      if (set) {
        set.delete(res);
        if (set.size === 0) sseClients.delete(momentId!);
      }
    });
  }
});

// Config para frontend (chave pública do MP - usada para tokenizar cartão)
router.get('/config', (req, res) => {
  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({ error: 'Mercado Pago não configurado (falta MERCADO_PAGO_PUBLIC_KEY)' });
  }
  res.json({ publicKey });
});

// Get available plans
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' },
    });
    res.json({ plans });
  } catch (error) {
    next(error);
  }
});

// Create checkout session (Mercado Pago Checkout Pro - link de pagamento)
// Usuário é redirecionado ao MP, paga (Pix/cartão/boleto) e volta ao site
router.post(
  '/checkout/mercadopago',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const { planId, momentId } = createCheckoutSchema.parse(req.body);
      const { preferenceClient } = getMercadoPagoClient();

      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
      });
      if (!user?.email) {
        return res.status(400).json({ error: 'Email do usuário não encontrado' });
      }

      const plan = await resolvePlan(planId);
      if (!plan) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }

      const externalRef = momentId
        ? `${req.userId!}:${plan.id}:${momentId}`
        : `${req.userId!}:${plan.id}`;

      const preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: plan.id,
              title: plan.name,
              description: plan.description || `Plano ${plan.name}`,
              quantity: 1,
              unit_price: plan.price,
              currency_id: plan.currency || 'BRL',
            },
          ],
          payer: {
            email: user.email,
            name: user.name || user.email.split('@')[0],
          },
          back_urls: {
            success: `${frontendUrl}/checkout/success?ref=${encodeURIComponent(externalRef)}`,
            failure: `${frontendUrl}/criar?plan=${planId}&error=payment_failed`,
            pending: `${frontendUrl}/checkout/pending?ref=${encodeURIComponent(externalRef)}`,
          },
          payment_methods: {
            excluded_payment_types: [
              { id: 'ticket' },       // boleto
              { id: 'atm' },          // caixa eletrônico
              { id: 'prepaid_card' }, // cartão pré-pago
            ],
            installments: 12,
          },
          auto_return: 'approved' as const,
          external_reference: externalRef,
          notification_url: `${apiBaseUrl}/api/payments/webhook/mercadopago`,
          statement_descriptor: 'MEMORY BLOOM',
        },
      });

      res.json({
        initPoint: preference.init_point || preference.sandbox_init_point,
        preferenceId: preference.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error('[Checkout MP] Erro:', error);
      let msgStr = 'Erro ao criar checkout';
      if (error instanceof Error) msgStr = error.message;
      else {
        const err = error as Record<string, unknown>;
        if (err?.message) msgStr = String(err.message);
        else if (Array.isArray(err?.cause) && err.cause[0] && typeof (err.cause[0] as { description?: string }).description === 'string') {
          msgStr = (err.cause[0] as { description: string }).description;
        }
      }
      const isMPConfig = msgStr.includes('MERCADO_PAGO') || msgStr.includes('não configurado');
      return res.status(isMPConfig ? 503 : 500).json({ error: msgStr });
    }
  }
);

// Create checkout (Pix) - retorna QR code para pagamento imediato (Pix visível direto)
router.post('/checkout/pix', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { planId, momentId } = createCheckoutSchema.parse(req.body);
    const { paymentClient } = getMercadoPagoClient();

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });
    if (!user?.email) {
      return res.status(400).json({ error: 'Email do usuário não encontrado' });
    }

    const plan = await resolvePlan(planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    const externalRef = momentId
      ? `${req.userId!}:${plan.id}:${momentId}`
      : `${req.userId!}:${plan.id}`;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const transactionAmount = Number(plan.price);
    if (Number.isNaN(transactionAmount) || transactionAmount <= 0) {
      return res.status(400).json({ error: 'Valor do plano inválido' });
    }

    const idempotencyKey = `pix-${Date.now()}-${req.userId!}-${plan.id}-${momentId || 'noid'}`;

    const payment = await paymentClient.create({
      body: {
        transaction_amount: transactionAmount,
        description: plan.name,
        payment_method_id: 'pix',
        payer: {
          email: user.email,
          first_name: user.name?.split(' ')[0] || user.email.split('@')[0],
          last_name: user.name?.split(' ').slice(1).join(' ') || 'User',
        },
        external_reference: externalRef,
        date_of_expiration: expiresAt.toISOString(),
        notification_url: `${apiBaseUrl}/api/payments/webhook/mercadopago`,
      },
      requestOptions: {
        idempotencyKey,
      },
    });

    let poi = payment.point_of_interaction?.transaction_data;
    let qrCode = poi?.qr_code;
    let qrCodeBase64 = poi?.qr_code_base64;

    // Em produção o MP às vezes retorna o QR de forma assíncrona; tenta GET após 1.5s
    if (!qrCode && !qrCodeBase64 && payment.id) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const refreshed = await paymentClient.get({ id: String(payment.id) });
        poi = refreshed.point_of_interaction?.transaction_data;
        qrCode = poi?.qr_code;
        qrCodeBase64 = poi?.qr_code_base64;
      } catch (e) {
        console.warn('[Pix] GET payment after create failed:', e);
      }
    }

    if (!qrCode && !qrCodeBase64) {
      console.error('[Pix] MP não retornou QR. paymentId=%s status=%s live_mode=%s response=%s',
        payment.id, payment.status, payment.live_mode,
        JSON.stringify({
          hasPointOfInteraction: !!payment.point_of_interaction,
          transactionData: payment.point_of_interaction?.transaction_data,
        }));
      return res.status(500).json({
        error: 'Mercado Pago não retornou o QR Code. Em produção, confira: (1) Use credenciais de produção no .env (2) Ative o Pix na sua conta em developers.mercadopago.com (3) Tente novamente em alguns segundos.',
      });
    }

    res.json({
      paymentId: payment.id,
      qrCode: qrCode || '',
      qrCodeBase64: qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : null,
      copyPaste: qrCode || '',
      expiresAt: payment.date_of_expiration || expiresAt.toISOString(),
      planId: plan.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    const msg = error instanceof Error ? error.message : 'Erro ao gerar Pix';
    const isMPConfig = msg.includes('MERCADO_PAGO') || msg.includes('não configurado');
    return res.status(isMPConfig ? 503 : 500).json({ error: msg });
  }
});

// Checkout Transparente - pagamento com cartão sem redirecionamento
const transparentCardSchema = z.object({
  planId: z.string(),
  momentId: z.string().optional(),
  token: z.string(),
  paymentMethodId: z.string(),
  installments: z.number().min(1).max(12),
  issuerId: z.number().optional(),
  cardholderName: z.string(),
  identificationType: z.string().default('CPF'),
  identificationNumber: z.string(),
});

router.post('/checkout/transparent/card', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const data = transparentCardSchema.parse(req.body);
    const paymentClient = getPaymentClientOnly();

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
    });
    if (!user?.email) {
      return res.status(400).json({ error: 'Email do usuário não encontrado' });
    }

    const plan = await resolvePlan(data.planId);
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }

    const externalRef = data.momentId
      ? `${req.userId!}:${plan.id}:${data.momentId}`
      : `${req.userId!}:${plan.id}`;

    const idempotencyKey = `card-${Date.now()}-${req.userId}-${plan.id}`;

    const paymentBody: Record<string, unknown> = {
      token: data.token,
      payment_method_id: data.paymentMethodId,
      transaction_amount: plan.price,
      installments: data.installments,
      description: plan.name,
      external_reference: externalRef,
      payer: {
        email: user.email,
        identification: {
          type: data.identificationType,
          number: data.identificationNumber.replace(/\D/g, ''),
        },
        first_name: data.cardholderName.split(' ')[0] || user.name?.split(' ')[0] || 'User',
        last_name: data.cardholderName.split(' ').slice(1).join(' ') || user.name?.split(' ').slice(1).join(' ') || 'User',
      },
      binary_mode: true,
      notification_url: `${apiBaseUrl}/api/payments/webhook/mercadopago`,
    };

    if (data.issuerId) {
      paymentBody.issuer_id = data.issuerId;
    }

    const payment = await paymentClient.create({
      body: paymentBody as never,
      requestOptions: {
        idempotencyKey,
      },
    });

    if (payment.status === 'approved') {
      const extRef = payment.external_reference || '';
      const parts = extRef.split(':');
      const [userId, planId, momentId] = parts;
      if (userId && planId) {
        const planFound = await prisma.plan.findFirst({
          where: { OR: [{ type: planId }, { id: planId }] },
        });
        const renewalDate =
          planFound?.type === 'ANNUAL'
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            : null;

        const existing = await prisma.subscription.findFirst({
          where: { providerId: String(payment.id), provider: 'mercado_pago' },
        });

        if (existing) {
          await prisma.subscription.update({
            where: { id: existing.id },
            data: { status: 'active', renewalDate },
          });
        } else if (planFound) {
          await prisma.subscription.create({
            data: {
              userId,
              planId: planFound.id,
              status: 'active',
              provider: 'mercado_pago',
              providerId: String(payment.id),
              renewalDate,
            },
          });
        }

        if (momentId) {
          const moment = await prisma.moment.findFirst({
            where: { id: momentId, userId },
          });
          if (moment && moment.status === 'draft') {
            await prisma.moment.update({
              where: { id: momentId },
              data: { status: 'published' },
            });
          }
          return res.json({
            paymentId: payment.id,
            status: payment.status,
            statusDetail: payment.status_detail,
            ...(moment && { slug: moment.slug }),
          });
        }
      }
    }

    res.json({
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.status_detail,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('[Checkout Transparente] Erro:', error);
    let msgStr = 'Erro ao processar pagamento com cartão';
    if (error instanceof Error) msgStr = error.message;
    else {
      const err = error as Record<string, unknown>;
      if (err?.message) msgStr = String(err.message);
      else if (Array.isArray(err?.cause) && err.cause[0] && typeof (err.cause[0] as { description?: string }).description === 'string') {
        msgStr = (err.cause[0] as { description: string }).description;
      }
    }
    const isMPConfig = msgStr.includes('MERCADO_PAGO') || msgStr.includes('não configurado');
    return res.status(isMPConfig ? 503 : 500).json({ error: msgStr });
  }
});

// Legado: redireciona /checkout/stripe para mercadopago
router.post(
  '/checkout/stripe',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const { planId } = createCheckoutSchema.parse(req.body);
      const { preferenceClient } = getMercadoPagoClient();

      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
      });
      if (!user?.email) {
        return res.status(400).json({ error: 'Email do usuário não encontrado' });
      }

      const plan = await resolvePlan(planId);
      if (!plan) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }

      const externalRef = `${req.userId!}:${plan.id}`;

      const preference = await preferenceClient.create({
        body: {
          items: [
            {
              id: plan.id,
              title: plan.name,
              description: plan.description || `Assinatura ${plan.name}`,
              quantity: 1,
              unit_price: plan.price,
              currency_id: plan.currency || 'BRL',
            },
          ],
          payer: {
            email: user.email,
            name: user.name || user.email.split('@')[0],
          },
          back_urls: {
            success: `${frontendUrl}/checkout/success?ref=${externalRef}`,
            failure: `${frontendUrl}/checkout?plan=${planId}&error=payment_failed`,
            pending: `${frontendUrl}/checkout/pending?ref=${externalRef}`,
          },
          payment_methods: {
            excluded_payment_types: [
              { id: 'ticket' },
              { id: 'atm' },
              { id: 'prepaid_card' },
            ],
            installments: 12,
          },
          auto_return: 'approved' as const,
          external_reference: externalRef,
          notification_url: `${apiBaseUrl}/api/payments/webhook/mercadopago`,
        },
      });

      res.json({
        checkoutUrl: preference.init_point || preference.sandbox_init_point,
        initPoint: preference.init_point || preference.sandbox_init_point,
        sessionId: preference.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      next(error);
    }
  }
);

// GET na mesma URL: health check (confirma que a URL está acessível em produção).
router.get('/webhook/mercadopago', (_req, res) => {
  res.status(200).json({ ok: true, message: 'Webhook MP: use POST para notificações' });
});

// Webhook Mercado Pago (IPN - Instant Payment Notification)
// MP envia: JSON { type, data: { id }, action } - ex: action "payment.updated"
// Respondemos 200 SEMPRE e cedo para evitar timeout/503; processamos em seguida.
router.post('/webhook/mercadopago', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
  let responded = false;
  const safeSend200 = () => {
    if (responded) return;
    responded = true;
    try {
      res.status(200).json({ received: true });
    } catch (_) {}
  };

  try {
    const body = req.body || {};
    const type = body.type || body.topic;
    const action = body.action;
    const paymentId = body.data?.id ?? body.id ?? req.query?.id;

    console.log('Webhook MP received', { paymentId, type, action });

    if (!paymentId) {
      safeSend200();
      return;
    }

    safeSend200();

    const id = String(paymentId);
    const isPaymentEvent = type === 'payment' || type === 'payment.created' || !type ||
      action === 'payment.updated' || action === 'payment.created';

    if (!isPaymentEvent) return;

    (async () => {
      try {
        const { paymentClient } = getMercadoPagoClient();
        const payment = await paymentClient.get({ id });

        if (payment.status === 'approved') {
          const extRef = payment.external_reference || '';
          const parts = extRef.split(':');
          const [userId, planId, momentId] = parts;
          if (userId && planId) {
            const providerIdStr = id;
            const planFound = await prisma.plan.findFirst({
              where: { OR: [{ type: planId }, { id: planId }] },
            });
            const renewalDate =
              planFound?.type === 'ANNUAL'
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                : null;

            const existing = await prisma.subscription.findFirst({
              where: { providerId: providerIdStr, provider: 'mercado_pago' },
            });

            if (existing) {
              await prisma.subscription.update({
                where: { id: existing.id },
                data: { status: 'active', renewalDate },
              });
            } else if (planFound) {
              await prisma.subscription.create({
                data: {
                  userId,
                  planId: planFound.id,
                  status: 'active',
                  provider: 'mercado_pago',
                  providerId: providerIdStr,
                  renewalDate,
                },
              });
            }

            if (momentId) {
              const moment = await prisma.moment.findFirst({
                where: { id: momentId, userId },
              });
              if (moment && moment.status === 'draft') {
                await prisma.moment.update({
                  where: { id: momentId },
                  data: { status: 'published' },
                });
                notifyPaymentApproved(momentId, moment.slug);
                console.log('[Webhook MP] Pagamento aprovado, momento publicado e notificação SSE enviada', { momentId, slug: moment.slug });
              } else if (!moment) {
                console.warn('[Webhook MP] momentId no external_reference mas momento não encontrado', { momentId, userId });
              }
            }
          }
        }
      } catch (err: unknown) {
        const mpErr = err as { status?: number; error?: string; message?: string };
        if (mpErr?.status === 404 || mpErr?.error === 'not_found') {
          console.info('Webhook Mercado Pago: pagamento não encontrado (teste ou ID inválido), ignorando. id=', id);
          return;
        }
        console.error('Webhook Mercado Pago process error:', err);
      }
    })();
  } catch (err) {
    console.error('Webhook Mercado Pago handler error (antes de responder):', err);
    safeSend200();
  }
});

// Webhook handler (Stripe) - mantido para compatibilidade
router.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    res.json({ received: true });
  }
);

// Webhook handler (Pix) - redireciona para mercadopago
router.post('/webhook/pix', express.json(), async (req, res) => {
  res.redirect(307, '/api/payments/webhook/mercadopago');
});

// Get user subscriptions
router.get(
  '/subscriptions',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const subscriptions = await prisma.subscription.findMany({
        where: { userId: req.userId! },
        include: {
          plan: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ subscriptions });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
