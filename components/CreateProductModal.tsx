import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, Image as ImageIcon } from 'lucide-react';
import { pb } from './pocketbase';
import { useLinera } from './LineraProvider';

interface CreateProductModalProps {
    onClose: () => void;
    onCreate: (data: { name: string; description: string; price: string; image?: string; fileHash?: string; fileName?: string }) => void;
    isLoading?: boolean;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onCreate, isLoading }) => {
    const { accountOwner } = useLinera();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [image, setImage] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [blobHash, setBlobHash] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);

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
                    setBlobHash(data.hash);
                    setUploadStatus('✅ File published to Linera!');
                } else if (data.type === 'blob_error') {
                    setUploadStatus(`❌ Error: ${data.message}`);
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

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setUploadStatus('Click "Publish File" to upload');
        }
    };

    const uploadFile = () => {
        if (!file || !wsRef.current) return;

        setUploadStatus('Uploading...');

        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string);

            wsRef.current?.send(JSON.stringify({
                type: 'publish_blob',
                file: base64, // Send full data URI
                fileType: file.type
            }));
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !description || !price) return;

        if (!accountOwner) {
            setUploadStatus('❌ Error: Wallet not connected');
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Create Record in PocketBase
            const record = await pb.collection('products').create({
                name: name,
                description: description,
                price: parseFloat(price),
                image: image,
                owner: accountOwner,
                file_hash: blobHash || '',
                file_name: file?.name || ''
            });

            console.log('Product created in PB:', record.id);

            // 2. Call Parent
            onCreate({
                name,
                description,
                price,
                image,
                fileHash: blobHash,
                fileName: file?.name
            });

        } catch (e: any) {
            console.error('Error creating product:', e);
            setUploadStatus(`❌ Error saving product: ${e.message}`);
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
                    <h2 className="font-display text-xl uppercase tracking-wider">List New Digital Item</h2>
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

                    {/* Image URL (Simpler for now) */}
                    <div>
                        <label className="block text-xs font-bold uppercase mb-1">Cover Image URL</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={image}
                                onChange={(e) => setImage(e.target.value)}
                                className="flex-1 bg-gray-50 border-2 border-deep-black p-2 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow"
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    {/* File Upload Section */}
                    <div className="border-2 border-dashed border-gray-300 p-4 bg-gray-50">
                        <label className="block text-xs font-bold uppercase mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Digital Product File (Zip, PDF, etc.)
                        </label>

                        <div className="flex gap-2 items-center">
                            <input
                                type="file"
                                onChange={handleFileChange}
                                className="text-xs file:mr-4 file:py-2 file:px-4 file:border-2 file:border-deep-black file:text-xs file:font-semibold file:bg-white file:text-deep-black hover:file:bg-gray-100"
                            />

                            {file && !blobHash && (
                                <button
                                    type="button"
                                    onClick={uploadFile}
                                    className="bg-deep-black text-white px-3 py-1 text-xs font-bold uppercase hover:bg-linera-red transition-colors"
                                >
                                    Publish File
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
                            disabled={isLoading || isSubmitting || (file && !blobHash)}
                            className="flex-1 bg-linera-red text-white px-4 py-3 border-2 border-deep-black font-bold uppercase shadow-[4px_4px_0px_0px_#000000] hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading || isSubmitting ? 'Listing...' : 'List Item'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default CreateProductModal;
