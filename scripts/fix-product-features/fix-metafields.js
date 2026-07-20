import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GraphQLClient, gql } from 'graphql-request';

dotenv.config();

// Configuration
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';
const IS_WRITE_MODE = process.argv.includes('--write');

/**
 * Easily Editable Target Metafields Array
 * Add or remove any list.single_line_text_field metafields here.
 */
const TARGET_METAFIELDS = [
  { namespace: 'custom', key: 'product_feature' },
  { namespace: 'custom', key: 'wash_care' },
];

if (!SHOPIFY_STORE || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
  console.error('\n❌ ERROR: Missing SHOPIFY_STORE or SHOPIFY_ADMIN_ACCESS_TOKEN in .env file.\n');
  process.exit(1);
}

// Format store URL
const storeDomain = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
const GRAPHQL_ENDPOINT = `https://${storeDomain}/admin/api/${API_VERSION}/graphql.json`;

// Instantiate GraphQLClient
const client = new GraphQLClient(GRAPHQL_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
  },
});

/**
 * Regex Heuristic Explanation:
 * SPLIT_REGEX = /(?<=[a-z0-9,])\s(?=[A-Z])/g
 *
 * Mechanics:
 * - (?<=[a-z0-9,]) : Positive lookbehind matching a lowercase letter (a-z), digit (0-9), or comma (,).
 * - \s              : A single space separator.
 * - (?=[A-Z])       : Positive lookahead matching an uppercase letter (A-Z).
 *
 * Target Examples:
 * 1. "Comfort fit Button-down collar" -> ["Comfort fit", "Button-down collar"] (after 't' before 'B')
 * 2. "Wash inside out at 30°C with colours Use a normal cycle" -> ["Wash inside out at 30°C with colours", "Use a normal cycle"] (after 's' before 'U')
 * 3. "No pocket, Rounded hem" -> ["No pocket,", "Rounded hem"] -> trimmed to ["No pocket", "Rounded hem"]
 *
 * Known Limitations & Edge Cases:
 * 1. Mid-sentence Capitals / Acronyms: E.g., "100% Cotton", "UV Protection", "ISO Certified".
 * 2. Brand Names / CamelCase: E.g., "MacBook Pro", "Fitbit Charge".
 * 3. Proper Nouns / Origins: E.g., "Made in India" -> "Made in", "India".
 *
 * Ambiguity Detection:
 * The script flags items for manual review if:
 * - Any resulting item is unusually short (< 3 chars).
 * - The split creates fragments starting with common prepositions/conjunctions ("In", "On", "Of", "With", "By", "For", "To", "Or", "And").
 * - Contains numbers followed immediately by capital letters without lowercase preceding words.
 */
const SPLIT_REGEX = /(?<=[a-z0-9,])\s(?=[A-Z])/g;
const AMBIGUOUS_WORDS = new Set(['In', 'On', 'Of', 'With', 'By', 'For', 'And', 'To', 'Or', 'At']);

/**
 * Pause execution helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute GraphQL request with automatic throttle control and retries
 */
async function requestWithRetry(queryDocument, variables = {}, attempt = 1) {
  const maxAttempts = 5;
  try {
    const data = await client.request(queryDocument, variables);
    return data;
  } catch (error) {
    const isThrottled =
      error?.response?.status === 429 ||
      error?.response?.errors?.some((e) => e.extensions?.code === 'THROTTLED') ||
      error.message?.includes('THROTTLED');

    if (isThrottled && attempt <= maxAttempts) {
      const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`⚠️ Throttle limit reached. Backing off for ${Math.round(backoffMs)}ms... (Attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      return requestWithRetry(queryDocument, variables, attempt + 1);
    }

    if (attempt <= maxAttempts) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.warn(`⚠️ Request error (${error.message}). Retrying in ${backoffMs}ms... (Attempt ${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
      return requestWithRetry(queryDocument, variables, attempt + 1);
    }

    throw error;
  }
}

/**
 * Clean stray quotes surrounding text strings
 */
function cleanStrayQuotes(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/^["'“”'«»]+/, '')
    .replace(/["'“”'«»]+$/, '')
    .trim();
}

/**
 * Process a list of items for a given metafield value
 */
function processMetafieldValue(rawList) {
  const correctedList = [];
  let isMerged = false;
  let isAmbiguous = false;
  const warnings = [];

  for (const rawItem of rawList) {
    if (typeof rawItem !== 'string') continue;
    
    // Strip leading/trailing stray quotes left over from copy-paste
    const cleanedItem = cleanStrayQuotes(rawItem);
    if (!cleanedItem) continue;

    // Check if item contains regex split pattern
    if (SPLIT_REGEX.test(cleanedItem)) {
      isMerged = true;
      const parts = cleanedItem.split(SPLIT_REGEX).map(cleanStrayQuotes).filter(Boolean);

      for (const part of parts) {
        // Ambiguity check
        if (part.length < 3) {
          isAmbiguous = true;
          warnings.push(`Fragment too short: "${part}" in "${cleanedItem}"`);
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
      if (!correctedList.includes(cleanedItem)) {
        correctedList.push(cleanedItem);
      }
    }
  }

  return { correctedList, isMerged, isAmbiguous, warnings };
}

/**
 * Build dynamic GraphQL query for target metafields
 */
const GET_PRODUCTS_QUERY = gql`
  query getProductsWithMetafields($cursor: String, $identifiers: [HasMetafieldsIdentifier!]!) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        metafields(identifiers: $identifiers) {
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
 * Batched MetafieldsSet Mutation
 */
const SET_METAFIELDS_MUTATION = gql`
  mutation setMetafields($metafields: [MetafieldsSetInput!]!) {
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
 * Batch update multiple metafields for a product in a single mutation call
 */
async function updateProductMetafields(productId, metafieldUpdates) {
  const metafields = metafieldUpdates.map((update) => ({
    ownerId: productId,
    namespace: update.namespace,
    key: update.key,
    type: 'list.single_line_text_field',
    value: JSON.stringify(update.correctedList),
  }));

  const data = await requestWithRetry(SET_METAFIELDS_MUTATION, { metafields });
  const userErrors = data?.metafieldsSet?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(`metafieldsSet error: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  return data?.metafieldsSet?.metafields;
}

/**
 * Export report to CSV
 */
function exportToCSV(records) {
  if (records.length === 0) return '';
  const headers = [
    'productId',
    'title',
    'handle',
    'namespace',
    'key',
    'status',
    'beforeCount',
    'afterCount',
    'beforeValue',
    'afterValue',
    'warnings',
  ];
  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = records.map((r) =>
    [
      r.productId,
      r.title,
      r.handle,
      r.namespace,
      r.key,
      r.status,
      r.beforeCount,
      r.afterCount,
      JSON.stringify(r.beforeValue),
      JSON.stringify(r.afterValue),
      r.warnings.join(' | '),
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Main Script Execution
 */
async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 SHOPIFY MULTI-METAFIELD CLEANUP SCRIPT (GraphQL)`);
  console.log(`Store: ${storeDomain}`);
  console.log(`Mode:  ${IS_WRITE_MODE ? '🔴 WRITE MODE (Changes WILL be committed)' : '🟡 DRY RUN MODE (No changes written)'}`);
  console.log(`Target Metafields: ${TARGET_METAFIELDS.map((m) => `${m.namespace}.${m.key}`).join(', ')}`);
  console.log(`======================================================\n`);

  // Initialize summary map per metafield
  const metafieldStats = {};
  TARGET_METAFIELDS.forEach((m) => {
    const metaKey = `${m.namespace}.${m.key}`;
    metafieldStats[metaKey] = {
      scanned: 0,
      mergedFound: 0,
      updated: 0,
      ambiguous: 0,
      errors: 0,
    };
  });

  let totalProductsScanned = 0;
  let hasNextPage = true;
  let cursor = null;

  const records = [];

  while (hasNextPage) {
    console.log(`🔍 Fetching products batch (Cursor: ${cursor || 'START'})...`);
    const data = await requestWithRetry(GET_PRODUCTS_QUERY, {
      cursor,
      identifiers: TARGET_METAFIELDS,
    });

    const products = data?.products?.nodes || [];
    const pageInfo = data?.products?.pageInfo;

    for (const product of products) {
      totalProductsScanned++;
      const metafields = product.metafields || [];
      const pendingUpdates = [];

      for (const targetConfig of TARGET_METAFIELDS) {
        const metaKey = `${targetConfig.namespace}.${targetConfig.key}`;
        const metafield = metafields.find(
          (m) => m && m.namespace === targetConfig.namespace && m.key === targetConfig.key
        );

        if (!metafield || !metafield.value) continue;
        metafieldStats[metaKey].scanned++;

        let rawList = [];
        try {
          rawList = JSON.parse(metafield.value);
          if (!Array.isArray(rawList)) rawList = [metafield.value];
        } catch {
          rawList = [metafield.value];
        }

        const { correctedList, isMerged, isAmbiguous, warnings } = processMetafieldValue(rawList);

        if (isMerged) {
          metafieldStats[metaKey].mergedFound++;
          if (isAmbiguous) metafieldStats[metaKey].ambiguous++;

          console.log(`\n------------------------------------------------------`);
          console.log(`📦 Product: "${product.title}" (${product.handle})`);
          console.log(`🏷️ Metafield: ${metaKey}`);
          console.log(`❌ BEFORE (${rawList.length} items):`);
          console.log(`   ${JSON.stringify(rawList, null, 2)}`);
          console.log(`✅ AFTER (${correctedList.length} items):`);
          console.log(`   ${JSON.stringify(correctedList, null, 2)}`);

          if (warnings.length > 0) {
            console.log(`⚠️ AMBIGUITY WARNINGS:`);
            warnings.forEach((w) => console.log(`   - ${w}`));
          }

          pendingUpdates.push({
            namespace: targetConfig.namespace,
            key: targetConfig.key,
            metaKey,
            rawList,
            correctedList,
            isAmbiguous,
            warnings,
          });
        }
      }

      // Perform batched mutation update if any metafields were merged
      if (pendingUpdates.length > 0) {
        if (IS_WRITE_MODE) {
          try {
            await updateProductMetafields(product.id, pendingUpdates);
            console.log(`💾 Committed ${pendingUpdates.length} metafield update(s) to Shopify.`);
            for (const update of pendingUpdates) {
              metafieldStats[update.metaKey].updated++;
              records.push({
                productId: product.id,
                title: product.title,
                handle: product.handle,
                namespace: update.namespace,
                key: update.key,
                status: 'UPDATED',
                beforeCount: update.rawList.length,
                afterCount: update.correctedList.length,
                beforeValue: update.rawList,
                afterValue: update.correctedList,
                warnings: update.warnings,
              });
            }
          } catch (err) {
            console.error(`❌ Failed to update product ${product.id}: ${err.message}`);
            for (const update of pendingUpdates) {
              metafieldStats[update.metaKey].errors++;
              records.push({
                productId: product.id,
                title: product.title,
                handle: product.handle,
                namespace: update.namespace,
                key: update.key,
                status: 'ERROR',
                beforeCount: update.rawList.length,
                afterCount: update.correctedList.length,
                beforeValue: update.rawList,
                afterValue: update.correctedList,
                warnings: update.warnings,
              });
            }
          }
        } else {
          console.log(`ℹ️ [DRY RUN] Skipping write for ${pendingUpdates.length} metafield(s).`);
          for (const update of pendingUpdates) {
            records.push({
              productId: product.id,
              title: product.title,
              handle: product.handle,
              namespace: update.namespace,
              key: update.key,
              status: 'DRY_RUN_MATCH',
              beforeCount: update.rawList.length,
              afterCount: update.correctedList.length,
              beforeValue: update.rawList,
              afterValue: update.correctedList,
              warnings: update.warnings,
            });
          }
        }
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
    metafieldStats,
  };

  fs.writeFileSync(jsonReportPath, JSON.stringify({ summary, records }, null, 2));
  fs.writeFileSync(csvReportPath, exportToCSV(records));

  console.log(`\n======================================================`);
  console.log(`📊 FINAL SUMMARY REPORT (BROKEN DOWN PER METAFIELD)`);
  console.log(`======================================================`);
  console.log(`Total Products Scanned Across Store: ${totalProductsScanned}`);
  console.log(`------------------------------------------------------`);

  for (const [metaKey, stats] of Object.entries(metafieldStats)) {
    console.log(`📌 Metafield: ${metaKey}`);
    console.log(`   - Metafield Set In Products:  ${stats.scanned}`);
    console.log(`   - Merged Entries Found:      ${stats.mergedFound}`);
    console.log(`   - Ambiguous Splits Flagged:   ${stats.ambiguous}`);
    console.log(`   - Products Updated:           ${stats.updated}`);
    console.log(`   - Failed Updates / Errors:    ${stats.errors}`);
  }

  console.log(`------------------------------------------------------`);
  console.log(`📄 JSON Report saved to: ${jsonReportPath}`);
  console.log(`📄 CSV Report saved to:  ${csvReportPath}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('\n❌ Unhandled Fatal Error:', err);
  process.exit(1);
});
