import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import type { Cache } from 'cache-manager';
import { AppCacheService } from './app-cache.service';

describe('AppCacheService', () => {
  let service: AppCacheService;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>> & {
    store?: { keys?: jest.Mock };
  };

  beforeEach(async () => {
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      store: {
        keys: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppCacheService,
        {
          provide: CACHE_MANAGER,
          useValue: cache,
        },
      ],
    }).compile();

    service = module.get(AppCacheService);
  });

  it('returns cached value without calling the fetch function', async () => {
    cache.get.mockResolvedValue({ total: 10 });
    const fetchFunction = jest.fn();

    await expect(
      service.getOrSetCache('summary', 60, fetchFunction),
    ).resolves.toEqual({
      total: 10,
    });

    expect(fetchFunction).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('fetches and stores a value when cache is empty', async () => {
    cache.get.mockResolvedValue(null);
    const fetchFunction = jest.fn().mockResolvedValue({ total: 15 });

    await expect(
      service.getOrSetCache('summary', 30, fetchFunction),
    ).resolves.toEqual({
      total: 15,
    });

    expect(fetchFunction).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('summary', { total: 15 }, 30000);
  });

  it('deletes only keys matching the prefix when the store supports enumeration', async () => {
    cache.store?.keys?.mockResolvedValue([
      'wallet:user-1',
      'wallet:user-2',
      'quest:user-1',
    ]);

    await service.deleteByPrefix('wallet:');

    expect(cache.del).toHaveBeenCalledTimes(2);
    expect(cache.del).toHaveBeenNthCalledWith(1, 'wallet:user-1');
    expect(cache.del).toHaveBeenNthCalledWith(2, 'wallet:user-2');
  });

  it('creates stable keys by sorting object keys and dropping undefined values', () => {
    const first = service.stableKey({
      page: 1,
      filter: { type: 'reward', unused: undefined },
      tags: [{ id: 2, name: 'b' }],
    });
    const second = service.stableKey({
      tags: [{ name: 'b', id: 2 }],
      filter: { unused: undefined, type: 'reward' },
      page: 1,
    });

    expect(first).toBe(second);
    expect(first).toBe(
      '{"filter":{"type":"reward"},"page":1,"tags":[{"id":2,"name":"b"}]}',
    );
  });
});
