import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cache } from "cache-manager";

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private cacheManager: Cache) { }

  /**
   * Set a value in Redis with optional TTL
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds (optional)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logger.error(`Error setting cache for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get a value from Redis
   * @param key - Cache key
   * @returns The cached value or undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      return value;
    } catch (error) {
      this.logger.error(`Error getting cache for key ${key}:`, JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Delete a value from Redis
   * @param key - Cache key
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting cache for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Note: Cache reset functionality is not available in the current cache-manager version.
   * If you need to clear all cache, you'll need to implement it using the underlying Redis client directly.
   */

  /**
   * Get a value from cache or set it if it doesn't exist
   * @param key - Cache key
   * @param factory - Function to generate the value if not cached
   * @param ttl - Time to live in milliseconds (optional)
   * @returns The cached or newly generated value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    try {
      let value = await this.get<T>(key);

      if (value === undefined) {
        this.logger.debug(`Cache miss for ${key}, generating value...`);
        value = await factory();
        await this.set(key, value, ttl);
      }

      return value;
    } catch (error) {
      this.logger.error(`Error in getOrSet for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists in cache
   * @param key - Cache key
   * @returns True if the key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const value = await this.get(key);
      return value !== undefined;
    } catch (error) {
      this.logger.error(`Error checking cache for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set multiple key-value pairs
   * @param entries - Array of [key, value, ttl] tuples
   */
  async setMany(entries: Array<[string, unknown, number?]>): Promise<void> {
    try {
      await Promise.all(
        entries.map(([key, value, ttl]) => this.set(key, value, ttl)),
      );
      this.logger.debug(`Cache set for ${entries.length} keys`);
    } catch (error) {
      this.logger.error("Error setting multiple cache entries:", error);
      throw error;
    }
  }

  /**
   * Delete multiple keys
   * @param keys - Array of cache keys
   */
  async delMany(keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((key) => this.del(key)));
      this.logger.debug(`Cache deleted for ${keys.length} keys`);
    } catch (error) {
      this.logger.error("Error deleting multiple cache entries:", error);
      throw error;
    }
  }
}
