# Go-Live Readiness Checklist

| Category | Requirement | Status |
| :--- | :--- | :--- |
| **Security** | SSL/TLS Certificate installed | [ ] |
| **Security** | Production Secrets rotated (.env) | [ ] |
| **Security** | IAM Permission Matrix verified | [ ] |
| **Data** | Migration `0022_production_indices` applied | [x] |
| **Data** | Automated Daily Backups enabled | [ ] |
| **Performance** | Dashboard load time < 2s | [ ] |
| **Performance** | Report generation tested with 10k+ rows | [ ] |
| **Operational** | System Admin Guide shared | [x] |
| **Operational** | Finance User Manual shared | [x] |
| **Health** | `/api/health` monitor verified | [x] |
| **Validation** | UAT scripts executed and signed off | [ ] |
