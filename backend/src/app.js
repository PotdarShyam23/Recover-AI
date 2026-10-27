import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/apiRoutes.js';
import { seedInitialData } from './db/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.options('*', cors());

// Parse JSON bodies with rawBody preserved for Razorpay HMAC verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Parse URL-encoded bodies for incoming Twilio Voice webhooks & speech gathers
app.use(express.urlencoded({ extended: true }));

// Initialize baseline demo seed data (merchant & customers)
seedInitialData().catch(err => console.warn('Seed initialization error:', err.message));

// Mount standard API routes
app.use('/api', apiRoutes);

// Backward-compatibility aliases for legacy webhook and demo triggers
app.post('/webhooks/razorpay', (req, res, next) => {
  req.url = '/webhooks/razorpay';
  apiRoutes(req, res, next);
});

app.post('/demo/payment-failed', (req, res, next) => {
  req.url = '/simulator/trigger-webhook';
  apiRoutes(req, res, next);
});

// Serve frontend static assets from Vite build
app.use(express.static(frontendDistPath));

// For all non-API GET routes, serve frontend index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhooks') || req.path.startsWith('/twilio')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

export default app;
