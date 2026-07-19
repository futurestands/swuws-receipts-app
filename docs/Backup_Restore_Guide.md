# Backup & Restore Procedures
**SWUWS Collection & Financial Governance Platform**

## 1. Backup Strategy
- **Type**: Full logical backup using `pg_dump`.
- **Frequency**: Every 24 hours.
- **Retention**: 30 days of daily backups.

## 2. Manual Backup Command
To perform an immediate backup of the production database:
```bash
pg_dump -U swuws_admin -h localhost -p 5432 swuws_receipts > swuws_backup_$(date +%F).sql
```

## 3. Restore Procedure
To restore a backup to a fresh database:
1. **Drop & Create**:
```sql
DROP DATABASE IF EXISTS swuws_receipts;
CREATE DATABASE swuws_receipts;
```
2. **Restore Data**:
```bash
psql -U swuws_admin -d swuws_receipts < swuws_backup_YYYY-MM-DD.sql
```
3. **Verify**:
- Run `npm run db:migrate` to ensure schema is consistent.
- Check `api/health` to confirm database connectivity.

## 4. Disaster Recovery Targets
- **Recovery Point Objective (RPO)**: 24 hours (Max data loss).
- **Recovery Time Objective (RTO)**: 1 hour (Time to restore service).
