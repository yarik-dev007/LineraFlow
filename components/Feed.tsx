import React, { useState, useEffect, useCallback } from 'react';
import { useLinera } from './LineraProvider';
import { Post, Creator } from '../types';
import { pb } from './pocketbase';
import { cacheManager } from '../utils/cacheManager';
import { MessageCircle, Heart, Share2, Plus } from 'lucide-react';
import CreatePostModal from './CreatePostModal';

const Feed: React.FC = () => {
    const { application, accountOwner, subscribeToMyFeed, unsubscribeFromMyFeed } = useLinera();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [blobUrls, setBlobUrls] = useState<{ [hash: string]: string }>({});
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const [viewMode, setViewMode] = useState<'FEED' | 'MY_POSTS'>('FEED');

    // Helper to fetch blobs
    const fetchBlobs = useCallback(async (hashes: string[], currentPosts: Post[]) => {
        if (!application) return;

        const newUrls: { [h: string]: string } = {};

        for (const hash of hashes) {
            try {
                // 1. Check cache first
                const cacheKey = `blob_${hash}`;
                const cachedDataUrl = cacheManager.get<string>(cacheKey);

                if (cachedDataUrl) {
                    newUrls[hash] = cachedDataUrl;
                    continue;
                }

                // 2. Fetch from chain if not cached
                const query = `query { dataBlob(hash: "${hash}") } `;
                const result: any = await application.query(JSON.stringify({ query }));

                let bytes: number[] | null = null;
                if (result.data?.dataBlob) bytes = result.data.dataBlob;
                else if (result.dataBlob) bytes = result.dataBlob;
                else if (typeof result === 'string') {
                    try {
                        const parsed = JSON.parse(result);
                        bytes = parsed.data?.dataBlob || parsed.dataBlob || null;
                    } catch (e) { }
                }

                if (bytes) {
                    // Convert to Base64 Data URI for caching
                    const u8arr = new Uint8Array(bytes);
                    let binary = '';
                    const len = u8arr.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(u8arr[i]);
                    }
                    const base64 = window.btoa(binary);
                    const dataUrl = `data:image/jpeg;base64,${base64}`; // Assuming jpeg, could attempt detection

                    // Save to cache
                    cacheManager.set(cacheKey, dataUrl);

                    newUrls[hash] = dataUrl;
                }
            } catch (e) {
                console.error(`Failed to load blob ${hash} `, e);
            }
        }

        setBlobUrls(prev => ({ ...prev, ...newUrls }));
    }, [application]);

    // Fetch Feed
    const fetchFeed = useCallback(async () => {
        if (!application || !accountOwner) return;
        setLoading(true);
        try {
            // 1. Fetch posts from chain based on View Mode
            let query;

            if (viewMode === 'MY_POSTS') {
                query = `query {
    postsByAuthor(author: "${accountOwner}") {
        id
        author
        authorChainId
        title
        content
        imageHash
        createdAt
    }
} `;
            } else {
                query = `query {
    myFeed(subscriber: "${accountOwner}") {
        id
        author
        authorChainId
        title
        content
        imageHash
        createdAt
    }
} `;
            }

            console.log(`📨 [Feed-DEBUG] Fetching ${viewMode}... Query:`, query);
            const result: any = await application.query(JSON.stringify({ query }));
            console.log(`📬 [Feed-DEBUG] ${viewMode} Response:`, result);
            let rawPosts: any[] = [];

            // Handle different response structures
            if (viewMode === 'MY_POSTS') {
                if (result.data?.postsByAuthor) rawPosts = result.data.postsByAuthor;
                else if (result.postsByAuthor) rawPosts = result.postsByAuthor;
                else if (typeof result === 'string') {
                    try {
                        const parsed = JSON.parse(result);
                        rawPosts = parsed.data?.postsByAuthor || parsed.postsByAuthor || [];
                    } catch (e) { }
                }
            } else {
                if (result.data?.myFeed) rawPosts = result.data.myFeed;
                else if (result.myFeed) rawPosts = result.myFeed;
                else if (typeof result === 'string') {
                    try {
                        const parsed = JSON.parse(result);
                        rawPosts = parsed.data?.myFeed || parsed.myFeed || [];
                    } catch (e) { }
                }
            }

            if (!rawPosts || rawPosts.length === 0) {
                setPosts([]);
                setLoading(false);
                return;
            }

            // 2. Fetch Authors from PB to enrich
            const uniqueAuthors = Array.from(new Set(rawPosts.map(p => p.author)));
            let pbProfiles: any[] = [];
            try {
                if (uniqueAuthors.length > 0) {
                    // PocketBase filter limitation: verify safe max length usually
                    const filter = uniqueAuthors.map(a => `owner = "${a}"`).join('||');
                    pbProfiles = await pb.collection('profiles').getFullList({ filter });
                }
            } catch (e) { console.error("PB Fetch error", e); }


            // 3. Map Posts
            const mappedPosts: Post[] = rawPosts.map((p: any) => {
                const authorProfile = pbProfiles.find(pf => pf.owner === p.author);
                return {
                    id: p.id,
                    author: p.author,
                    authorChainId: p.authorChainId,
                    title: p.title,
                    content: p.content,
                    imageHash: p.imageHash,
                    createdAt: typeof p.createdAt === 'string' ? parseInt(p.createdAt) : p.createdAt, // handle u64 string
                    authorName: authorProfile?.name || 'Unknown',
                    authorAvatar: authorProfile?.avatar_file
                        ? pb.files.getUrl(authorProfile, authorProfile.avatar_file)
                        : undefined
                };
            });

            // Sort by createdAt desc (if not already)
            mappedPosts.sort((a, b) => b.createdAt - a.createdAt);

            // 4. Fetch Blobs (Images)
            // We'll fetch them individually to avoid blocking the UI, but here we just map hashes
            const hashesToFetch = mappedPosts
                .filter(p => p.imageHash && !blobUrls[p.imageHash])
                .map(p => p.imageHash!);

            if (hashesToFetch.length > 0) {
                fetchBlobs(hashesToFetch, mappedPosts);
            }

            setPosts(mappedPosts);
        } catch (err) {
            console.error("Feed fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, [application, accountOwner, blobUrls, fetchBlobs, viewMode]);

    useEffect(() => {
        // Initial fetch
        fetchFeed();

        // Subscription for real-time updates
        subscribeToMyFeed(() => {
            console.log("🔔 [Feed] New content notification");
            fetchFeed();
        });

        return () => {
            unsubscribeFromMyFeed();
        };
    }, [application, accountOwner, fetchFeed, subscribeToMyFeed, unsubscribeFromMyFeed]);


    // Disconnected State
    if (!accountOwner) {
        return (
            <div className="w-full max-w-2xl mx-auto p-12 text-center border-4 border-gray-100 border-dashed mt-8">
                <h2 className="font-display text-2xl text-gray-300 uppercase">Wallet Not Connected</h2>
                <p className="font-mono text-xs text-gray-400 mt-2 mb-6">Connect your wallet to see your personal feed</p>
            </div>
        );
    }

    // Initial loading state only
    if (loading && posts.length === 0) {
        return (
            <div className="w-full max-w-2xl mx-auto p-12 flex flex-col items-center justify-center">
                <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
                <p className="font-mono text-emerald-600 animate-pulse uppercase tracking-widest text-sm">Syncing Feed...</p>
            </div>
        );
    }

    // Success handler to refresh feed
    const handlePostCreated = () => {
        fetchFeed();
    };

    return (

        <>
            <div className="w-full max-w-2xl mx-auto pt-8 pb-24 animate-slide-in relative">
                <div className="flex items-center justify-between mb-8 border-b-4 border-emerald-500 pb-4">
                    <h1 className="font-display text-4xl uppercase text-deep-black">My Feed</h1>
                    <span className="bg-emerald-500 text-white font-mono text-xs font-bold px-2 py-1 uppercase">
                        Live Uplink
                    </span>
                </div>

                {/* View Toggles */}
                <div className="flex gap-4 mb-8">
                    <button
                        onClick={() => setViewMode('FEED')}
                        className={`font-mono text-sm font-bold px-4 py-2 uppercase border-2 transition-all ${viewMode === 'FEED'
                            ? 'bg-deep-black text-white border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]'
                            : 'bg-white text-deep-black border-deep-black hover:bg-gray-50'
                            }`}
                    >
                        Following
                    </button>
                    <button
                        onClick={() => setViewMode('MY_POSTS')}
                        className={`font-mono text-sm font-bold px-4 py-2 uppercase border-2 transition-all ${viewMode === 'MY_POSTS'
                            ? 'bg-deep-black text-white border-deep-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]'
                            : 'bg-white text-deep-black border-deep-black hover:bg-gray-50'
                            }`}
                    >
                        My Posts
                    </button>
                </div>

                {posts.length === 0 ? (
                    <div className="w-full max-w-2xl mx-auto p-12 text-center border-4 border-gray-100 border-dashed">
                        <h2 className="font-display text-2xl text-gray-300 uppercase">No Activity Yet</h2>
                        <p className="font-mono text-xs text-gray-400 mt-2">Subscribe to creators or start posting!</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {posts.map(post => (
                            <article key={post.id} className="bg-white border-2 border-gray-100 hover:border-emerald-500 transition-colors shadow-sm hover:shadow-hard group p-0 overflow-hidden">

                                {/* Header */}
                                <div className="p-4 flex gap-4">
                                    {/* Avatar */}
                                    <div className="shrink-0">
                                        <div className="w-12 h-12 rounded-full bg-gray-100 border-2 border-deep-black overflow-hidden relative">
                                            {post.authorAvatar ? (
                                                <img src={post.authorAvatar} alt={post.authorName} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-display text-lg text-gray-400">
                                                    {post.authorName?.substring(0, 1).toUpperCase() || '?'}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Meta & Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <div className="mb-1">
                                                <span className="font-bold text-deep-black mr-2 hover:underline cursor-pointer">
                                                    {post.authorName}
                                                </span>
                                                <span className="font-mono text-xs text-gray-400">
                                                    {new Date(post.createdAt / 1000).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>

                                        <h3 className="font-display text-xl leading-tight mb-2 text-deep-black">
                                            {post.title}
                                        </h3>

                                        <p className="font-mono text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mb-4">
                                            {post.content}
                                        </p>
                                    </div>
                                </div>

                                {/* Image Blob */}
                                {post.imageHash && (
                                    <div className="w-full bg-gray-50 border-t-2 border-gray-100 relative min-h-[200px] flex items-center justify-center">
                                        {blobUrls[post.imageHash] ? (
                                            <img
                                                src={blobUrls[post.imageHash]}
                                                alt="Post content"
                                                className="w-full h-auto max-h-[500px] object-cover"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 py-12">
                                                <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                                                <span className="font-mono text-xs text-gray-400 uppercase">Deciphering Blob...</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Actions Footer */}
                                <div className="bg-gray-50 p-3 flex gap-6 text-gray-400 border-t-2 border-gray-100">
                                    <button className="flex items-center gap-2 hover:text-emerald-600 transition-colors">
                                        <Heart className="w-4 h-4" /> <span className="font-mono text-xs font-bold">Like</span>
                                    </button>
                                    <button className="flex items-center gap-2 hover:text-blue-500 transition-colors">
                                        <Share2 className="w-4 h-4" /> <span className="font-mono text-xs font-bold">Share</span>
                                    </button>
                                </div>

                            </article>
                        ))}
                    </div>
                )}
            </div>

            {/* FAB - Moved outside container to break out of transform context */}
            <button
                onClick={() => setIsCreateModalOpen(true)}
                className="fixed bottom-32 right-8 z-50 w-14 h-14 bg-emerald-500 text-white rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-400 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all flex items-center justify-center border-2 border-deep-black"
                title="Create Post"
            >
                <Plus className="w-8 h-8" />
            </button>

            {isCreateModalOpen && (
                <CreatePostModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={handlePostCreated}
                />
            )}
        </>
    );
};

export default Feed;
