import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { useLinera } from './LineraProvider';
import { Product } from '../types';

interface CreateProductModalProps {
    onClose: () => void;
    onCreate: (data: { name: string; description: string; price: string; image?: string; fileHash?: string; fileName?: string }) => void;
    isLoading?: boolean;
    initialData?: Product;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onCreate, isLoading, initialData }) => {
    const { accountOwner, application } = useLinera();

    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [price, setPrice] = useState(initialData?.price?.toString() || '');
    const [image, setImage] = useState(initialData?.image || '');
    const [file, setFile] = useState<File | null>(null);
    const [previewFile, setPreviewFile] = useState<File | null>(null);

    const [uploadStatus, setUploadStatus] = useState<string>(initialData ? 'Mode: Edit Item' : '');
    const [blobHash, setBlobHash] = useState<string>(initialData?.data_blob_hash || '');
    const [previewBlobHash, setPreviewBlobHash] = useState<string>(initialData?.image_preview_hash || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeUpload, setActiveUpload] = useState<'product' | 'preview' | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const activeUploadRef = useRef<'product' | 'preview' | null>(null);

    useEffect(() => {
        // Connect to WebSocket Server for Blob Upload
        const ws = new WebSocket('ws://localhost:8070');

        ws.onopen = () => {
            console.log('Connected to Blob Server');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'blob_published') {
                    const currentType = activeUploadRef.current;
                    console.log(`Blob published for type: ${currentType}, hash: ${data.hash}`);

                    if (currentType === 'product') {
                        setBlobHash(data.hash);
                    } else if (currentType === 'preview') {
                        setPreviewBlobHash(data.hash);
                    }
                    setUploadStatus(`✅ ${currentType === 'product' ? 'Product' : 'Preview'} published to Linera!`);
                    setActiveUpload(null);
                    activeUploadRef.current = null;
                } else if (data.type === 'blob_error') {
                    setUploadStatus(`❌ Error: ${data.message}`);
                    setActiveUpload(null);
                    activeUploadRef.current = null;
                }
            } catch (e) {
                console.error('WS Error:', e);
            }
        };

        ws.onerror = (e) => {
            console.error('WebSocket error:', e);
            setUploadStatus('❌ Connection Error. Is server running?');
        };

        wsRef.current = ws;

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'preview') => {
        if (e.target.files && e.target.files[0]) {
            if (type === 'product') {
                setFile(e.target.files[0]);
                setBlobHash(''); // Reset hash to force re-upload
            } else {
                setPreviewFile(e.target.files[0]);
                setPreviewBlobHash(''); // Reset hash to force re-upload
            }
            setUploadStatus(`Click "Publish" for new ${type === 'product' ? 'product file' : 'preview image'}`);
        }
    };

    const uploadFile = (type: 'product' | 'preview') => {
        const targetFile = type === 'product' ? file : previewFile;
        if (!targetFile || !wsRef.current) return;

        setActiveUpload(type);
        activeUploadRef.current = type;
        setUploadStatus(`Uploading ${type}...`);

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string);

            wsRef.current?.send(JSON.stringify({
                type: 'publish_blob',
                file: base64,
                fileType: targetFile.type
            }));
        };
        reader.readAsDataURL(targetFile);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !description || !price) return;

        if (!accountOwner || !application) {
            setUploadStatus('❌ Error: Wallet or Application not ready');
            return;
        }

        setIsSubmitting(true);
        setUploadStatus('⏳ Sending transaction to Linera...');
        console.log(`🚀 Form Submission - Product Hash: ${blobHash || 'empty'}, Preview Hash: ${previewBlobHash || 'empty'}`);

        try {
            // 1. Execute Blockchain Mutation
            const mutation = initialData ? `
                mutation {
                    updateProduct(
                        productId: "${initialData.id}",
                        name: "${name}",
                        description: "${description}",
                        price: "${price}",
                        link: "${image || ''}",
                        dataBlobHash: "${blobHash || ''}",
                        imagePreviewHash: "${previewBlobHash || ''}"
                    )
                }
            ` : `
                mutation {
                    createProduct(
                        name: "${name}",
                        description: "${description}",
                        price: "${price}",
                        link: "${image || ''}",
                        dataBlobHash: "${blobHash || ''}",
                        imagePreviewHash: "${previewBlobHash || ''}"
                    )
                }
            `;

            console.log('Sending mutation:', mutation);

            const result: any = await application.query(JSON.stringify({ query: mutation }));
            console.log('Mutation completed:', result);

            let parsedResult = result;
            if (typeof result === 'string') {
                parsedResult = JSON.parse(result);
            }

            if (parsedResult?.errors) {
                throw new Error(parsedResult.errors[0]?.message || 'Blockchain error');
            }

            // 2. Notify Parent
            onCreate({
                name,
                description,
                price,
                image,
                fileHash: blobHash,
                fileName: file?.name
            });

            setUploadStatus('✅ Transaction sent! Item will appear shortly.');

            // Close after a short delay to let user see success
            setTimeout(() => {
                onClose();
            }, 1500);

        } catch (e: any) {
            console.error('Error creating product on chain:', e);
            setUploadStatus(`❌ Error: ${e.message || 'Transaction failed'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-deep-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white border-4 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-linera-red text-white p-4 border-b-4 border-deep-black flex justify-between items-center">
                    <h2 className="font-display text-xl uppercase tracking-wider">
                        {initialData ? 'Edit Digital Item' : 'List New Digital Item'}
                    </h2>
                    <button onClick={onClose} className="hover:rotate-90 transition-transform">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono">

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-bold uppercase mb-1">Item Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-deep-black p-2 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                            placeholder="e.g. Rare Cyberpunk Art"
                            autoFocus
                        />
                    </div>

                    {/* Price */}
                    <div>
                        <label className="block text-xs font-bold uppercase mb-1">Price (LIN)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-deep-black p-2 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                            placeholder="0.00"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-bold uppercase mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-deep-black p-2 h-24 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow resize-none"
                            placeholder="Describe your item..."
                        />
                    </div>

                    {/* Cover Image Upload */}
                    <div className="border-2 border-dashed border-gray-300 p-4 bg-gray-50">
                        <label className="block text-xs font-bold uppercase mb-2 flex items-center gap-2 text-linera-red">
                            <ImageIcon className="w-4 h-4" /> Cover Image (Preview)
                        </label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleFileChange(e, 'preview')}
                                className="text-xs file:mr-4 file:py-2 file:px-4 file:border-2 file:border-deep-black file:text-xs file:font-semibold file:bg-white file:text-deep-black hover:file:bg-gray-100"
                            />
                            {previewFile && !previewBlobHash && !activeUpload && (
                                <button
                                    type="button"
                                    onClick={() => uploadFile('preview')}
                                    className="bg-deep-black text-white px-3 py-1 text-xs font-bold uppercase hover:bg-linera-red transition-colors"
                                >
                                    Publish
                                </button>
                            )}
                        </div>
                        {previewBlobHash && (
                            <p className="text-[10px] mt-1 text-green-600 break-all">Preview Hash: {previewBlobHash}</p>
                        )}
                    </div>

                    {/* File Upload Section */}
                    <div className="border-2 border-dashed border-gray-300 p-4 bg-gray-50">
                        <label className="block text-xs font-bold uppercase mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Digital Product File (Zip, PDF, etc.)
                        </label>

                        <div className="flex gap-2 items-center">
                            <input
                                type="file"
                                onChange={(e) => handleFileChange(e, 'product')}
                                className="text-xs file:mr-4 file:py-2 file:px-4 file:border-2 file:border-deep-black file:text-xs file:font-semibold file:bg-white file:text-deep-black hover:file:bg-gray-100"
                            />

                            {file && !blobHash && !activeUpload && (
                                <button
                                    type="button"
                                    onClick={() => uploadFile('product')}
                                    className="bg-deep-black text-white px-3 py-1 text-xs font-bold uppercase hover:bg-linera-red transition-colors"
                                >
                                    Publish
                                </button>
                            )}
                        </div>

                        {uploadStatus && (
                            <p className={`text-xs mt-2 font-bold ${uploadStatus.includes('✅') ? 'text-green-600' : 'text-gray-500'}`}>
                                {uploadStatus}
                            </p>
                        )}

                        {blobHash && (
                            <p className="text-[10px] mt-1 text-gray-400 break-all">Hash: {blobHash}</p>
                        )}
                    </div>

                    {/* Submit */}
                    <div className="pt-2 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border-2 border-deep-black font-bold uppercase hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || isSubmitting || (file && !blobHash) || (previewFile && !previewBlobHash)}
                            className="flex-1 bg-linera-red text-white px-4 py-3 border-2 border-deep-black font-bold uppercase shadow-[4px_4px_0px_0px_#000000] hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading || isSubmitting ? (initialData ? 'Updating...' : 'Listing...') : (initialData ? 'Update Item' : 'List Item')}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default CreateProductModal;
