import React, { useMemo } from 'react';
import { Creator } from '../types';

interface CreatorDetailProps {
    creator: Creator;
    allDonations: any[];
    onBack: () => void;
    onDonate: () => void;
}

const CreatorDetail: React.FC<CreatorDetailProps> = ({ creator, allDonations, onBack, onDonate }) => {
    // Filter and get last 3 donations for this creator in realtime
    const recentDonations = useMemo(() => {
        return allDonations
            .filter((d: any) => d.to_owner === creator.contractAddress)
            .slice(0, 3);
    }, [allDonations, creator.contractAddress]);

    // Calculate unique backers count
    const backersCount = useMemo(() => {
        const uniqueDonors = new Set(
            allDonations
                .filter((d: any) => d.to_owner === creator.contractAddress)
                .map((d: any) => d.from_owner)
        );
        return uniqueDonors.size;
    }, [allDonations, creator.contractAddress]);

    return (
        <div className="w-full max-w-5xl mx-auto animate-slide-in pb-12">
            {/* Navigation */}
            <button
                onClick={onBack}
                className="mb-8 flex items-center gap-2 font-mono text-sm font-bold hover:text-linera-red transition-colors group"
            >
                <span className="group-hover:-translate-x-1 transition-transform">{'<-'}</span> RETURN TO INDEX
            </button>

            {/* Header Section */}
            <div className="relative bg-paper-white border-4 border-deep-black shadow-hard mb-8">
                <div className="h-40 md:h-64 bg-deep-black overflow-hidden relative">
                    <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,#FF4438_25%,transparent_25%,transparent_50%,#FF4438_50%,#FF4438_75%,transparent_75%,transparent)] bg-[length:20px_20px]"></div>
                    <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black to-transparent"></div>
                </div>

                <div className="px-6 md:px-8 pb-8 relative">
                    {/* Avatar - Negative Margin to overlap */}
                    <div className="absolute -top-12 md:-top-16 left-6 md:left-8 w-24 h-24 md:w-32 md:h-32 bg-white border-4 border-deep-black shadow-sm flex items-center justify-center">
                        <span className="font-display text-2xl md:text-4xl text-deep-black">{creator.name.substring(0, 2).toUpperCase()}</span>
                    </div>

                    <div className="pl-0 md:pl-40 pt-16 md:pt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-4">
                        <div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 mb-1">
                                <h1 className="font-display text-3xl md:text-5xl uppercase text-deep-black leading-none break-all md:break-normal">{creator.name}</h1>
                                <span className="self-start bg-linera-red text-white text-xs font-mono px-2 py-1 font-bold uppercase">{creator.category}</span>
                            </div>
                            <p className="font-mono text-xs md:text-sm text-gray-500 break-all">{creator.contractAddress || '0x88a...Contract'}</p>
                        </div>

                        <button
                            onClick={onDonate}
                            className="w-full md:w-auto bg-deep-black text-white font-display text-lg md:text-xl uppercase px-6 py-4 border-4 border-transparent hover:bg-linera-red hover:shadow-[4px_4px_0px_0px_#000] transition-all"
                        >
                            DONATE
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Stats */}
                <div className="space-y-6">
                    <div className="bg-paper-white border-4 border-deep-black p-6">
                        <h3 className="font-mono text-xs font-bold uppercase border-b-2 border-gray-200 pb-2 mb-4">Performance Metrics</h3>
                        <div className="space-y-4">
                            <div>
                                <span className="block text-gray-500 text-xs uppercase">Total Raised</span>
                                <span className="font-display text-3xl">{creator.raised} LIN</span>
                            </div>
                            <div>
                                <span className="block text-gray-500 text-xs uppercase">Backers</span>
                                <span className="font-display text-3xl">{backersCount}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-linera-red border-4 border-deep-black p-6 text-white">
                        <h3 className="font-mono text-xs font-bold uppercase border-b-2 border-white/20 pb-2 mb-4">Verified Links</h3>
                        {creator.socials && creator.socials.length > 0 ? (
                            <ul className="space-y-2 font-mono text-sm">
                                {creator.socials.map((social: any, idx: number) => (
                                    <li key={idx} className="flex items-center gap-2 hover:underline cursor-pointer">
                                        <a
                                            href={social.url.startsWith('http') ? social.url : `https://${social.name}.com/${social.url}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2"
                                        >
                                            {'->'} {social.name.charAt(0).toUpperCase() + social.name.slice(1)}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="font-mono text-sm opacity-70">No social links added yet.</p>
                        )}
                    </div>
                </div>

                {/* Right Column: Bio & Content */}
                <div className="md:col-span-2 space-y-8">
                    <div className="bg-white border-4 border-deep-black p-6 md:p-8">
                        <h2 className="font-display text-2xl uppercase mb-4">Creator Bio</h2>
                        <p className="font-mono text-sm leading-relaxed text-gray-700 mb-6">
                            {creator.fullBio || creator.shortBio}
                        </p>
                    </div>

                    <div className="border-t-4 border-deep-black pt-8">
                        <h3 className="font-mono text-xs font-bold uppercase mb-4 text-gray-400">Recent Donates</h3>
                        {recentDonations && recentDonations.length > 0 ? (
                            <div className="space-y-2">
                                {recentDonations.map((donation: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between bg-gray-50 p-3 border-2 border-gray-200">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span className="font-mono text-xs">
                                                {donation.from_owner ? `${donation.from_owner.substring(0, 6)}...${donation.from_owner.substring(donation.from_owner.length - 4)}` : 'Anonymous'}
                                            </span>
                                        </div>
                                        <span className="font-mono font-bold text-xs">+{donation.amount} LIN</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="font-mono text-sm text-gray-400">No donations yet.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreatorDetail;