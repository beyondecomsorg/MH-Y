# Shopify Multi-Metafield Cleanup Script (GraphQL)

A Node.js utility script powered by **`graphql-request`** and the **Shopify Admin GraphQL API (2024-10)** to automatically detect and fix concatenated list entries across multiple product metafields (`custom.product_feature`, `custom.wash_care`, and more).

---

## 📋 Features & Specifications

- **Multi-Metafield Array Config**: Target multiple list-type metafields in a single run (e.g. `custom.product_feature` and `custom.wash_care`) via an easily configurable array.
- **Enhanced Regex Heuristic**: Uses `/(?<=[a-z0-9,])\s(?=[A-Z])/g` to split merged run-on items while stripping stray copy-paste quote characters (`"`, `'`, `“`, `”`).
- **Batched Mutations**: Updates multiple corrected metafields per product in a single GraphQL `metafieldsSet` mutation call.
- **Dry-Run Safety Default**: Runs in safe **Dry-Run** mode by default. Logs before/after diffs per metafield and generates JSON/CSV reports without modifying store data.
- **`--write` Flag**: Only commits updates to Shopify when explicitly executed with `--write`.
- **Throttling & Retry Backoff**: Handles HTTP 429 and GraphQL `THROTTLED` errors with automatic exponential backoff.
- **Ambiguity Detection**: Flags suspicious split fragments (prepositions, short strings) for manual review.
- **Per-Metafield Breakdown Reporting**: Logs a final summary broken down by individual metafield and exports timestamped reports (`report_dryrun_*.json`, `report_dryrun_*.csv`, `report_write_*.json`, `report_write_*.csv`).

---

## 🛠️ Project Structure

```
fix-product-features/
├── .env.example        # Environment variable template
├── package.json        # Node.js project configuration (graphql-request)
├── README.md           # Documentation & instructions
└── fix-metafields.js   # Main multi-metafield cleanup script
```

---

## ⚙️ Target Metafield Configuration

At the top of `fix-metafields.js`, you can configure any target list-type metafields:

```javascript
const TARGET_METAFIELDS = [
  { namespace: 'custom', key: 'product_feature' },
  { namespace: 'custom', key: 'wash_care' },
  // Add more metafields here without changing logic
];
```

---

## 🚀 Setup & Installation

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher.
- **Shopify Admin Access Token**: A custom app access token with `read_products` and `write_products` permissions.

### 2. Install Dependencies
Navigate to the script directory and install `dotenv` and `graphql-request`:
```bash
cd scripts/fix-product-features
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your store details:
```env
SHOPIFY_STORE=your-store-name.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2024-10
```

---

## 🏃 Usage Instructions

### Step 1: Run in DRY-RUN Mode (Default)
```bash
npm start
# or: node fix-metafields.js
```
- Logs console diffs (`BEFORE` vs `AFTER`) for each affected product and metafield.
- Generates `report_dryrun_<timestamp>.json` and `report_dryrun_<timestamp>.csv`.

### Step 2: Review CSV/JSON Reports
Check `report_dryrun_<timestamp>.csv` to verify splits and check flagged ambiguity warnings.

### Step 3: Run in WRITE Mode (Commit Updates)
```bash
npm run write
# or: node fix-metafields.js --write
```
- Batches and commits updates to Shopify using `metafieldsSet`.
- Generates `report_write_<timestamp>.json` and `report_write_<timestamp>.csv`.
