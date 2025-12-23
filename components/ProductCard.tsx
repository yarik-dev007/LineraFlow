import React from 'react';
import { Product } from '../types';
import { ShoppingCart, Edit, Trash2, ExternalLink } from 'lucide-react';

interface ProductCardProps {
    product: Product;
    isOwner: boolean;
    onBuy?: (product: Product) => void;
    onEdit?: (product: Product) => void;
    onDelete?: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, isOwner, onBuy, onEdit, onDelete }) => {
    return (
        <div className="bg-white border-2 border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all duration-200 flex flex-col h-full group">

            {/* Image Placeholder */}
            <div className="h-48 bg-gray-100 border-b-2 border-deep-black flex items-center justify-center overflow-hidden relative">
                {product.image_preview_hash ? (
                    <img
                        src={`http://localhost:8080/blobs/${product.image_preview_hash}`}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            // If local blob fails, maybe it's not served directly or we're in a different env
                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Preview+Not+Found';
                        }}
                    />
                ) : product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="text-gray-300 font-display text-4xl select-none group-hover:scale-110 transition-transform">IMG</div>
                )}

                {/* Price Tag */}
                <div className="absolute top-2 right-2 bg-linera-red text-white border-2 border-deep-black px-2 py-1 font-mono font-bold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    {product.price} LIN
                </div>
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
                <div className="mt-auto pt-4 border-t border-gray-100 flex gap-2">
                    {isOwner ? (
                        <>
                            <button
                                onClick={() => onEdit?.(product)}
                                className="flex-1 bg-white border border-deep-black hover:bg-gray-50 text-deep-black py-2 px-3 text-xs font-bold font-mono uppercase flex items-center justify-center gap-1 transition-colors"
                            >
                                <Edit className="w-3 h-3" /> Edit
                            </button>
                            <button
                                onClick={() => onDelete?.(product)}
                                className="bg-white border border-deep-black hover:bg-red-50 text-red-600 py-2 px-3 transition-colors"
                                title="Delete Product"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => onBuy?.(product)}
                            className="flex-1 bg-deep-black text-white hover:bg-linera-red border-2 border-transparent hover:border-deep-black py-2 px-3 text-sm font-bold font-mono uppercase flex items-center justify-center gap-2 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,0)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        >
                            <ShoppingCart className="w-4 h-4" /> Buy Now
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
