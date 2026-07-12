import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { InsufficientStockError } from '../lib/inventory.js';

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.errors });
    return;
  }
  if (err instanceof InsufficientStockError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof Error && (err as any).statusCode === 409) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof Error && err.message.startsWith('DUPLICATE_REFERENCE:')) {
    res.status(409).json({ error: err.message.replace('DUPLICATE_REFERENCE:', '') });
    return;
  }
  if (err instanceof Error && err.message === 'Invalid credentials') {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  if (err instanceof Error && err.message.includes('registered on the')) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof Error) {
    console.error(err);
    res.status(500).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
}
