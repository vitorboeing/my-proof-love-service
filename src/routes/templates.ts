import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

const templates = [
  {
    id: 'mothers-day',
    name: 'Dia das Mães',
    description: 'Para agradecer a mulher mais especial da sua vida',
    category: 'holiday',
    settings: {
      colors: {
        primary: '#E91E63',
        secondary: '#F8BBD0',
      },
      fonts: {
        heading: 'Playfair Display',
        body: 'Inter',
      },
    },
    defaultBlocks: [
      { type: 'counter', order: 0 },
      { type: 'letter', order: 1 },
      { type: 'gallery', order: 2 },
      { type: 'surprise', order: 3 },
    ],
  },
  {
    id: 'valentines',
    name: 'Dia dos Namorados',
    description: 'O presente perfeito para o 14 de fevereiro',
    category: 'romantic',
    settings: {
      colors: {
        primary: '#C2185B',
        secondary: '#F48FB1',
      },
    },
    defaultBlocks: [
      { type: 'counter', order: 0 },
      { type: 'timeline', order: 1 },
      { type: 'gallery', order: 2 },
      { type: 'letter', order: 3 },
      { type: 'surprise', order: 4 },
    ],
  },
  {
    id: 'anniversary',
    name: 'Aniversário de Namoro',
    description: 'Celebre cada dia ao lado de quem você ama',
    category: 'romantic',
    settings: {
      colors: {
        primary: '#AD1457',
        secondary: '#F8BBD0',
      },
    },
    defaultBlocks: [
      { type: 'counter', order: 0 },
      { type: 'timeline', order: 1 },
      { type: 'gallery', order: 2 },
      { type: 'letter', order: 3 },
      { type: 'playlist', order: 4 },
      { type: 'surprise', order: 5 },
    ],
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Crie do zero com total liberdade',
    category: 'custom',
    settings: {},
    defaultBlocks: [],
  },
];

// Get all templates
router.get('/', async (req, res, next) => {
  try {
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// Get template by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = templates.find((t) => t.id === id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    next(error);
  }
});

export default router;

