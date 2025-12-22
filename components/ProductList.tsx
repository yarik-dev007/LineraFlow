import React from 'react';
import ProductCard from './ProductCard';
import { Product } from '../types';

interface ProductListProps {
    products: Product[];
    currentUserAddress?: string;
    onBuy: (product: Product) => void;
    onEdit: (product: Product) => void;
    onDelete: (product: Product) => void;
}

const ProductList: React.FC<ProductListProps> = ({ products, currentUserAddress, onBuy, onEdit, onDelete }) => {
    if (products.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white border-2 border-dashed border-gray-300">
                <p className="font-mono text-gray-400 uppercase tracking-widest">No products found</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
                <ProductCard
                    key={product.id}
                    product={product}
                    isOwner={product.author === currentUserAddress || product.authorAddress === currentUserAddress}
                    onBuy={onBuy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
};

export default ProductList;
