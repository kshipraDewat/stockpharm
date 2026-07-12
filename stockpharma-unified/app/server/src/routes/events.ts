import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { pollEvents, applyEvent, processPendingEvents, listEventHistory } from '../services/eventService.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? '50', 10);
    const events = await pollEvents(req.user.tenantId, limit);
    res.json({ data: events });
  } catch (e) { next(e); }
});

router.get('/history', async (req, res, next) => {
  try {
    const parsedLimit = parseInt((req.query.limit as string) ?? '20', 10);
    const limit = Math.min(200, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 20));
    const events = await listEventHistory(req.user.tenantId, limit);
    res.json({ data: events, limit });
  } catch (e) { next(e); }
});

router.post('/process', async (req, res, next) => {
  try {
    const results = await processPendingEvents(req.user.tenantId);
    res.json({ results });
  } catch (e) { next(e); }
});

// Ack is internal-only via processPendingEvents / applyEvent — no public ack route (BE-M1).

router.post('/:id/apply', async (req, res, next) => {
  try {
    const events = await pollEvents(req.user.tenantId, 100);
    const event = events.find(e => e.id === req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found or already delivered' }); return; }
    const result = await applyEvent(req.user.tenantId, event);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
