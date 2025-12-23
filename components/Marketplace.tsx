import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProductList from './ProductList';
import CreateProductModal from './CreateProductModal';
import { Product } from '../types';
import { pb } from './pocketbase';

interface MarketplaceProps {
    currentUserAddress?: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ currentUserAddress }) => {
    const { ownerId } = useParams<{ ownerId: string }>();

    const [activeTab, setActiveTab] = useState<'BROWSE' | 'MY_ITEMS'>('BROWSE');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Set initial filter based on URL
    useEffect(() => {
        if (ownerId) {
            setSearchQuery('');
        }
    }, [ownerId]);

    // Fetch Products from PocketBase
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                // If filtering by owner, we could filter in query, but for now client side limit is fine for MVP
                // or use pb.collection('products').getList(1, 50, { filter: `owner = "${ownerId}"` }) if ownerId is present
                // But let's fetch all active products for now to allow local filtering text search

                const records = await pb.collection('products').getFullList({
                    sort: '-created',
                });

                const mappedProducts: Product[] = records.map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    price: r.price,
                    image: r.image, // URL
                    author: r.owner, // PocketBase field
                    authorAddress: r.owner,
                    fileHash: r.file_hash,
                    fileName: r.file_name
                }));

                setProducts(mappedProducts);
                setIsLoading(false);
            } catch (e) {
                console.error('Error fetching products:', e);
                setIsLoading(false);
            }
        };

        fetchProducts();

        // Realtime Subscription
        pb.collection('products').subscribe('*', async (e) => {
            console.log('Realtime update:', e.action, e.record);
            if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
                await fetchProducts();
            }
        });

        return () => {
            pb.collection('products').unsubscribe('*');
        };
    }, []);

    const handleCreateProduct = (data: { name: string; description: string; price: string; image?: string; fileHash?: string; fileName?: string }) => {
        // Modal handles the distinct DB save. 
        // We just close the modal. Realtime subscription will update the list.
        setIsCreateModalOpen(false);
    };

    const handleDeleteProduct = async (product: Product) => {
        if (window.confirm(`Delete "${product.name}"?`)) {
            try {
                await pb.collection('products').delete(product.id);
            } catch (e) {
                console.error('Failed to delete product:', e);
                alert('Failed to delete product.');
            }
        }
    };

    const handleBuyProduct = (product: Product) => {
        alert(`Initiating purchase for: ${product.name} (${product.price} LIN)\n\n(This is a mock transaction)`);
    };

    const filteredProducts = products.filter(p => {
        // If URL has ownerId, filter by that AUTHOR only
        if (ownerId) {
            return p.author === ownerId || p.authorAddress === ownerId;
        }

        // Otherwise standard filters
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description.toLowerCase().includes(searchQuery.toLowerCase());

        if (activeTab === 'MY_ITEMS') {
            return matchesSearch && (p.author === currentUserAddress || p.authorAddress === currentUserAddress);
        }
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
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-linera-red text-white flex items-center gap-2 px-6 py-3 font-mono font-bold uppercase transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#000000] border-2 border-deep-black"
                    >
                        <Plus className="w-5 h-5" />
                        Sell Item
                    </button>
                </div>
            </div>

            {/* Tabs & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                {/* Tabs */}
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
                </div>

                {/* Search */}
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
                    onEdit={() => { }}
                    onDelete={handleDeleteProduct}
                />
            )}

            {/* Create Modal */}
            {isCreateModalOpen && (
                <CreateProductModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onCreate={handleCreateProduct}
                />
            )}
        </div>
    );
};

export default Marketplace;
