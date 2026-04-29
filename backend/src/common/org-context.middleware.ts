import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { orgContext } from './org-context';

@Injectable()
export class OrgContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const user: any = (req as any).user;
    const organizationId: string | undefined = user?.organizationId;
    if (!organizationId) {
      return next();
    }
    orgContext.run({ organizationId: String(organizationId) }, () => next());
  }
}
