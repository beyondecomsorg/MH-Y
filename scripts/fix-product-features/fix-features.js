import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';
const IS_WRITE_MODE = process.argv.includes('--write');

if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
  console.error('\n❌ ERROR: Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN in .env file.\n');
  process.exit(1);
}

// Clean domain string
const storeDomain = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
const GRAPHQL_ENDPOINT = `https://${storeDomain}/admin/api/${API_VERSION}/graphql.json`;

/**
 * Regex Heuristic Explanation:
 * SPLIT_REGEX = /(?<=[a-z])\s(?=[A-Z])/g
 *
 * Mechanics:
 * - (?<=[a-z]) : Positive lookbehind matching a lowercase letter.
 * - \s         : A single space character separating words.
 * - (?=[A-Z])  : Positive lookahead matching an uppercase letter.
 *
 * Target Example:
 * "Comfort fit Button-down collar Internal tape" ->
 * ["Comfort fit", "Button-down collar", "Internal tape"]
 *
 * Known Limitations & Edge Cases:
 * 1. Brand Names & CamelCase: E.g., "MacBook Pro" or "Fitbit Charge" will split into "Mac", "Book Pro" or "Fitbit Charge" (if lowercase letter precedes space and capital letter).
 * 2. Proper Nouns / Locations: E.g., "Made in India" -> "Made in", "India".
 * 3. Numbers / Special Characters: E.g., "100% Cotton UV Protection" won't match "100%" lookbehind.
 * 4. Technical Acronyms: E.g., "Waterproof GoreTex" -> "Waterproof", "GoreTex".
 *
 * Ambiguity Detection:
 * The script flags items for manual review if:
 * - Any resulting item is unusually short (< 3 chars).
 * - The split creates fragments starting with common prepositions/conjunctions ("In", "On", "Of", "With", "By", "For").
 */
const SPLIT_REGEX = /(?<=[a-z])\s(?=[A-Z])/g;
const AMBIGUOUS_WORDS = new Set(['In', 'On', 'Of', 'With', 'By', 'For', 'And', 'To']);

/**
 * Helper to pause execution for throttling/backoff
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send GraphQL Request with Throttle Rate-Limit Handling & Retries
 */
async function graphqlQuery(query, variables = {}, attempt = 1) {
  const maxAttempts = 5;
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      if (response.status === 429 && attempt <= maxAttempts) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`⚠️ HTTP 429 Throttled. Backing off for ${Math.round(backoffMs)}ms... (Attempt ${attempt}/${maxAttempts})`);
        await sleep(backoffMs);
        return graphqlQuery(query, variables, attempt + 1);
      }
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    // Handle GraphQL Cost Throttling from extensions
    if (json.extensions?.cost?.throttleStatus) {
      const { currentlyAvailable, restoreRate } = json.extensions.cost.throttleStatus;
      if (currentlyAvailable < 100) {
        const waitTimeMs = Math.ceil(((100 - currentlyAvailable) / restoreRate) * 1000);
        console.log(`⌛ Rate limit low (${currentlyAvailable} points available). Pausing ${waitTimeMs}ms...`);
        await sleep(waitTimeMs);
      }
    }

    // Handle GraphQL level THROTTLED errors
    if (json.errors) {
      const isThrottled = json.errors.some((err) => err.extensions?.code === 'THROTTLED');
      if (isThrottled && attempt <= maxAttempts) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`⚠️ GraphQL THROTTLED error. Retrying in ${Math.round(backoffMs)}ms... (Attempt ${attempt}/${maxAttempts})`);
        await sleep(backoffMs);
        return graphqlQuery(query, variables, attempt + 1);
      }
      throw new Error(`GraphQL Error: ${json.errors.map((e) => e.message).join('; ')}`);
    }

    return json.data;
  } catch (error) {
    if (attempt <= maxAttempts) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.warn(`⚠️ Request failed (${error.message}). Retrying in ${backoffMs}ms... (Attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      return graphqlQuery(query, variables, attempt + 1);
    }
    throw error;
  }
}

/**
 * Process a list of features, splitting merged strings and detecting ambiguities
 */
function processFeaturesList(rawList) {
  const correctedList = [];
  let isMerged = false;
  let isAmbiguous = false;
  const warnings = [];

  for (const rawItem of rawList) {
    if (typeof rawItem !== 'string') continue;
    const trimmedItem = rawItem.trim();
    if (!trimmedItem) continue;

    // Test if item contains lowercase -> space -> uppercase split pattern
    if (SPLIT_REGEX.test(trimmedItem)) {
      isMerged = true;
      const parts = trimmedItem.split(SPLIT_REGEX).map((p) => p.trim()).filter(Boolean);

      for (const part of parts) {
        // Ambiguity checks
        if (part.length < 3) {
          isAmbiguous = true;
          warnings.push(`Fragment too short: "${part}" in "${trimmedItem}"`);
        }
        const firstWord = part.split(/\s+/)[0];
        if (AMBIGUOUS_WORDS.has(firstWord)) {
          isAmbiguous = true;
          warnings.push(`Fragment starts with preposition/conjunction: "${part}"`);
        }

        if (!correctedList.includes(part)) {
          correctedList.push(part);
        }
      }
    } else {
      if (!correctedList.includes(trimmedItem)) {
        correctedList.push(trimmedItem);
      }
    }
  }

  return { correctedList, isMerged, isAmbiguous, warnings };
}

/**
 * GraphQL Query to fetch products with metafields
 */
const GET_PRODUCTS_QUERY = `
  query getProductsWithMetafield($cursor: String) {
    products(first: 50, after: $cursor, query: "metafields.custom.product_feature:*") {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        metafield(namespace: "custom", key: "product_feature") {
          id
          namespace
          key
          type
          value
        }
      }
    }
  }
`;

/**
 * GraphQL Mutation to set metafields
 */
const SET_METAFIELD_MUTATION = `
  mutation setMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Update product metafield via GraphQL mutation
 */
async function updateProductMetafield(productId, valueArray) {
  const variables = {
    metafields: [
      {
        ownerId: productId,
        namespace: 'custom',
        key: 'product_feature',
        type: 'list.single_line_text_field',
        value: JSON.stringify(valueArray),
      },
    ],
  };

  const data = await graphqlQuery(SET_METAFIELD_MUTATION, variables);
  const userErrors = data?.metafieldsSet?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(`metafieldsSet error: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  return data?.metafieldsSet?.metafields?.[0];
}

/**
 * Convert data array to CSV string
 */
function exportToCSV(records) {
  if (records.length === 0) return '';
  const headers = ['productId', 'title', 'handle', 'status', 'beforeCount', 'afterCount', 'beforeValue', 'afterValue', 'warnings'];
  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  
  const rows = records.map((r) => [
    r.productId,
    r.title,
    r.handle,
    r.status,
    r.beforeCount,
    r.afterCount,
    JSON.stringify(r.beforeValue),
    JSON.stringify(r.afterValue),
    r.warnings.join(' | '),
  ].map(escapeCsv).join(','));

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Main Execution Loop
 */
async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 SHOPIFY PRODUCT FEATURE METAFIELD CLEANUP SCRIPT`);
  console.log(`Store: ${storeDomain}`);
  console.log(`Mode:  ${IS_WRITE_MODE ? '🔴 WRITE MODE (Changes WILL be committed)' : '🟡 DRY RUN MODE (No changes written)'}`);
  console.log(`======================================================\n`);

  let hasNextPage = true;
  let cursor = null;

  let totalProductsScanned = 0;
  let mergedProductsFound = 0;
  let productsUpdated = 0;
  let ambiguousProductsFound = 0;
  let errorsEncountered = 0;

  const records = [];

  while (hasNextPage) {
    console.log(`🔍 Fetching products batch (Cursor: ${cursor || 'START'})...`);
    const data = await graphqlQuery(GET_PRODUCTS_QUERY, { cursor });
    const products = data?.products?.nodes || [];
    const pageInfo = data?.products?.pageInfo;

    for (const product of products) {
      totalProductsScanned++;
      const metafield = product.metafield;
      if (!metafield || !metafield.value) continue;

      let rawList = [];
      try {
        rawList = JSON.parse(metafield.value);
        if (!Array.isArray(rawList)) {
          rawList = [metafield.value];
        }
      } catch {
        rawList = [metafield.value];
      }

      const { correctedList, isMerged, isAmbiguous, warnings } = processFeaturesList(rawList);

      if (isMerged) {
        mergedProductsFound++;
        if (isAmbiguous) ambiguousProductsFound++;

        console.log(`\n------------------------------------------------------`);
        console.log(`📦 Product: "${product.title}" (${product.handle})`);
        console.log(`🆔 ID: ${product.id}`);
        console.log(`❌ BEFORE (${rawList.length} items):`);
        console.log(`   ${JSON.stringify(rawList, null, 2)}`);
        console.log(`✅ AFTER (${correctedList.length} items):`);
        console.log(`   ${JSON.stringify(correctedList, null, 2)}`);
        
        if (warnings.length > 0) {
          console.log(`⚠️ AMBIGUITY WARNINGS:`);
          warnings.forEach((w) => console.log(`   - ${w}`));
        }

        let status = 'FOUND_MERGED';

        if (IS_WRITE_MODE) {
          try {
            await updateProductMetafield(product.id, correctedList);
            productsUpdated++;
            status = 'UPDATED';
            console.log(`💾 Committed update to Shopify.`);
          } catch (err) {
            errorsEncountered++;
            status = 'ERROR';
            console.error(`❌ Failed to update product ${product.id}: ${err.message}`);
          }
        } else {
          status = 'DRY_RUN_MATCH';
          console.log(`ℹ️ [DRY RUN] Skipping write.`);
        }

        records.push({
          productId: product.id,
          title: product.title,
          handle: product.handle,
          status,
          beforeCount: rawList.length,
          afterCount: correctedList.length,
          beforeValue: rawList,
          afterValue: correctedList,
          warnings,
        });
      }
    }

    hasNextPage = pageInfo?.hasNextPage || false;
    cursor = pageInfo?.endCursor || null;
  }

  // Generate Reports
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportMode = IS_WRITE_MODE ? 'write' : 'dryrun';
  const jsonReportPath = path.join(process.cwd(), `report_${reportMode}_${timestamp}.json`);
  const csvReportPath = path.join(process.cwd(), `report_${reportMode}_${timestamp}.csv`);

  const summary = {
    timestamp: new Date().toISOString(),
    mode: IS_WRITE_MODE ? 'WRITE' : 'DRY_RUN',
    totalProductsScanned,
    mergedProductsFound,
    productsUpdated,
    ambiguousProductsFound,
    errorsEncountered,
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify({ summary, records }, null, 2));
  fs.writeFileSync(csvReportPath, exportToCSV(records));

  console.log(`\n======================================================`);
  console.log(`📊 FINAL SUMMARY REPORT`);
  console.log(`======================================================`);
  console.log(`Total Products Scanned:          ${totalProductsScanned}`);
  console.log(`Merged Products Found:           ${mergedProductsFound}`);
  console.log(`Ambiguous Splits Flagged:        ${ambiguousProductsFound}`);
  console.log(`Products Updated:                ${productsUpdated}`);
  console.log(`Errors / Failed Updates:         ${errorsEncountered}`);
  console.log(`------------------------------------------------------`);
  console.log(`📄 JSON Report saved to: ${jsonReportPath}`);
  console.log(`📄 CSV Report saved to:  ${csvReportPath}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('\n❌ Unhandled Fatal Error:', err);
  process.exit(1);
});
