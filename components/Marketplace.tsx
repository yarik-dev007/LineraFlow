import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ProductList from './ProductList';
import CreateProductModal from './CreateProductModal';
import { Product } from '../types';

interface MarketplaceProps {
    currentUserAddress?: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ currentUserAddress }) => {
    const { ownerId } = useParams<{ ownerId: string }>();

    const [activeTab, setActiveTab] = useState<'BROWSE' | 'MY_ITEMS'>('BROWSE');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Set initial filter based on URL
    useEffect(() => {
        if (ownerId) {
            setSearchQuery('');
            // Logic to filter by owner is in filteredProducts below
        }
    }, [ownerId]);

    // MOCK DATA
    const [products, setProducts] = useState<Product[]>([
        {
            id: 'prod_1',
            name: 'Neon Genesis Abstract Art',
            description: 'A one-of-a-kind digital masterpiece featuring cyberpunk aesthetics and vibrant neon colors.',
            price: 10.5,
            author: '0x1A2...B3C',
            authorAddress: '0x1A2...B3C',
        },
        {
            id: 'prod_2',
            name: 'Retro Synthwave Track',
            description: 'Exclusive licensing for my latest synthwave track. Perfect for background music or streaming.',
            price: 5.0,
            author: '0x8F9...E2D',
            authorAddress: '0x8F9...E2D',
        },
        {
            id: 'prod_3',
            name: 'Golden Ticket Access',
            description: 'VIP access to my private Discord community and weekly exclusive content.',
            price: 100.0,
            author: currentUserAddress || 'User123', // Mock owning one product if logged in
            authorAddress: currentUserAddress || 'User123',
        }
    ]);

    const handleCreateProduct = (data: { name: string; description: string; price: string; image?: string; fileHash?: string; fileName?: string }) => {
        const newProduct: Product = {
            id: `prod_${Date.now()}`,
            name: data.name,
            description: data.description,
            price: parseFloat(data.price),
            author: currentUserAddress || 'Anonymous',
            authorAddress: currentUserAddress,
            image: data.image
            // In a real app we would store fileHash/fileName too, adding to mock type if needed or just logging for now
        };

        console.log('Created Product with Blob:', data.fileHash);

        setProducts([newProduct, ...products]);
        setIsCreateModalOpen(false);
    };

    const handleDeleteProduct = (product: Product) => {
        if (window.confirm(`Are you sure you want to delete "${product.name}"?`)) {
            setProducts(products.filter(p => p.id !== product.id));
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
            <ProductList
                products={filteredProducts}
                currentUserAddress={currentUserAddress}
                onBuy={handleBuyProduct}
                onEdit={() => { }} // TODO: Implement Edit Modal
                onDelete={handleDeleteProduct}
            />

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
