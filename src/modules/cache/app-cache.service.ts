import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

@Injectable()
export class AppCacheService {
  private readonly logger = new Logger(AppCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async getOrSetCache<T>(
    key: string,
    ttlSeconds: number,
    fetchFunction: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const value = await fetchFunction();
    await this.cache.set(key, value, ttlSeconds * 1000);
    return value;
  }

  async delete(key: string) {
    await this.cache.del(key);
  }

  /**
   * Delete all cache entries whose key starts with `prefix`.
   * Works with the Keyv/Redis store used by cache-manager.
   */
  async deleteByPrefix(prefix: string) {
    try {
      // @ts-expect-error — accessing the underlying Keyv store for key enumeration
      const store = this.cache.store;

      if (store && typeof store.keys === 'function') {
        const allKeys: string[] = await store.keys();
        const matchingKeys = allKeys.filter((k) => k.startsWith(prefix));
        for (const key of matchingKeys) {
          await this.cache.del(key);
        }
        if (matchingKeys.length > 0) {
          this.logger.log(
            `Invalidated ${matchingKeys.length} cache keys with prefix "${prefix}"`,
          );
        }
        return;
      }

      // Fallback: no other store enumeration available
      this.logger.warn(
        'deleteByPrefix: store does not support key enumeration, skipping prefix invalidation',
      );
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate cache prefix "${prefix}": ${error}`,
      );
    }
  }

  stableKey(value: unknown) {
    return JSON.stringify(this.sortValue(value));
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          const item = (value as Record<string, unknown>)[key];
          if (item !== undefined) {
            acc[key] = this.sortValue(item);
          }
          return acc;
        }, {});
    }

    return value;
  }
}
