import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { initialize, Client, Faucet, Wallet, Application } from '@linera/client';
import { MetaMask } from '@linera/signer';
import { sessionManager } from '../utils/sessionManager';
import { Composite } from '../utils/CompositeSigner';

interface BalanceData {
    accountBalance: string;
    chainBalance: string;
}

interface LineraContextType {
    client?: Client;
    wallet?: Wallet;
    chainId?: string;
    application?: Application;
    accountOwner?: string;
    loading: boolean;
    status: 'Idle' | 'Loading' | 'Creating Wallet' | 'Creating Client' | 'Creating Chain' | 'Ready' | 'Error';
    error?: Error;
    balances: BalanceData;
    autoSignEnabled: boolean;
    connectWallet: () => Promise<void>;
    queryBalance: () => Promise<void>;
    enableAutoSign: () => Promise<void>;
    subscribeToMyItems: (callback: () => void) => void;
    unsubscribeFromMyItems: () => void;
    subscribeToMyPurchases: (callback: () => void) => void;
    unsubscribeFromMyPurchases: () => void;
    subscribeToMarketplace: (callback: () => void) => void;
    unsubscribeFromMarketplace: () => void;
}

const LineraContext = createContext<LineraContextType>({
    loading: false,
    status: 'Idle',
    balances: { accountBalance: '0', chainBalance: '0' },
    autoSignEnabled: false,
    connectWallet: async () => { },
    queryBalance: async () => { },
    enableAutoSign: async () => { },
    subscribeToMyItems: () => { },
    unsubscribeFromMyItems: () => { },
    subscribeToMyPurchases: () => { },
    unsubscribeFromMyPurchases: () => { },
    subscribeToMarketplace: () => { },
    unsubscribeFromMarketplace: () => { },
});

export const useLinera = () => useContext(LineraContext);
export { LineraContext };

export const LineraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<LineraContextType>({
        loading: false,
        status: 'Idle',
        balances: { accountBalance: '0', chainBalance: '0' },
        autoSignEnabled: false,
        connectWallet: async () => { },
        queryBalance: async () => { },
        enableAutoSign: async () => { },
        subscribeToMyItems: () => { },
        unsubscribeFromMyItems: () => { },
        subscribeToMyPurchases: () => { },
        unsubscribeFromMyPurchases: () => { },
        subscribeToMarketplace: () => { },
        unsubscribeFromMarketplace: () => { },
    });

    useEffect(() => {
        const appId = import.meta.env.VITE_LINERA_APPLICATION_ID;
        const chainId = import.meta.env.VITE_LINERA_MAIN_CHAIN_ID;
        console.log(`🚀 [LineraProvider] Environment Loaded:\n   - AppID: ${appId}\n   - ChainID: ${chainId}`);
    }, []);

    // Refs for subscription callbacks
    const myItemsCallbackRef = useRef<(() => void) | null>(null);
    const myPurchasesCallbackRef = useRef<(() => void) | null>(null);
    const marketplaceCallbackRef = useRef<(() => void) | null>(null);

    const subscribeToMyItems = React.useCallback((callback: () => void) => {
        console.log('📦 [LineraProvider] Subscribed to My Items updates');
        myItemsCallbackRef.current = callback;
    }, []);

    const unsubscribeFromMyItems = React.useCallback(() => {
        console.log('📦 [LineraProvider] Unsubscribed from My Items updates');
        myItemsCallbackRef.current = null;
    }, []);

    const subscribeToMyPurchases = React.useCallback((callback: () => void) => {
        console.log('🛍️ [LineraProvider] Subscribed to My Purchases updates');
        myPurchasesCallbackRef.current = callback;
    }, []);

    const unsubscribeFromMyPurchases = React.useCallback(() => {
        console.log('🛍️ [LineraProvider] Unsubscribed from My Purchases updates');
        myPurchasesCallbackRef.current = null;
    }, []);

    const subscribeToMarketplace = React.useCallback((callback: () => void) => {
        console.log('🏪 [LineraProvider] Subscribed to Marketplace updates');
        marketplaceCallbackRef.current = callback;
    }, []);

    const unsubscribeFromMarketplace = React.useCallback(() => {
        console.log('🏪 [LineraProvider] Unsubscribed from Marketplace updates');
        marketplaceCallbackRef.current = null;
    }, []);

    const queryBalance = React.useCallback(async () => {
        if (!state.application || !state.accountOwner) return;

        try {
            const result: any = await state.application.query(
                JSON.stringify({
                    query: `query {
            accounts {
              entry(key: "${state.accountOwner}") {
                value
              }
              chainBalance
            }
          }`
                })
            );

            let parsedResult = result;
            if (typeof result === 'string') {
                parsedResult = JSON.parse(result);
            }

            const accountBalance = parsedResult?.data?.accounts?.entry?.value ||
                parsedResult?.accounts?.entry?.value ||
                '0';
            const chainBalance = parsedResult?.data?.accounts?.chainBalance ||
                parsedResult?.accounts?.chainBalance ||
                '0';

            setState(prev => ({
                ...prev,
                balances: {
                    accountBalance,
                    chainBalance,
                },
            }));
        } catch (error) {
            // Silent error handling
        }
    }, [state.application, state.accountOwner]);

    // Listener Effect - on chain
    useEffect(() => {
        if (state.client && state.chainId) {
            const storageKey = `linera_last_height_${state.chainId}`;
            let active = true;

            const setupListener = async () => {
                try {
                    if (!state.client) return;
                    const chain = await state.client.chain(state.chainId!);
                    if (!active) return;

                    chain.onNotification((notification: any) => {
                        if (!active) return;

                        if (notification.reason?.NewBlock) {
                            const currentHeight = notification.reason.NewBlock.height;
                            const lastProcessedHeight = parseInt(localStorage.getItem(storageKey) || '0', 10);

                            if (currentHeight < lastProcessedHeight) {
                                return;
                            }

                            localStorage.setItem(storageKey, currentHeight.toString());
                            queryBalance();

                            // Call subscription callbacks if subscribed
                            if (myItemsCallbackRef.current) myItemsCallbackRef.current();
                            if (myPurchasesCallbackRef.current) myPurchasesCallbackRef.current();
                            if (marketplaceCallbackRef.current) marketplaceCallbackRef.current();
                        } else if (notification.reason?.NewIncomingMessage) {
                            queryBalance();

                            // Call subscription callbacks if subscribed
                            if (myItemsCallbackRef.current) myItemsCallbackRef.current();
                            if (myPurchasesCallbackRef.current) myPurchasesCallbackRef.current();
                            if (marketplaceCallbackRef.current) marketplaceCallbackRef.current();
                        } else if (notification.reason?.NewOutgoingMessage) {
                            queryBalance();
                        }
                    });
                } catch (e) {
                    console.error("Chain listener error:", e);
                }
            };

            setupListener();

            return () => { active = false; };
        }
    }, [state.client, state.chainId, queryBalance]);

    const enableAutoSign = React.useCallback(async () => {
        // Auto-signing is configured during connectWallet
        // This just confirms status
        const autosigner = sessionManager.loadSessionKey();
        if (!autosigner) {
            console.warn("⚠️ No autosigner found");
            return;
        }

        const autosignerAddress = await autosigner.address();
        console.log("✅ Auto-signing confirmed");
        console.log("   Autosigner:", autosignerAddress);

        setState(prev => ({ ...prev, autoSignEnabled: true }));
    }, []);

    const connectWallet = React.useCallback(async () => {
        if (state.status === 'Loading' || state.status === 'Ready') return;

        try {
            setState(prev => ({ ...prev, status: 'Loading', loading: true }));
            await initialize();

            const faucetUrl = import.meta.env.VITE_LINERA_FAUCET_URL;
            const applicationId = import.meta.env.VITE_LINERA_APPLICATION_ID;

            // Prepare Signers
            const metaMaskSigner = new MetaMask();
            const metaMaskAddress = await metaMaskSigner.address();
            console.log("🦊 MetaMask address:", metaMaskAddress);

            // Create/Load autosigner
            let autosigner = sessionManager.loadSessionKey();
            if (!autosigner) {
                autosigner = sessionManager.createSessionKey();
            }
            const autosignerAddress = await autosigner.address();
            console.log("🔑 Autosigner address:", autosignerAddress);

            // COMPOSITE SIGNER: [Autosigner, MetaMask] - like official example line 75
            const compositeSigner = new Composite(autosigner, metaMaskSigner);

            const faucet = new Faucet(faucetUrl);
            setState(prev => ({ ...prev, status: 'Creating Wallet' }));
            const wallet = await faucet.createWallet();

            setState(prev => ({ ...prev, status: 'Creating Chain' }));
            // CRITICAL: Create chain with AUTOSIGNER as primary owner
            // This makes autosigner the DEFAULT for all operations
            console.log("🔗 Creating chain with AUTOSIGNER as primary owner...");
            const chainId = await faucet.claimChain(wallet, autosignerAddress);
            console.log("✅ Chain created:", chainId);

            setState(prev => ({ ...prev, status: 'Creating Client' }));

            // Create client - NO OPTIONS (official example style)
            console.log("🔧 Creating client - NO OPTIONS");
            const clientInstance = await new Client(wallet, compositeSigner);
            console.log("✅ Client created");

            console.log("⛓️ Getting chain object...");
            const chain = await clientInstance.chain(chainId);
            console.log("✅ Chain obtained");

            console.log("📱 Getting application...");
            const application = await chain.application(applicationId);
            console.log("✅ Application obtained");

            // Add MetaMask as SECONDARY owner (for user-initiated mutations with {owner} option)
            console.log("➕ Adding MetaMask as secondary owner...");
            await chain.addOwner(metaMaskAddress);
            console.log("✅ MetaMask added as owner");

            // Confirm autosigner as wallet owner
            console.log("🔧 Confirming autosigner as wallet owner...");
            await (wallet as any).setOwner(chainId, autosignerAddress);
            console.log("✅ wallet.setOwner completed");

            setState(prev => ({
                ...prev,
                client: clientInstance,
                wallet,
                chainId,
                application,
                accountOwner: metaMaskAddress, // For UI display
                loading: false,
                status: 'Ready',
            }));

        } catch (err) {
            console.error("Connect Wallet Error:", err);
            setState(prev => ({
                ...prev,
                loading: false,
                status: 'Error',
                error: err as Error,
            }));
        }
    }, [state.status]);

    useEffect(() => {
        if (state.status === 'Ready' && state.application && state.accountOwner) {
            queryBalance();
            if (!state.autoSignEnabled) {
                enableAutoSign();
            }
        }
    }, [state.status, state.application, state.accountOwner, queryBalance, enableAutoSign, state.autoSignEnabled]);

    const contextValue: LineraContextType = React.useMemo(() => ({
        ...state,
        connectWallet,
        queryBalance,
        enableAutoSign,
        subscribeToMyItems,
        unsubscribeFromMyItems,
        subscribeToMyPurchases,
        unsubscribeFromMyPurchases,
        subscribeToMarketplace,
        unsubscribeFromMarketplace,
    }), [state, connectWallet, queryBalance, enableAutoSign, subscribeToMyItems, unsubscribeFromMyItems, subscribeToMyPurchases, unsubscribeFromMyPurchases, subscribeToMarketplace, unsubscribeFromMarketplace]);

    return <LineraContext.Provider value={contextValue}>{children}</LineraContext.Provider>;
};
