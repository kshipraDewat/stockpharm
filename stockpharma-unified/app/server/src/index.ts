import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env.js';
import { getDb } from './db/client.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRouter from './routes/auth.js';
import pharmaciesRouter from './routes/pharmacies.js';
import suppliersRouter from './routes/suppliers.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import billsRouter from './routes/bills.js';
import paymentsRouter from './routes/payments.js';
import supplierPaymentsRouter from './routes/supplierPayments.js';
import purchasesRouter from './routes/purchases.js';
import returnsRouter from './routes/returns.js';
import reportsRouter from './routes/reports.js';
import auditRouter from './routes/audit.js';
import usersRouter from './routes/users.js';
import systemRouter from './routes/system.js';
import settingsRouter from './routes/settings.js';
import stockistConnectionsRouter from './routes/stockistConnections.js';
import communicationRouter from './routes/communication.js';
import purchaseOrdersRouter from './routes/purchaseOrders.js';
import grnRouter from './routes/grn.js';
import payableBillsRouter from './routes/payableBills.js';
import payablePaymentsRouter from './routes/payablePayments.js';
import retailSalesRouter from './routes/retailSales.js';
import customersRouter from './routes/customers.js';
import eventsRouter from './routes/events.js';
import stockistReturnsRouter from './routes/stockistReturns.js';
import publicRouter from './routes/public.js';
import platformRouter from './routes/platform.js';
import smartOrderRouter from './routes/smartOrder.js';
import extendedAccountsRouter from './routes/extendedAccounts.js';
import { ensurePlatformAdmin } from './services/platformService.js';
import { seedDemoUsers } from './services/devBootstrap.js';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: env.NODE_ENV === 'development' ? true : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/pharmacies', pharmaciesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/bills', billsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/supplier-payments', supplierPaymentsRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/users', usersRouter);
app.use('/api/system', systemRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/stockist-connections', stockistConnectionsRouter);
app.use('/api/communication', communicationRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/grn', grnRouter);
app.use('/api/payable-bills', payableBillsRouter);
app.use('/api/payable-payments', payablePaymentsRouter);
app.use('/api/retail-sales', retailSalesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/events', eventsRouter);
app.use('/api/stockist-returns', stockistReturnsRouter);
app.use('/api/platform', platformRouter);
app.use('/api/smart-order', smartOrderRouter);
app.use('/api/accounts', extendedAccountsRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

async function start() {
  await getDb();
  console.log('Database connected.');

  const { migrate } = await import('./db/migrateInline.js');
  await migrate();

  if (env.PLATFORM_ADMIN_EMAIL && env.PLATFORM_ADMIN_PASSWORD) {
    await ensurePlatformAdmin(env.PLATFORM_ADMIN_EMAIL, env.PLATFORM_ADMIN_PASSWORD, env.PLATFORM_ADMIN_NAME ?? 'Platform Admin');
    console.log('Platform admin ensured.');
  }

  await seedDemoUsers();

  app.listen(env.PORT, () => {
    console.log(`Unified platform running on http://localhost:${env.PORT} (API)`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
