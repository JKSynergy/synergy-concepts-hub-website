import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

class DatabaseConfig {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });

    // Log database events - commented out due to TypeScript issues
    // this.prisma.$on('query', (e) => {
    //   logger.debug('Query: ' + e.query);
    //   logger.debug('Params: ' + e.params);
    //   logger.debug('Duration: ' + e.duration + 'ms');
    // });

    // this.prisma.$on('error', (e) => {
    //   logger.error('Database error:', e);
    // });

    // this.prisma.$on('info', (e) => {
    //   logger.info('Database info:', e.message);
    // });

    // this.prisma.$on('warn', (e) => {
    //   logger.warn('Database warning:', e.message);
    // });
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('✅ Database disconnected successfully');
    } catch (error) {
      logger.error('❌ Database disconnection failed:', error);
      throw error;
    }
  }

  getClient(): PrismaClient {
    return this.prisma;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

export const dbConfig = new DatabaseConfig();
export const prisma = dbConfig.getClient();