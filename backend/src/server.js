import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { startHoldSweeper } from './services/seatService.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { runSeed } from './seed/seed.js';

async function main() {
  await connectDatabase();

  // The in-memory database starts empty on every boot, so seed it automatically
  // to keep `npm run dev` a genuinely one-command start.
  if (!env.mongoUri) {
    await runSeed({ quiet: true });
    logger.info('In-memory database seeded');
  }

  const stopSweeper = startHoldSweeper({ intervalSeconds: env.holdSweepIntervalSeconds });

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    logger.info(`Health: http://localhost:${env.port}/health`);
  });

  /**
   * Graceful shutdown: stop accepting connections, let in-flight requests
   * finish, then close the database. Killing the process mid-registration
   * could otherwise strand a seat hold with no open payment order.
   */
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down...`);
    stopSweeper();
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
}

main().catch((err) => {
  logger.error('Failed to start:', err);
  process.exit(1);
});
