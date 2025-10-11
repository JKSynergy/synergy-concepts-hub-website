import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/savers - Get all savers
router.get('/', async (req, res) => {
  try {
    const savers = await prisma.saver.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json({
      success: true,
      data: savers,
      message: 'Savers retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching savers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve savers'
    });
  }
});

// GET /api/savers/:id - Get saver by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const saver = await prisma.saver.findUnique({
      where: { id }
    });
    
    if (!saver) {
      return res.status(404).json({
        success: false,
        message: 'Saver not found'
      });
    }
    
    return res.json({
      success: true,
      data: saver,
      message: 'Saver retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching saver:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve saver'
    });
  }
});

// POST /api/savers - Create new saver
router.post('/', async (req, res) => {
  try {
    const { accountId, customerName, phone, email, nationalId, dateOfBirth, address, occupation } = req.body;
    
    const saver = await prisma.saver.create({
      data: {
        accountId,
        customerName,
        phone: phone || '',
        email: email || '',
        nationalId: nationalId || '',
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || '',
        occupation: occupation || '',
        openingDate: new Date()
      }
    });
    
    res.status(201).json({
      success: true,
      data: saver,
      message: 'Saver created successfully'
    });
  } catch (error) {
    console.error('Error creating saver:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create saver'
    });
  }
});

export default router;
