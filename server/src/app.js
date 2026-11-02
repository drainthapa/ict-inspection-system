import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Behind Nginx / a load balancer in production, so req.ip is the client's
  if (env.isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'], // blob: for photo previews before upload
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));
  app.use(cors({
    origin(origin, cb) {
      // Same-origin and non-browser requests have no Origin header
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!env.isProduction) app.use(morgan('dev'));

  app.use('/api', apiLimiter, routes);

  // Uploaded photos: signed-in users only. Filenames are random UUIDs.
  app.use('/uploads', authenticate, express.static(path.resolve(env.uploads.dir), {
    index: false, dotfiles: 'deny', maxAge: '7d',
    setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, max-age=604800'); },
  }));

  // Optionally serve the built website from the same server (single-app hosting, e.g. cPanel)
  const clientDist = env.clientDist && path.resolve(env.clientDist);
  if (clientDist && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    // Client-side routes (/inspections/5, /reports, ...) all load index.html
    app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else if (clientDist) {
    console.warn(`CLIENT_DIST is set but ${clientDist}/index.html was not found; run "npm run build" in client/`);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
