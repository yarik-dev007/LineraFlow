/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LINERA_FAUCET_URL: string;
    readonly VITE_LINERA_APPLICATION_ID: string;
    readonly VITE_LINERA_MAIN_CHAIN_ID: string;
    readonly VITE_POCKETBASE_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
