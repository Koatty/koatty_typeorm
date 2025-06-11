/**
 * 事务装饰器集成测试 - 实际使用场景
 */
import 'reflect-metadata';
import { 
  Transactional, 
  TransactionManager,
  TransactionOptions,
  TransactionHooks,
  getCurrentQueryRunner,
  getCurrentEntityManager,
  isInTransaction
} from '../src/decorator';

describe.skip('事务装饰器集成测试', () => {
  // 模拟服务类
  class UserService {
    
    @Transactional({
      isolationLevel: 'READ_COMMITTED',
      timeout: 30000,
      name: 'create-user'
    })
    async createUser(userData: any): Promise<any> {
      // 模拟用户创建逻辑
      if (!userData.email) {
        throw new Error('邮箱不能为空');
      }
      
      const em = getCurrentEntityManager();
      expect(em).toBeDefined();
      expect(isInTransaction()).toBe(true);
      
      return { id: 1, ...userData };
    }

    @Transactional({
      readOnly: true,
      isolationLevel: 'REPEATABLE_READ',
      name: 'get-user-stats'
    })
    async getUserStats(): Promise<any> {
      expect(isInTransaction()).toBe(true);
      
      const qr = getCurrentQueryRunner();
      if (qr) {
        // 模拟查询
        await qr.query('SELECT COUNT(*) FROM users');
      }
      
      return { totalUsers: 100, activeUsers: 95 };
    }

    @Transactional({
      propagation: 'REQUIRES_NEW',
      name: 'audit-log',
      hooks: {
        beforeCommit: async () => {
          console.log('准备提交审计日志...');
        },
        afterCommit: async () => {
          console.log('审计日志已提交');
        }
      }
    })
    async createAuditLog(action: string): Promise<void> {
      expect(isInTransaction()).toBe(true);
      
      const qr = getCurrentQueryRunner();
      if (qr) {
        await qr.query(
          'INSERT INTO audit_logs (action, timestamp) VALUES (?, ?)',
          [action, new Date()]
        );
      }
    }

    @Transactional({
      propagation: 'REQUIRED',
      name: 'bulk-operation'
    })
    async bulkCreateUsers(usersData: any[]): Promise<any[]> {
      const results: any[] = [];
      
      for (const userData of usersData) {
        try {
          // 每个用户创建使用嵌套事务
          const user = await this.createUserWithNested(userData);
          results.push(user);
        } catch (error: any) {
          console.log(`用户创建失败: ${error.message}`);
          // 继续处理下一个用户
        }
      }
      
      return results;
    }

    @Transactional({
      propagation: 'NESTED',
      name: 'create-user-nested'
    })
    async createUserWithNested(userData: any): Promise<any> {
      if (userData.email === 'invalid@test.com') {
        throw new Error('无效邮箱');
      }
      
      return { id: Math.random(), ...userData };
    }
  }

  // 模拟数据库相关对象
  let mockApp: any;
  let mockQueryRunner: any;
  let mockEntityManager: any;

  beforeEach(() => {
    // 设置mock对象
    mockEntityManager = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

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
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      isInitialized: true,
      hasMetadata: true,
    };

    mockApp = {
      getMetaData: jest.fn().mockReturnValue({
        dataSource: mockDataSource,
      }),
    };

    // 设置app到AspectClass  
    const { TransactionAspect } = require('../src/decorator');
    
    // 创建一个TransactionAspect实例并设置app
    const originalAspect = TransactionAspect;
    const mockAspect = function() {
      originalAspect.call(this);
      this.app = mockApp;
    };
    mockAspect.prototype = originalAspect.prototype;
    
    // 替换构造函数
    require('../src/decorator').TransactionAspect = mockAspect;

    // 重置统计
    TransactionManager.resetStats();
  });

  afterEach(() => {
    TransactionManager.stopCleanupTimer();
  });

  describe('基础功能测试', () => {
    it('应该能够创建用户', async () => {
      const userService = new UserService();
      
      const userData = {
        name: 'Test User',
        email: 'test@example.com'
      };

      const result = await userService.createUser(userData);
      
      expect(result).toEqual({
        id: 1,
        name: 'Test User',
        email: 'test@example.com'
      });

      // 验证事务操作
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('应该处理用户创建失败', async () => {
      const userService = new UserService();
      
      const userData = {
        name: 'Test User'
        // 缺少email
      };

      await expect(userService.createUser(userData)).rejects.toThrow('邮箱不能为空');

      // 验证事务回滚
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('应该执行只读事务', async () => {
      const userService = new UserService();
      
      const stats = await userService.getUserStats();
      
      expect(stats).toEqual({
        totalUsers: 100,
        activeUsers: 95
      });

      // 验证设置了只读模式
      expect(mockQueryRunner.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    });
  });

  describe('事务传播行为测试', () => {
    it('应该支持REQUIRES_NEW传播行为', async () => {
      const userService = new UserService();
      
      // 在主事务中调用REQUIRES_NEW的方法
      const mainTransaction = async () => {
        await userService.createAuditLog('user_created');
        return 'main_result';
      };

             // 使用装饰器包装主事务
       class MainTransactionService {
         @Transactional({
           name: 'main-transaction'
         })
         async execute() {
           return await mainTransaction();
         }
       }

       const wrappedInstance = new MainTransactionService();
       const result = await wrappedInstance.execute();
      
      expect(result).toBe('main_result');
      
      // 验证创建了多个事务
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(2);
    });

    it('应该支持嵌套事务', async () => {
      const userService = new UserService();
      
      const usersData = [
        { name: 'User1', email: 'user1@test.com' },
        { name: 'User2', email: 'invalid@test.com' }, // 这个会失败
        { name: 'User3', email: 'user3@test.com' }
      ];

      const results = await userService.bulkCreateUsers(usersData);
      
      // 应该创建了2个用户（跳过了失败的那个）
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('User1');
      expect(results[1].name).toBe('User3');

      // 验证使用了保存点
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^SAVEPOINT sp_\d+_[a-z0-9]+$/)
      );
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringMatching(/^ROLLBACK TO SAVEPOINT sp_\d+_[a-z0-9]+$/)
      );
    });
  });

  describe('事务钩子测试', () => {
    it('应该执行事务钩子', async () => {
      const userService = new UserService();
      
      // 监听控制台输出
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await userService.createAuditLog('test_action');
      
      expect(consoleSpy).toHaveBeenCalledWith('准备提交审计日志...');
      expect(consoleSpy).toHaveBeenCalledWith('审计日志已提交');
      
      consoleSpy.mockRestore();
    });
  });

  describe('性能监控测试', () => {
    it('应该记录事务统计信息', async () => {
      const userService = new UserService();
      
      // 执行多个事务
      await userService.createUser({ name: 'User1', email: 'user1@test.com' });
      await userService.createUser({ name: 'User2', email: 'user2@test.com' });
      await userService.getUserStats();

      const stats = TransactionManager.getStats();
      
      expect(stats.totalTransactions).toBe(3);
      expect(stats.successfulTransactions).toBe(3);
      expect(stats.failedTransactions).toBe(0);
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    it('应该记录失败的事务', async () => {
      const userService = new UserService();
      
      // 成功的事务
      await userService.createUser({ name: 'User1', email: 'user1@test.com' });
      
             // 失败的事务
       try {
         await userService.createUser({ name: 'User2' }); // 缺少email
       } catch (e: any) {
         // 忽略错误
       }

      const stats = TransactionManager.getStats();
      
      expect(stats.totalTransactions).toBe(2);
      expect(stats.successfulTransactions).toBe(1);
      expect(stats.failedTransactions).toBe(1);
    });
  });

  describe('边界条件测试', () => {
    it('应该处理超时事务', async () => {
      // 创建一个会超时的事务
      class SlowService {
        @Transactional({
          timeout: 50, // 50ms超时
          name: 'slow-operation'
        })
        async slowOperation(): Promise<string> {
          // 模拟慢操作
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'should-not-reach';
        }
      }

      const slowService = new SlowService();
      
      await expect(slowService.slowOperation())
        .rejects.toThrow(/Transaction timeout after \d+ms/);

      const stats = TransactionManager.getStats();
      expect(stats.failedTransactions).toBe(1);
    });

    it('应该处理数据源配置错误', async () => {
      // 模拟数据源未找到
      mockApp.getMetaData.mockReturnValue(null);
      
      class TestService {
        @Transactional({ name: 'test-no-datasource' })
        async testMethod(): Promise<string> {
          return 'result';
        }
      }

      const testService = new TestService();
      
      await expect(testService.testMethod())
        .rejects.toThrow("数据源 'DB' 未找到或未初始化");
    });
  });
}); 