import React from 'react';
import { AppView, WalletState } from '../types';
import { Wallet } from 'lucide-react';


interface SidebarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
  wallet: WalletState;
  onToggleWallet: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, wallet, onToggleWallet }) => {
  const navItems = [
    { id: 'EXPLORE', label: 'EXPLORE', icon: '○' },
    { id: 'MARKETPLACE', label: 'MARKET', icon: '◇' },
    { id: 'FEED', label: 'MY FEED', icon: '▤' },
    { id: 'PROFILE', label: 'IDENTITY', icon: '□' },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR (Visible only on Large screens lg: 1024px+) */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-deep-black text-white flex-col justify-between z-40 border-r-4 border-deep-black shadow-hard">
        {/* Brand */}
        <button
          onClick={() => setView('LANDING')}
          className="p-6 border-b border-white/20 hover:bg-white/10 transition-colors w-full text-left group"
          title="Return to Landing Page"
        >
          <h1 className="font-display text-2xl tracking-tighter text-linera-red group-hover:text-white transition-colors">
            LINERA<span className="text-white group-hover:text-linera-red transition-colors">FLOW</span>
          </h1>
        </button>

        {/* Nav */}
        <nav className="flex-1 py-8 flex flex-col gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id as AppView)}
              className={`
                flex items-center px-6 py-4 transition-all duration-200
                ${currentView === item.id
                  ? item.id === 'FEED'
                    ? 'bg-emerald-500 text-white font-bold translate-x-2 shadow-[4px_4px_0px_0px_#000]'
                    : 'bg-white text-deep-black font-bold translate-x-2 shadow-[4px_4px_0px_0px_#FF4438]'
                  : 'hover:bg-white/10 text-gray-300 hover:text-white'}
              `}
            >
              <span className={`text-xl font-mono mr-4 text-center w-6 ${item.id === 'FEED' && currentView !== 'FEED' ? 'text-emerald-500' : ''}`}>{item.icon}</span>
              <span className="font-mono uppercase tracking-widest text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Wallet Toggle (Desktop) */}
        <button
          onClick={onToggleWallet}
          className={`p-6 border-t border-white/20 transition-colors group text-left
             ${!wallet.isConnected ? 'bg-linera-red hover:bg-white hover:text-deep-black text-white' : 'hover:bg-linera-red'}
          `}
        >
          {!wallet.isConnected ? (
            <div className="flex flex-col items-center justify-center py-2 gap-1">
              <Wallet className="w-6 h-6" />
              <span className="font-display text-xl uppercase tracking-widest">Connect Wallet</span>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 group-hover:text-white uppercase tracking-widest font-bold">Wallet Bal</span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-xl font-bold">{wallet.ownerBalance.toFixed(0)}</span>
                <span className="text-xs text-gray-500 group-hover:text-white/80">LIN</span>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* MOBILE & TABLET BOTTOM NAV (Visible on screens smaller than lg) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-20 bg-deep-black text-white flex justify-around items-center z-50 border-t-4 border-deep-black shadow-[0px_-4px_10px_rgba(0,0,0,0.3)] pb-2 safe-area-pb">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id as AppView)}
            className={`flex flex-col items-center justify-center w-full h-full pt-2 transition-colors 
                ${currentView === item.id
                ? item.id === 'FEED' ? 'text-emerald-500' : 'text-linera-red'
                : 'text-gray-400'
              }`}
          >
            <span className="text-2xl font-bold mb-1">{item.icon}</span>
            <span className="text-[10px] font-mono uppercase font-bold">{item.label}</span>
          </button>
        ))}

        {/* Mobile Wallet Trigger */}
        <button
          onClick={onToggleWallet}
          className={`flex flex-col items-center justify-center w-full h-full pt-2 border-l border-white/10 transition-colors
             ${!wallet.isConnected ? 'bg-linera-red text-white' : 'text-white bg-white/5 active:bg-linera-red'}
          `}
        >
          {!wallet.isConnected ? (
            <>
              <Wallet className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-mono uppercase font-bold">LINK</span>
            </>
          ) : (
            <>
              <Wallet className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-mono uppercase font-bold">{wallet.ownerBalance.toFixed(0)} LIN</span>
            </>
          )}
        </button>
      </div>
    </>
  );
};

export default Sidebar;