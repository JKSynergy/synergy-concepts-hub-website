import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Simple login for demo purposes
router.post('/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { username, password } = req.body;

    // Demo credentials - in production this would check against database
    if (username === 'admin' && password === 'admin123') {
      // Generate JWT token and refresh token
      const token = jwt.sign(
        { 
          id: 1, 
          email: 'admin@quickcredit.com', 
          username: 'admin',
          role: 'ADMIN' 
        },
        'demo-secret-key',
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        { 
          id: 1, 
          username: 'admin',
          type: 'refresh'
        },
        'demo-refresh-secret-key',
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          refreshToken,
          user: {
            id: '1',
            username: 'admin',
            email: 'admin@quickcredit.com',
            role: 'ADMIN',
            firstName: 'System',
            lastName: 'Administrator'
          }
        }
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, 'demo-secret-key') as any;
    
    return res.json({
      success: true,
      data: {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
        firstName: 'System',
        lastName: 'Administrator'
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
});

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;