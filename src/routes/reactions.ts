import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

// Get IP hash for privacy
const hashIP = (ip: string): string => {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
};

// Add reaction
router.post('/:momentId', async (req, res, next) => {
  try {
    const { momentId } = req.params;
    const { type = 'heart', message } = req.body;

    // Get IP address
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ipHash = hashIP(ip);

    // Check if moment exists and is published
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
    });

    if (!moment || moment.status !== 'published') {
      return res.status(404).json({ error: 'Moment not found' });
    }

    const reaction = await prisma.reaction.create({
      data: {
        momentId,
        type,
        message,
        ipHash,
      },
    });

    res.status(201).json({ reaction });
  } catch (error) {
    next(error);
  }
});

// Get reactions for a moment (public)
router.get('/:momentId', async (req, res, next) => {
  try {
    const { momentId } = req.params;

    const reactions = await prisma.reaction.findMany({
      where: { momentId },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to 50 most recent
    });

    // Don't expose IP hash to public
    const publicReactions = reactions.map((r) => ({
      id: r.id,
      type: r.type,
      message: r.message,
      createdAt: r.createdAt,
    }));

    res.json({ reactions: publicReactions, count: reactions.length });
  } catch (error) {
    next(error);
  }
});

export default router;

