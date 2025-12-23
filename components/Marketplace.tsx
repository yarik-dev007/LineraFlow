import React, { useState, useEffect } from 'react';
import { Plus, Search, ShoppingBag } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProductList from './ProductList';
import CreateProductModal from './CreateProductModal';
import { Product, Purchase } from '../types';
import { pb } from './pocketbase';
import { useLinera } from './LineraProvider';

interface MarketplaceProps {
    currentUserAddress?: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ currentUserAddress }) => {
    const { ownerId } = useParams<{ ownerId: string }>();
    const { application, accountOwner } = useLinera();

    const [activeTab, setActiveTab] = useState<'BROWSE' | 'MY_ITEMS' | 'PURCHASES'>('BROWSE');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [purchases, setPurchases] = useState<Product[]>([]);
    const [myProducts, setMyProducts] = useState<Product[]>([]);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Set initial filter based on URL
    useEffect(() => {
        if (ownerId) {
            setSearchQuery('');
        }
    }, [ownerId]);

    // Fetch Products from PocketBase
    const fetchProducts = async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            const records = await pb.collection('products').getFullList({
                sort: '-created_at',
            });

            const mappedProducts: Product[] = records.map((r: any) => ({
                id: r.product_id, // Use on-chain ID
                pbId: r.id, // PocketBase Record ID
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
                data_blob_hash: r.file_hash // Map PocketBase file_hash to data_blob_hash
            }));

            // Deduplicate by on-chain ID (keep the first one encountered which is the latest due to sort)
            const uniqueProducts: Product[] = [];
            const seenIds = new Set();

            for (const p of mappedProducts) {
                if (!seenIds.has(p.id)) {
                    uniqueProducts.push(p);
                    seenIds.add(p.id);
                }
            }

            setProducts(uniqueProducts);
        } catch (e) {
            console.error('Error fetching products:', e);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const enrichProductsWithMetadata = async (onChainProducts: any[]): Promise<Product[]> => {
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

        return onChainProducts.map((p: any) => {
            const pbProduct = pbRecords.find(r => r.product_id === p.id);
            return {
                id: p.id,
                pbId: pbProduct?.id,
                collectionId: pbProduct?.collectionId,
                name: p.name,
                description: p.description,
                price: parseFloat(p.price || '0'),
                author: p.author,
                authorAddress: p.author,
                authorChainId: p.authorChainId,
                image: p.link,
                image_preview: pbProduct?.image_preview,
                image_preview_hash: p.imagePreviewHash || p.image_preview_hash,
                data_blob_hash: p.dataBlobHash || p.data_blob_hash,
            };
        });
    };

    const fetchMyProducts = async (silent = false) => {
        if (!application || !accountOwner) return;

        try {
            if (!silent) setIsLoading(true);
            console.log('👷 [My Items] Fetching from chain for:', accountOwner);
            const query = `query {
                productsByAuthor(owner: "${accountOwner}") {
                    id, author, authorChainId, name, description, price, imagePreviewHash, dataBlobHash
                }
            }`;

            const result: any = await application.query(JSON.stringify({ query }));
            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);

            const rawProducts = parsedResult?.data?.productsByAuthor || parsedResult?.productsByAuthor || [];
            console.log(`📊 [My Items] Found ${rawProducts.length} products on chain`);

            const enriched = await enrichProductsWithMetadata(rawProducts);
            setMyProducts(enriched);
        } catch (e) {
            console.error('Error fetching my products:', e);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const fetchPurchases = async (silent = false) => {
        if (!application || !accountOwner) return;

        try {
            if (!silent) setIsLoading(true);
            console.log('🔗 [Purchases] Fetching from chain for:', accountOwner);
            const query = `query {
                myPurchases(owner: "${accountOwner}") {
                    id, product { id, author, authorChainId, name, description, price, imagePreviewHash, dataBlobHash }
                }
            }`;

            const result: any = await application.query(JSON.stringify({ query }));
            let parsedResult = result;
            if (typeof result === 'string') parsedResult = JSON.parse(result);

            const rawPurchases = parsedResult?.data?.myPurchases || parsedResult?.myPurchases || [];
            const onChainProducts = rawPurchases.map((pur: any) => pur.product);

            const enriched = await enrichProductsWithMetadata(onChainProducts);
            setPurchases(enriched);
        } catch (e) {
            console.error('Error fetching purchases:', e);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            // Only show loader if we have NO data yet
            const hasNoProducts = products.length === 0;
            const hasNoPurchases = activeTab === 'PURCHASES' && purchases.length === 0;
            const hasNoMyItems = activeTab === 'MY_ITEMS' && myProducts.length === 0;

            const silent = !hasNoProducts && !hasNoPurchases && !hasNoMyItems;

            if (!silent) setIsLoading(true);
            await fetchProducts(true);
            if (activeTab === 'PURCHASES') {
                await fetchPurchases(true);
            } else if (activeTab === 'MY_ITEMS') {
                await fetchMyProducts(true);
            }
            if (!silent) setIsLoading(false);
        };
        init();
    }, [ownerId, activeTab, application, accountOwner]);

    const handleCreateProduct = (data: { name: string; description: string; price: string; image?: string; fileHash?: string; fileName?: string }) => {
        setIsCreateModalOpen(false);
        setEditingProduct(null);
        // Refresh after a delay to allow indexer to sync
        setTimeout(() => {
            if (activeTab === 'MY_ITEMS') fetchMyProducts(true);
            else fetchProducts(true);
        }, 2000);
    };

    const handleDeleteProduct = async (product: Product) => {
        if (!application || !accountOwner) return;

        if (window.confirm(`Delete "${product.name}"? This will remove it from the blockchain.`)) {
            try {
                setIsLoading(true);
                const mutation = `
                    mutation {
                        deleteProduct(productId: "${product.id}")
                    }
                `;
                console.log('🗑️ [Marketplace] Sending delete mutation:', mutation);
                const result = await application.query(JSON.stringify({ query: mutation }));
                console.log('✅ [Marketplace] Delete result:', result);

                alert('Delete operation scheduled!');
                // Wait for sync and refresh
                setTimeout(() => {
                    if (activeTab === 'MY_ITEMS') fetchMyProducts(true);
                    else fetchProducts(true);
                }, 2000);
            } catch (e: any) {
                console.error('Failed to delete product:', e);
                alert(`Failed to delete: ${e.message}`);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product);
        setIsCreateModalOpen(true);
    };

    const handleBuyProduct = async (product: Product) => {
        if (!application || !accountOwner) {
            alert('Please connect your wallet first.');
            return;
        }

        const targetChainId = product.authorChainId || import.meta.env.VITE_LINERA_MAIN_CHAIN_ID;

        if (window.confirm(`Confirm purchase of "${product.name}" for ${product.price} LIN?`)) {
            try {
                setIsLoading(true);
                const mutation = `
                    mutation {
                        transferToBuy(
                            owner: "${accountOwner}"
                            productId: "${product.id}"
                            amount: "${product.price}"
                            targetAccount: {
                                chainId: "${targetChainId}"
                                owner: "${product.author}"
                            }
                        )
                    }
                `;

                console.log('💸 [Marketplace] Initiating purchase mutation with string:', mutation);
                const result = await application.query(JSON.stringify({ query: mutation }));
                console.log('✅ [Marketplace] Purchase mutation raw result:', result);

                let parsedResult: any = result;
                if (typeof result === 'string') {
                    try {
                        parsedResult = JSON.parse(result);
                        console.log('📦 [Marketplace] Parsed mutation result:', parsedResult);
                    } catch (e) {
                        console.warn('⚠️ [Marketplace] Failed to parse result as JSON:', e);
                    }
                }

                const errors = (parsedResult as any)?.errors;
                if (errors && Array.isArray(errors)) {
                    console.error('❌ [Marketplace] GraphQL errors detected:', errors);
                    throw new Error(errors[0]?.message || 'Blockchain mutation error');
                }

                alert('Purchase operation scheduled! It will appear in your purchases once confirmed on-chain.');

                // Switch to purchases tab to wait for it
                setActiveTab('PURCHASES');
            } catch (e: any) {
                console.error('❌ [Marketplace] Purchase failed:', e);
                alert(`Purchase failed: ${e.message || 'Unknown error'}`);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleDownloadProduct = async (product: Product) => {
        if (!application || !product.data_blob_hash) {
            alert('Download failed: No data hash found for this product.');
            return;
        }

        try {
            setIsLoading(true);
            console.log('📥 [Marketplace] Fetching blob for download:', product.data_blob_hash);

            const query = `query {
                dataBlob(hash: "${product.data_blob_hash}")
            }`;

            const result: any = await application.query(JSON.stringify({ query }));

            let parsedResult = result;
            if (typeof result === 'string') {
                parsedResult = JSON.parse(result);
            }

            const bytes = parsedResult?.data?.dataBlob || parsedResult?.dataBlob;

            if (!bytes || !Array.isArray(bytes) || bytes.length === 0) {
                throw new Error('Blob data is empty or not found on-chain.');
            }

            console.log(`📦 [Marketplace] Received ${bytes.length} bytes from blockchain`);

            const uint8 = new Uint8Array(bytes);
            const blob = new Blob([uint8], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${product.name.replace(/\s+/g, '_')}_product.zip`; // Fallback extension
            document.body.appendChild(a);
            a.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            console.log('✅ [Marketplace] Download triggered successfully');
        } catch (e: any) {
            console.error('❌ [Marketplace] Download failed:', e);
            alert(`Download failed: ${e.message || 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleViewProduct = async (product: Product): Promise<string | null> => {
        if (!application || !product.data_blob_hash) return null;

        try {
            console.log('👁️ [Marketplace] Fetching blob for viewing:', product.data_blob_hash);

            const query = `query {
                dataBlob(hash: "${product.data_blob_hash}")
            }`;

            const result: any = await application.query(JSON.stringify({ query }));

            let parsedResult = result;
            if (typeof result === 'string') {
                parsedResult = JSON.parse(result);
            }

            const bytes = parsedResult?.data?.dataBlob || parsedResult?.dataBlob;

            if (!bytes || !Array.isArray(bytes) || bytes.length === 0) {
                return null;
            }

            const uint8 = new Uint8Array(bytes);
            // Default to octet-stream, browser will decide how to handle it
            const blob = new Blob([uint8], { type: 'application/octet-stream' });
            return URL.createObjectURL(blob);
        } catch (e) {
            console.error('❌ [Marketplace] View failed:', e);
            return null;
        }
    };

    const displayProducts = activeTab === 'PURCHASES' ? purchases : (activeTab === 'MY_ITEMS' ? myProducts : products);

    const filteredProducts = displayProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase());

        // 1. If we are in PURCHASES or MY_ITEMS, we already have the correct list (from chain queries)
        if (activeTab === 'PURCHASES' || activeTab === 'MY_ITEMS') {
            return matchesSearch;
        }

        // 2. BROWSE tab - handle ownerId override for creator profile view
        if (ownerId) {
            const targetOwner = ownerId.toLowerCase();
            const isFromOwner = p.author?.toLowerCase() === targetOwner || p.authorAddress?.toLowerCase() === targetOwner;
            return matchesSearch && isFromOwner;
        }

        // 3. Default BROWSE
        return matchesSearch;
    });

    return (
        <div className="flex flex-col h-full space-y-6">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 border-b-4 border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div>
                    <h1 className="font-display text-4xl uppercase tracking-tighter mb-1">Marketplace</h1>
                    <p className="font-mono text-sm text-gray-500 uppercase">Buy, Sell, and Trade Digital Goods</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setEditingProduct(null);
                            setIsCreateModalOpen(true);
                        }}
                        className="bg-linera-red text-white flex items-center gap-2 px-6 py-3 font-mono font-bold uppercase transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#000000] border-2 border-deep-black"
                    >
                        <Plus className="w-5 h-5" />
                        Sell Item
                    </button>
                </div>
            </div>

            {/* Tabs & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex bg-white border-2 border-deep-black p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <button
                        onClick={() => setActiveTab('BROWSE')}
                        className={`px-6 py-2 font-mono font-bold uppercase transition-colors ${activeTab === 'BROWSE' ? 'bg-deep-black text-white' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                        Browse
                    </button>
                    <button
                        onClick={() => setActiveTab('MY_ITEMS')}
                        className={`px-6 py-2 font-mono font-bold uppercase transition-colors ${activeTab === 'MY_ITEMS' ? 'bg-deep-black text-white' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                        My Items
                    </button>
                    <button
                        onClick={() => setActiveTab('PURCHASES')}
                        className={`px-6 py-2 font-mono font-bold uppercase transition-colors ${activeTab === 'PURCHASES' ? 'bg-deep-black text-white' : 'hover:bg-gray-100 text-gray-500'} flex items-center gap-2`}
                    >
                        <ShoppingBag className="w-4 h-4" />
                        Purchases
                    </button>
                </div>

                <div className="relative w-full md:w-auto md:min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border-2 border-deep-black pl-10 pr-4 py-2 font-mono text-sm focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                    />
                </div>
            </div>

            {/* Product Grid */}
            {isLoading ? (
                <div className="text-center py-20 font-mono text-gray-500">Loading marketplace...</div>
            ) : (
                <ProductList
                    products={filteredProducts}
                    currentUserAddress={currentUserAddress}
                    onBuy={handleBuyProduct}
                    onEdit={handleEditProduct}
                    onDelete={handleDeleteProduct}
                    onDownload={handleDownloadProduct}
                    onView={handleViewProduct}
                    activeTab={activeTab}
                    isPurchased={activeTab === 'PURCHASES'}
                />
            )}

            {/* Create/Edit Modal */}
            {isCreateModalOpen && (
                <CreateProductModal
                    initialData={editingProduct || undefined}
                    onClose={() => {
                        setIsCreateModalOpen(false);
                        setEditingProduct(null);
                    }}
                    onCreate={handleCreateProduct}
                />
            )}
        </div>
    );
};

export default Marketplace;
