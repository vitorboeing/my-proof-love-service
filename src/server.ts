import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import momentRoutes from './routes/moments.js';
import uploadRoutes from './routes/upload.js';
import qrRoutes from './routes/qr.js';
import paymentRoutes from './routes/payments.js';
import reactionRoutes from './routes/reactions.js';
import timeCapsuleRoutes from './routes/timecapsule.js';
import templateRoutes from './routes/templates.js';
import { scheduleExpireAnnualSubscriptions } from './jobs/expireAnnualSubscriptions.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Middleware – CORS: aceita FRONTEND_URL do .env (e variantes www/não-www) e localhost para desenvolvimento
function buildAllowedOrigins(): string[] {
  const list: string[] = [
    'http://localhost:8080',
    'http://localhost:5173',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:5173',
  ];
  const front = process.env.FRONTEND_URL?.trim();
  if (front) {
    list.push(front);
    try {
      const u = new URL(front);
      if (u.hostname.startsWith('www.')) {
        list.push(`${u.protocol}//${u.hostname.slice(4)}${u.port ? ':' + u.port : ''}`);
      } else {
        list.push(`${u.protocol}//www.${u.hostname}${u.port ? ':' + u.port : ''}`);
      }
    } catch (_) {}
  }
  const extra = process.env.FRONTEND_URL_EXTRA;
  if (extra) {
    extra.split(',').forEach((s) => {
      const o = s.trim();
      if (o) list.push(o);
    });
  }
  return list;
}
const allowedOrigins = buildAllowedOrigins();

/** Verifica se a origem é do mesmo site que FRONTEND_URL (mesmo host com/sem www) */
function isSameSiteOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const front = process.env.FRONTEND_URL?.trim();
  if (!front) return false;
  try {
    const a = new URL(front);
    const b = new URL(origin);
    const norm = (h: string) => h.replace(/^www\./, '').toLowerCase() || h;
    return norm(a.hostname) === norm(b.hostname) && a.protocol === b.protocol;
  } catch (_) {
    return false;
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin) || isSameSiteOrigin(origin)) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/moments', momentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/timecapsule', timeCapsuleRoutes);
app.use('/api/templates', templateRoutes);

// Serve static files (uploads)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  scheduleExpireAnnualSubscriptions();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;

