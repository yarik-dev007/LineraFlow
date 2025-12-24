/**
 * Cache Manager for localStorage-based data caching
 * Provides versioned caching with timestamp tracking
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    version: string;
}

class CacheManager {
    private VERSION = '1.0.0';
    private PREFIX = 'linera_cache_';

    /**
     * Store data in cache
     */
    set<T>(key: string, data: T): void {
        try {
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                version: this.VERSION,
            };
            localStorage.setItem(
                this.PREFIX + key,
                JSON.stringify(entry)
            );
        } catch (error) {
            console.warn('Failed to set cache:', error);
        }
    }

    /**
     * Retrieve data from cache
     * Returns null if not found or version mismatch
     */
    get<T>(key: string): T | null {
        try {
            const item = localStorage.getItem(this.PREFIX + key);
            if (!item) return null;

            const entry: CacheEntry<T> = JSON.parse(item);

            // Version check
            if (entry.version !== this.VERSION) {
                this.clear(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.warn('Failed to get cache:', error);
            return null;
        }
    }

    /**
     * Clear specific cache entry
     */
    clear(key: string): void {
        try {
            localStorage.removeItem(this.PREFIX + key);
        } catch (error) {
            console.warn('Failed to clear cache:', error);
        }
    }

    /**
     * Clear all cache entries
     */
    clearAll(): void {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.warn('Failed to clear all cache:', error);
        }
    }

    /**
     * Clear cache for specific user
     */
    clearForUser(accountOwner: string): void {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(this.PREFIX) && key.includes(accountOwner)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.warn('Failed to clear user cache:', error);
        }
    }
}

export const cacheManager = new CacheManager();
export default cacheManager;
