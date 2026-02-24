import express from 'express';
import { PrismaClient } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/callback/google`
);

// Generate JWT token
const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Google OAuth - Get authorization URL
router.get('/google', (req, res) => {
  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'consent',
  });
  res.json({ url: authUrl });
});

// Google OAuth - Callback
router.post('/google/callback', async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body);

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Get user info from Google
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'Failed to get user info from Google' });
    }

    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Update user if they're switching to Google OAuth
      if (user.provider !== 'google') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            provider: 'google',
            name: name || user.name,
            image: picture || user.image,
            emailVerified: true,
          },
        });
      } else {
        // Update name and image if changed
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: name || user.name,
            image: picture || user.image,
            emailVerified: true,
          },
        });
      }
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          name: name || undefined,
          image: picture || undefined,
          provider: 'google',
          emailVerified: true,
        },
      });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

// Google OAuth - Verify token (for frontend token verification)
router.post('/google/verify', async (req, res, next) => {
  try {
    const { idToken } = z.object({ idToken: z.string() }).parse(req.body);

    // Verify the token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'Failed to verify token' });
    }

    const { email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Email not provided by Google' });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Update user if they're switching to Google OAuth
      if (user.provider !== 'google') {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            provider: 'google',
            name: name || user.name,
            image: picture || user.image,
            emailVerified: true,
          },
        });
      } else {
        // Update name and image if changed
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            name: name || user.name,
            image: picture || user.image,
            emailVerified: true,
          },
        });
      }
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          name: name || undefined,
          image: picture || undefined,
          provider: 'google',
          emailVerified: true,
        },
      });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
  }
});

export default router;

