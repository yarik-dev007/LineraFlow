import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { initialize, Client, Faucet, Wallet, Application, signer } from '@linera/client';
import { Signer as MetaMask } from '@linera/metamask';
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
    subscribeToMyOrders: (callback: () => void) => void;
    unsubscribeFromMyOrders: () => void;
    subscribeToMyFeed: (callback: () => void) => void;
    unsubscribeFromMyFeed: () => void;
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
    subscribeToMyOrders: () => { },
    unsubscribeFromMyOrders: () => { },
    subscribeToMyFeed: () => { },
    unsubscribeFromMyFeed: () => { },
});

export const useLinera = () => useContext(LineraContext);
export { LineraContext };

// Helper to managing keys in Cookies as backup
const getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
};

const setCookie = (name: string, value: string, days = 365) => {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Strict";
};

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
        subscribeToMyOrders: () => { },
        unsubscribeFromMyOrders: () => { },
        subscribeToMyFeed: () => { },
        unsubscribeFromMyFeed: () => { },
    });

    // Refs for subscription callbacks
    const myItemsCallbackRef = useRef<(() => void) | null>(null);
    const myPurchasesCallbackRef = useRef<(() => void) | null>(null);
    const marketplaceCallbackRef = useRef<(() => void) | null>(null);
    const myOrdersCallbackRef = useRef<(() => void) | null>(null);

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

    const subscribeToMyOrders = React.useCallback((callback: () => void) => {
        console.log('📋 [LineraProvider] Subscribed to My Orders updates');
        myOrdersCallbackRef.current = callback;
    }, []);

    const unsubscribeFromMyOrders = React.useCallback(() => {
        console.log('📋 [LineraProvider] Unsubscribed from My Orders updates');
        myOrdersCallbackRef.current = null;
    }, []);

    // Feed Subscription
    const myFeedCallbackRef = useRef<(() => void) | null>(null);

    const subscribeToMyFeed = React.useCallback((callback: () => void) => {
        console.log('📰 [LineraProvider] Subscribed to My Feed updates');
        myFeedCallbackRef.current = callback;
    }, []);

    const unsubscribeFromMyFeed = React.useCallback(() => {
        console.log('📰 [LineraProvider] Unsubscribed from My Feed updates');
        myFeedCallbackRef.current = null;
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

    const enableAutoSign = React.useCallback(async () => {
        // Auto-signing is configured during connectWallet
        setState(prev => ({ ...prev, autoSignEnabled: true }));
    }, []);

    const connectWallet = React.useCallback(async (force = false) => {
        if (!force && (state.status === 'Loading' || state.status === 'Ready')) return;

        try {
            // If forcing (e.g. account switch), ensure we start Fresh
            setState(prev => ({ ...prev, status: 'Loading', loading: true }));

            // IMPORTANT: If we are switching accounts, we must re-initialize to be safe
            // However, initialize() loads WASM and sets formatting. Calling it multiple times should be fine/idempotent in most WASM bindings or just a no-op.
            await initialize();

            const faucetUrl = import.meta.env.VITE_LINERA_FAUCET_URL;
            const applicationId = import.meta.env.VITE_LINERA_APPLICATION_ID;

            // WALLET PROVIDER DETECTION - Handle multiple wallet extensions
            // When users have Nightly, MetaMask, or other wallets, they compete for window.ethereum
            let ethereumProvider = (window as any).ethereum;

            // If multiple providers exist, prefer MetaMask or the first non-Nightly provider
            if (ethereumProvider) {
                // Check if there are multiple providers (e.g., window.ethereum.providers array)
                if (ethereumProvider.providers?.length > 0) {
                    console.log('🔍 Multiple Ethereum providers detected:', ethereumProvider.providers.length);

                    // Try to find MetaMask first
                    const metaMaskProvider = ethereumProvider.providers.find((p: any) => p.isMetaMask && !p.isNightly);
                    if (metaMaskProvider) {
                        ethereumProvider = metaMaskProvider;
                        console.log('✅ Selected MetaMask provider');
                    } else {
                        // Fallback: use first non-Nightly provider
                        const nonNightlyProvider = ethereumProvider.providers.find((p: any) => !p.isNightly);
                        if (nonNightlyProvider) {
                            ethereumProvider = nonNightlyProvider;
                            console.log('✅ Selected first non-Nightly provider');
                        }
                    }
                } else if (ethereumProvider.isNightly && (window as any).ethereum !== ethereumProvider) {
                    // If current provider is Nightly but there's another ethereum object, try to use it
                    console.warn('⚠️ Nightly wallet detected, looking for alternatives...');
                }

                // Temporarily override window.ethereum with selected provider for MetaMask signer
                const originalEthereum = (window as any).ethereum;
                try {
                    // Only override if we found a better provider
                    if (ethereumProvider !== originalEthereum) {
                        Object.defineProperty(window, 'ethereum', {
                            value: ethereumProvider,
                            writable: true,
                            configurable: true
                        });
                    }
                } catch (e) {
                    // If we can't override (getter-only), just use what we have
                    console.warn('⚠️ Could not override window.ethereum, using existing provider');
                }
            }

            // Prepare Signers
            // MetaMask signer will pick up the *current* window.ethereum.selectedAddress
            let metaMaskSigner;
            let metaMaskAddress;

            try {
                metaMaskSigner = new MetaMask();
                metaMaskAddress = await metaMaskSigner.address();
                // NORMALIZE ADDRESS: Ensure we consistently use lowercase for storage keys
                metaMaskAddress = metaMaskAddress.toLowerCase();
                console.log("🦊 MetaMask address (normalized):", metaMaskAddress);
            } catch (error) {
                console.error("❌ Failed to initialize MetaMask signer:", error);
                setState(prev => ({
                    ...prev,
                    status: 'Error',
                    loading: false,
                    error: new Error('Failed to connect to Ethereum wallet. Please ensure you have MetaMask or a compatible wallet installed and unlocked.')
                }));
                throw error;
            }

            // ---------------------------------------------------------
            // PER-ACCOUNT SESSION KEY & CHAIN ID LOGIC
            // ---------------------------------------------------------
            const SESSION_KEY_STORAGE_PREFIX = 'linera_session_key_';
            const CHAIN_ID_STORAGE_PREFIX = 'linera_chain_id_';
            const userSessionKeyKey = `${SESSION_KEY_STORAGE_PREFIX}${metaMaskAddress}`;
            const userChainIdKey = `${CHAIN_ID_STORAGE_PREFIX}${metaMaskAddress}`;

            // 1. Load or Create Session Key for THIS MetaMask Account
            // Check both LocalStorage AND Cookies for redundancy
            let storedKey = localStorage.getItem(userSessionKeyKey);
            const cookieKey = getCookie(userSessionKeyKey);

            // Sync logic: If found in cookie but not LS, or vice versa, sync them
            if (cookieKey && !storedKey) {
                console.log("🍪 Found key in cookies (missing in LS), syncing...");
                storedKey = cookieKey;
                localStorage.setItem(userSessionKeyKey, cookieKey);
            } else if (storedKey && !cookieKey) {
                console.log("💾 Found key in LS (missing in cookies), syncing...");
                setCookie(userSessionKeyKey, storedKey);
            }

            let autosigner: signer.PrivateKey;

            if (storedKey) {
                autosigner = new signer.PrivateKey(storedKey);
                console.log("🔑 Loaded existing autosigner for", metaMaskAddress);
            } else {
                // Generate a new random key
                const array = new Uint8Array(32);
                crypto.getRandomValues(array);
                const privateKeyHex = Array.from(array)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
                autosigner = new signer.PrivateKey(privateKeyHex);
                // Save to BOTH
                localStorage.setItem(userSessionKeyKey, privateKeyHex);
                setCookie(userSessionKeyKey, privateKeyHex);
                console.log("🔑 Created NEW autosigner for", metaMaskAddress);
            }

            const autosignerAddress = await autosigner.address();

            // COMPOSITE SIGNER: [Autosigner, MetaMask]
            const compositeSigner = new Composite(autosigner, metaMaskSigner);

            const faucet = new Faucet(faucetUrl);
            setState(prev => ({ ...prev, status: 'Creating Wallet' }));
            const wallet = await faucet.createWallet();

            // 2. Load or Claim Chain for THIS MetaMask Account
            let chainId = localStorage.getItem(userChainIdKey);

            setState(prev => ({ ...prev, status: 'Creating Chain' }));

            if (chainId) {
                console.log(`🔗 Found stored Chain ID for ${metaMaskAddress}:`, chainId);
                // We still claim to ensure it's valid/registered, but it should return the same
                try {
                    const claimedId = await faucet.claimChain(wallet, autosignerAddress);
                    if (claimedId !== chainId) {
                        console.warn(`⚠️ Warning: Stored chain ID ${chainId} differs from claimed ${claimedId}. Updating.`);
                        chainId = claimedId;
                        localStorage.setItem(userChainIdKey, chainId);
                    }
                } catch (e) {
                    console.log("ℹ️ Claim chain likely already exists (expected):", e);
                }
            } else {
                console.log("🔗 Creating NEW chain for", metaMaskAddress);
                chainId = await faucet.claimChain(wallet, autosignerAddress);
                console.log("✅ Chain created:", chainId);
                localStorage.setItem(userChainIdKey, chainId);
            }

            setState(prev => ({ ...prev, status: 'Creating Client' }));

            // Create client
            console.log("🔧 Creating client");
            const clientInstance = await new Client(wallet, compositeSigner);
            console.log("✅ Client created");

            console.log("⛓️ Getting chain object...");
            const chain = await clientInstance.chain(chainId!);
            console.log("✅ Chain obtained");

            console.log("📱 Getting application...");
            const application = await chain.application(applicationId);
            console.log("✅ Application obtained");

            // Add MetaMask as SECONDARY owner
            // Note: If chain existed, this might fail if already added, but addOwner is usually idempotent or we catch
            console.log("➕ Adding MetaMask as secondary owner...");
            try {
                await chain.addOwner(metaMaskAddress);
                console.log("✅ MetaMask added as owner");
            } catch (e) {
                console.log("ℹ️ MetaMask likely already owner");
            }

            // Confirm autosigner as wallet owner for this chain
            console.log("🔧 Confirming autosigner as wallet owner...");
            await (wallet as any).setOwner(chainId, autosignerAddress);

            setState(prev => ({
                ...prev,
                client: clientInstance,
                wallet,
                chainId: chainId!,
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
        const appId = import.meta.env.VITE_LINERA_APPLICATION_ID;
        const chainId = import.meta.env.VITE_LINERA_MAIN_CHAIN_ID;
        console.log(`🚀 [LineraProvider] Environment Loaded:\n   - AppID: ${appId}\n   - ChainID: ${chainId}`);

        // Accounts Changed Listener
        if (window.ethereum) {
            const handleAccountsChanged = async (accounts: string[]) => {
                console.log("🔄 Accounts changed:", accounts);

                // 1. Reset state to disconnected
                setState(prev => ({
                    ...prev,
                    client: undefined,
                    wallet: undefined,
                    chainId: undefined,
                    application: undefined,
                    accountOwner: undefined,
                    loading: false,
                    status: 'Idle',
                    balances: { accountBalance: '0', chainBalance: '0' },
                    autoSignEnabled: false,
                }));

                // 2. If valid account, reconnect automatically using FORCE
                if (accounts.length > 0) {
                    // We pass force=true to bypass the 'Idle' status check inside connectWallet in case of race conditions,
                    // and also because we JUST set it to Idle, but the closure in connectWallet might be stale if not carefully updated.
                    // Actually, since connectWallet is a useCallback dependency here (if I add it), it will be fresh.
                    // But forcing is safer.
                    await connectWallet(true);
                }
            };

            window.ethereum.on('accountsChanged', handleAccountsChanged);

            // Cleanup function provided by useEffect
            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            };
        }
    }, [connectWallet]); // Add connectWallet to dependency so the listener uses the latest version

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
                            if (myOrdersCallbackRef.current) myOrdersCallbackRef.current();
                            if (myFeedCallbackRef.current) myFeedCallbackRef.current();
                        } else if (notification.reason?.NewIncomingMessage) {
                            queryBalance();

                            // Call subscription callbacks if subscribed
                            if (myItemsCallbackRef.current) myItemsCallbackRef.current();
                            if (myPurchasesCallbackRef.current) myPurchasesCallbackRef.current();
                            if (marketplaceCallbackRef.current) marketplaceCallbackRef.current();
                            if (myOrdersCallbackRef.current) myOrdersCallbackRef.current();
                            if (myFeedCallbackRef.current) myFeedCallbackRef.current();
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
        subscribeToMyOrders,
        unsubscribeFromMyOrders,
        subscribeToMyFeed,
        unsubscribeFromMyFeed,
    }), [state, connectWallet, queryBalance, enableAutoSign, subscribeToMyItems, unsubscribeFromMyItems, subscribeToMyPurchases, unsubscribeFromMyPurchases, subscribeToMarketplace, unsubscribeFromMarketplace, subscribeToMyOrders, unsubscribeFromMyOrders, subscribeToMyFeed, unsubscribeFromMyFeed]);

    return <LineraContext.Provider value={contextValue}>{children}</LineraContext.Provider>;
};

