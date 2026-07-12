import { Request, Response, NextFunction } from 'express';

type Role = 'admin' | 'biller' | 'pharmacist' | 'cashier';
type TenantType = 'stockist' | 'pharmacy';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** Role gating scoped to tenant type — prevents cross-panel role confusion. */
export function requireRoleForTenant(allowed: Partial<Record<TenantType, Role[]>>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const tenantType = (req.user.tenantType ?? 'stockist') as TenantType;
    const roles = allowed[tenantType];
    if (!roles?.length) {
      res.status(403).json({ error: 'Action not allowed for this tenant type' });
      return;
    }
    if (!roles.includes(req.user.role as Role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** Shared routes: stockist admin/biller; pharmacy admin/pharmacist/cashier where applicable. */
export const sharedProductWrite = requireRoleForTenant({
  stockist: ['admin'],
  pharmacy: ['admin', 'pharmacist'],
});

export const sharedProductAdjust = requireRoleForTenant({
  stockist: ['admin'],
  pharmacy: ['admin', 'pharmacist'],
});
