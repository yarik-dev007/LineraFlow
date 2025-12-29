import { signer } from '@linera/client';

const SESSION_KEY_STORAGE = 'linera_session_key';

export const sessionManager = {
    /**
     * Generates a new session key and saves it to local storage.
     * Returns the generated PrivateKey instance.
     */
    createSessionKey: (): signer.PrivateKey => {
        // Generate a new random key (using 32 random bytes converted to hex)
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const privateKeyHex = Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const key = new signer.PrivateKey(privateKeyHex);
        localStorage.setItem(SESSION_KEY_STORAGE, privateKeyHex);
        return key;
    },

    /**
     * Loads the session key from local storage.
     * Returns null if no key exists.
     */
    loadSessionKey: (): signer.PrivateKey | null => {
        const storedKey = localStorage.getItem(SESSION_KEY_STORAGE);
        if (!storedKey) return null;
        try {
            return new signer.PrivateKey(storedKey);
        } catch (e) {
            console.error("Failed to load session key", e);
            return null;
        }
    },

    /**
     * Clears the session key from local storage.
     */
    clearSessionKey: () => {
        localStorage.removeItem(SESSION_KEY_STORAGE);
    },

    /**
     * Checks if a session key exists.
     */
    hasSessionKey: (): boolean => {
        return !!localStorage.getItem(SESSION_KEY_STORAGE);
    }
};
