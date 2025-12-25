import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load configuration from .env if available
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('📝 Loaded configuration from .env');
}

// Configuration
const LINERA_CHAIN_ID = process.env.VITE_LINERA_MAIN_CHAIN_ID || 'fcc99b4e4c6be2f33864d71de61acb33c0f692c397a32b6d64578cf0c82f7faa';
const LINERA_APP_ID = process.env.VITE_LINERA_APPLICATION_ID || 'a205b6233965c4d98d9f36dd11e1ff10693a864eb9d53d800b8cd463996d50b6';
const LINERA_NODE_URL = `http://localhost:7071`;
const LINERA_WS_URL = `ws://localhost:7071/ws`;
const POCKETBASE_URL = 'http://127.0.0.1:8090';

console.log(`🚀 Config: Chain=${LINERA_CHAIN_ID.substring(0, 8)}, App=${LINERA_APP_ID.substring(0, 8)}`);

// Initialize PocketBase
const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

// Sync status
let isSyncing = false;
let pendingSync = false;

async function fetchGraphQL(query, variables = {}) {
    const url = `${LINERA_NODE_URL}/chains/${LINERA_CHAIN_ID}/applications/${LINERA_APP_ID}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            console.error(`❌ HTTP Error: ${response.status}`);
            return { errors: [{ message: `HTTP Error ${response.status}` }] };
        }

        const result = await response.json();
        if (result.errors) {
            console.error(`❌ GraphQL Errors:`, JSON.stringify(result.errors, null, 2));
        }
        return result;
    } catch (e) {
        console.error(`❌ Fetch Exception:`, e.message);
        return { errors: [{ message: e.message }] };
    }
}

async function syncProfiles() {
    console.log('Syncing profiles...');
    const query = `query {
        allProfilesView {
            owner
            chainId
            name
            bio
            socials { name, url }
            avatarHash
            headerHash
        }
    }`;
    try {
        const result = await fetchGraphQL(query);
        if (!result.data) {
            console.error('❌ [Profiles] Skip sync: No data returned from chain');
            return;
        }
        const profiles = result.data.allProfilesView || [];
        console.log(`📊 [Profiles] Found ${profiles.length} profiles on chain`);

        for (const p of profiles) {
            try {
                const existing = await pb.collection('profiles').getFirstListItem(`owner="${p.owner}"`).catch(() => null);

                // Prepare FormData for file upload support
                const data = new FormData();
                data.append('chain_id', p.chainId);
                data.append('name', p.name);
                data.append('bio', p.bio);
                data.append('socials', JSON.stringify(p.socials));
                data.append('avatar_hash', p.avatarHash || '');
                data.append('header_hash', p.headerHash || '');
                if (!existing) {
                    data.append('owner', p.owner);
                }

                // Avatar Processing
                if (p.avatarHash) {
                    const hasAvatar = existing && existing.avatar_file;
                    const hashDiff = existing && existing.avatar_hash !== p.avatarHash;

                    if (!hasAvatar || hashDiff) {
                        console.log(`🖼️  [SYNC] Fetching avatar blob ${p.avatarHash.substring(0, 8)} for ${p.name}...`);
                        const blobQuery = `query { dataBlob(hash: "${p.avatarHash}") }`;
                        const blobRes = await fetchGraphQL(blobQuery);
                        const bytes = blobRes.data?.dataBlob;

                        if (bytes && bytes.length > 0) {
                            const imageBlob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }); // Defaulting to jpeg, PB handles detection
                            data.append('avatar_file', imageBlob, `avatar_${p.owner}.jpg`);
                        }
                    }
                }

                // Header Processing
                if (p.headerHash) {
                    const hasHeader = existing && existing.header_file;
                    const hashDiff = existing && existing.header_hash !== p.headerHash;

                    if (!hasHeader || hashDiff) {
                        console.log(`🖼️  [SYNC] Fetching header blob ${p.headerHash.substring(0, 8)} for ${p.name}...`);
                        const blobQuery = `query { dataBlob(hash: "${p.headerHash}") }`;
                        const blobRes = await fetchGraphQL(blobQuery);
                        const bytes = blobRes.data?.dataBlob;

                        if (bytes && bytes.length > 0) {
                            const imageBlob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
                            data.append('header_file', imageBlob, `header_${p.owner}.jpg`);
                        }
                    }
                }

                if (existing) {
                    await pb.collection('profiles').update(existing.id, data);
                    console.log(`✅ Updated profile for ${p.owner}`);
                } else {
                    await pb.collection('profiles').create(data);
                    console.log(`✅ Created profile for ${p.owner}`);
                }
            } catch (e) {
                console.error(`❌ Error processing profile ${p.owner}:`, e.message);
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
            id, from, to, amount, message, timestamp, sourceChainId, toChainId
        }
    }`;
    try {
        const result = await fetchGraphQL(query);
        if (!result.data) {
            console.error('❌ [Donations] Skip sync: No data returned from chain');
            return;
        }
        const donations = result.data.allDonations || [];
        console.log(`📊 [Donations] Found ${donations.length} donations on chain`);

        for (const d of donations) {
            try {
                const amountStr = String(d.amount).replace(/\.$/, '');
                const amount = parseFloat(amountStr) || 0;

                const existing = await pb.collection('donations').getList(1, 1, {
                    filter: `from_owner="${d.from}" && to_owner="${d.to}" && timestamp="${d.timestamp}" && amount=${amount}`
                });

                if (existing.items.length === 0) {
                    await pb.collection('donations').create({
                        from_owner: d.from,
                        to_owner: d.to,
                        amount: amount,
                        message: d.message,
                        timestamp: d.timestamp,
                        source_chain_id: d.sourceChainId,
                        to_chain_id: d.toChainId
                    });
                    console.log(`✅ Created donation: ${amount} from ${d.from} to ${d.to}`);
                } else {
                    const rec = existing.items[0];
                    if (!rec.source_chain_id && d.sourceChainId || !rec.to_chain_id && d.toChainId) {
                        await pb.collection('donations').update(rec.id, {
                            source_chain_id: d.sourceChainId,
                            to_chain_id: d.toChainId
                        });
                        console.log(`🔄 Updated donation chain info: ${rec.id}`);
                    }
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
            id, author, authorChainId, publicData { key value }, price, orderForm { key label fieldType required }
        }
    }`;

    try {
        const result = await fetchGraphQL(query);
        if (!result.data) {
            console.error('❌ [Products] Skip sync: No data returned from chain');
            return;
        }
        const products = result.data.allProducts || [];
        console.log(`📊 [Products] Found ${products.length} products on chain`);

        for (const p of products) {
            try {
                // Parse Public Data
                const getVal = (key) => p.publicData.find(k => k.key === key)?.value || '';
                const name = getVal('name');
                let description = getVal('description');
                if (description) description = description.replace(/\\n/g, '\n'); // Fix escaped newlines
                const imageHash = getVal('image_preview_hash');
                const type = getVal('type');
                const category = getVal('category');
                const orderForm = p.orderForm || [];

                // Note: file_hash is typically private, but if exposed in publicData we can map it.
                // Otherwise it will be empty in public index.
                const fileHash = getVal('data_blob_hash');

                // Find and deduplicate
                const duplicates = await pb.collection('products').getFullList({
                    filter: `product_id="${p.id}"`,
                    sort: '-created_at'
                });

                const priceNum = parseFloat(p.price || '0');
                const existing = duplicates.length > 0 ? duplicates[0] : null;

                if (duplicates.length > 1) {
                    console.warn(`🧹 [SYNC] Found ${duplicates.length} records for product ${p.id}. Cleaning up...`);
                    for (let i = 1; i < duplicates.length; i++) {
                        try { await pb.collection('products').delete(duplicates[i].id); } catch (e) { }
                    }
                }

                const data = new FormData();
                data.append('product_id', p.id);
                data.append('owner', p.author);
                data.append('chain_id', p.authorChainId);
                data.append('name', name);
                data.append('description', description);
                data.append('price', priceNum);
                data.append('file_name', name);
                data.append('image_preview_hash', imageHash);
                data.append('file_hash', fileHash);
                data.append('type', type);
                data.append('category', category);
                data.append('order_form', JSON.stringify(orderForm));

                // Image Sync
                if (imageHash) {
                    const hasImage = existing && existing.image_preview;
                    const hashDiff = existing && existing.image_preview_hash !== imageHash;

                    if (!hasImage || hashDiff) {
                        console.log(`🖼️  [SYNC] Fetching blob ${imageHash.substring(0, 8)} for ${name}...`);
                        const blobQuery = `query { dataBlob(hash: "${imageHash}") }`;
                        const blobRes = await fetchGraphQL(blobQuery);
                        const bytes = blobRes.data?.dataBlob;

                        if (bytes && bytes.length > 0) {
                            const imageBlob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
                            data.append('image_preview', imageBlob, `preview_${p.id}.jpg`);
                        }
                    }
                }

                if (existing) {
                    await pb.collection('products').update(existing.id, data);
                } else {
                    await pb.collection('products').create(data);
                    console.log(`✅ [SYNC] Created product: ${p.id.substring(0, 8)}... (${name})`);
                }
            } catch (e) {
                console.error(`❌ [SYNC] Error for product ${p.id}:`, e.message);
            }
        }

        // Deletion (Cleanup products that are no longer on chain)
        const pbProducts = await pb.collection('products').getFullList({
            sort: '-created_at'
        });
        const chainIds = new Set(products.map(p => p.id));
        for (const local of pbProducts) {
            if (!chainIds.has(local.product_id)) {
                console.log(`🗑️  [SYNC] Deleting removed product: ${local.name} (${local.product_id})`);
                try {
                    await pb.collection('products').delete(local.id);
                } catch (err) {
                    console.error(`❌ Failed to delete orphan ${local.id}:`, err.message);
                }
            }
        }
    } catch (e) {
        console.error('❌ Error syncing products:', e.message);
    }
}

async function syncSubscriptions() {
    console.log('Syncing subscriptions...');
    const query = `query {
        allSubscriptionPrices {
            author
            price
            description
        }
    }`;

    try {
        const result = await fetchGraphQL(query);
        if (!result.data) {
            console.error('❗ [Subscriptions] Skip sync: No data returned from chain');
            return;
        }
        const subscriptions = result.data.allSubscriptionPrices || [];
        console.log(`📊 [Subscriptions] Found ${subscriptions.length} subscription offers on chain`);

        for (const sub of subscriptions) {
            try {
                const priceNum = parseFloat(sub.price || '0');

                const existing = await pb.collection('author_subscriptions').getFirstListItem(
                    `author="${sub.author}"`
                ).catch(() => null);

                if (existing) {
                    await pb.collection('author_subscriptions').update(existing.id, {
                        price: priceNum,
                        description: sub.description,
                        author_chain_id: LINERA_CHAIN_ID  // Use main chain for now
                    });
                    console.log(`✅ Updated subscription for ${sub.author}`);
                } else {
                    await pb.collection('author_subscriptions').create({
                        author: sub.author,
                        price: priceNum,
                        description: sub.description,
                        author_chain_id: LINERA_CHAIN_ID
                    });
                    console.log(`✅ Created subscription for ${sub.author}`);
                }
            } catch (e) {
                console.error('❗ Error processing subscription:', e.message);
            }
        }

        // Cleanup: Remove subscriptions that are no longer on chain
        const pbSubs = await pb.collection('author_subscriptions').getFullList();
        const chainAuthors = new Set(subscriptions.map(s => s.author));
        for (const local of pbSubs) {
            if (!chainAuthors.has(local.author)) {
                console.log(`🗑️  [SYNC] Deleting removed subscription: ${local.author}`);
                try {
                    await pb.collection('author_subscriptions').delete(local.id);
                } catch (err) {
                    console.error(`❗ Failed to delete subscription ${local.id}:`, err.message);
                }
            }
        }
    } catch (e) {
        console.error('❗ Error syncing subscriptions:', e.message);
    }
}

async function performSync() {
    if (isSyncing) {
        pendingSync = true;
        console.log('⏳ Sync in progress, queued...');
        return;
    }

    isSyncing = true;
    console.log('\n🔄 [LOCK] Starting sync...');
    try {
        await syncProfiles();
        await syncDonations();
        await syncProducts();
        await syncSubscriptions();
        console.log('✅ [LOCK] Sync complete');
    } catch (e) {
        console.error('❌ [LOCK] Sync failed:', e.message);
    } finally {
        isSyncing = false;
        if (pendingSync) {
            pendingSync = false;
            setTimeout(performSync, 500);
        }
    }
}

async function start() {
    console.log('🚀 Starting Linera Indexer...');
    await performSync();

    const wsClient = createClient({
        url: LINERA_WS_URL,
        webSocketImpl: WebSocket,
        connectionParams: { chainId: LINERA_CHAIN_ID, applicationId: LINERA_APP_ID },
        on: {
            connected: () => console.log('✅ WebSocket connected'),
            error: (err) => console.error('❌ WebSocket error:', err)
        }
    });

    const subscription = `subscription { notifications(chainId: "${LINERA_CHAIN_ID}") }`;

    wsClient.subscribe(
        { query: subscription },
        {
            next: () => {
                console.log('\n🔔 [NOTIFY] Notification received');
                performSync();
            },
            error: (err) => {
                console.error('❌ Subscription error:', err);
                startPolling();
            },
            complete: () => console.log('✅ Subscription complete')
        }
    );
}

function startPolling() {
    console.log('🔄 Polling mode (10s)...');
    setInterval(performSync, 10000);
}

start();
