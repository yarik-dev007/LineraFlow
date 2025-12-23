import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import PocketBase from 'pocketbase';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Configuration
const LINERA_CHAIN_ID = '8034b1b376dd64d049deec9bb3a74378502e9b2a6b1b370c5d1a510534e93b66';
const LINERA_APP_ID = 'a2376c5a0cc2e471078462f22eacca74d1ca8849dd09dbc47cb0e5da5e06fb89';
const LINERA_NODE_URL = `http://localhost:8081`;
const LINERA_WS_URL = `ws://localhost:8081/ws`;
const POCKETBASE_URL = 'http://127.0.0.1:8090';
const CACHE_FILE = path.join(process.cwd(), '.indexer-cache.json');

// Initialize PocketBase
const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false); // Disable auto-cancellation for indexer requests

// Cache management
let cache = { lastSyncTimestamp: 0, lastNotificationHeight: 0 };

function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf8');
            cache = JSON.parse(data);
            console.log('📦 Loaded cache:', cache);
        }
    } catch (e) {
        console.warn('⚠️  Could not load cache:', e.message);
    }
}

function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        console.log('💾 Saved cache:', cache);
    } catch (e) {
        console.error('❌ Could not save cache:', e.message);
    }
}

async function fetchGraphQL(query, variables = {}) {
    const response = await fetch(`${LINERA_NODE_URL}/chains/${LINERA_CHAIN_ID}/applications/${LINERA_APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });
    return response.json();
}

async function syncProfiles() {
    console.log('Syncing profiles...');
    const query = `query {
        allProfilesView {
            owner
            chainId
            name
            bio
            socials {
                name
                url
            }
        }
    }`;

    try {
        const result = await fetchGraphQL(query);
        const profiles = result.data?.allProfilesView || [];

        for (const p of profiles) {
            // Check if exists by owner (unique field)
            try {
                const existing = await pb.collection('profiles').getFirstListItem(`owner="${p.owner}"`);
                // Update existing profile
                await pb.collection('profiles').update(existing.id, {
                    chain_id: p.chainId,
                    name: p.name,
                    bio: p.bio,
                    socials: p.socials
                });
                console.log(`✅ Updated profile for ${p.owner}`);
            } catch (e) {
                // Profile doesn't exist, create new
                if (e.status === 404) {
                    await pb.collection('profiles').create({
                        owner: p.owner,
                        chain_id: p.chainId,
                        name: p.name,
                        bio: p.bio,
                        socials: p.socials
                    });
                    console.log(`✅ Created profile for ${p.owner}`);
                } else {
                    console.error(`❌ Error processing profile ${p.owner}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('❌ Error syncing profiles:', e.message);
    }
}

async function syncDonations() {
    console.log('Syncing donations...');
    const query = `query {
        allDonations {
            id
            from
            to
            amount
            message
            timestamp
            sourceChainId
        }
    }`;

    try {
        const result = await fetchGraphQL(query);
        const donations = result.data?.allDonations || [];

        for (const d of donations) {
            // Use the contract's unique ID to prevent duplicates
            // We need to add a contract_id field to track this
            try {
                // Parse amount correctly - Linera amounts can have trailing dots like "1."
                const amountStr = String(d.amount).replace(/\.$/, ''); // Remove trailing dot
                const amount = parseFloat(amountStr) || 0;

                // Try to find existing donation by unique combination
                const existing = await pb.collection('donations').getList(1, 1, {
                    filter: `from_owner="${d.from}" && to_owner="${d.to}" && timestamp="${d.timestamp}" && amount=${amount}`
                });

                if (existing.items.length === 0) {
                    // Doesn't exist, create it
                    await pb.collection('donations').create({
                        from_owner: d.from,
                        to_owner: d.to,
                        amount: amount,
                        message: d.message,
                        timestamp: d.timestamp,
                        source_chain_id: d.sourceChainId
                    });
                    console.log(`✅ Created donation: ${amount} from ${d.from} to ${d.to}`);
                } else {
                    console.log(`⏭️  Donation already exists, skipping`);
                }
            } catch (e) {
                console.error('❌ Error processing donation:', e.message);
            }
        }
    } catch (e) {
        console.error('❌ Error syncing donations:', e.message);
    }
}

async function syncProducts() {
    console.log('Syncing products...');
    const query = `query {
        allProducts {
            id
            author
            authorChainId
            name
            description
            price
            dataBlobHash
            link
        }
    }`;

    try {
        const result = await fetchGraphQL(query);
        const products = result.data?.allProducts || [];

        // 1. Sync Logic: Update/Create existing
        for (const p of products) {
            try {
                // Find by on-chain product_id (unique)
                const existingList = await pb.collection('products').getList(1, 1, {
                    filter: `product_id_linera="${p.id}"`
                });

                const priceNum = parseFloat(p.price || '0');

                // Map Data - Removed image/file_hash from schema as requested
                // Storing metadata only
                const data = {
                    product_id_linera: p.id,
                    owner: p.author,
                    chain_id: p.authorChainId,
                    name: p.name,
                    description: p.description,
                    price: priceNum,
                    file_name: p.name // Fallback if file_name not in chain
                };

                if (existingList.items.length > 0) {
                    const existing = existingList.items[0];
                    await pb.collection('products').update(existing.id, data);
                } else {
                    await pb.collection('products').create(data);
                    console.log(`✅ Created product ${p.name}`);
                }
            } catch (e) {
                console.error(`❌ Error syncing product ${p.id}:`, e.message);
            }
        }

        // 2. Deletion Sync
        const allPbProducts = await pb.collection('products').getFullList();
        const chainIds = new Set(products.map(p => p.id));

        for (const localProd of allPbProducts) {
            if (!chainIds.has(localProd.product_id_linera)) {
                console.log(`🗑️ Deleting removed product: ${localProd.name}`);
                await pb.collection('products').delete(localProd.id);
            }
        }

    } catch (e) {
        console.error('❌ Error syncing products:', e.message);
    }
}

// Main Indexer
async function start() {
    console.log('🚀 Starting Linera Indexer...');

    // Initial sync
    console.log('📊 Performing initial sync...');
    await syncProfiles();
    await syncDonations();
    await syncProducts();
    console.log('✅ Initial sync complete\n');

    // Setup GraphQL WS subscription
    console.log('🔌 Setting up GraphQL WebSocket subscription...');

    const wsClient = createClient({
        url: LINERA_WS_URL,
        webSocketImpl: WebSocket,
        connectionParams: {
            chainId: LINERA_CHAIN_ID,
            applicationId: LINERA_APP_ID
        },
        on: {
            connected: () => console.log('✅ WebSocket connected'),
            closed: () => console.log('❌ WebSocket closed'),
            error: (err) => console.error('❌ WebSocket error:', err)
        }
    });

    // Subscribe to notifications
    const subscription = `
        subscription {
            notifications(chainId: "${LINERA_CHAIN_ID}")
        }
    `;

    try {
        const unsubscribe = wsClient.subscribe(
            { query: subscription },
            {
                next: async (data) => {
                    console.log('\n🔔 Received notification:', data);
                    console.log('🔄 Syncing data after notification...');
                    await syncProfiles();
                    await syncDonations();
                    await syncProducts();
                },
                error: (err) => {
                    console.error('❌ Subscription error:', err);
                    console.log('⚠️  Falling back to polling mode...');
                    startPolling();
                },
                complete: () => {
                    console.log('✅ Subscription completed');
                }
            }
        );

        console.log('✅ Subscribed to chain notifications');
        console.log('👂 Listening for blockchain events...\n');

    } catch (error) {
        console.error('❌ Failed to setup subscription:', error);
        console.log('⚠️  Falling back to polling mode...');
        startPolling();
    }
}

// Fallback polling function
function startPolling() {
    console.log('🔄 Starting polling mode (every 10 seconds)...');
    setInterval(async () => {
        console.log('\n⏰ Polling...');
        await syncProfiles();
        await syncDonations();
        await syncProducts();
    }, 10000); // Poll every 10 seconds
}

start();
