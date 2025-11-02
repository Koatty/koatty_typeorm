/**
 * 并发事务测试
 * 
 * 测试目标：
 * 1. 多个并发事务的独立性
 * 2. 事务上下文隔离
 * 3. 并发场景下的性能
 * 4. 资源竞争处理
 */

import { DataSource, QueryRunner } from 'typeorm';
import { TransactionManager, TransactionAspect, TransactionOptions } from '../src/decorator';

describe('并发事务测试', () => {
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;
  let mockApp: any;
  let aspect: TransactionAspect;

  beforeEach(() => {
    // 重置统计信息
    TransactionManager.resetStats();

    // 创建模拟 QueryRunner
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      isTransactionActive: true,
      isReleased: false,
      manager: {} as any,
    } as any;

    // 创建模拟 DataSource
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      isInitialized: true,
      hasMetadata: true,
    } as any;

    // 创建模拟应用
    mockApp = {
      getMetaData: jest.fn().mockReturnValue({
        dataSource: mockDataSource
      })
    };

    aspect = new TransactionAspect();
    aspect.app = mockApp;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('并发事务独立性', () => {
    it('应该正确隔离并发事务的上下文', async () => {
      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      // 创建多个并发事务
      const concurrentTransactions = Array.from({ length: 10 }, (_, i) => {
        return aspect.run(
          [options],
          async () => {
            // 获取当前事务上下文
            const context = TransactionManager.getCurrentContext();
            expect(context).toBeDefined();
            
            // 模拟异步操作
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            
            // 验证上下文仍然有效
            const contextAfter = TransactionManager.getCurrentContext();
            expect(contextAfter).toBe(context);
            
            return i;
          }
        );
      });

      const results = await Promise.all(concurrentTransactions);
      
      // 验证所有事务都成功执行
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      
      // 验证所有事务都被提交
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(10);
    });

    it('应该正确处理并发事务的错误', async () => {
      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      // 创建混合的成功和失败事务
      const concurrentTransactions = Array.from({ length: 10 }, (_, i) => {
        return aspect.run(
          [options],
          async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
            
            // 偶数索引的事务失败
            if (i % 2 === 0) {
              throw new Error(`Transaction ${i} failed`);
            }
            
            return i;
          }
        ).catch(error => ({ error: error.message, index: i }));
      });

      const results = await Promise.all(concurrentTransactions);
      
      // 验证失败的事务返回错误
      results.forEach((result, i) => {
        if (i % 2 === 0) {
          expect(result).toHaveProperty('error');
          expect(result).toMatchObject({ error: `Transaction ${i} failed`, index: i });
        } else {
          expect(result).toBe(i);
        }
      });
      
      // 验证成功和失败事务的统计
      const stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(10);
      expect(stats.successfulTransactions).toBe(5);
      expect(stats.failedTransactions).toBe(5);
    });
  });

  describe('并发嵌套事务', () => {
    it('应该正确处理并发的嵌套事务', async () => {
      const outerOptions: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      const nestedOptions: TransactionOptions = {
        propagation: 'NESTED',
        dataSourceName: 'DB'
      };

      // 创建并发的外部事务，每个都包含嵌套事务
      const concurrentTransactions = Array.from({ length: 5 }, (_, i) => {
        return aspect.run(
          [outerOptions],
          async () => {
            // 外部事务
            const outerContext = TransactionManager.getCurrentContext();
            expect(outerContext).toBeDefined();
            
            // 创建嵌套事务
            const nestedResult = await aspect.run(
              [nestedOptions],
              async () => {
                const nestedContext = TransactionManager.getCurrentContext();
                expect(nestedContext).toBe(outerContext); // 嵌套事务共享上下文
                
                await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
                return `nested-${i}`;
              }
            );
            
            expect(nestedResult).toBe(`nested-${i}`);
            return `outer-${i}`;
          }
        );
      });

      const results = await Promise.all(concurrentTransactions);
      
      expect(results).toEqual([
        'outer-0', 'outer-1', 'outer-2', 'outer-3', 'outer-4'
      ]);
      
      // 验证保存点操作
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^SAVEPOINT/)
      );
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^RELEASE SAVEPOINT/)
      );
    });

    it('应该正确处理并发嵌套事务的部分回滚', async () => {
      const outerOptions: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      const nestedOptions: TransactionOptions = {
        propagation: 'NESTED',
        dataSourceName: 'DB'
      };

      // 创建并发事务，部分嵌套事务失败
      const concurrentTransactions = Array.from({ length: 5 }, (_, i) => {
        return aspect.run(
          [outerOptions],
          async () => {
            try {
              await aspect.run(
                [nestedOptions],
                async () => {
                  // 偶数索引的嵌套事务失败
                  if (i % 2 === 0) {
                    throw new Error(`Nested transaction ${i} failed`);
                  }
                  return `nested-${i}`;
                }
              );
              return `success-${i}`;
            } catch (error) {
              // 捕获嵌套事务错误，但外部事务继续
              return `caught-${i}`;
            }
          }
        );
      });

      const results = await Promise.all(concurrentTransactions);
      
      // 偶数索引应该捕获到错误
      expect(results).toEqual([
        'caught-0', 'success-1', 'caught-2', 'success-3', 'caught-4'
      ]);
      
      // 验证回滚到保存点
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^ROLLBACK TO SAVEPOINT/)
      );
    });
  });

  describe('并发性能测试', () => {
    it('应该在并发场景下保持良好性能', async () => {
      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      const startTime = Date.now();
      const concurrencyLevel = 50;

      // 创建大量并发事务
      const concurrentTransactions = Array.from({ length: concurrencyLevel }, (_, i) => {
        return aspect.run(
          [options],
          async () => {
            // 模拟实际的数据库操作延迟
            await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
            return i;
          }
        );
      });

      await Promise.all(concurrentTransactions);
      const duration = Date.now() - startTime;

      // 验证性能：50个并发事务应该在合理时间内完成（考虑异步并发）
      expect(duration).toBeLessThan(2000); // 2秒内完成
      
      // 验证统计信息
      const stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(concurrencyLevel);
      expect(stats.successfulTransactions).toBe(concurrencyLevel);
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    it('应该正确管理并发场景下的 QueryRunner', async () => {
      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      const concurrencyLevel = 20;
      let activeRunners = 0;
      let maxActiveRunners = 0;

      // 跟踪活跃的 QueryRunner 数量
      mockQueryRunner.connect.mockImplementation(async () => {
        activeRunners++;
        maxActiveRunners = Math.max(maxActiveRunners, activeRunners);
      });

      mockQueryRunner.release.mockImplementation(async () => {
        activeRunners--;
      });

      const concurrentTransactions = Array.from({ length: concurrencyLevel }, () => {
        return aspect.run(
          [options],
          async () => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 30));
            return 'ok';
          }
        );
      });

      await Promise.all(concurrentTransactions);

      // 验证所有 QueryRunner 都被正确释放
      expect(activeRunners).toBe(0);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(concurrencyLevel);
      
      // 验证最大并发 QueryRunner 数量
      expect(maxActiveRunners).toBe(concurrencyLevel);
    });
  });

  describe('资源竞争测试', () => {
    it('应该正确处理对共享资源的并发访问', async () => {
      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
      };

      const results: number[] = [];
      const expectedCount = 30;

      // 创建并发事务，每个都记录自己的结果
      const concurrentTransactions = Array.from({ length: expectedCount }, (_, i) => {
        return aspect.run(
          [options],
          async () => {
            const currentContext = TransactionManager.getCurrentContext();
            expect(currentContext).toBeDefined();
            
            // 模拟异步操作
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            
            // 记录结果
            results.push(i);
            
            return i;
          }
        );
      });

      const transactionResults = await Promise.all(concurrentTransactions);

      // 验证所有事务都成功完成
      expect(transactionResults).toHaveLength(expectedCount);
      expect(results).toHaveLength(expectedCount);
      
      // 验证每个事务的上下文隔离
      expect(new Set(transactionResults).size).toBe(expectedCount);
    });

    it('应该正确处理并发事务超时', async () => {
      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB',
        timeout: 100 // 100ms 超时
      };

      // 创建会超时的并发事务
      const concurrentTransactions = Array.from({ length: 5 }, (_, i) => {
        return aspect.run(
          [options],
          async () => {
            // 部分事务会超时
            const delay = i < 3 ? 50 : 150;
            await new Promise(resolve => setTimeout(resolve, delay));
            return `result-${i}`;
          }
        ).catch(error => ({ error: error.message, index: i }));
      });

      const results = await Promise.all(concurrentTransactions);

      // 验证超时的事务
      results.forEach((result, i) => {
        if (i >= 3) {
          expect(result).toHaveProperty('error');
        } else {
          expect(result).toBe(`result-${i}`);
        }
      });
    });
  });

  describe('并发配置测试', () => {
    it('应该正确应用全局配置到并发事务', async () => {
      // 配置全局默认值
      TransactionManager.configure({
        defaultTimeout: 100,
        defaultIsolationLevel: 'READ_COMMITTED'
      });

      const options: TransactionOptions = {
        propagation: 'REQUIRED',
        dataSourceName: 'DB'
        // 不指定 timeout 和 isolationLevel，使用全局默认值
      };

      const concurrentTransactions = Array.from({ length: 5 }, () => {
        return aspect.run(
          [options],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            return 'ok';
          }
        );
      });

      await Promise.all(concurrentTransactions);

      // 验证事务使用了配置的隔离级别
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
    });
  });
});

