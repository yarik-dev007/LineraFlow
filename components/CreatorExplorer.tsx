import React, { useState, useMemo } from 'react';
import { Creator } from '../types';

interface CreatorExplorerProps {
  creators: Creator[];
  onSelectCreator: (creator: Creator) => void;
  currentUserAddress?: string;
}

const CreatorExplorer: React.FC<CreatorExplorerProps> = ({ creators, onSelectCreator, currentUserAddress }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCreators = useMemo(() => {
    return creators.filter(creator => {
      // 1. Exclude current user (Case Insensitive)
      if (currentUserAddress && creator.contractAddress) {
        if (creator.contractAddress.toLowerCase() === currentUserAddress.toLowerCase()) {
          return false;
        }
      }

      // 2. Filter by search term (Name or Chain ID)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const nameMatch = creator.name.toLowerCase().includes(term);
        const chainMatch = creator.chainId?.toLowerCase().includes(term) || creator.contractAddress?.toLowerCase().includes(term);
        return nameMatch || chainMatch;
      }

      return true;
    });
  }, [creators, currentUserAddress, searchTerm]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-12 border-b-4 border-deep-black pb-4 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h2 className="font-display text-5xl uppercase text-deep-black">Global Index</h2>
          <p className="font-mono text-sm text-gray-500 mt-2">DISCOVER & SUPPORT AUTONOMOUS AUTHORS</p>
        </div>

        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="SEARCH AUTHOR (NAME / CHAIN ID)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-paper-white border-4 border-deep-black p-3 font-mono text-sm focus:outline-none focus:bg-gray-50 placeholder:text-gray-400"
            />
            <div className="absolute right-3 top-3 text-gray-400 font-bold">🔍</div>
          </div>
          <div className="hidden md:block font-mono text-xs text-right">
            TOTAL AUTHORS: {filteredCreators.length}<br />
            STATUS: OPERATIONAL
          </div>
        </div>
      </div>

      {filteredCreators.length === 0 ? (
        <div className="text-center py-24 border-4 border-dashed border-gray-300">
          <p className="font-mono text-gray-400">NO AUTHORS FOUND MATCHING QUERY.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredCreators.map((creator) => (
            <div
              key={creator.id}
              onClick={() => onSelectCreator(creator)}
              className="group bg-paper-white border-4 border-deep-black shadow-hard hover:shadow-hard-hover hover:translate-x-1 hover:translate-y-1 transition-all duration-200 flex flex-col cursor-pointer"
            >
              {/* Card Header/Image Placeholder */}
              <div className="h-40 bg-gray-100 border-b-4 border-deep-black relative overflow-hidden group-hover:bg-gray-50 transition-colors">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-linera-red to-transparent scale-75 group-hover:scale-100 transition-transform duration-500"></div>
                <div className="absolute top-2 right-2 bg-deep-black text-white text-xs font-mono px-2 py-1 z-10">
                  {creator.category}
                </div>
                <div className="absolute bottom-0 left-0 p-4 w-full">
                  <div className="flex items-end gap-4">
                    <div className="w-16 h-16 bg-deep-black border-2 border-white shadow-sm flex items-center justify-center overflow-hidden">
                      {/* Initials Avatar */}
                      <span className="font-display text-white text-2xl">{creator.name.substring(0, 1)}</span>
                    </div>
                    <div className="mb-1">
                      <h3 className="font-display text-xl uppercase leading-none text-deep-black bg-white px-1 inline-block">{creator.name}</h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 flex flex-col">
                <p className="font-mono text-xs text-gray-600 leading-relaxed mb-6 line-clamp-3 border-l-2 border-linera-red pl-3">
                  {creator.shortBio}
                </p>

                <div className="mt-auto flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Total Raised</span>
                    <span className="font-mono font-bold text-lg">{creator.raised} LIN</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Products</span>
                    <span className="font-mono font-bold text-lg">{creator.productsCount || 0}</span>
                  </div>
                  <span className="text-deep-black font-bold text-sm flex items-center gap-2 group-hover:gap-3 transition-all ml-4">
                    VIEW <span>{'->'}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CreatorExplorer;