import express from 'express';
import QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const qrDir = path.join(__dirname, '../../uploads/qr');
fs.mkdir(qrDir, { recursive: true }).catch(console.error);

// Generate QR Code for moment
router.post('/:momentId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { momentId } = req.params;
    const { 
      style = 'minimalist',
      darkColor,
      lightColor,
      size = 300,
      margin = 1,
      errorCorrectionLevel = 'H'
    } = req.body;

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

    // Generate URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const momentUrl = `${frontendUrl}/m/${moment.slug}`;

    // QR Code options
    const qrOptions: any = {
      errorCorrectionLevel: errorCorrectionLevel || 'H',
      type: 'png',
      quality: 0.92,
      margin: margin || 1,
      width: size || 300,
      color: {
        dark: darkColor || '#000000',
        light: lightColor || '#FFFFFF',
      },
    };

    // Style-specific presets (if custom colors not provided)
    if (!darkColor && !lightColor) {
      switch (style) {
        case 'floral':
          qrOptions.color.dark = '#8B4513';
          qrOptions.color.light = '#FFF8DC';
          qrOptions.margin = 2;
          break;
        case 'neon':
          qrOptions.color.dark = '#00FFFF';
          qrOptions.color.light = '#000000';
          break;
        case 'romantic':
          qrOptions.color.dark = '#FF69B4';
          qrOptions.color.light = '#FFF0F5';
          break;
        case 'elegant':
          qrOptions.color.dark = '#2C3E50';
          qrOptions.color.light = '#ECF0F1';
          break;
        case 'golden':
          qrOptions.color.dark = '#D4AF37';
          qrOptions.color.light = '#FFF8DC';
          break;
        case 'minimalist':
        default:
          qrOptions.color.dark = '#000000';
          qrOptions.color.light = '#FFFFFF';
          break;
      }
    }

    // Generate QR Code
    const qrDataUrl = await QRCode.toDataURL(momentUrl, qrOptions);

    // Convert data URL to buffer
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Save file
    const filename = `qr-${momentId}-${style}-${Date.now()}.png`;
    const filepath = path.join(qrDir, filename);
    await fs.writeFile(filepath, buffer);

    // Save to database
    const qrCode = await prisma.qRCode.create({
      data: {
        momentId,
        style,
        imageUrl: `/uploads/qr/${filename}`,
      },
    });

    res.status(201).json({
      qrCode,
      dataUrl: qrDataUrl, // Return data URL for immediate use
      url: momentUrl,
    });
  } catch (error) {
    next(error);
  }
});

// Get QR Codes for moment
router.get('/:momentId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { momentId } = req.params;

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

    const qrCodes = await prisma.qRCode.findMany({
      where: { momentId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ qrCodes });
  } catch (error) {
    next(error);
  }
});

export default router;

