import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind a load balancer: needed for correct client IPs
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());

  // Correlates every log line and error response with a single request.
  app.use((req, _res, next) => {
    req.id = req.get('x-request-id') || crypto.randomUUID();
    next();
  });

  /**
   * Capture the raw body alongside the parsed one: webhook signatures are
   * computed over the exact bytes sent, and re-serialising the parsed object
   * would change key order and whitespace, breaking verification.
   */
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  if (env.nodeEnv !== 'test') {
    morgan.token('id', (req) => req.id);
    app.use(morgan(':id :method :url :status :response-time ms'));
  }

  // Liveness/readiness. Reports the DB state so an orchestrator does not route
  // traffic to an instance whose connection has dropped.
  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      database: mongoose.connection.readyState,
      serverTime: new Date(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
