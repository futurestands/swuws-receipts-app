# System Administrator Guide
**SWUWS Collection & Financial Governance Platform v1.0.0**

## 1. Environment Configuration
The system requires the following environment variables in `.env.production`:
- `DATABASE_URL`: PostgreSQL connection string.
- `BETTER_AUTH_SECRET`: Encryption key for session management.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token for logo uploads.

## 2. Security & IAM
- **Role Management**: Navigate to `/admin` to manage roles and Rank (0-100).
- **Permissions**: Assign granular permissions (e.g., `receipts.void`) via the IAM matrix.
- **Scope Enforcement**: Ensure users are assigned to the correct Organization Unit (Cluster, Branch, or Scheme) to limit their data visibility.

## 3. Maintenance Procedures
- **Backups**: Perform daily automated exports using `pg_dump`.
- **Migrations**: Apply updates using `node db/migrate.js`. Always verify backups before running migrations.
- **Health Monitoring**: Monitor the `/api/health` endpoint for uptime and database latency alerts.

## 4. Troubleshooting
- **Logs**: Review `audit_log` in the database for unauthorized access attempts.
- **Common Errors**: 
  - `403 Forbidden`: User lacks required permission or scope.
  - `500 Internal Server Error`: Check database connectivity and Vercel Blob token status.
