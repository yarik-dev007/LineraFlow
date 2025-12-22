import React, { useState } from 'react';
import { X } from 'lucide-react';

interface CreateProductModalProps {
    onClose: () => void;
    onCreate: (data: { name: string; description: string; price: string; image?: string }) => void;
    isLoading?: boolean;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onCreate, isLoading }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [image, setImage] = useState(''); // Optional URL for now

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !description || !price) return;
        onCreate({ name, description, price, image });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-deep-black/20 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="bg-white border-4 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md relative z-10 animate-pop-in">
                {/* Header */}
                <div className="bg-linera-red text-white p-4 border-b-4 border-deep-black flex justify-between items-center">
                    <h2 className="font-display text-xl tracking-tighter uppercase">List New Item</h2>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block font-mono text-xs font-bold uppercase mb-1">Product Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-deep-black p-3 font-sans focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                            placeholder="e.g. Exclusive Digital Art"
                            required
                        />
                    </div>

                    <div>
                        <label className="block font-mono text-xs font-bold uppercase mb-1">Price (LIN)</label>
                        <input
                            type="number"
                            step="0.0001"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-deep-black p-3 font-mono focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                            placeholder="0.0"
                            required
                        />
                    </div>

                    <div>
                        <label className="block font-mono text-xs font-bold uppercase mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-deep-black p-3 font-sans h-24 resize-none focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                            placeholder="Describe your item..."
                            required
                        />
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border-2 border-deep-black font-mono font-bold hover:bg-gray-100 transition-colors"
                        >
                            CANCEL
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-3 bg-deep-black text-white border-2 border-deep-black font-mono font-bold hover:bg-linera-red hover:border-deep-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'LISTING...' : 'LIST ITEM'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateProductModal;
