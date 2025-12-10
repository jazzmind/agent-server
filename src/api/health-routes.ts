import { registerApiRoute } from '@mastra/core/server';
import { getSharedPostgresStore } from '../mastra/utils/database';

/**
 * Health check route
 * GET /api/health
 * 
 * Returns system health status including database connectivity
 */
export const healthRoutes = [
  registerApiRoute('/api/health', {
    method: 'GET',
    handler: async () => {
      const startTime = Date.now();
      const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          api: {
            status: "healthy",
            message: "API is responsive",
          },
          database: {
            status: "unknown",
            message: "Not checked",
          },
        },
      };

      // Check if database is configured
      if (!process.env.DATABASE_URL) {
        health.checks.database = {
          status: "not_configured",
          message: "DATABASE_URL not set",
        };
        health.status = "degraded";
      } else {
        // Try to connect to database
        try {
          const pgStore = await getSharedPostgresStore();
          if (pgStore) {
            await pgStore.db.one('SELECT 1 as value');
            health.checks.database = {
              status: "healthy",
              message: "Database connection successful",
            };
          } else {
            health.checks.database = {
              status: "unhealthy",
              message: "Database connection failed",
            };
            health.status = "unhealthy";
          }
        } catch (error) {
          health.checks.database = {
            status: "unhealthy",
            message: error instanceof Error ? error.message : "Database connection failed",
          };
          health.status = "unhealthy";
        }
      }

      const responseTime = Date.now() - startTime;
      const statusCode = health.status === "unhealthy" ? 503 : 200;

      return new Response(
        JSON.stringify({
          ...health,
          responseTime: `${responseTime}ms`,
        }),
        {
          status: statusCode,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    },
  }),
];

