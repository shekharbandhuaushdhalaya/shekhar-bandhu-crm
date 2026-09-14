# Feature Implementation Roadmap

## Core CRM
- [ ] Email integration (IMAP sync)
- [ ] Calendar / scheduling
- [x] Automated workflows (drip campaigns, lead nurturing)
- [ ] Customer portal / self-service
- [x] Bulk import/export (CSV/Excel)

## Financial
- [ ] Full accounting (chart of accounts, P&L, balance sheet)
- [x] GST returns data export (GSTR-1, GSTR-3B)
- [x] Credit / debit notes
- [x] Recurring invoices / subscriptions
- [ ] TDS / TCS calculations
- [x] Bank reconciliation
- [x] E-way bills integration

## Inventory
- [x] Barcode / QR code scanning
- [x] Low stock alerts / reorder notifications
- [x] Physical stocktake
- [x] Expiry alerts for finished goods & raw materials
- [x] Botanical & Scientific Name Auto-Lookup Service
- [x] Ayurvedic Pharmacopoeia (API/API Part I) Monograph Dictionary (Herbal, Rasa, Animal & Schedule E1)

## Operational
- [x] Production planning / scheduling
- [x] Logistics / shipment tracking API integration
- [x] Purchase order management (separate from invoices)
- [x] Demand forecasting

## System
- [x] Password reset / forgot password flow
- [x] In-app notifications
- [x] API documentation (Swagger / OpenAPI)
- [x] Backup / restore
- [ ] Multi-language support

## Deferred
- Public Storefront Website (`sba-website`) — descoped/deferred as an external separate project.


## 2026-09 Manufacturing & AYUSH compliance upgrade
- [x] Product-specific AYUSH QC specifications with version/source and approval workflow
- [x] CoA is specification-driven; missing tests can no longer default to PASS
- [x] BMR raw-material analytical report number and received/issued/used/returned/rejected tracking fields
- [x] Two-person authenticated Chemist + QA electronic signatures; same-user dual signing blocked
- [x] Market release gate requires approved QC specification, mandatory QC passes and manufacturing/filling/packing line clearances
- [x] Equipment, deviations/CAPA, stability, recall and vendor-qualification modules surfaced in a GMP & AYUSH Compliance dashboard
- [x] Production social integrations fail closed instead of reporting mocked success
