import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from monorepo root (server/src → ../..)
const envPath = resolve(__dirname, '../..', '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET required, must be at least 32 characters');
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  JWT_SECRET: jwtSecret,
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '24h',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '7d',
  DATABASE_URL: process.env.DATABASE_URL ?? 'pglite:memory',
  FEATURE_AI_PARSE: process.env.FEATURE_AI_PARSE === 'true',
  FEATURE_WHATSAPP: process.env.FEATURE_WHATSAPP === 'true',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN ?? '',
  WHATSAPP_PHONE_ID: process.env.WHATSAPP_PHONE_ID ?? '',
  // Password-reset email (SMTP or Resend); when unset, forgot-password still creates a token
  // and returns emailConfigured: false (dev mode also returns devToken in the API response).
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT ?? '587', 10),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  emailConfigured: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY),
  PLATFORM_ADMIN_EMAIL: process.env.PLATFORM_ADMIN_EMAIL ?? '',
  PLATFORM_ADMIN_PASSWORD: process.env.PLATFORM_ADMIN_PASSWORD ?? '',
  PLATFORM_ADMIN_NAME: process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin',
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? 'http://localhost:3000',
  SEED_DEMO_USERS: process.env.SEED_DEMO_USERS !== 'false',
} as const;
