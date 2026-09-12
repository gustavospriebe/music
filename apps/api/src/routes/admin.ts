import type { FastifyInstance } from 'fastify';
import type { HttpContext } from './context.js';
import { registerAdminProductionRoutes } from './admin-production.js';
import { registerAdminSessionRoutes } from './admin-session.js';
import { registerAdminQueriesRoutes } from './admin-queries.js';
import { registerAdminReportingRoutes } from './admin-reporting.js';
import { registerAdminAccessRoutes } from './admin-access.js';
import { registerAdminRecoveryRoutes } from './admin-recovery.js';

export const registerAdminRoutes = (app: FastifyInstance, ctx: HttpContext) => {
  registerAdminProductionRoutes(app, ctx);
  registerAdminSessionRoutes(app, ctx);
  registerAdminQueriesRoutes(app, ctx);
  registerAdminReportingRoutes(app, ctx);
  registerAdminAccessRoutes(app, ctx);
  registerAdminRecoveryRoutes(app, ctx);
};
