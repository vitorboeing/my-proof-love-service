import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

const router = express.Router();
const prisma = new PrismaClient();

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

    const payment = await paymentClient.create({
      body: {
        transaction_amount: plan.price,
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
    });

    const poi = payment.point_of_interaction?.transaction_data;
    const qrCode = poi?.qr_code;
    const qrCodeBase64 = poi?.qr_code_base64;

    if (!qrCode && !qrCodeBase64) {
      console.error('MP Pix response:', JSON.stringify(payment, null, 2));
      return res.status(500).json({
        error: 'Mercado Pago não retornou o QR Code. Tente novamente.',
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

// Webhook Mercado Pago (IPN - Instant Payment Notification)
// MP envia: JSON { type, data: { id } } ou form-urlencoded topic, id
router.post('/webhook/mercadopago', express.json(), async (req, res) => {
    try {
      const body = req.body || {};
      const type = body.type || body.topic;
      const paymentId = body.data?.id ?? body.id ?? req.query?.id;

      if (!paymentId) {
        return res.status(400).json({ received: false, error: 'Missing payment id' });
      }

      const id = String(paymentId);

      if (type === 'payment' || type === 'payment.created' || !type) {
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

          // Publicar momento se veio no ref (userId:planId:momentId)
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
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook Mercado Pago error:', err);
    res.status(500).json({ received: false });
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
