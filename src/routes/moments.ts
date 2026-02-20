import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Validation schemas
const createMomentSchema = z.object({
  title: z.string().optional(),
  introText: z.string().optional(),
  introPhrase: z.string().optional(),
  recipientName: z.string().optional(),
  senderName: z.string().optional(),
  startDate: z.union([z.string().datetime(), z.string(), z.null()]).optional(),
  locale: z.string().optional().default('pt-BR'),
  themeId: z.string().optional(),
  settings: z.record(z.any()).optional(),
});

const updateMomentSchema = createMomentSchema.partial();

// Generate slug from title or use UUID
const generateSlug = (title?: string): string => {
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
};

// Create moment
router.post('/', authenticate, async (req: AuthRequest, res, next) => {
  try {
    // Parse and validate data
    const parsed = createMomentSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: parsed.error.errors 
      });
    }

    const data = parsed.data;
    const slug = generateSlug(data.title);

    // Check if slug exists
    const existing = await prisma.moment.findUnique({
      where: { slug },
    });

    let finalSlug = slug;
    if (existing) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    // Prepare moment data
    const momentData: any = {
      userId: req.userId!,
      slug: finalSlug,
      locale: data.locale || 'pt-BR',
    };

    if (data.title) momentData.title = data.title;
    if (data.introText) momentData.introText = data.introText;
    if (data.introPhrase) momentData.introPhrase = data.introPhrase;
    if (data.recipientName) momentData.recipientName = data.recipientName;
    if (data.senderName) momentData.senderName = data.senderName;
    if (data.themeId) momentData.themeId = data.themeId;
    if (data.settings) momentData.settings = data.settings;
    
    // Handle startDate - accept ISO string or Date object
    if (data.startDate) {
      try {
        momentData.startDate = new Date(data.startDate);
      } catch (e) {
        // Invalid date, skip it
      }
    }

    const moment = await prisma.moment.create({
      data: momentData,
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
        media: true,
        qrCodes: true,
      },
    });

    res.status(201).json({ moment });
  } catch (error: any) {
    console.error('Error creating moment:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    
    // Handle Prisma errors
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Slug already exists',
        message: 'A moment with this slug already exists'
      });
    }
    
    next(error);
  }
});

// Get user's moments
router.get('/my', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const moments = await prisma.moment.findMany({
      where: { userId: req.userId! },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
        media: true,
        qrCodes: true,
        _count: {
          select: {
            reactions: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ moments });
  } catch (error) {
    next(error);
  }
});

// Get moment by ID (public)
router.get('/by-id/:id', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    const moment = await prisma.moment.findUnique({
      where: { id },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
        media: {
          orderBy: { createdAt: 'asc' },
        },
        qrCodes: true,
        _count: {
          select: {
            reactions: true,
          },
        },
      },
    });

    if (!moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    // Check if user owns this moment or if it's published
    if (moment.status !== 'published' && moment.userId !== req.userId) {
      return res.status(403).json({ error: 'Moment not available' });
    }

    res.json({ moment });
  } catch (error) {
    next(error);
  }
});

// Get moment by slug (public)
router.get('/:slug', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const { slug } = req.params;

    const moment = await prisma.moment.findUnique({
      where: { slug },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
        media: {
          orderBy: { createdAt: 'asc' },
        },
        qrCodes: true,
        _count: {
          select: {
            reactions: true,
          },
        },
      },
    });

    if (!moment) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    // Check if user owns this moment or if it's published
    if (moment.status !== 'published' && moment.userId !== req.userId) {
      return res.status(403).json({ error: 'Moment not available' });
    }

    res.json({ moment });
  } catch (error) {
    next(error);
  }
});

// Update moment
router.put('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const data = updateMomentSchema.parse(req.body);

    // Check ownership
    const existing = await prisma.moment.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (existing.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Prepare update data
    const updateData: any = {};
    
    if (data.title !== undefined) updateData.title = data.title;
    if (data.introText !== undefined) updateData.introText = data.introText;
    if (data.introPhrase !== undefined) updateData.introPhrase = data.introPhrase;
    if (data.recipientName !== undefined) updateData.recipientName = data.recipientName;
    if (data.senderName !== undefined) updateData.senderName = data.senderName;
    if (data.locale !== undefined) updateData.locale = data.locale;
    if (data.themeId !== undefined) updateData.themeId = data.themeId;
    if (data.settings !== undefined) updateData.settings = data.settings;
    
    // Handle startDate - validate and convert
    if (data.startDate !== undefined) {
      if (data.startDate === null || data.startDate === '' || data.startDate === 'null') {
        updateData.startDate = null;
      } else if (typeof data.startDate === 'string') {
        // Validate date string format
        const dateStr = data.startDate.trim();
        // Check if it's a valid ISO date string
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}/) || dateStr.includes('T')) {
          try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
              updateData.startDate = date;
            }
          } catch (e) {
            // Invalid date, skip it
            console.warn('Invalid date format:', dateStr);
          }
        }
      }
    }

    const moment = await prisma.moment.update({
      where: { id },
      data: updateData,
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
        media: true,
        qrCodes: true,
      },
    });

    res.json({ moment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

// Delete moment
router.delete('/:id', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Check ownership
    const existing = await prisma.moment.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (existing.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.moment.delete({
      where: { id },
    });

    res.json({ message: 'Moment deleted' });
  } catch (error) {
    next(error);
  }
});

// Publish moment
router.post('/:id/publish', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;

    // Check ownership
    const existing = await prisma.moment.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (existing.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Check subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: req.userId!,
        status: 'active',
      },
      include: { plan: true },
    });

    if (!subscription) {
      return res.status(403).json({
        error: 'Subscription required',
        message: 'You need an active subscription to publish moments. Please subscribe to a plan.',
      });
    }

    // Check moment limits for annual plan
    if (subscription.plan.type === 'ANNUAL') {
      const publishedCount = await prisma.moment.count({
        where: {
          userId: req.userId!,
          status: 'published',
        },
      });

      if (publishedCount >= 5) {
        return res.status(403).json({
          error: 'Moment limit reached',
          message: 'You have reached the limit of 5 published moments on the Annual plan. Upgrade to Lifetime for unlimited moments.',
        });
      }
    }

    const moment = await prisma.moment.update({
      where: { id },
      data: { status: 'published' },
      include: {
        blocks: {
          orderBy: { order: 'asc' },
        },
        media: true,
        qrCodes: true,
      },
    });

    res.json({ moment });
  } catch (error) {
    next(error);
  }
});

// Add block to moment
router.post('/:id/blocks', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { id } = req.params;
    const { type, content, order } = req.body;

    // Check ownership
    const existing = await prisma.moment.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (existing.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const block = await prisma.momentBlock.create({
      data: {
        momentId: id,
        type,
        content,
        order: order ?? 0,
      },
    });

    res.status(201).json({ block });
  } catch (error) {
    next(error);
  }
});

// Update block
router.put('/blocks/:blockId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { blockId } = req.params;
    const { content, order } = req.body;

    const block = await prisma.momentBlock.findUnique({
      where: { id: blockId },
      include: { moment: true },
    });

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    if (block.moment.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.momentBlock.update({
      where: { id: blockId },
      data: {
        content,
        order,
      },
    });

    res.json({ block: updated });
  } catch (error) {
    next(error);
  }
});

// Delete block
router.delete('/blocks/:blockId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { blockId } = req.params;

    const block = await prisma.momentBlock.findUnique({
      where: { id: blockId },
      include: { moment: true },
    });

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    if (block.moment.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.momentBlock.delete({
      where: { id: blockId },
    });

    res.json({ message: 'Block deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;

