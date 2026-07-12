import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  getDashboardKpis, getSalesReport, getOutstandingReport,
  getGstReport, getStockAgingReport, getRequiredStockReport, getComplianceReport,
  getProfitReport,
  getPortalOrdersReport,
  getPurchaseAnalysisReport,
} from '../services/reportService.js';
import {
  getRetailSalesReport, getPayablesAgingReport, getPharmacyGstReport,
  getPharmacyProfitReport, getPharmacyComplianceReport, getPharmacyDashboardKpis,
} from '../services/pharmacyReportService.js';

const router = Router();
router.use(authenticate);

const isPharmacy = (req: { user: { tenantType?: string } }) =>
  (req.user.tenantType ?? 'stockist') === 'pharmacy';

router.get('/dashboard', async (req, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (isPharmacy(req)) {
      res.json(await getPharmacyDashboardKpis(req.user.tenantId));
    } else {
      res.json(await getDashboardKpis(req.user.tenantId, from, to));
    }
  } catch (e) { next(e); }
});

// me48: sales report contains per-pharmacy revenue + top defaulters; gate to
// admin + biller/pharmacist roles. Cashier should not see tenant-wide P&L.
router.get('/sales', requireRole('admin', 'biller', 'pharmacist'), async (req, res, next) => {
  try {
    const { from, to, page, pageSize } = req.query as { from: string; to: string; page?: string; pageSize?: string };
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    const rangeFrom = from ?? monthStart;
    const rangeTo = to ?? today;
    // me45: clamp page + pageSize to safe bounds
    const pg = Math.max(1, page ? parseInt(page, 10) : 1);
    const requested = pageSize ? parseInt(pageSize, 10) : 50;
    const ps = Math.min(100, Math.max(1, Number.isFinite(requested) ? requested : 50));
    if (isPharmacy(req)) {
      res.json(await getRetailSalesReport(req.user.tenantId, rangeFrom, rangeTo, pg, ps));
    } else {
      res.json(await getSalesReport(req.user.tenantId, rangeFrom, rangeTo, pg, ps));
    }
  } catch (e) { next(e); }
});

router.get('/outstanding', requireRole('admin'), async (req, res, next) => {
  try {
    const { asOfDate } = req.query as { asOfDate?: string };
    if (isPharmacy(req)) {
      res.json(await getPayablesAgingReport(req.user.tenantId, asOfDate));
    } else {
      res.json(await getOutstandingReport(req.user.tenantId, asOfDate));
    }
  } catch (e) { next(e); }
});

router.get('/gst', requireRole('admin'), async (req, res, next) => {
  try {
    const { month } = req.query as { month: string };
    const currentMonth = new Date().toISOString().slice(0, 7);
    const m = month ?? currentMonth;
    if (isPharmacy(req)) {
      res.json(await getPharmacyGstReport(req.user.tenantId, m));
    } else {
      res.json(await getGstReport(req.user.tenantId, m));
    }
  } catch (e) { next(e); }
});

// me48: stock-aging exposes per-batch cost; restrict to non-cashier roles.
router.get('/stock-aging', requireRole('admin', 'biller', 'pharmacist'), async (req, res, next) => {
  try {
    const { asOfDate } = req.query as { asOfDate?: string };
    res.json(await getStockAgingReport(req.user.tenantId, asOfDate));
  } catch (e) { next(e); }
});

router.get('/required-stock', requireRole('admin', 'biller', 'pharmacist'), async (req, res, next) => {
  try { res.json(await getRequiredStockReport(req.user.tenantId)); } catch (e) { next(e); }
});

router.get('/compliance', requireRole('admin'), async (req, res, next) => {
  try {
    const { type = 'H1', month } = req.query as Record<string, string>;
    if (isPharmacy(req)) {
      res.json(await getPharmacyComplianceReport(req.user.tenantId, type, month));
    } else {
      res.json(await getComplianceReport(req.user.tenantId, type, month));
    }
  } catch (e) { next(e); }
});

router.get('/profit', requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = req.query as { from: string; to: string };
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    const rangeFrom = from ?? monthStart;
    const rangeTo = to ?? today;
    if (isPharmacy(req)) {
      res.json(await getPharmacyProfitReport(req.user.tenantId, rangeFrom, rangeTo));
    } else {
      res.json(await getProfitReport(req.user.tenantId, rangeFrom, rangeTo));
    }
  } catch (e) { next(e); }
});

router.get('/portal-orders', requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    res.json(await getPortalOrdersReport(req.user.tenantId, from, to));
  } catch (e) { next(e); }
});

router.get('/purchase-analysis', requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    res.json(await getPurchaseAnalysisReport(req.user.tenantId, from, to));
  } catch (e) { next(e); }
});

export default router;
