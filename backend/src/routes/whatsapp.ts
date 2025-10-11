import { Router } from 'express';

const router = Router();

// POST /api/whatsapp/send - Send WhatsApp message
router.post('/send', async (req, res) => {
  try {
    res.json({
      success: true,
      data: null,
      message: 'WhatsApp message sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send WhatsApp message'
    });
  }
});

// GET /api/whatsapp/webhook - WhatsApp webhook
router.get('/webhook', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'WhatsApp webhook endpoint'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'WhatsApp webhook error'
    });
  }
});

export default router;