/**
 * 事务装饰器性能测试
 */
import { 
  TransactionManager, 
  TransactionAspect,
  TransactionOptions 
} from '../src/decorator';
import { DataSource, QueryRunner } from 'typeorm';

describe('事务装饰器性能测试', () => {
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;
  let transactionAspect: TransactionAspect;

  beforeEach(() => {
    jest.clearAllMocks();
    TransactionManager.resetStats();

    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      manager: {} as any,
      isTransactionActive: true,
      isReleased: false,
    } as any;

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      isInitialized: true,
    } as any;

    transactionAspect = new TransactionAspect();
    transactionAspect.app = {
      getMetaData: jest.fn().mockReturnValue({
        dataSource: mockDataSource,
      }),
    };
  });

  afterEach(() => {
    TransactionManager.stopCleanupTimer();
  });

  describe('并发事务测试', () => {
    it('应该能够处理大量并发事务', async () => {
      const concurrentTransactions = 100;
      const transactionDuration = 10; // 10ms

      const createTransaction = async (id: number) => {
        const mockProceed = jest.fn().mockImplementation(async () => {
          // 模拟异步操作
          await new Promise(resolve => setTimeout(resolve, transactionDuration));
          return `result-${id}`;
        });

        const options: TransactionOptions = {
          name: `concurrent-tx-${id}`,
          timeout: 5000
        };

        return await transactionAspect.run([options], mockProceed);
      };

      const startTime = Date.now();
      
      // 启动并发事务
      const promises = Array.from({ length: concurrentTransactions }, (_, i) => 
        createTransaction(i)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // 验证结果
      expect(results).toHaveLength(concurrentTransactions);
      results.forEach((result, index) => {
        expect(result).toBe(`result-${index}`);
      });

      // 验证性能指标
      const stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(concurrentTransactions);
      expect(stats.successfulTransactions).toBe(concurrentTransactions);
      expect(stats.failedTransactions).toBe(0);

      console.log(`并发事务测试完成:`);
      console.log(`- 事务数量: ${concurrentTransactions}`);
      console.log(`- 总耗时: ${totalTime}ms`);
      console.log(`- 平均事务耗时: ${stats.averageDuration.toFixed(2)}ms`);
      console.log(`- 最长事务耗时: ${stats.longestTransaction}ms`);
      console.log(`- 最短事务耗时: ${stats.shortestTransaction}ms`);

      // 性能断言
      expect(totalTime).toBeLessThan(concurrentTransactions * transactionDuration * 2); // 应该有并发优势
      expect(stats.averageDuration).toBeGreaterThan(transactionDuration);
      expect(stats.averageDuration).toBeLessThan(transactionDuration * 5); // 不应该超过5倍
    }, 30000);

    it('应该正确处理并发事务中的错误', async () => {
      const totalTransactions = 50;
      const errorRate = 0.2; // 20%的事务会失败

      const createTransaction = async (id: number) => {
        const shouldFail = Math.random() < errorRate;
        
        const mockProceed = jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          
          if (shouldFail) {
            throw new Error(`Transaction ${id} failed`);
          }
          
          return `success-${id}`;
        });

        const options: TransactionOptions = {
          name: `error-test-tx-${id}`,
          timeout: 1000
        };

        try {
          return await transactionAspect.run([options], mockProceed);
        } catch (error) {
          return { error: error.message };
        }
      };

      const promises = Array.from({ length: totalTransactions }, (_, i) => 
        createTransaction(i)
      );

      const results = await Promise.all(promises);
      const stats = TransactionManager.getStats();

      const successCount = results.filter(r => typeof r === 'string').length;
      const errorCount = results.filter(r => typeof r === 'object' && r.error).length;

      expect(successCount + errorCount).toBe(totalTransactions);
      expect(stats.totalTransactions).toBe(totalTransactions);
      expect(stats.successfulTransactions).toBe(successCount);
      expect(stats.failedTransactions).toBe(errorCount);

      console.log(`错误处理测试完成:`);
      console.log(`- 总事务数: ${totalTransactions}`);
      console.log(`- 成功事务数: ${successCount}`);
      console.log(`- 失败事务数: ${errorCount}`);
      console.log(`- 成功率: ${((successCount / totalTransactions) * 100).toFixed(2)}%`);
    });
  });

  describe('内存泄漏测试', () => {
    it('应该正确清理事务上下文', async () => {
      const transactionCount = 1000;
      
      // 模拟大量短期事务
      for (let i = 0; i < transactionCount; i++) {
        const mockProceed = jest.fn().mockResolvedValue(`result-${i}`);
        const options: TransactionOptions = {
          name: `memory-test-${i}`,
          timeout: 100
        };

        await transactionAspect.run([options], mockProceed);
      }

      // 验证统计信息
      const stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(transactionCount);
      expect(stats.successfulTransactions).toBe(transactionCount);

      // 模拟内存使用情况检查
      const memUsage = process.memoryUsage();
      console.log('内存使用情况:');
      console.log(`- RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
      
      // 内存使用应该在合理范围内（这里假设300MB以内）
      expect(memUsage.heapUsed).toBeLessThan(300 * 1024 * 1024);
    });
  });

  describe('超时处理性能测试', () => {
    it('应该准确处理事务超时', async () => {
      const timeout = 100; // 100ms超时
      const executionTime = 200; // 实际执行200ms

      const mockProceed = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, executionTime));
        return 'should-not-reach-here';
      });

      const options: TransactionOptions = {
        timeout,
        name: 'timeout-test'
      };

      const startTime = Date.now();

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow(`Transaction timeout after ${timeout}ms`);

      const actualTime = Date.now() - startTime;
      
      // 超时应该在预期时间附近（允许一定误差）
      expect(actualTime).toBeGreaterThanOrEqual(timeout);
      expect(actualTime).toBeLessThan(timeout + 200); // 允许200ms误差，适应不同系统性能

      const stats = TransactionManager.getStats();
      expect(stats.failedTransactions).toBe(1);
    });
  });

  describe('统计信息性能测试', () => {
    it('统计信息更新不应该显著影响性能', async () => {
      const transactionCount = 1000;
      
      // 禁用统计的基准测试
      const originalUpdateStats = TransactionManager.updateStats;
      TransactionManager.updateStats = jest.fn(); // 不执行实际更新

      const startTimeWithoutStats = Date.now();
      
      for (let i = 0; i < transactionCount; i++) {
        const mockProceed = jest.fn().mockResolvedValue(`result-${i}`);
        const options: TransactionOptions = { name: `perf-test-${i}` };
        await transactionAspect.run([options], mockProceed);
      }
      
      const timeWithoutStats = Date.now() - startTimeWithoutStats;

      // 恢复统计功能
      TransactionManager.updateStats = originalUpdateStats;
      TransactionManager.resetStats();

      const startTimeWithStats = Date.now();
      
      for (let i = 0; i < transactionCount; i++) {
        const mockProceed = jest.fn().mockResolvedValue(`result-${i}`);
        const options: TransactionOptions = { name: `perf-test-with-stats-${i}` };
        await transactionAspect.run([options], mockProceed);
      }
      
      const timeWithStats = Date.now() - startTimeWithStats;

      console.log(`统计性能影响:`);
      console.log(`- 无统计耗时: ${timeWithoutStats}ms`);
      console.log(`- 有统计耗时: ${timeWithStats}ms`);
      console.log(`- 性能影响: ${((timeWithStats - timeWithoutStats) / timeWithoutStats * 100).toFixed(2)}%`);

      // 统计功能的性能影响应该小于80%（在高并发环境下允许更多开销）
      expect(timeWithStats / timeWithoutStats).toBeLessThan(1.8);
    });
  });
});

/**
 * 基准测试工具
 */
export class TransactionBenchmark {
  
  static async runBenchmark(
    name: string,
    testFn: () => Promise<void>,
    iterations: number = 1000
  ): Promise<void> {
    console.log(`\n=== ${name} 基准测试 ===`);
    console.log(`迭代次数: ${iterations}`);

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    for (let i = 0; i < iterations; i++) {
      await testFn();
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;

    console.log(`总耗时: ${totalTime}ms`);
    console.log(`平均耗时: ${avgTime.toFixed(2)}ms`);
    console.log(`吞吐量: ${(iterations / totalTime * 1000).toFixed(2)} ops/sec`);
    console.log(`内存增长: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log('========================\n');
  }
} 