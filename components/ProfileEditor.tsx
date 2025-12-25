import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { generateCreativeBio } from '../services/geminiService';
import { useLinera } from './LineraProvider';
import { cacheManager } from '../utils/cacheManager';
import { Image as ImageIcon, Check } from 'lucide-react';
import { pb } from './pocketbase';

interface ProfileEditorProps {
    initialProfile: UserProfile;
    onSave: (profile: UserProfile) => void;
    donations?: any[];
}

const MAIN_CHAIN_ID = import.meta.env.VITE_LINERA_MAIN_CHAIN_ID;

const ProfileEditor: React.FC<ProfileEditorProps> = ({ initialProfile, onSave, donations = [] }) => {
    const { application, accountOwner, balances, chainId } = useLinera();
    const [mode, setMode] = useState<'VIEW' | 'EDIT' | 'SUBSCRIPTION'>('VIEW');
    const [profile, setProfile] = useState<UserProfile>(initialProfile);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasProfile, setHasProfile] = useState(false);

    // Subscription State
    const [subscriptionPrice, setSubscriptionPrice] = useState('');
    const [subscriptionDescription, setSubscriptionDescription] = useState('');

    // Image upload state
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarHash, setAvatarHash] = useState('');
    const [headerFile, setHeaderFile] = useState<File | null>(null);
    const [headerHash, setHeaderHash] = useState('');
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const [activeUploadId, setActiveUploadId] = useState<string | null>(null);

    // Fetch Profile on Mount and when balance changes (indicating new blocks)
    useEffect(() => {
        const fetchProfile = async () => {
            if (!application || !accountOwner) return;

            // Fetch Subscription info from PB
            try {
                const sub = await pb.collection('author_subscriptions').getFirstListItem(`author="${accountOwner}"`);
                if (sub) {
                    setSubscriptionPrice(sub.price.toString());
                    setSubscriptionDescription(sub.description);
                }
            } catch (e) {
                // No subscription found
            }


            const cacheKey = `profile_${accountOwner}`;

            // 1. Load from cache immediately
            const cached = cacheManager.get<UserProfile>(cacheKey);
            if (cached) {
                console.log(`📦 [Profile] Loaded from cache`);
                setProfile(cached);
                setHasProfile(true);
                setIsLoading(false);
            } else {
                setIsLoading(true);
            }

            // 2. Fetch fresh data in background
            try {
                const query = `query {
  profile(owner: "${accountOwner}") {
    name
    bio
    socials {
      name
      url
    }
    avatarHash
    headerHash
  }
}`;
                console.log('👤 [Profile] Fetching fresh data...');
                const result: any = await application.query(JSON.stringify({ query }));
                let data = result;
                if (typeof result === 'string') {
                    data = JSON.parse(result);
                }

                const profileData = data?.data?.profile || data?.profile;

                if (profileData) {
                    setHasProfile(true);

                    const socialsMap = { twitter: '', instagram: '', youtube: '', tiktok: '' };
                    if (profileData.socials) {
                        profileData.socials.forEach((s: any) => {
                            if (s.name === 'twitter') socialsMap.twitter = s.url;
                            if (s.name === 'instagram') socialsMap.instagram = s.url;
                            if (s.name === 'youtube') socialsMap.youtube = s.url;
                            if (s.name === 'tiktok') socialsMap.tiktok = s.url;
                        });
                    }

                    const freshProfile: UserProfile = {
                        displayName: profileData.name || '',
                        bio: profileData.bio || '',
                        socials: socialsMap
                    };

                    // Set image hashes
                    if (profileData.avatarHash) setAvatarHash(profileData.avatarHash);
                    if (profileData.headerHash) setHeaderHash(profileData.headerHash);

                    // 3. Update only if different from cache
                    const isDifferent = JSON.stringify(freshProfile) !== JSON.stringify(cached);
                    if (isDifferent || !cached) {
                        console.log(`✅ [Profile] ${isDifferent ? 'Updated' : 'Same'}`);
                        setProfile(freshProfile);
                        cacheManager.set(cacheKey, freshProfile);
                    }
                } else {
                    setHasProfile(false);
                }
            } catch (error) {
                // Silent error handling
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [application, accountOwner, balances.accountBalance, balances.chainBalance]);

    const handleGenerateBio = async (e: React.MouseEvent) => {
        e.preventDefault();
        if (!profile.displayName) {
            alert("Please enter a display name first.");
            return;
        }

        setIsGenerating(true);
        const keywords = "blockchain, builder, futurist, creator economy";

        try {
            const generatedBio = await generateCreativeBio(profile.displayName, keywords);
            setProfile(prev => ({ ...prev, bio: generatedBio }));
        } catch (err) {
            console.error(err);
            setProfile(prev => ({ ...prev, bio: "AI_CORE_OFFLINE: Manual override required." }));
        } finally {
            setIsGenerating(false);
        }
    };

    // Image upload functions
    const handleUploadSuccess = (hash: string, id: string) => {
        setUploadStatus('✅ Upload Complete');

        if (id === 'avatar') {
            setAvatarHash(hash);
        } else if (id === 'header') {
            setHeaderHash(hash);
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
                    handleUploadSuccess(data.hash, id);
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

    const handleSaveSubscription = async () => {
        if (!application || !accountOwner) {
            alert("Wallet not connected!");
            return;
        }
        setIsSaving(true);
        try {
            // Mutation for subscription only
            const subMutation = `mutation {
                setSubscriptionPrice(price: "${subscriptionPrice}", description: "${subscriptionDescription || ''}")
             }`;
            await application.query(JSON.stringify({ query: subMutation }), { owner: accountOwner });
            alert("✅ Subscription updated!");
            setMode('VIEW');
        } catch (e: any) {
            console.error("Failed to set subscription:", e);
            alert(`❌ Error: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        if (!application || !accountOwner) {
            alert("Wallet not connected!");
            return;
        }

        setIsSaving(true);

        try {
            // Prepare socials array
            const socialsList = [];
            if (profile.socials.twitter) socialsList.push(`{ name: "twitter", url: "${profile.socials.twitter}" }`);
            if (profile.socials.instagram) socialsList.push(`{ name: "instagram", url: "${profile.socials.instagram}" }`);
            if (profile.socials.youtube) socialsList.push(`{ name: "youtube", url: "${profile.socials.youtube}" }`);
            if (profile.socials.tiktok) socialsList.push(`{ name: "tiktok", url: "${profile.socials.tiktok}" }`);

            const socialsString = `[${socialsList.join(', ')}]`;

            let mutation;
            if (hasProfile) {
                // Update Profile
                mutation = `mutation {
  updateProfile(
    name: "${profile.displayName}",
    bio: "${profile.bio}",
    socials: ${socialsString},
    avatarHash: ${avatarHash ? `"${avatarHash}"` : 'null'},
    headerHash: ${headerHash ? `"${headerHash}"` : 'null'}
  )
}`;
            } else {
                // Register Profile
                mutation = `mutation {
  register(
    mainChainId: "${MAIN_CHAIN_ID}",
    name: "${profile.displayName}",
    bio: "${profile.bio}",
    socials: ${socialsString},
    avatarHash: ${avatarHash ? `"${avatarHash}"` : 'null'},
    headerHash: ${headerHash ? `"${headerHash}"` : 'null'}
  )
}`;
            }

            // For user-initiated mutations, use MetaMask owner
            await application.query(JSON.stringify({ query: mutation }), { owner: accountOwner });

            setHasProfile(true);
            onSave(profile);
            setMode('VIEW');

        } catch (error: any) {
            console.error("Save failed:", error);
            alert(`❌ Error: ${error.message || "Transaction failed"}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setProfile(initialProfile);
        setMode('VIEW');
    };

    if (isLoading) {
        return (
            <div className="w-full max-w-3xl mx-auto p-12 text-center">
                <div className="animate-spin w-12 h-12 border-4 border-deep-black border-t-linera-red rounded-full mx-auto mb-4"></div>
                <p className="font-mono text-sm uppercase">Syncing Identity...</p>
            </div>
        );
    }

    // --- VIEW MODE ---
    if (mode === 'VIEW') {
        return (
            <div className="w-full max-w-3xl mx-auto animate-slide-in pb-12">
                <div className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 gap-4">
                    <div>
                        <h1 className="font-display text-4xl md:text-5xl uppercase text-deep-black">My Identity</h1>

                    </div>
                    <div className="flex gap-4 w-full md:w-auto">
                        {/* Manage Subscription Button */}
                        <button
                            onClick={() => setMode('SUBSCRIPTION')}
                            className="bg-white text-deep-black border-4 border-deep-black font-mono font-bold uppercase px-6 py-2 hover:bg-gray-100 transition-colors shadow-hard hover:shadow-hard-hover flex-1 md:flex-none"
                        >
                            Manage Subscription
                        </button>
                        <button
                            onClick={() => setMode('EDIT')}
                            className="bg-deep-black text-white font-mono uppercase px-6 py-2 hover:bg-linera-red transition-colors shadow-hard hover:shadow-hard-hover flex-1 md:flex-none"
                        >
                            [ Edit Profile ]
                        </button>
                    </div>
                </div>

                <div className="bg-paper-white border-4 border-deep-black shadow-hard p-0 relative mb-8">
                    {/* Badge Header */}
                    <div className="bg-gray-100 border-b-4 border-deep-black p-4 flex justify-between items-center">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 bg-red-500 rounded-full border border-black"></div>
                            <div className="w-3 h-3 bg-yellow-500 rounded-full border border-black"></div>
                            <div className="w-3 h-3 bg-green-500 rounded-full border border-black"></div>
                        </div>
                        <span className="font-mono text-xs font-bold uppercase">Verified Creator</span>
                    </div>

                    <div className="p-6 md:p-12 flex flex-col md:flex-row gap-8 md:gap-12">
                        {/* Avatar Placeholder */}
                        <div className="shrink-0 self-center md:self-start">
                            <div className="w-32 h-32 md:w-40 md:h-40 bg-deep-black border-4 border-deep-black flex items-center justify-center">
                                <span className="font-display text-4xl md:text-6xl text-white">
                                    {profile.displayName ? profile.displayName.substring(0, 1).toUpperCase() : '?'}
                                </span>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 space-y-6">
                            <div>
                                <label className="block font-mono text-xs text-gray-400 uppercase mb-1">Display Name</label>
                                <h2 className="font-display text-2xl md:text-4xl uppercase leading-none break-all">{profile.displayName || 'UNKNOWN'}</h2>
                            </div>

                            <div>
                                <label className="block font-mono text-xs text-gray-400 uppercase mb-1">Bio Data</label>
                                <p className="font-mono text-sm leading-relaxed border-l-2 border-linera-red pl-4">
                                    {profile.bio || 'No bio data found on chain.'}
                                </p>
                            </div>

                            {/* Social Badges */}
                            <div>
                                <label className="block font-mono text-xs text-gray-400 uppercase mb-2">Social Links</label>
                                <div className="flex flex-wrap gap-3">
                                    {profile.socials.twitter && (
                                        <a href={`https://twitter.com/${profile.socials.twitter}`} target="_blank" className="bg-black text-white px-3 py-1 font-mono text-xs hover:bg-linera-red transition-colors">TWITTER</a>
                                    )}
                                    {profile.socials.instagram && (
                                        <a href={`https://instagram.com/${profile.socials.instagram}`} target="_blank" className="bg-black text-white px-3 py-1 font-mono text-xs hover:bg-linera-red transition-colors">INSTAGRAM</a>
                                    )}
                                    {profile.socials.youtube && (
                                        <a href={`https://youtube.com/${profile.socials.youtube}`} target="_blank" className="bg-black text-white px-3 py-1 font-mono text-xs hover:bg-linera-red transition-colors">YOUTUBE</a>
                                    )}
                                    {profile.socials.tiktok && (
                                        <a href={`https://tiktok.com/${profile.socials.tiktok}`} target="_blank" className="bg-black text-white px-3 py-1 font-mono text-xs hover:bg-linera-red transition-colors">TIKTOK</a>
                                    )}
                                    {Object.values(profile.socials).every(val => !val) && (
                                        <span className="text-xs font-mono text-gray-400 italic">No social links added.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Received Donations Section */}
                <div className="bg-paper-white border-4 border-deep-black shadow-hard p-0 relative">
                    <div className="bg-gray-100 border-b-4 border-deep-black p-4 flex justify-between items-center">
                        <span className="font-mono text-xs font-bold uppercase">Received Donations</span>
                        <span className="bg-linera-red text-white text-[10px] px-2 py-1 font-bold rounded-full border border-black">
                            {donations.length}
                        </span>
                    </div>
                    <div className="p-0">
                        {donations.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 font-mono text-sm">
                                No donations received yet.
                            </div>
                        ) : (
                            <div className="divide-y-2 divide-gray-100">
                                {donations.map((donation, idx) => (
                                    <div key={idx} className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-sm">
                                                    {donation.source_chain_id
                                                        ? `${donation.source_chain_id.substring(0, 8)}...`
                                                        : (donation.from_owner ? `${donation.from_owner.substring(0, 6)}...` : 'Anonymous')}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-mono">
                                                    {(() => {
                                                        const ts = Number(donation.timestamp);
                                                        // Check if timestamp is in microseconds (Linera) or milliseconds
                                                        // Microseconds usually > 1e15, Milliseconds > 1e12
                                                        const date = new Date(ts > 1e14 ? ts / 1000 : ts);
                                                        return date.toLocaleString();
                                                    })()}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 italic">"{donation.message}"</p>
                                        </div>
                                        <div className="font-display text-xl font-bold text-linera-red">
                                            +{donation.amount} LIN
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- SUBSCRIPTION MODE ---
    if (mode === 'SUBSCRIPTION') {
        return (
            <div className="w-full max-w-2xl bg-paper-white border-4 border-deep-black shadow-hard p-0 relative mx-0 md:mx-auto animate-slide-in mb-12">
                <div className="border-b-4 border-deep-black p-4 md:p-6 bg-paper-white flex justify-between items-center">
                    <div>
                        <h1 className="font-display text-2xl md:text-3xl uppercase tracking-tighter text-deep-black">
                            Subscription_Config
                        </h1>
                        <p className="font-mono text-xs mt-1 text-gray-500">MANAGE YOUR SUBSCRIBERS</p>
                    </div>
                    <button onClick={handleCancel} className="font-mono text-xs underline hover:text-linera-red">CANCEL</button>
                </div>

                <div className="p-4 md:p-6 space-y-6 md:space-y-8">
                    <p className="font-mono text-sm text-gray-600">
                        Set a monthly price for exclusive access to your content. Set price to 0 to disable subscriptions.
                    </p>
                    <div className="space-y-4">
                        <fieldset className="relative border-2 border-deep-black p-4 pt-2 group focus-within:shadow-hard-sm transition-shadow">
                            <legend className="font-mono text-xs font-bold px-2 bg-paper-white border-2 border-deep-black uppercase">
                                Monthly Price (LIN)
                            </legend>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={subscriptionPrice}
                                onChange={(e) => setSubscriptionPrice(e.target.value)}
                                className="w-full bg-transparent border-none outline-none font-mono font-bold text-xl placeholder-gray-300"
                                placeholder="0.00"
                            />
                        </fieldset>
                        <fieldset className="relative border-2 border-deep-black p-4 pt-2 group focus-within:shadow-hard-sm transition-shadow">
                            <legend className="font-mono text-xs font-bold px-2 bg-paper-white border-2 border-deep-black uppercase">
                                Plan Description
                            </legend>
                            <textarea
                                value={subscriptionDescription}
                                onChange={(e) => setSubscriptionDescription(e.target.value)}
                                className="w-full bg-transparent border-none outline-none font-mono text-sm placeholder-gray-300 min-h-[100px] resize-none"
                                placeholder="Describe what subscribers get (e.g. exclusive posts, direct messages)..."
                            />
                        </fieldset>
                    </div>

                    <button
                        onClick={handleSaveSubscription}
                        disabled={isSaving}
                        className={`
                        w-full py-4 bg-emerald-500 text-white font-display uppercase text-xl tracking-widest border-4 border-deep-black
                        transition-all duration-100 hover:bg-emerald-600
                        ${isSaving ? 'translate-y-1 translate-x-1 shadow-none' : 'hover:-translate-y-1 hover:-translate-x-1 shadow-hard hover:shadow-hard-hover'}
                    `}
                    >
                        {isSaving ? 'Updating...' : 'Update Subscription'}
                    </button>
                </div>
            </div>
        );
    }

    // --- EDIT MODE ---
    return (
        <div className="w-full max-w-2xl bg-paper-white border-4 border-deep-black shadow-hard p-0 relative mx-0 md:mx-0 animate-slide-in mb-12">
            {/* Card Header */}
            <div className="border-b-4 border-deep-black p-4 md:p-6 bg-paper-white flex justify-between items-center">
                <div>
                    <h1 className="font-display text-2xl md:text-3xl uppercase tracking-tighter text-deep-black">
                        Identity_Config
                    </h1>
                    <p className="font-mono text-xs mt-1 text-gray-500">EDIT MODE // UNLOCKED</p>
                </div>
                <button onClick={handleCancel} className="font-mono text-xs underline hover:text-linera-red">CANCEL</button>
            </div>

            <div className="p-4 md:p-6 space-y-6 md:space-y-8 h-[60vh] overflow-y-auto custom-scrollbar">

                {/* Profile Images */}
                <div className="space-y-4">
                    <h3 className="font-display text-xl uppercase border-b-2 border-gray-200 pb-1">Profile Images</h3>

                    {/* Avatar Upload */}
                    <div className="border-2 border-dashed border-gray-300 p-4 bg-white rounded">
                        <label className="text-xs font-bold uppercase flex items-center gap-2 mb-2 text-linera-red">
                            <ImageIcon className="w-4 h-4" /> Avatar (Profile Picture)
                        </label>
                        {avatarHash ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Avatar Uploaded
                                    </span>
                                    <button
                                        onClick={() => { setAvatarHash(''); setAvatarFile(null); }}
                                        className="text-xs text-red-500 hover:text-red-700 font-bold uppercase underline"
                                    >
                                        Replace Avatar
                                    </button>
                                </div>
                                <div className="text-xs text-gray-500 font-mono break-all bg-gray-50 p-1 rounded select-all">
                                    {avatarHash}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => {
                                        if (e.target.files && e.target.files[0]) {
                                            setAvatarFile(e.target.files[0]);
                                        }
                                    }}
                                    className="text-sm"
                                />
                                {avatarFile && (
                                    <button
                                        onClick={() => uploadFile(avatarFile, 'avatar')}
                                        className="bg-deep-black text-white px-3 py-1 text-xs uppercase font-bold"
                                    >
                                        Upload
                                    </button>
                                )}
                                {activeUploadId === 'avatar' && <span className="text-xs animate-pulse">Uploading...</span>}
                            </div>
                        )}
                    </div>

                    {/* Header Upload */}
                    <div className="border-2 border-dashed border-gray-300 p-4 bg-white rounded">
                        <label className="text-xs font-bold uppercase flex items-center gap-2 mb-2 text-linera-red">
                            <ImageIcon className="w-4 h-4" /> Header (Cover Image)
                        </label>
                        {headerHash ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Header Uploaded
                                    </span>
                                    <button
                                        onClick={() => { setHeaderHash(''); setHeaderFile(null); }}
                                        className="text-xs text-red-500 hover:text-red-700 font-bold uppercase underline"
                                    >
                                        Replace Header
                                    </button>
                                </div>
                                <div className="text-xs text-gray-500 font-mono break-all bg-gray-50 p-1 rounded select-all">
                                    {headerHash}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={e => {
                                        if (e.target.files && e.target.files[0]) {
                                            setHeaderFile(e.target.files[0]);
                                        }
                                    }}
                                    className="text-sm"
                                />
                                {headerFile && (
                                    <button
                                        onClick={() => uploadFile(headerFile, 'header')}
                                        className="bg-deep-black text-white px-3 py-1 text-xs uppercase font-bold"
                                    >
                                        Upload
                                    </button>
                                )}
                                {activeUploadId === 'header' && <span className="text-xs animate-pulse">Uploading...</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Name Input */}
                <fieldset className="relative border-2 border-deep-black p-4 pt-2 group focus-within:shadow-hard-sm transition-shadow">
                    <legend className="font-mono text-xs font-bold px-2 bg-paper-white border-2 border-deep-black uppercase">
                        Display Name
                    </legend>
                    <input
                        type="text"
                        value={profile.displayName}
                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                        className="w-full bg-transparent border-none outline-none font-sans font-bold text-xl placeholder-gray-300"
                        placeholder="ENTER_NAME"
                    />
                </fieldset>

                {/* Bio Input with AI Trigger */}
                <fieldset className="relative border-2 border-deep-black p-0 group focus-within:shadow-hard-sm transition-shadow">
                    <legend className="font-mono text-xs font-bold ml-4 px-2 bg-paper-white border-2 border-deep-black border-b-0 -mb-2 z-10 relative uppercase w-max">
                        Bio Data
                    </legend>
                    <div className="relative">
                        <textarea
                            value={profile.bio}
                            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                            className="w-full h-32 bg-[linear-gradient(#e5e7eb_1px,transparent_1px)] bg-[length:100%_2rem] border-none outline-none p-4 pt-6 font-mono text-sm leading-8 resize-none focus:bg-blue-50/10"
                            placeholder="Tell your story..."
                        />
                        <button
                            onClick={handleGenerateBio}
                            disabled={isGenerating}
                            className="absolute bottom-4 right-4 bg-linera-red text-white p-2 border-2 border-deep-black hover:bg-black transition-colors disabled:opacity-50"
                            title="Generate with Gemini"
                        >
                            {isGenerating ? (
                                <span className="animate-spin block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                            ) : (
                                <span className="font-mono text-xs font-bold flex items-center gap-1">AI GEN <span className="text-[10px]">⚡</span></span>
                            )}
                        </button>
                    </div>
                </fieldset>

                {/* Socials Grid */}
                <div className="space-y-4">
                    <h3 className="font-display text-xl uppercase border-b-2 border-gray-200 pb-1">Social Uplink</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* Twitter */}
                        <fieldset className="relative border-2 border-deep-black p-2 group focus-within:bg-gray-50 transition-colors">
                            <legend className="font-mono text-[10px] font-bold px-1 bg-paper-white border border-deep-black uppercase">Twitter / X</legend>
                            <div className="flex items-center">
                                <span className="text-gray-400 font-mono mr-1">@</span>
                                <input
                                    type="text"
                                    value={profile.socials.twitter}
                                    onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, twitter: e.target.value } })}
                                    className="w-full bg-transparent border-none outline-none font-mono text-sm"
                                    placeholder="username"
                                />
                            </div>
                        </fieldset>

                        {/* Instagram */}
                        <fieldset className="relative border-2 border-deep-black p-2 group focus-within:bg-gray-50 transition-colors">
                            <legend className="font-mono text-[10px] font-bold px-1 bg-paper-white border border-deep-black uppercase">Instagram</legend>
                            <div className="flex items-center">
                                <span className="text-gray-400 font-mono mr-1">@</span>
                                <input
                                    type="text"
                                    value={profile.socials.instagram}
                                    onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, instagram: e.target.value } })}
                                    className="w-full bg-transparent border-none outline-none font-mono text-sm"
                                    placeholder="username"
                                />
                            </div>
                        </fieldset>

                        {/* YouTube */}
                        <fieldset className="relative border-2 border-deep-black p-2 group focus-within:bg-gray-50 transition-colors">
                            <legend className="font-mono text-[10px] font-bold px-1 bg-paper-white border border-deep-black uppercase">YouTube</legend>
                            <div className="flex items-center">
                                <span className="text-gray-400 font-mono mr-1">/</span>
                                <input
                                    type="text"
                                    value={profile.socials.youtube}
                                    onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, youtube: e.target.value } })}
                                    className="w-full bg-transparent border-none outline-none font-mono text-sm"
                                    placeholder="channel_handle"
                                />
                            </div>
                        </fieldset>

                        {/* TikTok */}
                        <fieldset className="relative border-2 border-deep-black p-2 group focus-within:bg-gray-50 transition-colors">
                            <legend className="font-mono text-[10px] font-bold px-1 bg-paper-white border border-deep-black uppercase">TikTok</legend>
                            <div className="flex items-center">
                                <span className="text-gray-400 font-mono mr-1">@</span>
                                <input
                                    type="text"
                                    value={profile.socials.tiktok}
                                    onChange={(e) => setProfile({ ...profile, socials: { ...profile.socials, tiktok: e.target.value } })}
                                    className="w-full bg-transparent border-none outline-none font-mono text-sm"
                                    placeholder="username"
                                />
                            </div>
                        </fieldset>
                    </div>
                </div >

            </div >

            {/* Footer Actions */}
            < div className="p-4 md:p-6 pt-0 border-t-2 border-gray-100 mt-4" >
                {uploadStatus && (
                    <div className="mb-4 text-center">
                        <span className="text-xs font-bold text-linera-red animate-pulse">{uploadStatus}</span>
                    </div>
                )}
                <button
                    onClick={handleSave}
                    className={`
                    w-full py-4 bg-deep-black text-white font-display uppercase text-xl tracking-widest border-4 border-deep-black
                    transition-all duration-100
                    ${isSaving ? 'translate-y-1 translate-x-1 shadow-none' : 'hover:-translate-y-1 hover:-translate-x-1 shadow-hard hover:shadow-hard-hover'}
                `}
                >
                    {isSaving ? 'Writing to Chain...' : 'Commit Changes'}
                </button>
            </div>
        </div>
    );
};

export default ProfileEditor;