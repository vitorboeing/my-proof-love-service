import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from './auth.js';

const prisma = new PrismaClient();

export interface SubscriptionInfo {
  hasActiveSubscription: boolean;
  planType?: 'ANNUAL' | 'LIFETIME';
  canCreateMoments: boolean;
  maxMoments?: number;
  canPublish: boolean;
  canUsePremiumFeatures: boolean;
  /** Data de renovação/expiração (só plano anual) */
  renewalDate?: Date;
}

export const checkSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user's active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: req.userId,
        status: 'active',
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Plano anual: considerar inativo se já passou da data de renovação
    const now = new Date();
    const isAnnualExpired =
      subscription?.plan.type === 'ANNUAL' &&
      subscription.renewalDate &&
      now > subscription.renewalDate;

    const effectiveSubscription = isAnnualExpired ? null : subscription;

    const subscriptionInfo: SubscriptionInfo = {
      hasActiveSubscription: !!effectiveSubscription,
      planType: effectiveSubscription?.plan.type as 'ANNUAL' | 'LIFETIME' | undefined,
      canCreateMoments: true, // Free users can create drafts
      canPublish: !!effectiveSubscription,
      canUsePremiumFeatures: !!effectiveSubscription && effectiveSubscription.plan.type === 'LIFETIME',
      renewalDate: effectiveSubscription?.renewalDate ?? undefined,
    };

    // Check moment limits for annual plan
    if (effectiveSubscription?.plan.type === 'ANNUAL') {
      const momentCount = await prisma.moment.count({
        where: {
          userId: req.userId,
          status: 'published',
        },
      });
      subscriptionInfo.maxMoments = 5;
      subscriptionInfo.canPublish = momentCount < 5;
    } else if (effectiveSubscription?.plan.type === 'LIFETIME') {
      subscriptionInfo.maxMoments = undefined; // Unlimited
    }

    req.subscription = subscriptionInfo;
    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    next(error);
  }
};

export const requireSubscription = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.subscription?.hasActiveSubscription) {
    return res.status(403).json({
      error: 'Subscription required',
      message: 'You need an active subscription to perform this action',
    });
  }
  next();
};

// Extend AuthRequest interface
declare module './auth.js' {
  interface AuthRequest {
    subscription?: SubscriptionInfo;
  }
}

