import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|mp3|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  },
});

// Upload single file
router.post('/:momentId', authenticate, upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    const { momentId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check moment ownership
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
    });

    if (!moment) {
      // Clean up uploaded file
      await fs.unlink(file.path).catch(console.error);
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (moment.userId !== req.userId) {
      // Clean up uploaded file
      await fs.unlink(file.path).catch(console.error);
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Determine file type
    const ext = path.extname(file.originalname).toLowerCase();
    let type = 'image';
    if (['.mp4', '.mov', '.avi'].includes(ext)) type = 'video';
    if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';

    // Get file URL (in production, this would be S3/R2 URL)
    const fileUrl = `/uploads/${file.filename}`;
    const caption = req.body?.caption || null;

    // Save to database
    const media = await prisma.media.create({
      data: {
        momentId,
        url: fileUrl,
        type,
        size: file.size,
        caption: caption || undefined,
      },
    });

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
});

// Delete media
router.delete('/:mediaId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const { mediaId } = req.params;

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { moment: true },
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media.moment.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete file from filesystem
    const filePath = path.join(uploadsDir, path.basename(media.url));
    await fs.unlink(filePath).catch(console.error);

    // Delete from database
    await prisma.media.delete({
      where: { id: mediaId },
    });

    res.json({ message: 'Media deleted' });
  } catch (error) {
    next(error);
  }
});

// Note: Static files are served by main server.ts

export default router;

