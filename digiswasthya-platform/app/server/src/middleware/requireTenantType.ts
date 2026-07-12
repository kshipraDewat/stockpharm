import { Request, Response, NextFunction } from 'express';

export function requireTenantType(...types: ('stockist' | 'pharmacy')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const tenantType = req.user.tenantType;
    if (!tenantType || req.user.accountKind && req.user.accountKind !== 'tenant') {
      res.status(403).json({ error: `This endpoint is only available for ${types.join(' or ')} tenants` });
      return;
    }
    if (!types.includes(tenantType as 'stockist' | 'pharmacy')) {
      res.status(403).json({ error: `This endpoint is only available for ${types.join(' or ')} tenants` });
      return;
    }
    next();
  };
}
