import PocketBase from 'pocketbase';

export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);
pb.autoCancellation(false); // Disable auto-cancellation to ensure all requests complete
pb.autoCancellation(false);
