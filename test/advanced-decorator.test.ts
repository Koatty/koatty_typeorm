/**
 * 改进版事务装饰器完整测试套件
 */
import 'reflect-metadata';
import { 
  TransactionAspect, 
  TransactionManager,
  TransactionOptions,
  TransactionHooks,
  getCurrentQueryRunner,
  getCurrentEntityManager,
  isInTransaction,
  getCurrentDataSource,
  getCurrentTransactionOptions,
  getCurrentTransactionStartTime,
  getCurrentTransactionDuration
} from '../src/decorator';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';

// Mock TypeORM
jest.mock('typeorm');

describe('改进版事务装饰器测试', () => {
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    TransactionManager.resetStats();
    
    // 创建 mock 对象
    mockEntityManager = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as any;

    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      manager: mockEntityManager,
      isTransactionActive: true,
      isReleased: false,
    } as any;

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      initialize: jest.fn().mockResolvedValue(mockDataSource),
      isInitialized: true,
      hasMetadata: true,
    } as any;

    // 创建 mock 应用
    mockApp = {
      getMetaData: jest.fn().mockReturnValue({
        dataSource: mockDataSource,
        connection: mockDataSource,
      }),
      setMetaData: jest.fn(),
    };
  });

  afterEach(() => {
    // 清理定时器
    TransactionManager.stopCleanupTimer();
  });

  describe('TransactionManager 增强功能', () => {
    it('应该提供准确的统计信息', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      // 执行一些成功的事务
      for (let i = 0; i < 5; i++) {
        const mockProceed = jest.fn().mockResolvedValue(`result-${i}`);
        await transactionAspect.run([{}], mockProceed);
      }

      // 执行一些失败的事务
      for (let i = 0; i < 3; i++) {
        const mockProceed = jest.fn().mockRejectedValue(new Error(`error-${i}`));
        try {
          await transactionAspect.run([{}], mockProceed);
        } catch (e) {
          // 忽略错误
        }
      }

      const stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(8);
      expect(stats.successfulTransactions).toBe(5);
      expect(stats.failedTransactions).toBe(3);
      expect(stats.averageDuration).toBeGreaterThan(0);
      expect(stats.longestTransaction).toBeGreaterThan(0);
      expect(stats.shortestTransaction).toBeGreaterThan(0);
    });

    it('应该能够重置统计信息', () => {
      // 先生成一些统计数据
      TransactionManager.updateStats(100, true);
      TransactionManager.updateStats(200, false);

      let stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(2);

      // 重置统计
      TransactionManager.resetStats();

      stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(0);
      expect(stats.successfulTransactions).toBe(0);
      expect(stats.failedTransactions).toBe(0);
      expect(stats.averageDuration).toBe(0);
    });

    it('应该提供连接池状态信息', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockImplementation(async () => {
        const poolStatus = TransactionManager.getConnectionPoolStatus();
        expect(poolStatus).toEqual({
          isInitialized: true,
          hasMetadata: true
        });
        return 'result';
      });

      await transactionAspect.run([{}], mockProceed);
    });
  });

  describe('事务钩子功能', () => {
    it('应该正确执行所有钩子', async () => {
      const hooks: TransactionHooks = {
        beforeCommit: jest.fn().mockResolvedValue(undefined),
        afterCommit: jest.fn().mockResolvedValue(undefined),
        beforeRollback: jest.fn().mockResolvedValue(undefined),
        afterRollback: jest.fn().mockResolvedValue(undefined),
      };

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      // 测试成功提交的钩子
      const mockProceed = jest.fn().mockResolvedValue('success');
      const options: TransactionOptions = { hooks };

      await transactionAspect.run([options], mockProceed);

      expect(hooks.beforeCommit).toHaveBeenCalled();
      expect(hooks.afterCommit).toHaveBeenCalled();
      expect(hooks.beforeRollback).not.toHaveBeenCalled();
      expect(hooks.afterRollback).not.toHaveBeenCalled();
    });

    it('应该在回滚时执行回滚钩子', async () => {
      const hooks: TransactionHooks = {
        beforeCommit: jest.fn().mockResolvedValue(undefined),
        afterCommit: jest.fn().mockResolvedValue(undefined),
        beforeRollback: jest.fn().mockResolvedValue(undefined),
        afterRollback: jest.fn().mockResolvedValue(undefined),
      };

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockRejectedValue(new Error('Test error'));
      const options: TransactionOptions = { hooks };

      await expect(transactionAspect.run([options], mockProceed)).rejects.toThrow('Test error');

      expect(hooks.beforeCommit).toHaveBeenCalled();
      expect(hooks.afterCommit).not.toHaveBeenCalled();
      expect(hooks.beforeRollback).toHaveBeenCalled();
      expect(hooks.afterRollback).toHaveBeenCalled();
    });

    it('应该处理钩子中的错误', async () => {
      const hooks: TransactionHooks = {
        beforeCommit: jest.fn().mockResolvedValue(undefined),
        afterCommit: jest.fn().mockRejectedValue(new Error('After commit error')),
        beforeRollback: jest.fn().mockRejectedValue(new Error('Before rollback error')),
        afterRollback: jest.fn().mockRejectedValue(new Error('After rollback error')),
      };

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      // 测试成功事务中after commit钩子的错误
      const mockProceed1 = jest.fn().mockResolvedValue('success');
      
      // after commit钩子错误不应该影响事务结果
      const result = await transactionAspect.run([{ hooks }], mockProceed1);
      expect(result).toBe('success');

      // 测试失败事务中回滚钩子的错误
      const mockProceed2 = jest.fn().mockRejectedValue(new Error('Original error'));
      
      await expect(transactionAspect.run([{ hooks }], mockProceed2))
        .rejects.toThrow('Original error');
    });
  });

  describe('嵌套事务功能', () => {
    it('应该支持嵌套事务', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const outerProceed = jest.fn().mockImplementation(async () => {
        const innerProceed = jest.fn().mockResolvedValue('inner-result');
        const innerOptions: TransactionOptions = {
          propagation: 'NESTED',
          name: 'inner-transaction'
        };

        const innerResult = await transactionAspect.run([innerOptions], innerProceed);
        expect(innerResult).toBe('inner-result');

        return 'outer-result';
      });

      const outerOptions: TransactionOptions = {
        propagation: 'REQUIRED',
        name: 'outer-transaction'
      };

      const result = await transactionAspect.run([outerOptions], outerProceed);
      expect(result).toBe('outer-result');

      // 验证创建了保存点
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^SAVEPOINT sp_tx_\d+_[a-z0-9]+_\d+$/)
      );
    });

    it('应该在嵌套事务失败时回滚到保存点', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const outerProceed = jest.fn().mockImplementation(async () => {
        const innerProceed = jest.fn().mockRejectedValue(new Error('Inner transaction failed'));
        const innerOptions: TransactionOptions = {
          propagation: 'NESTED',
          name: 'failing-inner-transaction'
        };

        try {
          await transactionAspect.run([innerOptions], innerProceed);
        } catch (error) {
          expect(error.message).toBe('Inner transaction failed');
        }

        return 'outer-continues';
      });

      const outerOptions: TransactionOptions = {
        propagation: 'REQUIRED',
        name: 'outer-transaction'
      };

      const result = await transactionAspect.run([outerOptions], outerProceed);
      expect(result).toBe('outer-continues');

      // 验证回滚到了保存点
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^ROLLBACK TO SAVEPOINT sp_tx_\d+_[a-z0-9]+_\d+$/)
      );
    });
  });

  describe('只读事务功能', () => {
    it('应该设置只读模式', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockResolvedValue('readonly-result');
      const options: TransactionOptions = {
        readOnly: true,
        name: 'readonly-transaction'
      };

      await transactionAspect.run([options], mockProceed);

      expect(mockQueryRunner.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    });
  });

  describe('事务传播行为测试', () => {
    let transactionAspect: TransactionAspect;

    beforeEach(() => {
      transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;
    });

    it('应该支持 NOT_SUPPORTED 传播行为', async () => {
      // 先创建一个现有事务上下文
      const outerProceed = jest.fn().mockImplementation(async () => {
        expect(isInTransaction()).toBe(true);

        // 在事务中调用NOT_SUPPORTED的方法
        const innerProceed = jest.fn().mockImplementation(async () => {
          // 这里应该不在事务中
          expect(isInTransaction()).toBe(false);
          return 'not-supported-result';
        });

        const innerOptions: TransactionOptions = {
          propagation: 'NOT_SUPPORTED'
        };

        return await transactionAspect.run([innerOptions], innerProceed);
      });

      const outerOptions: TransactionOptions = {
        propagation: 'REQUIRED'
      };

      const result = await transactionAspect.run([outerOptions], outerProceed);
      expect(result).toBe('not-supported-result');
    });

    it('应该支持 REQUIRES_NEW 传播行为', async () => {
      let outerContextId: string | undefined;
      let innerContextId: string | undefined;

      const outerProceed = jest.fn().mockImplementation(async () => {
        const outerContext = TransactionManager.getCurrentContext();
        outerContextId = outerContext?.contextId;

        const innerProceed = jest.fn().mockImplementation(async () => {
          const innerContext = TransactionManager.getCurrentContext();
          innerContextId = innerContext?.contextId;
          return 'requires-new-result';
        });

        const innerOptions: TransactionOptions = {
          propagation: 'REQUIRES_NEW'
        };

        return await transactionAspect.run([innerOptions], innerProceed);
      });

      const outerOptions: TransactionOptions = {
        propagation: 'REQUIRED'
      };

      const result = await transactionAspect.run([outerOptions], outerProceed);
      expect(result).toBe('requires-new-result');

      // 验证创建了新的事务上下文
      expect(outerContextId).toBeDefined();
      expect(innerContextId).toBeDefined();
      expect(outerContextId).not.toBe(innerContextId);
    });
  });

  describe('超时处理测试', () => {
    it('应该在超时时取消事务', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const timeout = 50; // 50ms超时
      const executionTime = 100; // 执行100ms

      const mockProceed = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, executionTime));
        return 'should-not-reach';
      });

      const options: TransactionOptions = {
        timeout,
        name: 'timeout-test'
      };

      const startTime = Date.now();

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow(/Transaction timeout after \d+ms/);

      const actualTime = Date.now() - startTime;
      expect(actualTime).toBeGreaterThanOrEqual(timeout);
      expect(actualTime).toBeLessThan(timeout + 50); // 允许50ms误差
    });
  });

  describe('工具函数测试', () => {
    it('应该在事务上下文中提供正确的工具函数', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockImplementation(async () => {
        expect(isInTransaction()).toBe(true);
        expect(getCurrentQueryRunner()).toBe(mockQueryRunner);
        expect(getCurrentEntityManager()).toBe(mockEntityManager);
        expect(getCurrentDataSource()).toBe(mockDataSource);

        const options = getCurrentTransactionOptions();
        expect(options).toEqual(
          expect.objectContaining({
            name: 'tool-functions-test'
          })
        );

        const startTime = getCurrentTransactionStartTime();
        expect(startTime).toBeDefined();
        expect(typeof startTime).toBe('number');

        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 10));

        const duration = getCurrentTransactionDuration();
        expect(duration).toBeDefined();
        expect(duration).toBeGreaterThan(0);

        return 'tool-functions-result';
      });

      const options: TransactionOptions = {
        name: 'tool-functions-test'
      };

      const result = await transactionAspect.run([options], mockProceed);
      expect(result).toBe('tool-functions-result');
    });

    it('应该在事务外返回undefined', () => {
      expect(isInTransaction()).toBe(false);
      expect(getCurrentQueryRunner()).toBeUndefined();
      expect(getCurrentEntityManager()).toBeUndefined();
      expect(getCurrentDataSource()).toBeUndefined();
      expect(getCurrentTransactionOptions()).toBeUndefined();
      expect(getCurrentTransactionStartTime()).toBeUndefined();
      expect(getCurrentTransactionDuration()).toBeUndefined();
    });
  });

  describe('错误场景测试', () => {
    it('应该处理数据源未找到的情况', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = {
        getMetaData: jest.fn().mockReturnValue(null)
      };

      const mockProceed = jest.fn();
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow("数据源 'DB' 未找到或未初始化");
    });

    it('应该处理自定义数据源', async () => {
      const customDataSource = { ...mockDataSource };
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = {
        getMetaData: jest.fn().mockImplementation((name: string) => {
          if (name === 'CUSTOM_DB') {
            return { dataSource: customDataSource };
          }
          return null;
        })
      };

      const mockProceed = jest.fn().mockResolvedValue('custom-result');
      const options: TransactionOptions = {
        dataSourceName: 'CUSTOM_DB'
      };

      const result = await transactionAspect.run([options], mockProceed);
      expect(result).toBe('custom-result');
      expect(transactionAspect.app.getMetaData).toHaveBeenCalledWith('CUSTOM_DB');
    });

    it('应该处理查询运行器连接失败', async () => {
      mockQueryRunner.connect.mockRejectedValue(new Error('Connection failed'));

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn();
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow('Connection failed');
    });

    it('应该处理事务开始失败', async () => {
      mockQueryRunner.startTransaction.mockRejectedValue(new Error('Start transaction failed'));

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn();
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow('Start transaction failed');
    });

    it('应该处理提交失败', async () => {
      mockQueryRunner.commitTransaction.mockRejectedValue(new Error('Commit failed'));

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockResolvedValue('result');
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow('Commit failed');
    });

    it('应该处理回滚失败', async () => {
      mockQueryRunner.rollbackTransaction.mockRejectedValue(new Error('Rollback failed'));

      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockRejectedValue(new Error('Original error'));
      const options: TransactionOptions = {};

      // 应该抛出原始错误，而不是回滚错误
      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow('Original error');
    });
  });

  describe('清理机制测试', () => {
    it('应该正确清理过期的事务上下文', async () => {
      // 重置mock调用计数
      jest.clearAllMocks();
      
      // 模拟过期事务上下文
      const expiredContext = {
        queryRunner: mockQueryRunner,
        dataSource: mockDataSource,
        isActive: true,
        startTime: Date.now() - 40 * 60 * 1000, // 40分钟前
        options: {},
        contextId: 'expired-context',
        savepoints: [] as string[],
        depth: 0
      };

      // 手动添加过期上下文到管理器中
      (TransactionManager as any).contexts.set('expired-context', expiredContext);

      // 触发清理并等待异步操作完成
      await (TransactionManager as any).cleanupExpiredContexts();
      
      // 等待所有异步操作完成
      await new Promise(resolve => setImmediate(resolve));

      // 验证过期上下文被清理
      const contexts = (TransactionManager as any).contexts;
      expect(contexts.has('expired-context')).toBe(false);

      // 验证调用了回滚和释放
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
}); 