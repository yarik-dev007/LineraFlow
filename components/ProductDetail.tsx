import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useParams, useNavigate } from 'react-router-dom';
import { useLinera } from './LineraProvider';
import { Product } from '../types';
import { ArrowLeft, ShoppingBag, Copy, Check } from 'lucide-react';
import OrderFillModal from './OrderFillModal';
import PrivateDataModal from './PrivateDataModal';
import { pb } from './pocketbase';

const ProductDetail: React.FC = () => {
    const { ownerId, productId } = useParams<{ ownerId: string; productId: string }>();
    const navigate = useNavigate();
    const { application, accountOwner, status, connectWallet } = useLinera();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
    const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
    const [copied, setCopied] = useState(false);
    const isMounted = useRef(true);

    useEffect(() => {
        // Scroll to top when product detail opens
        window.scrollTo(0, 0);

        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        const fetchProduct = async () => {
            if (!productId) {
                console.error('⚠️ [ProductDetail] ProductId is missing from URL');
                setLoading(false);
                return;
            }

            try {
                if (isMounted.current) setLoading(true);

                try {
                    const record = await pb.collection('products').getFirstListItem(`product_id="${productId}"`);

                    if (record) {
                        // Fetch profile for author
                        let authorProfile = null;
                        if (record.owner) {
                            try {
                                authorProfile = await pb.collection('profiles').getFirstListItem(`owner="${record.owner}"`);
                            } catch (err) {
                                // Ignore if profile not found
                            }
                        }

                        const p: Product = {
                            id: record.product_id,
                            pbId: record.id,
                            collectionId: record.collectionId,
                            author: record.owner,
                            authorAddress: record.owner,
                            authorChainId: record.chain_id,
                            name: record.name,
                            description: record.description
                                ? record.description
                                    .replace(/</g, '&lt;') // Escape HTML
                                    .replace(/\r?\n/g, "&nbsp;  \n") // Force spacing on every new line
                                : "",
                            price: record.price,
                            image: record.image_preview
                                ? pb.files.getUrl({ collectionId: record.collectionId, id: record.id }, record.image_preview)
                                : undefined,
                            image_preview: record.image_preview,
                            publicData: [],
                            privateData: [],
                            orderForm: record.order_form || [],
                            createdAt: Date.parse(record.created) / 1000,
                            image_preview_hash: record.image_preview_hash,
                            data_blob_hash: record.file_hash,

                            // Author Info
                            authorAvatar: authorProfile?.avatar_file,
                            authorProfileId: authorProfile?.id,
                            authorProfileCollectionId: authorProfile?.collectionId,
                            authorDisplayName: authorProfile?.name
                        };

                        if (isMounted.current) {
                            setProduct(p);
                            setLoading(false);
                        }
                    }
                } catch (pbError) {
                    console.warn('⚠️ [ProductDetail] PocketBase fetch failed or not found:', pbError);
                }

                if (isMounted.current) setLoading(false);

            } catch (e) {
                console.error('❌ [ProductDetail] Error fetching product:', e);
                if (isMounted.current) setLoading(false);
            }
        };

        fetchProduct();
    }, [productId]);

    const handleBuy = async (product: Product) => {
        if (!accountOwner) {
            try {
                console.log("Triggering wallet connection...");
                await connectWallet();
            } catch (e) {
                console.error("Connection failed:", e);
                alert("Failed to connect wallet. Please ensure the extension is installed and unlocked.");
            }
            return;
        }
        setBuyingProduct(product);
    };

    const performPurchase = async (p: Product, orderData: { key: string; value: string }[]) => {
        if (!application || !accountOwner) {
            alert("Wallet not connected!");
            return;
        }

        try {
            const formatKv = (list: { key: string; value: string }[]) => {
                return list.map(item => `{ key: "${item.key}", value: "${item.value}" }`).join(', ');
            };

            const targetAccountStr = `{ chainId: "${p.authorChainId}", owner: "${p.author}" }`;
            const orderDataStr = `[${formatKv(orderData)}]`;

            const mutation = `
                mutation {
                    transferToBuy(
                        owner: "${accountOwner}",
                        productId: "${p.id}",
                        amount: "${p.price}",
                        targetAccount: ${targetAccountStr},
                        orderData: ${orderDataStr}
                    )
                }
            `;

            // For user-initiated mutations, use MetaMask owner  
            await application.query(JSON.stringify({ query: mutation }), { owner: accountOwner });
            setBuyingProduct(null);

            alert("Purchase submitted! Check 'Purchases' tab shortly.");
        } catch (e) {
            console.error(e);
            alert("Purchase failed");
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="w-12 h-12 border-4 border-deep-black border-t-linera-red rounded-full animate-spin"></div>
                <p className="font-bold uppercase animate-pulse">Loading Product...</p>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <p className="font-bold text-xl uppercase text-gray-500">Product not found</p>
                <div className="text-sm text-gray-400">ID: {productId}</div>
                <button
                    onClick={() => navigate('/marketplace')}
                    className="flex items-center gap-2 px-4 py-2 bg-deep-black text-white font-bold uppercase hover:bg-gray-800 transition-all"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Marketplace
                </button>
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto p-4 md:p-8 min-h-screen font-mono">
            {/* Top Bar: Back & Copy Link */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => navigate('/marketplace')}
                    className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors font-bold uppercase text-xs"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Marketplace
                </button>

                <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-2 text-gray-500 hover:text-linera-red transition-colors font-bold uppercase text-[10px] border border-gray-200 px-3 py-1 bg-white hover:border-linera-red"
                >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                </button>
            </div>

            {/* Vertical Layout */}
            <div className="bg-white border-2 border-deep-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-0 overflow-hidden flex flex-col">

                {/* Image Section (Top, Full Width) */}
                <div className="w-full relative bg-gray-100 border-b-2 border-deep-black">
                    {/* Aspect Ratio constraint */}
                    <div className="w-full max-h-[350px] overflow-hidden flex items-center justify-center">
                        {product.image ? (
                            <img
                                src={product.image}
                                alt={product.name}
                                className="w-full h-full object-contain md:object-cover max-h-[350px]"
                                onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                }}
                            />
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center text-gray-400 text-center">
                                <ShoppingBag className="w-12 h-12 mb-2 opacity-20" />
                                <span className="uppercase font-bold text-xs tracking-widest">No Image Available</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Details Section (Bottom, Full Width) */}
                <div className="w-full p-6 md:p-8 flex flex-col">
                    <div className="mb-auto">
                        <div className="flex justify-between items-start mb-3">
                            <span className="bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 border border-gray-200">
                                Product
                            </span>
                            <span className="font-mono text-[10px] text-gray-400">
                                {new Date(product.createdAt * 1000).toLocaleDateString()}
                            </span>
                        </div>

                        <h1 className="text-2xl md:text-3xl font-black uppercase leading-tight mb-4">
                            {product.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b-2 border-gray-100">
                            <div className="flex items-center gap-2">
                                {/* Author Avatar */}
                                {product.authorAvatar && product.authorProfileId && product.authorProfileCollectionId ? (
                                    <img
                                        src={pb.files.getUrl({ collectionId: product.authorProfileCollectionId, id: product.authorProfileId }, product.authorAvatar)}
                                        alt={product.authorDisplayName || 'Author'}
                                        className="w-8 h-8 rounded-full border border-deep-black object-cover shadow-sm bg-white"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-linera-red flex items-center justify-center text-white font-bold text-xs border border-deep-black shadow-sm">
                                        {(product.authorDisplayName || product.author || '?').substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">Created By</span>
                                    <span className="text-xs font-bold font-mono text-linera-red">
                                        {product.authorDisplayName || (product.authorChainId ? product.authorChainId.substring(0, 8) : product.author.substring(0, 8))}...
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="prose max-w-none text-gray-600 leading-relaxed mb-8 font-sans text-base prose-headings:font-bold prose-headings:uppercase prose-a:text-linera-red prose-a:font-bold">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {product.description || "No description provided."}
                            </ReactMarkdown>
                        </div>
                    </div>

                    <div className="mt-4 pt-6 border-t-2 border-deep-black border-dashed">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex flex-col">
                                <span className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Price</span>
                                <span className="text-3xl md:text-4xl font-black text-deep-black tracking-tighter">
                                    {product.price} <span className="text-xl text-linera-red">TLIN</span>
                                </span>
                            </div>

                            <button
                                onClick={() => handleBuy(product)}
                                disabled={status === 'Loading'}
                                className={`w-full md:w-auto md:min-w-[240px] py-3 px-6 font-black uppercase tracking-widest text-sm transition-all border-2 border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-none flex items-center justify-center gap-3
                                    ${(status === 'Loading') ? 'bg-gray-200 text-gray-400 cursor-wait' : 'bg-linera-red text-white hover:bg-red-600'}`}
                            >
                                {status === 'Loading' ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        <ShoppingBag className="w-4 h-4" />
                                        {accountOwner ? 'Purchase Now' : 'Connect Wallet to Buy'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {buyingProduct && (
                <OrderFillModal
                    product={buyingProduct}
                    onClose={() => setBuyingProduct(null)}
                    onSubmit={(data) => performPurchase(buyingProduct, data)}
                />
            )}

            {viewingProduct && (
                <PrivateDataModal
                    product={viewingProduct}
                    onClose={() => setViewingProduct(null)}
                />
            )}
        </div>
    );
};

export default ProductDetail;
