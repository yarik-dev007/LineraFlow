import React, { useState } from 'react';
import { WalletState } from '../types';
import { useLinera } from './useLinera';

interface WalletHUDProps {
    wallet: WalletState;
    onMint: () => void;
    onWithdraw: () => void;
    onClose: () => void;
    onConnect: () => void;
}

const WalletHUD: React.FC<WalletHUDProps> = ({ onMint, onWithdraw, onClose, onConnect }) => {
    const { accountOwner, chainId, balances, loading, status, error, application, queryBalance } = useLinera();
    const [isMintHovered, setIsMintHovered] = useState(false);
    const [isWithdrawHovered, setIsWithdrawHovered] = useState(false);
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const isConnected = status === 'Ready' && !loading;
    const isConnecting = loading && status !== 'Error';

    console.log('WalletHUD render:', { status, loading, isConnected, balances });

    const handleTopUp = async () => {
        if (!application || !accountOwner || !topUpAmount) return;

        setIsProcessing(true);
        try {
            const mutation = `mutation {
  mint(owner: "${accountOwner}", amount: "${topUpAmount}")
}`;
            await application.query(JSON.stringify({ query: mutation }));
            await queryBalance(); // Update balance
            setShowTopUpModal(false);
            setTopUpAmount('');
        } catch (error: any) {
            alert(`❌ Error: ${error.message || 'Mint failed'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleWithdraw = async () => {
        if (!application) return;

        setIsProcessing(true);
        try {
            const mutation = `mutation {
  withdraw
}`;
            await application.query(JSON.stringify({ query: mutation }));
            await queryBalance(); // Update balance
        } catch (error: any) {
            alert(`❌ Error: ${error.message || 'Withdraw failed'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-deep-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Modal Widget */}
            <div
                className="relative w-[92%] md:w-full max-w-md font-mono flex flex-col group shadow-2xl animate-pop-in"
            >

                {/* Header */}
                <div
                    className="bg-deep-black text-white px-4 py-3 border-4 border-deep-black border-b-0 font-bold text-xs tracking-widest flex justify-between items-center"
                >
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-linera-red animate-pulse' : 'bg-gray-500'}`}></span>
                        <span>{isConnected ? '// WALLET_CONTROLLER' : '// LINERA_INIT'}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center hover:bg-linera-red text-white transition-colors font-bold"
                    >
                        X
                    </button>
                </div>

                {!isConnected ? (
                    /* CONNECTING/LOADING STATE */
                    <div className="bg-paper-white border-4 border-deep-black shadow-hard p-8 flex flex-col items-center text-center space-y-6">
                        <div className="w-20 h-20 bg-gray-100 border-4 border-deep-black flex items-center justify-center mb-2">
                            {status === 'Error' ? (
                                <span className="text-4xl">⚠️</span>
                            ) : (
                                <span className="text-4xl">🔌</span>
                            )}
                        </div>
                        <div>
                            <h2 className="font-display text-2xl uppercase text-deep-black mb-2">
                                {status === 'Error' ? 'Connection Failed' : 'Initializing'}
                            </h2>
                            <p className="font-mono text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                                {status === 'Error'
                                    ? `Error: ${error?.message || 'Unknown error'}`
                                    : `Status: ${status}`}
                            </p>
                        </div>

                        {status === 'Error' ? (
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-4 bg-linera-red text-white font-display text-lg uppercase tracking-widest hover:bg-deep-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all shadow-[4px_4px_0px_0px_#000] border-2 border-transparent flex justify-center items-center gap-2"
                            >
                                <span>Retry Connection</span>
                            </button>
                        ) : (
                            status === 'Idle' ? (
                                <button
                                    onClick={onConnect}
                                    className="w-full py-4 bg-linera-red text-white font-display text-lg uppercase tracking-widest hover:bg-deep-black hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all shadow-[4px_4px_0px_0px_#000] border-2 border-transparent flex justify-center items-center gap-2"
                                >
                                    <span>Connect Wallet</span>
                                </button>
                            ) : (
                                <div className="w-full flex items-center justify-center gap-2">
                                    <span className="animate-spin h-6 w-6 border-4 border-deep-black border-t-transparent rounded-full"></span>
                                    <span className="text-sm font-bold text-deep-black">{status}...</span>
                                </div>
                            )
                        )}
                    </div>
                ) : (
                    /* CONNECTED STATE */
                    <>
                        {/* Owner Section (Cold Zone) - LINERA ACCOUNT */}
                        <div className="bg-paper-white border-4 border-deep-black border-b-0 p-6 relative">
                            <div className="flex flex-col space-y-4">
                                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                                    <span className="text-xs text-deep-black uppercase font-black tracking-wider">Account Owner</span>
                                    <span className="text-[10px] bg-green-100 px-2 py-1 border border-black text-deep-black font-bold">LINERA::CONNECTED</span>
                                </div>
                                <div className="flex justify-between items-baseline pt-1">
                                    <span className="text-xs text-gray-600">ADDR:</span>
                                    <span className="text-xs font-bold truncate w-48 md:w-64 text-right bg-gray-100 p-1">{accountOwner || '0x...'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-deep-black text-sm">ACCOUNT BAL:</span>
                                    <span className="font-black text-deep-black text-xl md:text-2xl">{balances.accountBalance}</span>
                                </div>
                            </div>
                        </div>

                        {/* Chain Section (Hot Zone) - LINERA NETWORK */}
                        <div className="bg-linera-red border-4 border-deep-black border-b-0 p-6 text-white relative overflow-hidden">
                            {/* Scanline effect */}
                            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:10px_10px] pointer-events-none"></div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-center mb-4 border-b border-white/20 pb-2">
                                    <span className="text-xs font-black uppercase tracking-wider">Linera Network</span>
                                    <span className="text-[10px] font-mono opacity-90 border border-white px-2">ACTIVE NODE</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] uppercase opacity-80">Chain ID</span>
                                        <span className="text-[10px] font-mono opacity-90 bg-black/20 p-1">{chainId?.substring(0, 16) || 'N/A'}...</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] uppercase opacity-80">Chain Balance</span>
                                        <span className="text-3xl md:text-4xl font-display font-black leading-none">{balances.chainBalance} <span className="text-lg">LIN</span></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Grid */}
                        <div className="flex border-4 border-deep-black shadow-hard bg-white">
                            <button
                                onClick={() => setShowTopUpModal(true)}
                                onMouseEnter={() => setIsMintHovered(true)}
                                onMouseLeave={() => setIsMintHovered(false)}
                                disabled={isProcessing}
                                className={`flex-1 py-6 font-bold text-sm uppercase border-r-4 border-deep-black transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                        ${isMintHovered ? 'bg-deep-black text-white' : 'bg-paper-white text-deep-black'}
                    `}
                            >
                                <span>[ + ]</span>
                                <span>Top Up</span>
                            </button>
                            <button
                                onClick={handleWithdraw}
                                onMouseEnter={() => setIsWithdrawHovered(true)}
                                onMouseLeave={() => setIsWithdrawHovered(false)}
                                disabled={isProcessing}
                                className={`flex-1 py-6 font-bold text-sm uppercase transition-colors duration-150 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                        ${isWithdrawHovered ? 'bg-linera-red text-white' : 'bg-deep-black text-white'}
                    `}
                            >
                                <span>Withdraw</span>
                                <span>{`->`}</span>
                            </button>
                        </div>
                    </>
                )}
                {/* Top Up Modal Overlay */}
                {showTopUpModal && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-deep-black/90 backdrop-blur-sm p-4 animate-fade-in">
                        <div className="w-full bg-paper-white border-4 border-deep-black shadow-hard p-6 flex flex-col gap-4">
                            <div className="flex justify-between items-center border-b-4 border-deep-black pb-2">
                                <h3 className="font-display text-xl uppercase">Top Up Wallet</h3>
                                <button
                                    onClick={() => setShowTopUpModal(false)}
                                    className="font-bold hover:text-linera-red"
                                >
                                    [CLOSE]
                                </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold uppercase">Amount to Mint</label>
                                <input
                                    type="number"
                                    value={topUpAmount}
                                    onChange={(e) => setTopUpAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full p-3 font-mono text-lg border-4 border-deep-black focus:outline-none focus:border-linera-red transition-colors"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-4 mt-2">
                                <button
                                    onClick={() => setShowTopUpModal(false)}
                                    className="flex-1 py-3 font-bold uppercase border-4 border-deep-black hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleTopUp}
                                    disabled={!topUpAmount || isProcessing}
                                    className="flex-1 py-3 font-bold uppercase bg-linera-red text-white border-4 border-deep-black hover:shadow-hard hover:-translate-y-1 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                                >
                                    {isProcessing ? 'Minting...' : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WalletHUD;