import PocketBase from 'pocketbase';

// Use proxy /pb in browser to avoid COEP/CORS issues
// Use FULL URL if in Node.js (indexer) or if ENV is set to full URL
const baseUrl = import.meta.env.VITE_POCKETBASE_URL;

export const pb = new PocketBase(baseUrl);
pb.autoCancellation(false);
