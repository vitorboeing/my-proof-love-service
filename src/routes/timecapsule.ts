import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();

const createTimeCapsuleSchema = z.object({
  momentId: z.string().uuid(),
  unlockDate: z.string().datetime(),
  message: z.string(),
  title: z.string().optional(),
});

// Create time capsule
router.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { momentId, unlockDate, message, title } = createTimeCapsuleSchema.parse(req.body);

    // Check moment ownership
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
    });

    if (!moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (moment.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Create time capsule as a special block
    const block = await prisma.momentBlock.create({
      data: {
        momentId,
        type: 'timecapsule',
        content: {
          unlockDate,
          message,
          title,
        },
        order: 999, // Place at end
      },
    });

    res.status(201).json({ block });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

// Get unlocked time capsules for a moment (public)
router.get('/:momentId', async (req, res, next) => {
  try {
    const { momentId } = req.params;

    const now = new Date();

    const timeCapsules = await prisma.momentBlock.findMany({
      where: {
        momentId,
        type: 'timecapsule',
      },
    });

    const unlocked = timeCapsules.filter((block) => {
      const content = block.content;
      if (content === null || typeof content !== 'object' || Array.isArray(content)) return false;
      const unlockDateStr = (content as { unlockDate?: string }).unlockDate;
      if (unlockDateStr == null) return false;
      const unlockDate = new Date(unlockDateStr);
      return unlockDate <= now;
    });

    res.json({ timeCapsules: unlocked });
  } catch (error) {
    next(error);
  }
});

export default router;

