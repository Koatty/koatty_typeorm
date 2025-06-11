/**
 * 简化的事务装饰器测试
 */
import 'reflect-metadata';
import { 
  TransactionAspect, 
  TransactionManager,
  TransactionOptions
} from '../src/decorator';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';

// Mock TypeORM
jest.mock('typeorm');

describe('简化事务装饰器测试', () => {
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    TransactionManager.resetStats();
    
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

    mockApp = {
      getMetaData: jest.fn().mockReturnValue({
        dataSource: mockDataSource,
        connection: mockDataSource,
      }),
      setMetaData: jest.fn(),
    };
  });

  afterEach(() => {
    TransactionManager.stopCleanupTimer();
  });

  describe('基础事务功能', () => {
    it('应该能够执行基本事务', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockResolvedValue('test result');
      const options: TransactionOptions = {};

      const result = await transactionAspect.run([options], mockProceed);

      expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockProceed).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(result).toBe('test result');
    });

    it('应该在错误时回滚事务', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockRejectedValue(new Error('Test error'));
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed)).rejects.toThrow('Test error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('应该支持隔离级别', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockResolvedValue('result');
      const options: TransactionOptions = {
        isolationLevel: 'READ_COMMITTED'
      };

      await transactionAspect.run([options], mockProceed);

      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
    });

    it('应该支持只读事务', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockResolvedValue('result');
      const options: TransactionOptions = {
        readOnly: true
      };

      await transactionAspect.run([options], mockProceed);

      expect(mockQueryRunner.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    });

    it('应该在数据源未找到时抛出错误', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = {
        getMetaData: jest.fn().mockReturnValue(null)
      };

      const mockProceed = jest.fn();
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow("数据源 'DB' 未找到或未初始化");
    });
  });

  describe('统计功能', () => {
    it('应该记录事务统计信息', async () => {
      // 重置统计以确保干净的状态
      TransactionManager.resetStats();
      
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      // 执行成功事务
      const mockProceed = jest.fn().mockResolvedValue('result');
      await transactionAspect.run([{}], mockProceed);

      const stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(1);
      expect(stats.successfulTransactions).toBe(1);
      expect(stats.failedTransactions).toBe(0);
      expect(stats.averageDuration).toBeGreaterThan(0);
      expect(stats.longestTransaction).toBeGreaterThan(0);
      expect(stats.shortestTransaction).toBeGreaterThan(0);
    });

    it('应该正确重置统计信息', () => {
      TransactionManager.updateStats(100, true);
      TransactionManager.updateStats(200, false);

      let stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(2);

      TransactionManager.resetStats();

      stats = TransactionManager.getStats();
      expect(stats.totalTransactions).toBe(0);
      expect(stats.successfulTransactions).toBe(0);
      expect(stats.failedTransactions).toBe(0);
    });
  });

  describe('传播行为', () => {
    it('应该支持 NEVER 传播行为', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      // 模拟当前存在事务的情况
      const mockGetCurrentContext = jest.spyOn(TransactionManager, 'getCurrentContext')
        .mockReturnValue({
          queryRunner: mockQueryRunner,
          dataSource: mockDataSource,
          isActive: true,
          startTime: Date.now(),
          options: {},
          contextId: 'existing-context',
          savepoints: [],
          depth: 0
        });

      const mockProceed = jest.fn();
      const options: TransactionOptions = {
        propagation: 'NEVER'
      };

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow('Transaction not allowed (NEVER propagation)');

      mockGetCurrentContext.mockRestore();
    });

    it('应该支持 MANDATORY 传播行为', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn();
      const options: TransactionOptions = {
        propagation: 'MANDATORY'
      };

      await expect(transactionAspect.run([options], mockProceed))
        .rejects.toThrow('Transaction required (MANDATORY propagation)');
    });

    it('应该支持 SUPPORTS 传播行为', async () => {
      const transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;

      const mockProceed = jest.fn().mockResolvedValue('supports-result');
      const options: TransactionOptions = {
        propagation: 'SUPPORTS'
      };

      const result = await transactionAspect.run([options], mockProceed);

      expect(result).toBe('supports-result');
      expect(mockProceed).toHaveBeenCalled();
      // 不应该创建事务
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });
  });
}); 