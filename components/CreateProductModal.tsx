import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, Image as ImageIcon, Link as LinkIcon, Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { useLinera } from './LineraProvider';
import { Product, KeyValuePair, OrderFormField } from '../types';

interface CreateProductModalProps {
    onClose: () => void;
    onCreate: (data: any) => void;
    isLoading?: boolean;
    initialData?: Product;
}

type BlockType = 'text' | 'link' | 'file';
type OrderFieldType = 'text' | 'email' | 'textarea' | 'number' | 'select';

interface ContentBlock {
    id: string;
    type: BlockType;
    key: string;
    value: string; // text content, url, or blob hash
    fileName?: string; // for files
    label?: string; // used for display name in constructor
}

interface OrderBlock {
    id: string;
    key: string;
    label: string;
    fieldType: OrderFieldType;
    required: boolean;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onCreate, isLoading, initialData }) => {
    const { accountOwner, application } = useLinera();
    const [step, setStep] = useState(1);

    // --- Step 1: Public Data ---
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [previewImage, setPreviewImage] = useState<File | null>(null);
    const [previewHash, setPreviewHash] = useState('');
    const [category, setCategory] = useState('digital');

    // --- Step 2: Private Data (The Payload) ---
    const [privateBlocks, setPrivateBlocks] = useState<ContentBlock[]>([]);
    const [successMessage, setSuccessMessage] = useState('Thank you for your purchase! Your content is available below.');

    // --- Step 3: Order Form ---
    const [orderBlocks, setOrderBlocks] = useState<OrderBlock[]>([]);

    // --- System ---
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeUploadId, setActiveUploadId] = useState<string | null>(null); // 'preview' or block ID

    const wsRef = useRef<WebSocket | null>(null);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    // Initialize from existing data if editing
    useEffect(() => {
        if (initialData) {
            // Extract standard fields from key-value pairs
            const getVal = (key: string) => initialData.publicData.find(k => k.key === key)?.value || '';
            setName(getVal('name'));
            setDescription(getVal('description'));
            setCategory(getVal('category') || 'digital');
            setPreviewHash(getVal('image_preview_hash'));
            setPrice(initialData.price.toString());

            // Reconstruct blocks from private data
            // Note: This is a simplification. Ideally we store block metadata structure.
            if (initialData.privateData) {
                const blocks: ContentBlock[] = initialData.privateData.map((kv, idx) => {
                    let type: BlockType = 'text';
                    if (kv.key.includes('blob') || kv.key.includes('file')) type = 'file';
                    else if (kv.key.includes('link') || kv.value.startsWith('http')) type = 'link';

                    return {
                        id: `existing-${idx}`,
                        type,
                        key: kv.key,
                        value: kv.value,
                        label: kv.key
                    };
                });
                setPrivateBlocks(blocks);
            }

            if (initialData.orderForm) {
                setOrderBlocks(initialData.orderForm.map((f, idx) => ({ ...f, fieldType: f.field_type as OrderFieldType, id: `form-${idx}` })));
            }
        }
    }, [initialData]);

    // --- Upload Logic (HTTP) ---
    // --- Upload Logic (HTTP) ---
    const handleUploadSuccess = (hash: string, id: string, fileName?: string) => {
        setUploadStatus('✅ Upload Complete');

        if (id === 'preview') {
            setPreviewHash(hash);
        } else {
            // Update specific block
            setPrivateBlocks(blocks => blocks.map(b =>
                b.id === id ? { ...b, value: hash, fileName: fileName } : b
            ));
        }
        setActiveUploadId(null);
    };

    const uploadFile = (file: File, id: string) => {
        setActiveUploadId(id);
        setUploadStatus(`Uploading ${file.name}...`);

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const response = await fetch('http://localhost:8070/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'publish_blob',
                        file: (reader.result as string),
                        fileType: file.type
                    })
                });

                const data = await response.json();
                if (response.ok && data.hash) {
                    handleUploadSuccess(data.hash, id, file.name);
                } else {
                    setUploadStatus(`❌ Error: ${data.error || 'Upload failed'}`);
                    setActiveUploadId(null);
                }
            } catch (e) {
                console.error(e);
                setUploadStatus('❌ Connection failed. Check server.');
                setActiveUploadId(null);
            }
        };
        reader.readAsDataURL(file);
    };

    // --- Constructor Logic ---

    const addPrivateBlock = (type: BlockType) => {
        const id = Date.now().toString();
        const newBlock: ContentBlock = {
            id,
            type,
            key: `${type}_${privateBlocks.length + 1}`,
            value: '',
            label: `New ${type}`
        };
        setPrivateBlocks([...privateBlocks, newBlock]);
    };

    const updatePrivateBlock = (id: string, updates: Partial<ContentBlock>) => {
        setPrivateBlocks(blocks => blocks.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const removePrivateBlock = (id: string) => {
        setPrivateBlocks(blocks => blocks.filter(b => b.id !== id));
    };

    const addOrderBlock = () => {
        const id = Date.now().toString();
        setOrderBlocks([...orderBlocks, {
            id,
            key: `field_${orderBlocks.length + 1}`,
            label: 'New Question',
            fieldType: 'text',
            required: true
        }]);
    };

    const updateOrderBlock = (id: string, updates: Partial<OrderBlock>) => {
        setOrderBlocks(blocks => blocks.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const removeOrderBlock = (id: string) => {
        setOrderBlocks(blocks => blocks.filter(b => b.id !== id));
    };

    // --- Drag and Drop Logic ---
    const handleSort = (list: any[], setList: (l: any[]) => void) => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        const copy = [...list];
        const draggedItemContent = copy[dragItem.current];
        copy.splice(dragItem.current, 1);
        copy.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setList(copy);
    };

    // --- Submission ---
    const handleSubmit = async () => {
        if (!accountOwner || !application) return;
        setIsSubmitting(true);
        setUploadStatus('🚀 Sending transaction...');

        try {
            const publicData = [
                { key: 'name', value: name },
                { key: 'description', value: description },
                { key: 'category', value: category },
                { key: 'type', value: 'digital' },
                { key: 'image_preview_hash', value: previewHash }
            ];

            const privateData = privateBlocks.map(b => ({
                key: b.key,
                value: b.value // url, text, or blob hash
            }));

            const orderForm = orderBlocks.map(b => ({
                key: b.key,
                label: b.label,
                field_type: b.fieldType,
                required: b.required
            }));

            // Format graphQL inputs
            const formatKv = (list: any[]) => list.map(i => `{ key: "${i.key}", value: "${i.value.replace(/"/g, '\\"')}" }`).join(', ');
            const formatForm = (list: any[]) => list.map(i => `{ key: "${i.key}", label: "${i.label}", fieldType: "${i.field_type}", required: ${i.required} }`).join(', ');

            let mutation;
            if (initialData?.id) {
                // Update
                mutation = `
                    mutation {
                        updateProduct(
                            productId: "${initialData.id}",
                            publicData: [${formatKv(publicData)}],
                            price: "${price}",
                            privateData: [${formatKv(privateData)}],
                            successMessage: "${successMessage}",
                            orderForm: [${formatForm(orderForm)}]
                        )
                    }
                `;
            } else {
                // Create
                mutation = `
                    mutation {
                        createProduct(
                            publicData: [${formatKv(publicData)}],
                            price: "${price}",
                            privateData: [${formatKv(privateData)}],
                            successMessage: "${successMessage}",
                            orderForm: [${formatForm(orderForm)}]
                        )
                    }
                `;
            }

            await application.query(JSON.stringify({ query: mutation }));

            setUploadStatus(initialData ? '✅ Product Updated!' : '✅ Product Created!');
            onCreate({}); // Trigger refresh
            setTimeout(onClose, 1000);

        } catch (e: any) {
            console.error(e);
            setUploadStatus(`❌ Error: ${e.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-deep-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white border-4 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-2xl h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="bg-linera-red text-white p-4 border-b-4 border-deep-black flex justify-between items-center shrink-0">
                    <h2 className="font-display text-xl uppercase tracking-wider">Product Constructor</h2>
                    <button onClick={onClose}><X className="w-6 h-6" /></button>
                </div>

                {/* Steps Indicator */}
                <div className="flex border-b-2 border-deep-black shrink-0">
                    {[1, 2, 3].map(i => (
                        <button
                            key={i}
                            onClick={() => setStep(i)}
                            className={`flex-1 p-3 text-sm font-bold uppercase transition-colors
                                ${step === i ? 'bg-deep-black text-white' : 'hover:bg-gray-100'}`}
                        >
                            {i === 1 && '1. Details'}
                            {i === 2 && '2. Content (Private)'}
                            {i === 3 && '3. Order Form'}
                        </button>
                    ))}
                </div>

                {/* Content Area - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">

                    {/* STEP 1: PUBLIC DETAILS */}
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold uppercase">Name</label>
                                    <input value={name} onChange={e => setName(e.target.value)} className="w-full border-2 border-deep-black p-2 mt-1" placeholder="Product Name" autoFocus />
                                </div>
                                <div>
                                    <label className="text-xs font-bold uppercase">Price (LIN)</label>
                                    <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full border-2 border-deep-black p-2 mt-1" placeholder="0.00" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold uppercase">Description</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full border-2 border-deep-black p-2 mt-1 h-24" placeholder="Describe your product..." />
                            </div>

                            <div className="border-2 border-dashed border-gray-300 p-4 bg-white rounded">
                                <label className="text-xs font-bold uppercase flex items-center gap-2 mb-2 text-linera-red">
                                    <ImageIcon className="w-4 h-4" /> Cover Image
                                </label>
                                <div className="flex items-center gap-4">
                                    <input type="file" onChange={e => e.target.files && setPreviewImage(e.target.files[0])} className="text-sm" />
                                    {previewImage && !previewHash && (
                                        <button onClick={() => uploadFile(previewImage, 'preview')} className="bg-deep-black text-white px-3 py-1 text-xs uppercase font-bold">Upload</button>
                                    )}
                                    {previewHash && <span className="text-green-600 text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Uploaded</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: PRIVATE CONTENT CONSTRUCTOR */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-sm text-blue-800 mb-4">
                                Drag blocks to reorder. This content will only be visible to buyers after purchase.
                            </div>

                            <div className="space-y-3">
                                {privateBlocks.map((block, index) => (
                                    <div
                                        key={block.id}
                                        draggable
                                        onDragStart={() => dragItem.current = index}
                                        onDragEnter={() => dragOverItem.current = index}
                                        onDragEnd={() => handleSort(privateBlocks, setPrivateBlocks)}
                                        onDragOver={e => e.preventDefault()}
                                        className="bg-white border-2 border-gray-200 p-4 flex gap-4 items-start group hover:border-deep-black transition-colors"
                                    >
                                        <div className="cursor-move text-gray-400 group-hover:text-deep-black mt-2">
                                            <GripVertical className="w-5 h-5" />
                                        </div>

                                        <div className="flex-1 space-y-2">
                                            <div className="flex justify-between">
                                                <span className="text-xs font-bold uppercase bg-gray-100 px-2 py-0.5 rounded">{block.type}</span>
                                                <input
                                                    value={block.key}
                                                    onChange={e => updatePrivateBlock(block.id, { key: e.target.value })}
                                                    className="text-xs border-b border-gray-300 text-right focus:outline-none"
                                                    placeholder="Unique Key"
                                                />
                                            </div>

                                            {block.type === 'text' && (
                                                <textarea
                                                    value={block.value}
                                                    onChange={e => updatePrivateBlock(block.id, { value: e.target.value })}
                                                    className="w-full border border-gray-300 p-2 text-sm"
                                                    placeholder="Secret text content..."
                                                />
                                            )}

                                            {block.type === 'link' && (
                                                <div className="flex items-center gap-2 border border-gray-300 p-2">
                                                    <LinkIcon className="w-4 h-4 text-gray-400" />
                                                    <input
                                                        value={block.value}
                                                        onChange={e => updatePrivateBlock(block.id, { value: e.target.value })}
                                                        className="flex-1 text-sm outline-none"
                                                        placeholder="https://..."
                                                    />
                                                </div>
                                            )}

                                            {block.type === 'file' && (
                                                <div className="border border-dashed border-gray-300 p-3 bg-gray-50 flex items-center justify-between">
                                                    {block.value ? (
                                                        <div className="text-sm text-green-600 font-bold flex flex-col gap-1 items-start w-full">
                                                            <div className="flex items-center gap-2">
                                                                <FileText className="w-4 h-4" />
                                                                {block.fileName || 'File Uploaded'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 font-mono break-all bg-white p-1 border rounded w-full select-all">
                                                                {block.value}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="file"
                                                                onChange={e => e.target.files && uploadFile(e.target.files[0], block.id)}
                                                                className="text-xs"
                                                            />
                                                            {activeUploadId === block.id && <span className="text-xs animate-pulse">Uploading...</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <button onClick={() => removePrivateBlock(block.id)} className="text-gray-400 hover:text-red-500">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Toolbar */}
                            <div className="grid grid-cols-3 gap-3 border-t-2 border-dashed border-gray-300 pt-4">
                                <button onClick={() => addPrivateBlock('text')} className="flex items-center justify-center gap-2 p-3 bg-white border-2 border-gray-200 hover:border-deep-black hover:shadow-md transition-all">
                                    <FileText className="w-4 h-4" /> <span className="font-bold text-xs uppercase">Add Text</span>
                                </button>
                                <button onClick={() => addPrivateBlock('link')} className="flex items-center justify-center gap-2 p-3 bg-white border-2 border-gray-200 hover:border-deep-black hover:shadow-md transition-all">
                                    <LinkIcon className="w-4 h-4" /> <span className="font-bold text-xs uppercase">Add Link</span>
                                </button>
                                <button onClick={() => addPrivateBlock('file')} className="flex items-center justify-center gap-2 p-3 bg-white border-2 border-gray-200 hover:border-deep-black hover:shadow-md transition-all">
                                    <Upload className="w-4 h-4" /> <span className="font-bold text-xs uppercase">Add File</span>
                                </button>
                            </div>

                            <div className="mt-4">
                                <label className="text-xs font-bold uppercase">Success Message (Shown after payment)</label>
                                <textarea
                                    value={successMessage}
                                    onChange={e => setSuccessMessage(e.target.value)}
                                    className="w-full border-2 border-deep-black p-2 mt-1 h-20 text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 3: ORDER FORM CONSTRUCTOR */}
                    {step === 3 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 text-sm text-yellow-800 mb-4">
                                Define questions buyers must answer before purchasing.
                            </div>

                            <div className="space-y-3">
                                {orderBlocks.map((block, index) => (
                                    <div
                                        key={block.id}
                                        draggable
                                        onDragStart={() => dragItem.current = index}
                                        onDragEnter={() => dragOverItem.current = index}
                                        onDragEnd={() => handleSort(orderBlocks, setOrderBlocks)}
                                        onDragOver={e => e.preventDefault()}
                                        className="bg-white border-2 border-gray-200 p-4 flex gap-4 items-center group hover:border-deep-black transition-colors"
                                    >
                                        <div className="cursor-move text-gray-400 group-hover:text-deep-black">
                                            <GripVertical className="w-5 h-5" />
                                        </div>

                                        <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                                            <div className="col-span-6">
                                                <input
                                                    value={block.label}
                                                    onChange={e => updateOrderBlock(block.id, { label: e.target.value })}
                                                    className="w-full border-b border-gray-300 focus:border-deep-black outline-none font-bold"
                                                    placeholder="Question Label"
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <select
                                                    value={block.fieldType}
                                                    onChange={e => updateOrderBlock(block.id, { fieldType: e.target.value as OrderFieldType })}
                                                    className="w-full bg-gray-50 border border-gray-300 p-1 text-sm"
                                                >
                                                    <option value="text">Text Input</option>
                                                    <option value="email">Email</option>
                                                    <option value="textarea">Long Text</option>
                                                    <option value="number">Number</option>
                                                </select>
                                            </div>
                                            <div className="col-span-2 flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={block.required}
                                                    onChange={e => updateOrderBlock(block.id, { required: e.target.checked })}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-xs uppercase font-bold">Req</span>
                                            </div>
                                        </div>

                                        <button onClick={() => removeOrderBlock(block.id)} className="text-gray-400 hover:text-red-500">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <button onClick={addOrderBlock} className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-deep-black hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
                                <Plus className="w-5 h-5" /> <span className="font-bold uppercase text-sm">Add Question</span>
                            </button>
                        </div>
                    )}

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t-4 border-deep-black bg-white flex justify-between items-center shrink-0">
                    <div className="flex gap-2">
                        {/* Navigation Buttons */}
                        {step > 1 && (
                            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 font-bold uppercase hover:bg-gray-100">
                                Back
                            </button>
                        )}
                    </div>

                    <div className="flex gap-4 items-center">
                        <span className="text-xs font-bold text-linera-red animate-pulse">{uploadStatus}</span>
                        {step < 3 ? (
                            <button onClick={() => setStep(s => s + 1)} className="bg-deep-black text-white px-6 py-2 font-bold uppercase hover:bg-gray-800">
                                Next Step
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || !name || !price}
                                className="bg-linera-red text-white px-8 py-2 font-bold uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50"
                            >
                                {isSubmitting ? 'Creating...' : 'Create Product'}
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CreateProductModal;
