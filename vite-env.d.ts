/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LINERA_FAUCET_URL: string;
    readonly VITE_LINERA_APPLICATION_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
