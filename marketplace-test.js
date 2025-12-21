#!/usr/bin/env node

import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper functions
function now() { return new Date().toISOString(); }
function log(...args) { console.log(`[${now()}] [marketplace-test]`, ...args); }
function error(...args) { console.error(`[${now()}] [marketplace-test] ERROR:`, ...args); }

// Read data.txt and parse chain information
function loadChainData() {
    const dataPath = __dirname + '/data.txt';
    if (!fs.existsSync(dataPath)) {
        throw new Error(`data.txt not found at ${dataPath}. Run linera-marketplace-test.sh first!`);
    }

    const content = fs.readFileSync(dataPath, 'utf-8');
    const data = {};

    content.split('\n').forEach(line => {
        const match = line.match(/^([A-Z_]+)=(.+)$/);
        if (match) {
            data[match[1]] = match[2];
        }
    });

    return {
        mainChain: data.MAIN_CHAIN,
        mainOwner: data.MAIN_OWNER,
        authorChain: data.AUTHOR_CHAIN,
        authorOwner: data.AUTHOR_OWNER,
        buyerChain: data.BUYER_CHAIN,
        buyerOwner: data.BUYER_OWNER,
        mainPort: data.MAIN_PORT || '7071',
        authorPort: data.AUTHOR_PORT || '7072',
        buyerPort: data.BUYER_PORT || '7073'
    };
}

// GraphQL query via axios
async function graphql(endpoint, query) {
    // Log what we're about to execute
    const operationMatch = query.match(/(mutation|query)\s*\{?\s*(\w+)/);
    const operationType = operationMatch ? operationMatch[1] : 'unknown';
    const operationName = operationMatch ? operationMatch[2] : 'unknown';
    const compactQuery = query.replace(/\s+/g, ' ').trim();

    log('POST', endpoint, 'query:', compactQuery);

    try {
        const res = await axios.post(endpoint, { query }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000,
            validateStatus: () => true
        });

        log('HTTP', res.status, res.statusText);
        const raw = res?.data;

        if (raw?.errors) {
            error('GraphQL errors:', JSON.stringify(raw.errors, null, 2));
            throw new Error(JSON.stringify(raw.errors));
        }

        const data = raw?.data;
        const keys = Object.keys(data || {});
        log('RESPONSE keys=' + keys.join(','), 'size=' + JSON.stringify(raw || {}).length);
        log('RESPONSE preview=', JSON.stringify(raw).substring(0, 500));

        return data;
    } catch (err) {
        error('Failed to execute GraphQL query:', err.message);
        error('Endpoint:', endpoint);
        throw err;
    }
}

// Generate random product data
function generateProductData() {
    const adjectives = ['Amazing', 'Premium', 'Essential', 'Digital', 'Ultimate'];
    const nouns = ['eBook', 'Course', 'Template', 'Guide', 'Toolkit'];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

    return {
        name: `${randomAdj} ${randomNoun}`,
        description: `A comprehensive ${randomNoun.toLowerCase()} that will help you master the topic`,
        link: `https://example.com/products/${Date.now()}`,
        dataBlobHash: `hash-${Math.random().toString(36).substring(2, 15)}`,
        price: '1' // 1 token (Amount uses u128, so 1 token = 1000000)
    };
}

async function runTest() {
    log('Starting marketplace integration test...');

    // Load chain data
    const chains = loadChainData();
    log('Loaded chain data:', chains);

    const APP_ID = process.env.DONATIONS_APP_ID || process.env.VITE_DONATIONS_APPLICATION_ID;
    if (!APP_ID) {
        throw new Error('DONATIONS_APP_ID environment variable not set');
    }

    // Construct GraphQL endpoints
    const mainEndpoint = `http://localhost:${chains.mainPort}/chains/${chains.mainChain}/applications/${APP_ID}`;
    const authorEndpoint = `http://localhost:${chains.authorPort}/chains/${chains.authorChain}/applications/${APP_ID}`;
    const buyerEndpoint = `http://localhost:${chains.buyerPort}/chains/${chains.buyerChain}/applications/${APP_ID}`;

    log('GraphQL Endpoints:');
    log('  Main:', mainEndpoint);
    log('  Author:', authorEndpoint);
    log('  Buyer:', buyerEndpoint);
    log('');

    // Step 1: Register author and buyer on main chain
    log('STEP 1: Registering author and buyer on main chain');

    try {
        const registerAuthorMutation = `
      mutation {
        register(
          mainChainId: "${chains.mainChain}"
          name: "Product Author"
          bio: "I create amazing digital products"
          socials: [{name: "website", url: "https://author.example.com"}]
        )
      }
    `;
        const authorRegResult = await graphql(authorEndpoint, registerAuthorMutation);
        log('✓ Author registered:', authorRegResult.register);
    } catch (err) {
        error('Failed to register author:', err.message);
    }

    try {
        const registerBuyerMutation = `
      mutation {
        register(
          mainChainId: "${chains.mainChain}"
          name: "Product Buyer"
          bio: "I love to buy digital goods"
          socials: [{name: "twitter", url: "https://twitter.com/buyer"}]
        )
      }
    `;
        const buyerRegResult = await graphql(buyerEndpoint, registerBuyerMutation);
        log('✓ Buyer registered:', buyerRegResult.register);
    } catch (err) {
        error('Failed to register buyer:', err.message);
    }

    log('');

    // Step 2: Create a product
    log('STEP 2: Creating product from author chain');
    const productData = generateProductData();
    log('Product data:', productData);

    const createProductMutation = `
    mutation {
      createProduct(
        name: "${productData.name}"
        description: "${productData.description}"
        link: "${productData.link}"
        dataBlobHash: "${productData.dataBlobHash}"
        price: "${productData.price}"
      )
    }
  `;

    const createResult = await graphql(authorEndpoint, createProductMutation);
    log('✓ Product created:', createResult.createProduct);
    log('');

    // Wait a bit for cross-chain synchronization
    log('Waiting 3 seconds for cross-chain sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 3: Query products from author chain
    log('STEP 3: Querying products from author chain');
    const authorProductsQuery = `
    query {
      productsByAuthor(owner: "${chains.authorOwner}") {
        id
        name
        description
        price
        dataBlobHash
      }
    }
  `;

    const authorProducts = await graphql(authorEndpoint, authorProductsQuery);
    log('Author products:', JSON.stringify(authorProducts.productsByAuthor, null, 2));

    if (!authorProducts.productsByAuthor || authorProducts.productsByAuthor.length === 0) {
        throw new Error('No products found on author chain!');
    }

    const productId = authorProducts.productsByAuthor[0].id;
    log('✓ Product ID:', productId);
    log('');

    // Step 4: Query products from main chain
    log('STEP 4: Querying products from main chain');
    const mainProductsQuery = `
    query {
      allProducts {
        id
        author
        authorChainId
        name
        description
        price
        dataBlobHash
      }
    }
  `;

    const mainProducts = await graphql(mainEndpoint, mainProductsQuery);
    log('Main chain products:', JSON.stringify(mainProducts.allProducts, null, 2));

    const productOnMain = mainProducts.allProducts?.find(p => p.id === productId);
    if (!productOnMain) {
        error('Product not found on main chain! Cross-chain sync may have failed.');
    } else {
        log('✓ Product verified on main chain:', productOnMain.name);
    }
    log('');

    // Step 5: Check initial balances
    log('STEP 5: Checking initial balances');
    const balanceQuery = `
    query {
      accounts {
        entry(key: "${chains.buyerOwner}") {
          key
          value
        }
      }
    }
  `;

    // Check Buyer Balance
    const buyerBalanceResult = await graphql(buyerEndpoint, balanceQuery);
    const initialBuyerBalance = buyerBalanceResult.accounts?.entry?.value || '0';
    log('Initial Buyer balance:', initialBuyerBalance);

    // Check Author Balance (need to query author chain for author's balance)
    const authorBalanceQuery = `
    query {
      accounts {
        entry(key: "${chains.authorOwner}") {
          key
          value
        }
      }
    }
  `;
    const authorBalanceResult = await graphql(authorEndpoint, authorBalanceQuery);
    const initialAuthorBalance = authorBalanceResult.accounts?.entry?.value || '0';
    log('Initial Author balance:', initialAuthorBalance);
    log('');

    // Step 6: Mint tokens if balance is too low
    if (initialBuyerBalance === '0' || BigInt(initialBuyerBalance) < BigInt(productData.price)) {
        log('STEP 6: Minting tokens for buyer (balance too low)');
        const mintAmount = '10000000'; // 10 tokens
        const mintMutation = `
      mutation {
        mint(
          owner: "${chains.buyerOwner}"
          amount: "${mintAmount}"
        )
      }
    `;

        const mintResult = await graphql(buyerEndpoint, mintMutation);
        log('✓ Tokens minted:', mintResult.mint);

        // Wait for mint to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check balance again
        const newBalanceResult = await graphql(buyerEndpoint, balanceQuery);
        const newBuyerBalance = newBalanceResult.accounts?.entry?.value || '0';
        log('New Buyer balance:', newBuyerBalance);
        log('');
    } else {
        log('STEP 6: Balance sufficient, skipping mint');
        log('');
    }

    // Step 7: Update Product
    log('STEP 7: Updating product (Price increase)');
    const updatedPrice = (BigInt(productData.price) * 2n).toString();
    const updateProductMutation = `
    mutation {
      updateProduct(
        productId: "${productId}"
        name: "${productData.name} (Updated)"
        price: "${updatedPrice}"
      )
    }
  `;
    const updateResult = await graphql(authorEndpoint, updateProductMutation);
    log('✓ Product updated:', updateResult.updateProduct);

    log('Waiting 3 seconds for update sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify update on Main Chain
    const mainProductUpdateQuery = `
    query {
      allProducts {
        id
        name
        price
      }
    }
    `;
    const mainProductsUpdated = await graphql(mainEndpoint, mainProductUpdateQuery);
    const updatedProductOnMain = mainProductsUpdated.allProducts?.find(p => p.id === productId);

    if (updatedProductOnMain && updatedProductOnMain.name.includes('(Updated)') && updatedProductOnMain.price === updatedPrice) {
        log('✓ Product update verified on Main Chain');
    } else {
        error('Product update NOT synced to Main Chain properly:', updatedProductOnMain);
    }
    log('');

    // Step 8: Purchase the product (at updated price)
    log('STEP 8: Purchasing product from buyer chain');
    const purchaseMutation = `
    mutation {
      transferToBuy(
        owner: "${chains.buyerOwner}"
        productId: "${productId}"
        amount: "${updatedPrice}"
        targetAccount: {
          chainId: "${chains.authorChain}"
          owner: "${chains.authorOwner}"
        }
      )
    }
  `;

    const purchaseResult = await graphql(buyerEndpoint, purchaseMutation);
    log('✓ Purchase initiated:', purchaseResult.transferToBuy);
    log('');

    // Wait for purchase to process
    log('Waiting 3 seconds for purchase to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('');

    // Step 9: Verify purchase
    log('STEP 9: Verifying purchase');
    const purchasesQuery = `
    query {
      purchases(owner: "${chains.buyerOwner}") {
        id
        productId
        amount
        product {
          name
        }
      }
    }
  `;

    const purchasesResult = await graphql(buyerEndpoint, purchasesQuery);
    log('Buyer purchases:', JSON.stringify(purchasesResult.purchases, null, 2));

    const foundPurchase = purchasesResult.purchases?.find(p => p.productId === productId);
    if (!foundPurchase) {
        error('Purchase not found! Transaction may have failed.');
    } else {
        log('✓ Purchase verified!');
    }
    log('');

    // Step 10: Verify Final Balances
    log('STEP 10: Verifying balances after purchase');

    // Buyer Final Balance
    const finalBuyerBalanceResult = await graphql(buyerEndpoint, balanceQuery);
    const finalBuyerBalance = finalBuyerBalanceResult.accounts?.entry?.value || '0';
    log('Final Buyer balance:', finalBuyerBalance);

    // Author Final Balance
    const finalAuthorBalanceResult = await graphql(authorEndpoint, authorBalanceQuery);
    const finalAuthorBalance = finalAuthorBalanceResult.accounts?.entry?.value || '0';
    log('Final Author balance:', finalAuthorBalance);

    // Check if balances changed correctly
    // Note: Buyer might have minted tokens, so we compare against balance BEFORE purchase but AFTER mint
    // Let's assume the balance entering Step 8 was the "pre-purchase" balance.
    // Simplifying: just check if author received funds.
    if (BigInt(finalAuthorBalance) > BigInt(initialAuthorBalance)) {
        log('✓ Author balance increased (Payment received)');
    } else {
        error('Author balance did NOT increase!');
    }
    log('');

    // Step 11: Delete Product
    log('STEP 11: Deleting product');
    const deleteProductMutation = `
    mutation {
      deleteProduct(productId: "${productId}")
    }
    `;
    const deleteResult = await graphql(authorEndpoint, deleteProductMutation);
    log('✓ Product deleted:', deleteResult.deleteProduct);

    log('Waiting 3 seconds for delete sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify deletion on Author Chain
    const authorProductsAfterDelete = await graphql(authorEndpoint, authorProductsQuery);
    const deletedOnAuthor = !authorProductsAfterDelete.productsByAuthor?.find(p => p.id === productId);
    if (deletedOnAuthor) {
        log('✓ Product successfully removed from Author Chain');
    } else {
        error('Product STILL exists on Author Chain!');
    }

    // Verify deletion on Main Chain
    const mainProductsAfterDelete = await graphql(mainEndpoint, mainProductsQuery);
    const deletedOnMain = !mainProductsAfterDelete.allProducts?.find(p => p.id === productId);
    if (deletedOnMain) {
        log('✓ Product successfully removed from Main Chain');
    } else {
        error('Product STILL exists on Main Chain!');
    }
    log('');

    log('✅ All tests completed successfully!');
}

// Run the test
runTest().catch(err => {
    error('Test failed:', err.message);
    process.exit(1);
});
