import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, ShoppingBag } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProductList from './ProductList';
import CreateProductModal from './CreateProductModal';
import OrderFillModal from './OrderFillModal';
import PrivateDataModal from './PrivateDataModal';
import { Product, Purchase } from '../types';
import { pb } from './pocketbase';
import { useLinera } from './LineraProvider';
import { cacheManager } from '../utils/cacheManager';
import RegistrationAlert from './RegistrationAlert';
import { useNavigate } from 'react-router-dom';

interface MarketplaceProps {
    chainId?: string;  // NEW: Chain-based filtering
    currentUserAddress?: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ chainId, currentUserAddress }) => {
    const { ownerId } = useParams<{ ownerId: string }>();
    const { application, accountOwner, autoSignEnabled, subscribeToMyItems, unsubscribeFromMyItems, subscribeToMyPurchases, unsubscribeFromMyPurchases, subscribeToMarketplace, unsubscribeFromMarketplace, subscribeToMyOrders, unsubscribeFromMyOrders } = useLinera();
    const navigate = useNavigate();
    const isMountedRef = useRef(true);
    const instanceId = useRef(Math.random().toString(36).substr(2, 5));

    const [activeTab, setActiveTab] = useState<'BROWSE' | 'MY_ITEMS' | 'PURCHASES'>('BROWSE');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [purchases, setPurchases] = useState<Product[]>([]);
    const [myProducts, setMyProducts] = useState<Product[]>([]);
    const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
    const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
    const [myItemsMode, setMyItemsMode] = useState<'PRODUCTS' | 'ORDERS'>('PRODUCTS');
    const [myOrders, setMyOrders] = useState<Purchase[]>([]);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [hasProfile, setHasProfile] = useState<boolean | null>(null);
    const [showRegistrationAlert, setShowRegistrationAlert] = useState(false);

    // Set initial filter based on URL
    useEffect(() => {
        if (chainId || ownerId) {
            setSearchQuery('');
        }
    }, [chainId, ownerId]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Refs to hold latest fetch functions for subscriptions
    const fetchMyProductsRef = useRef(null as any);
    const fetchPurchasesRef = useRef(null as any);
    const fetchProductsRef = useRef(null as any);
    const fetchMyOrdersRef = useRef(null as any);
    const refreshPocketBaseMetadataRef = useRef(null as any);

    // Subscribe to My Items updates when on MY_ITEMS tab
    useEffect(() => {
        if (activeTab === 'MY_ITEMS' && myItemsMode === 'PRODUCTS') {
            subscribeToMyItems(() => {
                console.log('🔔 [Marketplace] My Items notification received');
                fetchMyProductsRef.current?.(true); // Silent refresh from blockchain

                // After blockchain sync, refresh PocketBase metadata
                // Delay allows indexer time to sync new products
                setTimeout(() => {
                    refreshPocketBaseMetadataRef.current?.();
                }, 100); // Small initial delay before the 2s PB refresh
            });

            return () => {
                unsubscribeFromMyItems();
            };
        }
    }, [activeTab, myItemsMode, subscribeToMyItems, unsubscribeFromMyItems]); // eslint-disable-line react-hooks/exhaustive-deps

    // Subscribe to Purchases updates when on PURCHASES tab
    useEffect(() => {
        if (activeTab === 'PURCHASES') {
            subscribeToMyPurchases(() => {
                console.log('🔔 [Marketplace] Purchases notification received');
                fetchPurchasesRef.current?.(true); // Silent refresh
            });

            return () => {
                unsubscribeFromMyPurchases();
            };
        }
    }, [activeTab, subscribeToMyPurchases, unsubscribeFromMyPurchases]); // eslint-disable-line react-hooks/exhaustive-deps

    // Subscribe to Marketplace updates when on BROWSE tab
    useEffect(() => {
        if (activeTab === 'BROWSE') {
            subscribeToMarketplace(() => {
                console.log('🔔 [Marketplace] Browse notification received');
                fetchProductsRef.current?.(true); // Silent refresh
            });

            return () => {
                unsubscribeFromMarketplace();
            };
        }
    }, [activeTab, subscribeToMarketplace, unsubscribeFromMarketplace]); // eslint-disable-line react-hooks/exhaustive-deps

    // Subscribe to My Orders updates when on MY_ITEMS -> ORDERS mode
    useEffect(() => {
        if (activeTab === 'MY_ITEMS' && myItemsMode === 'ORDERS') {
            subscribeToMyOrders(() => {
                console.log('🔔 [Marketplace] My Orders notification received');
                fetchMyOrdersRef.current?.(true); // Silent refresh
            });

            return () => {
                unsubscribeFromMyOrders();
            };
        }
    }, [activeTab, myItemsMode, subscribeToMyOrders, unsubscribeFromMyOrders]); // eslint-disable-line react-hooks/exhaustive-deps

    // Helper function to refresh PocketBase metadata for current products
    const refreshPocketBaseMetadata = async (delay = 5000, retry = true) => {
        // Wait for indexer to sync
        await new Promise(resolve => setTimeout(resolve, delay));

        if (myProducts.length === 0) return;

        const productIds = myProducts.map(p => p.id);
        const filter = productIds.map(id => `product_id="${id}"`).join('||');

        try {
            console.log('🔄 [MyItems] Refreshing PocketBase metadata...');
            const pbRecords = await pb.collection('products').getFullList({ filter });

            let hasAnyChanges = false;

            // Update products with new metadata
            const updated = myProducts.map(p => {
                const pbProduct = pbRecords.find(r => r.product_id === p.id);
                if (!pbProduct) return p;

                // Only update if metadata changed
                const hasChanges =
                    pbProduct.image_preview !== p.image_preview ||
                    pbProduct.image !== p.image ||
                    !p.pbId;

                if (hasChanges) {
                    hasAnyChanges = true;
                    console.log(`✅ [MyItems] Updated metadata for ${p.name}`);
                    return {
                        ...p,
                        pbId: pbProduct.id,
                        collectionId: pbProduct.collectionId,
                        image: pbProduct.image,
                        image_preview: pbProduct.image_preview,
                        image_preview_hash: pbProduct.image_preview_hash,
                        data_blob_hash: pbProduct.file_hash,
                    };
                }
                return p;
            });

            setMyProducts(updated);

            // Update cache
            const cacheKey = `marketplace_my_items_${accountOwner}`;
            cacheManager.set(cacheKey, updated);

            // If no changes detected and retry enabled, try again after 10s
            if (!hasAnyChanges && retry) {
                console.log('⏳ [MyItems] No changes detected, will retry in 10s...');
                setTimeout(() => {
                    refreshPocketBaseMetadata(0, false); // No delay, no further retry
                }, 10000);
            }
        } catch (err) {
            console.warn('⚠️ [MyItems] Failed to refresh PB metadata:', err);
        }
    };

    // Fetch Products from PocketBase (Browse Tab)
    const fetchProducts = async (silent = false) => {
        const cacheKey = `marketplace_browse_${ownerId || 'all'}`;

        try {
            // 1. Load from cache immediately
            const cached = cacheManager.get<Product[]>(cacheKey);
            if (cached && cached.length > 0) {
                console.log(`📦 [Browse] Loaded ${cached.length} items from cache`);
                if (isMountedRef.current) {
                    setProducts(cached);
                    setIsLoading(false);
                }
            } else {
                if (!silent) setIsLoading(true);
            }

            // 2. Fetch fresh data from PocketBase
            const filter = ownerId ? `owner="${ownerId}"` : '';
            const records = await pb.collection('products').getFullList({
                sort: '-created_at',
                filter: filter,
            });

            const mappedProducts: Product[] = records.map((r: any) => ({
                id: r.product_id,
                pbId: r.id,
                collectionId: r.collectionId,
                name: r.name,
                description: r.description,
                price: r.price,
                image: r.image,
                image_preview: r.image_preview,
                author: r.owner,
                authorAddress: r.owner,
                authorChainId: r.chain_id,
                image_preview_hash: r.image_preview_hash,
                data_blob_hash: r.file_hash,
                publicData: [],
                orderForm: r.order_form || [],
                createdAt: Date.parse(r.created) / 1000
            }));

            // Deduplicate by on-chain ID before comparing with cache
            const uniqueProducts: Product[] = [];
            const seenIds = new Set();
            for (const p of mappedProducts) {
                if (!seenIds.has(p.id)) {
                    uniqueProducts.push(p);
                    seenIds.add(p.id);
                }
            }

            // 3. Update only if different from cache
            const isDifferent = JSON.stringify(uniqueProducts) !== JSON.stringify(cached);
            if (isDifferent || !cached) {
                console.log(`✅ [Browse] Found ${uniqueProducts.length} items (${isDifferent ? 'updated' : 'same'})`);
                if (isMountedRef.current) setProducts(uniqueProducts);
                cacheManager.set(cacheKey, uniqueProducts);
            } else {
                console.log(`✅ [Browse] Data unchanged, using cache`);
            }
        } catch (e) {
            console.error('Error fetching products:', e);
        } finally {
            if (!silent && isMountedRef.current) setIsLoading(false);
        }
    };

    // Update refs whenever functions change
    useEffect(() => {
        fetchMyProductsRef.current = fetchMyProducts;
        fetchPurchasesRef.current = fetchPurchases;
        fetchProductsRef.current = fetchProducts;
        fetchMyOrdersRef.current = fetchMyOrders;
        refreshPocketBaseMetadataRef.current = refreshPocketBaseMetadata;
    });

    const enrichProductsWithMetadata = async (onChainProducts: any[], previousEnriched: Product[] = []): Promise<Product[]> => {
        const productIds = Array.from(new Set(onChainProducts.map((p: any) => p.id)));
        let pbRecords: any[] = [];

        if (productIds.length > 0) {
            const filter = productIds.map(id => `product_id="${id}"`).join('||');
            try {
                pbRecords = await pb.collection('products').getFullList({ filter });
            } catch (err) {
                console.warn('⚠️ [Marketplace] Failed to fetch metadata from PocketBase:', err);
            }
        }

        return onChainProducts.map((p: Product) => {
            const pbProduct = pbRecords.find(r => r.product_id === p.id);
            const prev = previousEnriched.find(item => item.id === p.id);

            return {
                ...p, // Preserve existing flexible fields
                pbId: pbProduct?.id || prev?.pbId,
                collectionId: pbProduct?.collectionId || prev?.collectionId,
                image: pbProduct?.image || prev?.image,
                image_preview: pbProduct?.image_preview || prev?.image_preview,
                image_preview_hash: pbProduct?.image_preview_hash || p.image_preview_hash,
                data_blob_hash: pbProduct?.file_hash || p.data_blob_hash,
            };
        });
    };

    const productMapper = (p: any): Product => {
        const getVal = (list: any[], key: string) => list?.find((k: any) => k.key === key)?.value;
        return {
            id: p.id,
            author: p.author,
            authorAddress: p.author, // Alias for compatibility
            authorChainId: p.authorChainId || p.author_chain_id,
            publicData: p.publicData || [],
            privateData: p.privateData || [],
            orderForm: p.orderForm || [],
            price: p.price,
            createdAt: p.createdAt || p.created_at,
            name: getVal(p.publicData, 'name') || 'Untitled Product',
            description: getVal(p.publicData, 'description') || '',
            image: getVal(p.publicData, 'image_preview_hash') ? undefined : getVal(p.publicData, 'link'),
            image_preview_hash: getVal(p.publicData, 'image_preview_hash'),
            data_blob_hash: getVal(p.privateData, 'data_blob_hash')
        };
    };

    const enrichProductsWithChainBlobs = async (products: Product[]): Promise<Product[]> => {
        const enriched = await Promise.all(products.map(async (p) => {
            const previewHash = p.image_preview_hash;
            let blobUrl = p.image;

            if (previewHash && application && !blobUrl) {
                try {
                    const query = `query { dataBlob(hash: "${previewHash}") }`;
                    const result: any = await application.query(JSON.stringify({ query }));
                    let parsedResult = result;
                    if (typeof result === 'string') parsedResult = JSON.parse(result);

                    const bytes = parsedResult?.data?.dataBlob || parsedResult?.dataBlob;
                    if (bytes && Array.isArray(bytes) && bytes.length > 0) {
                        const uint8 = new Uint8Array(bytes);
                        const blob = new Blob([uint8], { type: 'image/jpeg' });
                        blobUrl = URL.createObjectURL(blob);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to fetch blob for ${p.name}:`, e);
                }
            }
            return { ...p, image: blobUrl };
        }));
        return enriched;
    };

    const fetchMyProducts = async (silent = false) => {
        if (!application || !accountOwner) {
            if (!silent && isMountedRef.current) setIsLoading(false);
            return;
        }

        const cacheKey = `marketplace_my_items_${accountOwner}`;

        try {
            // 1. Load from cache immediately (no spinner if cached)
            const cached = cacheManager.get<Product[]>(cacheKey);
            if (cached && cached.length > 0) {
                console.log(`📦 [MyProducts] Loaded ${cached.length} items from cache`);
                if (isMountedRef.current) {
                    setMyProducts(cached);
                    setIsLoading(false); // No spinner needed
                }
            } else {
                if (!silent) setIsLoading(true);
            }

            // 2. Fetch fresh data in background
            const query = `
                query {
                    productsByAuthorFull(owner: "${accountOwner}") {
                        id
                        author
                        authorChainId
                        publicData { key value }
                        privateData { key value }
                        successMessage
                        price
                        orderForm { key label fieldType required }
                        createdAt
                    }
                }
            `;

            console.log('🔍 [MyProducts] Fetching fresh data...');
            const result: any = await application.query(JSON.stringify({ query }));

            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);

            if (parsedResult.errors) {
                console.error('❌ [MyProducts] GraphQL Errors:', parsedResult.errors);
                return;
            }

            const fetchedProducts = parsedResult?.data?.productsByAuthorFull || [];
            const products = fetchedProducts.map(productMapper);
            const enriched = await enrichProductsWithMetadata(products, cached || []);

            // 3. Update only if different from cache
            const isDifferent = JSON.stringify(enriched) !== JSON.stringify(cached);
            if (isDifferent || !cached) {
                console.log(`✅ [MyProducts] Found ${enriched.length} items (${isDifferent ? 'updated' : 'same'})`);
                if (isMountedRef.current) setMyProducts(enriched);
                cacheManager.set(cacheKey, enriched);
            } else {
                console.log(`✅ [MyProducts] Data unchanged, using cache`);
            }
        } catch (e) {
            console.error('Error fetching my products:', e);
        } finally {
            if (!silent && isMountedRef.current) setIsLoading(false);
        }
    };

    const fetchPurchases = async (silent = false) => {
        if (!application || !accountOwner) {
            if (!silent && isMountedRef.current) setIsLoading(false);
            return;
        }

        const cacheKey = `marketplace_purchases_${accountOwner}`;

        try {
            // 1. Load from cache immediately
            const cached = cacheManager.get<Product[]>(cacheKey);
            if (cached && cached.length > 0) {
                console.log(`📦 [Purchases] Loaded ${cached.length} items from cache`);
                if (isMountedRef.current) {
                    setPurchases(cached);
                    setIsLoading(false);
                }
            } else {
                if (!silent) setIsLoading(true);
            }

            // 2. Fetch fresh data in background
            const query = `
                query {
                    myPurchases(owner: "${accountOwner}") {
                        id
                        productId
                        amount
                        timestamp
                        orderData { key value }
                        product {
                            id
                            author
                            authorChainId
                            publicData { key value }
                            privateData { key value }
                            successMessage
                            price
                            createdAt
                            orderForm { key label fieldType required }
                        }
                    }
                }
            `;

            console.log('🛍️ [Purchases] Fetching fresh data...');
            const result: any = await application.query(JSON.stringify({ query }));

            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);


            const fetchedPurchases = parsedResult?.data?.myPurchases || [];
            const products: Product[] = fetchedPurchases.map((pur: any) => {
                const p = productMapper(pur.product);
                p.successMessage = pur.product.successMessage;
                return p;
            });
            const uniqueProducts = Array.from(new Map(products.map(item => [item.id, item])).values());
            const enriched = await enrichProductsWithChainBlobs(uniqueProducts);

            // 3. Update only if different from cache
            const isDifferent = JSON.stringify(enriched) !== JSON.stringify(cached);
            if (isDifferent || !cached) {
                console.log(`✅ [Purchases] Found ${enriched.length} items (${isDifferent ? 'updated' : 'same'})`);
                if (isMountedRef.current) setPurchases(enriched);
                cacheManager.set(cacheKey, enriched);
            } else {
                console.log(`✅ [Purchases] Data unchanged, using cache`);
            }
        } catch (e) {
            console.error('Error fetching purchases:', e);
        } finally {
            if (!silent && isMountedRef.current) setIsLoading(false);
        }
    };

    const fetchMyOrders = async (silent = false) => {
        if (!application || !accountOwner) return;

        try {
            if (!silent) setIsLoading(true);
            if (isMountedRef.current) setMyOrders([]);

            const query = `
                query {
                    myOrders(owner: "${accountOwner}") {
                        id
                        productId
                        amount
                        timestamp
                        buyer
                        buyerChainId
                        sellerChainId
                        orderData { key value }
                        product {
                            id
                            author
                            authorChainId
                            publicData { key value }
                            privateData { key value }
                            successMessage
                            price
                            createdAt
                            orderForm { key label fieldType required }
                        }
                    }
                }
            `;

            const result: any = await application.query(JSON.stringify({ query }));
            console.log('📦 [My Orders] Result:', result);
            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);

            const fetchedOrders = parsedResult?.data?.myOrders || [];
            const orders: Purchase[] = fetchedOrders.map((pur: any) => {
                const p = productMapper(pur.product);
                return {
                    ...pur,
                    orderData: pur.orderData || [],
                    product: p
                };
            });

            if (isMountedRef.current) setMyOrders(orders);
        } catch (e) {
            console.error('Error fetching my orders:', e);
        } finally {
            if (!silent && isMountedRef.current) setIsLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            console.log('🔄 [Marketplace] Effect triggered. ActiveTab:', activeTab);

            // Check cache to determine if we should do silent fetch
            let hasCache = false;
            if (activeTab === 'BROWSE') {
                const cacheKey = `marketplace_browse_${ownerId || 'all'}`;
                hasCache = !!cacheManager.get(cacheKey);
            } else if (activeTab === 'MY_ITEMS' && accountOwner) {
                const cacheKey = `marketplace_my_items_${accountOwner}`;
                hasCache = !!cacheManager.get(cacheKey);
            } else if (activeTab === 'PURCHASES' && accountOwner) {
                const cacheKey = `marketplace_purchases_${accountOwner}`;
                hasCache = !!cacheManager.get(cacheKey);
            }

            // Silent if we have cache or data already loaded
            const silent = hasCache || products.length > 0 || (activeTab === 'PURCHASES' && purchases.length > 0);

            if (!silent) {
                console.log('⌛ [Marketplace] No cache found, will show loading');
            } else {
                console.log('📦 [Marketplace] Cache exists or data loaded, silent fetch');
            }

            if (activeTab === 'BROWSE') await fetchProducts(silent);
            else if (activeTab === 'MY_ITEMS') {
                if (myItemsMode === 'PRODUCTS') await fetchMyProducts(silent);
                else await fetchMyOrders(silent);
            }
            else if (activeTab === 'PURCHASES') await fetchPurchases(silent);
        };
        init();
    }, [activeTab, application, accountOwner, myItemsMode]);

    // ... Event handlers (handleBuy, handleEdit, handleDelete, handleDownload) ...
    // Note: Kept simplified for brevity in this replacement, assume they exist or are similar to previous

    // State moved to top

    // ... [existing useEffects] ...

    // Handle create product button - check registration first
    const handleCreateProduct = async () => {
        // Check if user has profile
        const hasReg = await checkProfile();
        if (!hasReg) {
            setShowRegistrationAlert(true);
            return;
        }
        setIsCreateModalOpen(true);
    };

    // Check if user has profile
    const checkProfile = async (): Promise<boolean> => {
        if (!application || !accountOwner) return false;

        try {
            const query = `query { profile(owner: "${accountOwner}") { name } }`;
            const result: any = await application.query(JSON.stringify({ query }));
            let data = result;
            if (typeof result === 'string') data = JSON.parse(result);

            const profileData = data?.data?.profile || data?.profile;
            const exists = !!(profileData && profileData.name);
            setHasProfile(exists);
            return exists;
        } catch (error) {
            setHasProfile(false);
            return false;
        }
    };

    // Check profile on mount and when accountOwner changes
    useEffect(() => {
        if (accountOwner && application) {
            checkProfile();
        }
    }, [accountOwner, application]);

    const formatKv = (list: { key: string; value: string }[]) => {
        return list.map(item => `{ key: "${item.key}", value: "${item.value}" }`).join(', ');
    };

    const performPurchase = async (product: Product, orderData: { key: string; value: string }[]) => {
        if (!application || !accountOwner) {
            alert('Please connect your wallet first.');
            return;
        }

        // Check if user has profile
        const hasReg = await checkProfile();
        if (!hasReg) {
            setShowRegistrationAlert(true);
            return;
        }

        try {
            const targetAccountStr = `{ chainId: "${product.authorChainId}", owner: "${product.author}" }`;
            const orderDataStr = `[${formatKv(orderData)}]`;

            const mutation = `
                mutation {
                    transferToBuy(
                        owner: "${accountOwner}",
                        productId: "${product.id}",
                        amount: "${product.price}",
                        targetAccount: ${targetAccountStr},
                        orderData: ${orderDataStr}
                    )
                }
            `;

            console.log('💸 [Buying] Mutation:', mutation);
            // For user-initiated mutations, use MetaMask owner (not autosigner)
            const result: any = await application.query(JSON.stringify({ query: mutation }), { owner: accountOwner });
            console.log('💸 [Buying] Result:', result);

            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);

            if (parsedResult.errors) {
                console.error('❌ [Buying] Errors:', parsedResult.errors);
                alert('Purchase failed: ' + parsedResult.errors[0].message);
            } else {
                // Products will stay visible - no need to refresh or alert
            }
        } catch (e) {
            console.error('Purchase error:', e);
            alert('Purchase failed. Check console.');
        } finally {
            setBuyingProduct(null);
        }
    };

    const handleBuy = async (product: Product) => {
        if (product.orderForm && product.orderForm.length > 0) {
            setBuyingProduct(product);
        } else {
            performPurchase(product, []);
        }
    };

    const handleOrderSubmit = (data: { key: string; value: string }[]) => {
        if (buyingProduct) {
            performPurchase(buyingProduct, data);
        }
    };

    const handleDelete = async (product: Product) => {
        if (!application || !accountOwner) return;

        // Check if user has profile
        const hasReg = await checkProfile();
        if (!hasReg) {
            setShowRegistrationAlert(true);
            return;
        }

        try {
            setDeletingIds(prev => new Set(prev).add(product.id));
            const mutation = `mutation { deleteProduct(productId: "${product.id}") }`;
            // For user-initiated mutations, use MetaMask owner
            await application.query(JSON.stringify({ query: mutation }), { owner: accountOwner });
            if (activeTab === 'MY_ITEMS') fetchMyProducts(true);
        } catch (e) {
            console.error(e);
            alert('Failed to delete');
        } finally {
            setDeletingIds(prev => {
                const next = new Set(prev);
                next.delete(product.id);
                return next;
            });
        }
    };

    const handleDownload = async (product: Product) => {
        if (!application) return;
        let blobHash = product.data_blob_hash;

        // Smart detecting of blob hash if not explicitly set
        if (!blobHash && product.privateData) {
            const fileEntry = product.privateData.find(kv => {
                const k = kv.key.toLowerCase();
                const v = kv.value;
                // Check if value is a 64-char hex string (SHA256 hash)
                const isHash = /^[a-f0-9]{64}$/i.test(v);
                return (k.includes('file') || isHash);
            });
            if (fileEntry) {
                blobHash = fileEntry.value;
                console.log(`📥 [Download] Found implicit blob hash in key '${fileEntry.key}'`);
            }
        }

        if (!blobHash) {
            alert('No file available for download.');
            return;
        }

        try {
            console.log(`📥 [Download] Fetching blob ${blobHash.substring(0, 8)}...`);
            const query = `query { dataBlob(hash: "${blobHash}") }`;
            const result: any = await application.query(JSON.stringify({ query }));

            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);

            const bytes = parsedResult?.data?.dataBlob || parsedResult?.dataBlob;
            if (bytes && Array.isArray(bytes) && bytes.length > 0) {
                const uint8 = new Uint8Array(bytes);
                // Detect file type from magic bytes
                const getFileType = (data: Uint8Array) => {
                    const header = Array.from(data.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
                    if (header.startsWith('89504E47')) return { mime: 'image/png', ext: 'png' };
                    if (header.startsWith('FFD8FF')) return { mime: 'image/jpeg', ext: 'jpg' };
                    if (header.startsWith('25504446')) return { mime: 'application/pdf', ext: 'pdf' };
                    if (header.startsWith('504B0304')) return { mime: 'application/zip', ext: 'zip' };
                    if (header.startsWith('47494638')) return { mime: 'image/gif', ext: 'gif' };
                    return { mime: 'application/octet-stream', ext: 'bin' };
                };

                const { mime, ext } = getFileType(uint8);
                console.log(`📥 [Download] Detected file type: ${mime} (.${ext})`);

                const blob = new Blob([uint8], { type: mime });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;

                // Smart filename: use provided name or generate based on product name + detected ext
                // If provided name is just '.bin', replace it.
                let fileName = product.privateData?.find(k => k.key === 'fileName')?.value;
                if (!fileName) {
                    fileName = `${product.name.replace(/\s+/g, '_')}.${ext}`;
                } else if (!fileName.includes('.') || fileName.endsWith('.bin')) {
                    // If existing name has no ext or is .bin, accept our detection
                    const base = fileName.includes('.') ? fileName.split('.')[0] : fileName;
                    fileName = `${base}.${ext}`;
                }

                a.download = fileName;

                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                alert('File content not found on chain.');
            }
        } catch (e) {
            console.error('Download failed:', e);
            alert('Download failed');
        }
    };

    const handleView = async (product: Product) => {
        setViewingProduct(product);
        return null;
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 md:p-8 min-h-screen font-mono">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                {ownerId ? (
                    <div className="flex items-center gap-4">
                        {/* Back Button */}
                        <button
                            onClick={() => navigate('/marketplace')}
                            className="p-3 bg-deep-black text-white hover:bg-linera-red transition-colors border-2 border-deep-black shadow-hard hover:shadow-hard-hover"
                            title="Back to Marketplace"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </button>

                        <div className="flex flex-col justify-center">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Store View</span>
                            <div className="font-black text-xl md:text-2xl break-all uppercase border-b-4 border-linera-red inline-block pb-1">
                                {ownerId.substring(0, 8)}...{ownerId.substring(ownerId.length - 6)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex bg-white border-2 border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-1">
                        <button
                            onClick={() => setActiveTab('BROWSE')}
                            className={`px-4 py-2 font-bold uppercase transition-all ${activeTab === 'BROWSE' ? 'bg-deep-black text-white' : 'hover:bg-gray-100 text-deep-black'}`}
                        >
                            Marketplace
                        </button>
                        <button
                            onClick={() => setActiveTab('MY_ITEMS')}
                            className={`px-4 py-2 font-bold uppercase transition-all ${activeTab === 'MY_ITEMS' ? 'bg-deep-black text-white' : 'hover:bg-gray-100 text-deep-black'}`}
                        >
                            My Items
                        </button>
                        <button
                            onClick={() => setActiveTab('PURCHASES')}
                            className={`px-4 py-2 font-bold uppercase transition-all ${activeTab === 'PURCHASES' ? 'bg-deep-black text-white' : 'hover:bg-gray-100 text-deep-black'}`}
                        >
                            Purchases
                        </button>
                    </div>
                )}

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <input
                            type="text"
                            placeholder="SEARCH ITEMS..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border-2 border-deep-black py-2 pl-3 pr-10 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow uppercase placeholder-gray-400"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-deep-black" />
                    </div>
                </div>
            </div>

            {/* List */}
            {activeTab === 'MY_ITEMS' && (
                <div className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                    {/* Mode Toggle */}
                    <div className="flex bg-gray-100 p-1 border-2 border-deep-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <button
                            onClick={() => setMyItemsMode('PRODUCTS')}
                            className={`px-4 py-1 font-bold uppercase text-sm transition-all ${myItemsMode === 'PRODUCTS' ? 'bg-deep-black text-white' : 'text-gray-500 hover:text-black'}`}
                        >
                            Products
                        </button>
                        <button
                            onClick={() => setMyItemsMode('ORDERS')}
                            className={`px-4 py-1 font-bold uppercase text-sm transition-all ${myItemsMode === 'ORDERS' ? 'bg-deep-black text-white' : 'text-gray-500 hover:text-black'}`}
                        >
                            Orders
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        {autoSignEnabled && (
                            <div className="flex items-center gap-2 text-green-600 text-sm font-bold uppercase px-4 py-2 bg-green-100 border-2 border-deep-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Auto-Sync Active
                            </div>
                        )}

                        {myItemsMode === 'PRODUCTS' && (
                            <button
                                onClick={handleCreateProduct}
                                className="bg-linera-red text-white px-6 py-3 font-bold uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all flex items-center gap-2 border-2 border-deep-black"
                            >
                                <Plus className="w-5 h-5" /> List New Item
                            </button>
                        )}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-deep-black border-t-linera-red rounded-full animate-spin"></div>
                    <p className="font-bold uppercase animate-pulse">Loading Marketplace...</p>
                </div>
            ) : (
                activeTab === 'MY_ITEMS' && myItemsMode === 'ORDERS' ? (
                    <div className="space-y-6">
                        {myOrders.length === 0 ? (
                            <div className="text-center py-20 bg-gray-50 border-2 border-dashed border-gray-300">
                                <p className="text-gray-500 font-bold uppercase">No orders received yet</p>
                            </div>
                        ) : (
                            myOrders.map((order) => (
                                <div key={order.id} className="bg-white border-2 border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 transition-all hover:translate-y-[-2px]">
                                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-4 border-b-2 border-gray-100 pb-4">
                                        <div>
                                            <h3 className="font-bold text-xl uppercase mb-1">{order.product.name}</h3>
                                            <p className="text-sm text-gray-500 font-mono">
                                                Order ID: {order.id}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-xl text-linera-red">{order.amount} TLIN</div>
                                            <div className="text-xs text-gray-400 font-mono">
                                                {new Date(order.timestamp / 1000).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-gray-50 p-4 border border-gray-200">
                                            <h4 className="font-bold uppercase text-xs text-gray-500 mb-2">Buyer Details</h4>
                                            <div className="font-mono text-sm break-all">
                                                <span className="text-gray-400">Owner:</span> {order.buyer}
                                                <br />
                                                <span className="text-gray-400">Chain:</span> {order.buyerChainId}
                                            </div>
                                        </div>

                                        <div className="bg-blue-50 p-4 border border-blue-100">
                                            <h4 className="font-bold uppercase text-xs text-blue-500 mb-2">Order Data</h4>
                                            {order.orderData.length > 0 ? (
                                                <div className="space-y-2">
                                                    {order.orderData.map((field, idx) => (
                                                        <div key={idx} className="flex flex-col">
                                                            <span className="text-xs font-bold uppercase text-gray-500">{field.key}</span>
                                                            <span className="font-mono text-sm">{field.value}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-gray-400 italic">No additional data submitted</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <ProductList
                        products={
                            activeTab === 'BROWSE' ? products :
                                activeTab === 'MY_ITEMS' ? myProducts :
                                    purchases
                        }
                        currentUserAddress={currentUserAddress}
                        activeTab={activeTab}
                        onBuy={handleBuy}
                        onEdit={(p) => { setEditingProduct(p); setIsCreateModalOpen(true); }}
                        onDelete={handleDelete}
                        onDownload={handleDownload}
                        onView={handleView}
                        deletingIds={deletingIds}
                    />
                )
            )}

            {/* Modals */}
            {isCreateModalOpen && (
                <CreateProductModal
                    onClose={() => {
                        setIsCreateModalOpen(false);
                        setEditingProduct(null);
                    }}
                    onCreate={() => {
                        fetchMyProducts(true);
                    }}
                    initialData={editingProduct || undefined}
                />
            )}

            {buyingProduct && (
                <OrderFillModal
                    product={buyingProduct}
                    onClose={() => setBuyingProduct(null)}
                    onSubmit={handleOrderSubmit}
                />
            )}

            {viewingProduct && (
                <PrivateDataModal
                    product={viewingProduct}
                    onClose={() => setViewingProduct(null)}
                />
            )}

            {/* Registration Alert Modal */}
            {showRegistrationAlert && (
                <RegistrationAlert
                    onClose={() => setShowRegistrationAlert(false)}
                    onInitialize={() => {
                        setShowRegistrationAlert(false);
                        navigate('/profile');
                    }}
                />
            )}
        </div >
    );
};

export default Marketplace;
