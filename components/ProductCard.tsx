import React from 'react';
import { Product } from '../types';
import { ShoppingCart, Edit, Trash2, ExternalLink, Eye, Loader2 } from 'lucide-react';

interface ProductCardProps {
    product: Product;
    isOwner: boolean;
    isPurchased?: boolean;
    onBuy?: (product: Product) => void;
    onEdit?: (product: Product) => void;
    onDelete?: (product: Product) => void;
    onDownload?: (product: Product) => void;
    onView?: (product: Product) => Promise<string | null>;
    activeTab?: 'BROWSE' | 'MY_ITEMS' | 'PURCHASES';
    isDeleting?: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, isOwner, isPurchased, onBuy, onEdit, onDelete, onDownload, onView, activeTab = 'BROWSE', isDeleting = false }) => {
    const [localUrl, setLocalUrl] = React.useState<string | null>(null);
    const [isViewLoading, setIsViewLoading] = React.useState(false);

    const handleView = async () => {
        if (localUrl) {
            window.open(localUrl, '_blank');
            return;
        }
        if (onView) {
            setIsViewLoading(true);
            try {
                const url = await onView(product);
                if (url) {
                    setLocalUrl(url);
                    window.open(url, '_blank');
                }
            } catch (err) {
                console.error('Failed to view product:', err);
                alert('Failed to load product content.');
            } finally {
                setIsViewLoading(false);
            }
        }
    };

    return (
        <div className="bg-white border-2 border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all duration-200 flex flex-col h-full group">
            {/* ... rest of the file ... */}

            {/* Image Placeholder */}
            <div className="h-48 bg-gray-100 border-b-2 border-deep-black flex items-center justify-center overflow-hidden relative">
                {product.image_preview && product.pbId && product.collectionId ? (
                    <img
                        src={`/pb/api/files/${product.collectionId}/${product.pbId}/${product.image_preview}`}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            console.log('PocketBase image load failed');
                            const target = e.target as HTMLImageElement;
                            target.parentElement?.classList.add('bg-linera-red/10');
                            target.style.display = 'none';
                        }}
                    />
                ) : product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : null}

                {/* Fallback Icon when no image or image fails */}
                <div className="absolute inset-0 flex items-center justify-center -z-10 bg-gray-50">
                    <div className="text-gray-200 font-display text-5xl uppercase select-none group-hover:scale-110 transition-transform">
                        {product.name.substring(0, 2)}
                    </div>
                </div>

                {/* Price Tag */}
                <div className="absolute top-2 right-2 bg-linera-red text-white border-2 border-deep-black px-2 py-1 font-mono font-bold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    {product.price} LIN
                </div>

                {isDeleting && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-linera-red" />
                        <span className="font-mono text-xs font-bold uppercase tracking-widest text-deep-black">Deleting...</span>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-4 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="font-display text-lg leading-tight mb-1 line-clamp-2">{product.name}</h3>
                        <p className="text-xs font-mono text-gray-500 uppercase">By {product.author.substring(0, 8)}...</p>
                    </div>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-3 flex-1">{product.description}</p>

                {/* Actions */}
                <div className="mt-auto pt-4 border-t border-gray-100 flex flex-col gap-2">
                    {activeTab === 'PURCHASES' ? (
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={handleView}
                                disabled={isViewLoading}
                                className="flex-1 bg-white border-2 border-deep-black hover:bg-gray-50 text-deep-black py-2 px-3 text-sm font-bold font-mono uppercase flex items-center justify-center gap-2 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50"
                            >
                                {isViewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} View
                            </button>
                            <button
                                onClick={() => onDownload?.(product)}
                                className="flex-1 bg-linera-red text-white hover:bg-deep-black border-2 border-transparent hover:border-deep-black py-2 px-3 text-sm font-bold font-mono uppercase flex items-center justify-center gap-2 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            >
                                <ExternalLink className="w-4 h-4" /> Download
                            </button>
                        </div>
                    ) : activeTab === 'MY_ITEMS' ? (
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={() => onEdit?.(product)}
                                className="flex-1 bg-white border-2 border-deep-black hover:bg-gray-50 text-deep-black py-2 px-3 text-sm font-bold font-mono uppercase flex items-center justify-center gap-2 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            >
                                <Edit className="w-4 h-4" /> Edit
                            </button>
                            <button
                                onClick={() => onDelete?.(product)}
                                disabled={isDeleting}
                                className="bg-white border-2 border-deep-black hover:bg-red-50 text-red-600 py-2 px-3 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Product"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        // BROWSE Tab
                        isOwner ? (
                            <div className="text-gray-400 text-xs font-mono uppercase py-2 text-center border-2 border-dashed border-gray-200 w-full mb-1 bg-gray-50/50">
                                Your Product
                            </div>
                        ) : (
                            <button
                                onClick={() => onBuy?.(product)}
                                className="flex-1 bg-deep-black text-white hover:bg-linera-red border-2 border-transparent hover:border-deep-black py-2 px-3 text-sm font-bold font-mono uppercase flex items-center justify-center gap-2 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            >
                                <ShoppingCart className="w-4 h-4" /> Buy Now
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
