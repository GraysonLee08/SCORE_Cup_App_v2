import express, { type Express } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { errorHandler } from './auth/middleware.js';
import { authRoutes } from './routes/auth.js';
import { teamRoutes } from './routes/teams.js';
import { registrationRoutes } from './routes/registration.js';
import { rosterRoutes } from './routes/roster.js';
import { eventRoutes } from './routes/events.js';
import { setupRoutes } from './routes/setup.js';
import { scheduleRoutes } from './routes/schedule.js';
import { refRoutes } from './routes/ref.js';
import { publicRoutes } from './routes/publicView.js';
import { adminRoutes } from './routes/admin.js';
import { participantRoutes } from './routes/participant.js';

/**
 * Wrap async route handlers so a rejected promise reaches the error handler
 * instead of hanging the request. Express 4 does not do this itself.
 */
function wrapAsyncRoutes(router: express.Router): void {
  for (const layer of (router as unknown as { stack: any[] }).stack ?? []) {
    const route = layer.route;
    if (!route) continue;
    route.stack = route.stack.map((handlerLayer: any) => {
      const original = handlerLayer.handle;
      if (original.length >= 4) return handlerLayer;
      handlerLayer.handle = (req: any, res: any, next: any) => {
        try {
          const result = original(req, res, next);
          if (result && typeof result.then === 'function') result.catch(next);
        } catch (error) {
          next(error);
        }
      };
      return handlerLayer;
    });
  }
}

export function createApp(config: Config, db: Db): Express {
  const app = express();

  // Behind nginx, so the client IP and protocol come from forwarded headers.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  if (config.corsOrigins.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({ pool: db as never, createTableIfMissing: true }),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      name: 'scorescup.sid',
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: 12 * 60 * 60 * 1000, // a long tournament day, then sign in again
      },
    }),
  );

  app.get('/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  const mount = (path: string, router: express.Router) => {
    wrapAsyncRoutes(router);
    app.use(path, router);
  };

  // Public first: these need no session at all.
  mount('/api/public', publicRoutes(db));

  mount('/api/auth', authRoutes(db));
  mount('/api/teams', teamRoutes(db));
  mount('/api/register', registrationRoutes(db));
  mount('/api/rosters', rosterRoutes(db));
  mount('/api/events', eventRoutes(db));
  mount('/api/setup', setupRoutes(db));
  mount('/api/schedule', scheduleRoutes(db));
  mount('/api/ref', refRoutes(db));
  mount('/api/admin', adminRoutes(db));
  mount('/api/participant', participantRoutes(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.', code: 'not_found' });
  });

  app.use(errorHandler);

  return app;
}
