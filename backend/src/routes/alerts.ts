import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Automatic cleanup function - deletes alerts older than 30 days
async function cleanupOldAlerts() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.alert.deleteMany({
      where: {
        timestamp: {
          lt: thirtyDaysAgo
        }
      }
    });

    if (result.count > 0) {
      console.log(`🗑️  Auto-cleanup: Deleted ${result.count} alert(s) older than 30 days`);
    }
    
    return result.count;
  } catch (error) {
    console.error('Error during alert cleanup:', error);
    return 0;
  }
}

// Get all alerts
router.get('/', async (req: Request, res: Response) => {
  try {
    // Auto-cleanup old alerts before fetching
    await cleanupOldAlerts();

    const alerts = await prisma.alert.findMany({
      orderBy: {
        timestamp: 'desc'
      }
    });

    // Transform to match frontend expectations
    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      alertId: alert.alertId,
      type: alert.type,
      title: generateAlertTitle(alert.type, alert.clientName),
      message: alert.message,
      timestamp: alert.timestamp.toISOString(),
      isRead: alert.isRead,
      priority: determinePriority(alert.type),
      reference: alert.refId
    }));

    res.json({
      success: true,
      data: formattedAlerts
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alerts',
      data: []
    });
  }
});

// Helper function to generate alert titles
function generateAlertTitle(type: string, clientName?: string | null): string {
  const name = clientName || 'Customer';
  switch (type.toLowerCase()) {
    case 'payment':
      return `New Payment from ${name}`;
    case 'application':
      return `New Loan Application from ${name}`;
    case 'overdue':
      return `Overdue Payment - ${name}`;
    case 'system':
      return 'System Notification';
    default:
      return 'Notification';
  }
}

// Helper function to determine priority
function determinePriority(type: string): 'low' | 'medium' | 'high' {
  switch (type.toLowerCase()) {
    case 'overdue':
      return 'high';
    case 'application':
      return 'medium';
    case 'payment':
      return 'medium';
    default:
      return 'low';
  }
}

// Mark a single alert as read
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const alert = await prisma.alert.update({
      where: { alertId: id },
      data: { isRead: true }
    });

    res.json({
      success: true,
      message: 'Alert marked as read',
      data: alert
    });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark alert as read'
    });
  }
});

// Mark all alerts as read
router.put('/mark-all-read', async (req: Request, res: Response) => {
  try {
    const result = await prisma.alert.updateMany({
      where: { isRead: false },
      data: { isRead: true }
    });

    res.json({
      success: true,
      message: 'All alerts marked as read',
      count: result.count
    });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all alerts as read'
    });
  }
});

// Delete a single alert
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await prisma.alert.delete({
      where: { alertId: id }
    });

    res.json({
      success: true,
      message: 'Alert deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(404).json({
      success: false,
      message: 'Alert not found or already deleted'
    });
  }
});

// Bulk delete alerts
router.delete('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids, filter } = req.body;
    
    let deleteCount = 0;

    if (ids && Array.isArray(ids)) {
      // Delete specific alerts by IDs
      const result = await prisma.alert.deleteMany({
        where: {
          alertId: {
            in: ids
          }
        }
      });
      deleteCount = result.count;
    } else if (filter) {
      // Delete based on filter criteria
      const whereClause: any = {};
      
      if (filter.isRead !== undefined) {
        whereClause.isRead = filter.isRead;
      }
      if (filter.type) {
        whereClause.type = filter.type;
      }
      if (filter.olderThan) {
        whereClause.timestamp = {
          lt: new Date(filter.olderThan)
        };
      }

      const result = await prisma.alert.deleteMany({
        where: whereClause
      });
      deleteCount = result.count;
    }

    res.json({
      success: true,
      message: 'Alerts deleted successfully',
      deletedCount: deleteCount
    });
  } catch (error) {
    console.error('Error bulk deleting alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk delete alerts'
    });
  }
});

export default router;
