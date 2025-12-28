import React, { useState } from 'react';
import { useLinera } from './LineraProvider';
import { X, Image, Upload } from 'lucide-react';
import { pb } from './pocketbase';

interface PostData {
    id?: string;
    title: string;
    content: string;
    imageHash?: string | null;
}

interface CreatePostModalProps {
    onClose: () => void;
    onSuccess: () => void;
    initialData?: PostData;
}

const CreatePostModal: React.FC<CreatePostModalProps> = ({ onClose, onSuccess, initialData }) => {
    const { application, accountOwner } = useLinera();
    const [title, setTitle] = useState(initialData?.title || '');
    const [content, setContent] = useState(initialData?.content || '');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState('');
    const [imageHash, setImageHash] = useState<string | null>(initialData?.imageHash || null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reused upload logic from ProfileEditor/CreateProduct
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageFile(file);
        setUploadStatus('Uploading...');

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                // Using the specific upload endpoint for raw blobs
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
                    setImageHash(data.hash);
                    setUploadStatus('✅ Ready');
                } else {
                    setUploadStatus('❌ Upload failed');
                    console.error("Upload error", data);
                }
            } catch (err) {
                console.error("Upload error", err);
                setUploadStatus('❌ Connection failed');
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!application || !accountOwner) {
            alert("Connect wallet first!");
            return;
        }
        if (!title || !content) {
            alert("Title and content are required.");
            return;
        }

        setIsSubmitting(true);
        try {
            let mutation;

            if (initialData?.id) {
                // UPDATE Mode
                mutation = `mutation {
                    updatePost(
                        postId: "${initialData.id}",
                        title: "${title}",
                        content: "${content.replace(/\r?\n/g, "\\n").replace(/"/g, '\\"')}",
                        imageHash: ${imageHash ? `"${imageHash}"` : 'null'}
                    )
                }`;
            } else {
                // CREATE Mode
                mutation = `mutation {
                    createPost(
                        title: "${title}",
                        content: "${content.replace(/\r?\n/g, "\\n").replace(/"/g, '\\"')}",
                        imageHash: ${imageHash ? `"${imageHash}"` : 'null'}
                    )
                }`;
            }

            await application.query(JSON.stringify({ query: mutation }), { owner: accountOwner });
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Post submission failed:", err);
            alert(`Failed to submit post: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-lg bg-paper-white border-4 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative">
                {/* Header */}
                <div className="bg-deep-black text-white p-4 flex justify-between items-center">
                    <h2 className="font-display text-xl uppercase tracking-wider">
                        {initialData ? 'Edit Transmission' : 'New Transmission'}
                    </h2>
                    <button onClick={onClose} className="hover:text-linera-red transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block font-mono text-xs font-bold uppercase mb-1">Subject / Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full bg-white border-2 border-deep-black p-2 font-bold focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none transition-shadow"
                            placeholder="Announce something..."
                        />
                    </div>

                    {/* Content */}
                    <div>
                        <label className="block font-mono text-xs font-bold uppercase mb-1">Message</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full h-32 bg-white border-2 border-deep-black p-2 font-mono text-sm focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none transition-shadow resize-none"
                            placeholder="Write your update..."
                        />
                    </div>

                    {/* Image Upload */}
                    <div className="border-2 border-dashed border-deep-black p-4 bg-gray-50 flex flex-col items-center gap-2">
                        <label className="cursor-pointer flex flex-col items-center gap-2 hover:opacity-70 transition-opacity">
                            <Upload className="w-8 h-8 text-emerald-600" />
                            <span className="font-mono text-xs font-bold uppercase">
                                {imageHash ? 'Change Media' : 'Upload Media'}
                            </span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>

                        {imageFile && (
                            <div className="flex items-center gap-2 text-xs font-mono bg-white border border-deep-black px-2 py-1 mt-2">
                                <Image className="w-3 h-3" />
                                <span className="truncate max-w-[200px]">{imageFile.name}</span>
                            </div>
                        )}

                        {imageHash && !imageFile && (
                            <div className="flex items-center gap-2 text-xs font-mono bg-emerald-100 border border-emerald-500 px-2 py-1 mt-2">
                                <Image className="w-3 h-3 text-emerald-700" />
                                <span className="truncate max-w-[200px] text-emerald-700">Existing Image Preserved</span>
                            </div>
                        )}

                        {uploadStatus && (
                            <span className={`text-[10px] font-bold uppercase ${uploadStatus.includes('✅') ? 'text-emerald-600' : 'text-linera-red'}`}>
                                {uploadStatus}
                            </span>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="pt-4 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 font-mono font-bold uppercase py-3 border-2 border-transparent hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || (!!imageFile && !imageHash)}
                            className="flex-1 bg-deep-black text-white font-display uppercase tracking-widest py-3 hover:bg-emerald-600 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Transmitting...' : (initialData ? 'Update Uplink' : 'Post Uplink')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreatePostModal;
