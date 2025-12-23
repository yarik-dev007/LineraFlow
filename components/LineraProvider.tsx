import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import * as linera from '@linera/client';
import { MetaMask } from '@linera/signer';

interface BalanceData {
    accountBalance: string;
    chainBalance: string;
}

interface LineraContextType {
    client?: linera.Client;
    wallet?: linera.Wallet;
    chainId?: string;
    application?: linera.Application;
    accountOwner?: string;
    loading: boolean;
    status: 'Idle' | 'Loading' | 'Creating Wallet' | 'Creating Client' | 'Creating Chain' | 'Ready' | 'Error';
    error?: Error;
    balances: BalanceData;
    connectWallet: () => Promise<void>;
    queryBalance: () => Promise<void>;
}

const LineraContext = createContext<LineraContextType>({
    loading: false,
    status: 'Idle',
    balances: { accountBalance: '0', chainBalance: '0' },
    connectWallet: async () => { },
    queryBalance: async () => { },
});

export const useLinera = () => useContext(LineraContext);
export { LineraContext };

export const LineraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<LineraContextType>({
        loading: false,
        status: 'Idle',
        balances: { accountBalance: '0', chainBalance: '0' },
        connectWallet: async () => { },
        queryBalance: async () => { },
    });
    const initRef = useRef(false);

    const queryBalance = React.useCallback(async () => {
        if (!state.application || !state.accountOwner) {
            return;
        }

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

    useEffect(() => {
        if (state.client && state.chainId) {
            // Storage key per chain
            const storageKey = `linera_last_height_${state.chainId}`;

            state.client.onNotification((notification: any) => {
                // Check block height to prevent processing old blocks
                if (notification.reason?.NewBlock) {
                    const currentHeight = notification.reason.NewBlock.height;
                    const lastProcessedHeight = parseInt(localStorage.getItem(storageKey) || '0', 10);

                    // Skip only if current height is LESS than last processed (allow equal for re-processing)
                    if (currentHeight < lastProcessedHeight) {
                        return;
                    }

                    localStorage.setItem(storageKey, currentHeight.toString());
                    queryBalance();
                } else if (notification.reason?.NewIncomingMessage) {
                    queryBalance();
                } else if (notification.reason?.NewOutgoingMessage) {
                    queryBalance();
                }
            });
        }
    }, [state.client, state.chainId, queryBalance]);

    const connectWallet = React.useCallback(async () => {
        // Allow retries if not already loading/ready
        if (state.status === 'Loading' || state.status === 'Ready') {
            return;
        }

        try {
            // 1. Initialize WASM
            setState(prev => ({ ...prev, status: 'Loading', loading: true }));
            await linera.default();

            // 2. Get configuration
            const faucetUrl = import.meta.env.VITE_LINERA_FAUCET_URL;
            const applicationId = import.meta.env.VITE_LINERA_APPLICATION_ID;

            if (!faucetUrl || !applicationId) {
                throw new Error('Missing environment variables');
            }

            // 3. Create MetaMask signer
            const signer = new MetaMask();
            const faucet = new linera.Faucet(faucetUrl);
            const owner = await Promise.resolve(signer.address());

            // 4. Create wallet and chain
            setState(prev => ({ ...prev, status: 'Creating Wallet' }));
            const wallet = await faucet.createWallet();

            setState(prev => ({ ...prev, status: 'Creating Chain' }));
            const chainId = await faucet.claimChain(wallet, owner);

            // 5. Create client and application
            setState(prev => ({ ...prev, status: 'Creating Client' }));
            const clientInstance = await new linera.Client(wallet, signer, false);
            const application = await clientInstance.frontend().application(applicationId);

            // 6. Update state
            setState(prev => ({
                ...prev,
                client: clientInstance,
                wallet,
                chainId,
                application,
                accountOwner: owner,
                loading: false,
                status: 'Ready',
            }));

        } catch (err) {
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
        }
    }, [state.status, state.application, state.accountOwner, queryBalance]);

    const contextValue: LineraContextType = React.useMemo(() => ({
        ...state,
        connectWallet,
        queryBalance
    }), [state, connectWallet, queryBalance]);

    return <LineraContext.Provider value={contextValue}>{children}</LineraContext.Provider>;
};
