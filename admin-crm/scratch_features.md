# Future Feature Roadmap

Here is a list of features that can be implemented at the feature-level to enrich this CRM/ERP platform:

## 1. 🧾 GST Filing, Offline Utilities & E-Invoicing
* **GSTR-1 & GSTR-3B JSON Exporter**: Generate ready-to-upload offline JSON utility payloads for GSTR-1 (sales details) and GSTR-3B returns matching direct GST portal structures.
* **E-Way Bill & E-Invoice Integration**: Directly communicate with NIC/IRN registries to automatically generate e-invoice QR codes and fetch PDF documents inside the platform.

## 2. 👥 Field Force CRM & Sales Beat
* **Route & Beat Planning**: Plan geo-fenced routes for Medical Representatives (MR) visits to clinics, making sure check-ins occur within specific coordinates.
* **Doctor Sample Distribution Tracking**: Track sample kit allocations from inventory to MRs and log exactly which doctor received which batch/quantity, mapping it directly to B2B sales conversions in that territory for marketing ROI calculation.

## 3. 💰 Debt Ageing & Payment Allocation
* **Bill-wise Payment Matching**: Move from overall balance tracking to allowing users to explicitly choose which outstanding invoices a receipt clears.
* **Receivable Ageing Analysis**: A dashboard displaying invoice age brackets (0-30 days, 31-60 days, 61-90 days, 90+ days) with automated payment reminders (Email/WhatsApp).

## 4. 🛒 Storefront Synchronization
* **E-Commerce Webhooks (Razorpay/Stripe)**: Handle storefront payment webhooks to mark orders as paid, auto-deduct finished goods inventories, and print shipping/packing lists automatically.
