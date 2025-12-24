import React from 'react';
import { Product } from '../types';
import { X, Copy, ExternalLink, FileText, Lock } from 'lucide-react';

interface PrivateDataModalProps {
    product: Product;
    onClose: () => void;
}

const PrivateDataModal: React.FC<PrivateDataModalProps> = ({ product, onClose }) => {

    // Helper to detect if value looks like a blob hash (64 hex chars)
    const isBlobHash = (val: string) => /^[a-f0-9]{64}$/i.test(val);

    // Filter out data items that look like files 
    // (exact data_blob_hash key, keys containing 'file', or values that are hashes)
    const dataItems = product.privateData?.filter(kv => {
        const key = kv.key.toLowerCase();
        if (key === 'data_blob_hash') return false;
        if (key.includes('file')) return false;
        if (isBlobHash(kv.value)) return false;
        return true;
    }) || [];

    // Also include success message if present
    const successMsg = product.successMessage;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    const isUrl = (text: string) => {
        try {
            const url = new URL(text);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto border-4 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-4 border-b-4 border-deep-black bg-gray-50 flex items-center justify-between sticky top-0 z-10">
                    <div>
                        <h2 className="text-xl font-bold uppercase flex items-center gap-2">
                            <Lock className="w-5 h-5 text-linera-red" /> Private Content
                        </h2>
                        <p className="text-sm text-gray-600 font-mono mt-1">
                            Purchased content for {product.name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Success Message */}
                    {successMsg && (
                        <div className="bg-green-50 border-2 border-green-600 p-4 rounded-none">
                            <h3 className="text-green-800 font-bold uppercase text-sm mb-2">Message from Author</h3>
                            <p className="font-mono text-green-900">{successMsg}</p>
                        </div>
                    )}

                    {/* Data Items */}
                    {dataItems.length > 0 ? (
                        <div className="space-y-4">
                            {dataItems.map((item, idx) => (
                                <div key={idx} className="border-2 border-deep-black p-3 bg-gray-50 hover:bg-white transition-colors group">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-bold uppercase text-gray-500">{item.key}</span>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleCopy(item.value)}
                                                className="p-1 hover:bg-gray-200"
                                                title="Copy Value"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="font-mono text-sm break-all">
                                        {isUrl(item.value) ? (
                                            <a
                                                href={item.value}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                <ExternalLink className="w-3 h-3" /> {item.value}
                                            </a>
                                        ) : (
                                            <span className="text-deep-black">{item.value}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        !successMsg && (
                            <div className="text-center py-8 text-gray-400 font-mono italic">
                                This product has no additional private text data.
                            </div>
                        )
                    )}

                    <div className="text-xs text-gray-400 font-mono border-t border-gray-200 pt-4 mt-4">
                        Note: If this product contains downloadable files, use the "Download" button on the main card.
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t-4 border-deep-black bg-gray-50">
                    <button
                        onClick={onClose}
                        className="w-full bg-deep-black text-white px-6 py-3 font-bold uppercase hover:bg-linera-red transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:shadow-none hover:translate-y-1"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PrivateDataModal;
