import 'reflect-metadata';
import { 
  TransactionAspect, 
  TransactionManager,
  getCurrentQueryRunner,
  getCurrentEntityManager,
  isInTransaction,
  TransactionOptions
} from '../src/decorator';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';

// Mock TypeORM
jest.mock('typeorm');

describe('事务装饰器测试', () => {
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
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
    TransactionManager.clearCurrentContextId();
  });

  describe('TransactionManager', () => {
    it('应该能够生成唯一的上下文ID', () => {
      const id1 = TransactionManager.generateContextId();
      const id2 = TransactionManager.generateContextId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^tx_\d+_[a-z0-9]+$/);
    });

    it('应该能够设置和获取当前上下文ID', () => {
      const contextId = 'test-context-id';
      
      TransactionManager.setCurrentContextId(contextId);
      expect((global as any).__TRANSACTION_CONTEXT_ID__).toBe(contextId);
      
      TransactionManager.clearCurrentContextId();
      expect((global as any).__TRANSACTION_CONTEXT_ID__).toBeUndefined();
    });

    it('应该能够管理事务上下文', () => {
      const contextId = 'test-context';
      const context = {
        queryRunner: mockQueryRunner,
        dataSource: mockDataSource,
        isActive: true,
        startTime: Date.now(),
        options: {}
      };

      TransactionManager.setContext(contextId, context);
      
      TransactionManager.setCurrentContextId(contextId);
      const retrievedContext = TransactionManager.getCurrentContext();
      
      expect(retrievedContext).toBe(context);
      
      TransactionManager.clearContext(contextId);
      expect(TransactionManager.getCurrentContext()).toBeUndefined();
    });
  });

  describe('TransactionAspect', () => {
    let transactionAspect: TransactionAspect;

    beforeEach(() => {
      transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;
    });

    it('应该能够执行基本事务', async () => {
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

    it('应该在发生错误时回滚事务', async () => {
      const mockProceed = jest.fn().mockRejectedValue(new Error('Test error'));
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed)).rejects.toThrow('Test error');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('应该支持事务隔离级别', async () => {
      const mockProceed = jest.fn().mockResolvedValue('result');
      const options: TransactionOptions = {
        isolationLevel: 'READ_COMMITTED'
      };

      await transactionAspect.run([options], mockProceed);

      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith('READ_COMMITTED');
    });

    it('应该在数据源未找到时抛出错误', async () => {
      mockApp.getMetaData.mockReturnValue(null);
      
      const mockProceed = jest.fn();
      const options: TransactionOptions = {};

      await expect(transactionAspect.run([options], mockProceed)).rejects.toThrow('数据源 \'DB\' 未找到或未初始化');
    });
  });

  describe('工具函数', () => {
    beforeEach(() => {
      // 设置一个活动的事务上下文
      const contextId = TransactionManager.generateContextId();
      const context = {
        queryRunner: mockQueryRunner,
        dataSource: mockDataSource,
        isActive: true,
        startTime: Date.now(),
        options: {}
      };
      
      TransactionManager.setCurrentContextId(contextId);
      TransactionManager.setContext(contextId, context);
    });

    it('getCurrentQueryRunner 应该返回当前事务的查询运行器', () => {
      const queryRunner = getCurrentQueryRunner();
      expect(queryRunner).toBe(mockQueryRunner);
    });

    it('getCurrentEntityManager 应该返回当前事务的实体管理器', () => {
      const entityManager = getCurrentEntityManager();
      expect(entityManager).toBe(mockEntityManager);
    });

    it('isInTransaction 应该正确检测事务状态', () => {
      expect(isInTransaction()).toBe(true);
      
      // 清除上下文
      TransactionManager.clearCurrentContextId();
      expect(isInTransaction()).toBe(false);
    });
  });

  describe('事务传播行为', () => {
    let transactionAspect: TransactionAspect;

    beforeEach(() => {
      transactionAspect = new TransactionAspect();
      transactionAspect.app = mockApp;
    });

    it('应该支持 REQUIRED 传播行为', async () => {
      // 先创建一个现有事务
      const contextId = TransactionManager.generateContextId();
      const existingContext = {
        queryRunner: mockQueryRunner,
        dataSource: mockDataSource,
        isActive: true,
        startTime: Date.now(),
        options: {}
      };
      
      TransactionManager.setCurrentContextId(contextId);
      TransactionManager.setContext(contextId, existingContext);

      const mockProceed = jest.fn().mockResolvedValue('result');
      const options: TransactionOptions = {
        propagation: 'REQUIRED'
      };

      const result = await transactionAspect.run([options], mockProceed);

      expect(result).toBe('result');
      expect(mockProceed).toHaveBeenCalled();
      // 不应该创建新的查询运行器，因为使用现有事务
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('应该支持 NEVER 传播行为', async () => {
      // 先创建一个现有事务
      const contextId = TransactionManager.generateContextId();
      const existingContext = {
        queryRunner: mockQueryRunner,
        dataSource: mockDataSource,
        isActive: true,
        startTime: Date.now(),
        options: {}
      };
      
      TransactionManager.setCurrentContextId(contextId);
      TransactionManager.setContext(contextId, existingContext);

      const mockProceed = jest.fn();
      const options: TransactionOptions = {
        propagation: 'NEVER'
      };

      await expect(transactionAspect.run([options], mockProceed)).rejects.toThrow('Transaction not allowed (NEVER propagation)');
    });

    it('应该支持 MANDATORY 传播行为', async () => {
      // 没有现有事务的情况
      const mockProceed = jest.fn();
      const options: TransactionOptions = {
        propagation: 'MANDATORY'
      };

      await expect(transactionAspect.run([options], mockProceed)).rejects.toThrow('Transaction required (MANDATORY propagation)');
    });

    it('应该支持 SUPPORTS 传播行为', async () => {
      // 没有现有事务的情况
      const mockProceed = jest.fn().mockResolvedValue('result');
      const options: TransactionOptions = {
        propagation: 'SUPPORTS'
      };

      const result = await transactionAspect.run([options], mockProceed);

      expect(result).toBe('result');
      expect(mockProceed).toHaveBeenCalled();
      // 不应该创建事务
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });
  });
}); 