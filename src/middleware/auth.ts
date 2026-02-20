import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  subscription?: {
    hasActiveSubscription: boolean;
    planType?: 'ANNUAL' | 'LIFETIME';
    canCreateMoments: boolean;
    maxMoments?: number;
    canPublish: boolean;
    canUsePremiumFeatures: boolean;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    req.userId = decoded.userId;
    req.user = {
      id: decoded.userId,
      email: '', // será preenchido se necessário
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      req.userId = decoded.userId;
    }

    next();
  } catch (error) {
    // Continua sem autenticação
    next();
  }
};

