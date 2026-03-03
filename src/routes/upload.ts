import express from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { isS3Configured, uploadToS3, deleteFromS3ByUrl } from '../lib/s3.js';

const router = express.Router();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '../../uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);

const useS3 = isS3Configured();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: useS3 ? memoryStorage : diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
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
    const file = req.file as Express.Multer.File & { path?: string };

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
    });

    if (!moment) {
      if (!useS3 && file.path) await fs.unlink(file.path).catch(console.error);
      return res.status(404).json({ error: 'Moment not found' });
    }

    if (moment.userId !== req.userId) {
      if (!useS3 && file.path) await fs.unlink(file.path).catch(console.error);
      return res.status(403).json({ error: 'Not authorized' });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    let type = 'image';
    if (['.mp4', '.mov', '.avi'].includes(ext)) type = 'video';
    if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';

    const caption = (req.body?.caption as string) || undefined;
    let fileUrl: string;

    if (useS3 && file.buffer) {
      fileUrl = await uploadToS3({
        momentId,
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
    } else {
      if (!file.path) {
        return res.status(500).json({ error: 'Upload storage error' });
      }
      fileUrl = `/uploads/${file.filename}`;
    }

    const media = await prisma.media.create({
      data: {
        momentId,
        url: fileUrl,
        type,
        size: file.size,
        caption,
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

    if (media.url.startsWith('http')) {
      await deleteFromS3ByUrl(media.url);
    } else {
      const filePath = path.join(uploadsDir, path.basename(media.url));
      await fs.unlink(filePath).catch(console.error);
    }

    await prisma.media.delete({
      where: { id: mediaId },
    });

    res.json({ message: 'Media deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
