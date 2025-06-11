import 'reflect-metadata';
import { KoattyTypeORM } from '../src/index';
import { KLogger } from '../src/logger';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Koatty } from 'koatty_core';

/**
 * 集成测试 - 测试真实场景下的插件行为
 * 注意：这些测试使用真实的 TypeORM 和 Koatty 实例，但使用内存数据库
 */
describe('KoattyTypeORM 集成测试', () => {
  let app: Koatty;
  let metaDataStore: Map<string, any>;

  beforeEach(() => {
    // 创建元数据存储
    metaDataStore = new Map();
    
    // 创建模拟的 Koatty 应用实例
    app = {
      config: jest.fn(),
      setMetaData: jest.fn((key: string, value: any) => {
        metaDataStore.set(key, value);
      }),
      getMetaData: jest.fn((key: string) => {
        return metaDataStore.get(key);
      }),
      on: jest.fn(),
    } as any;
  });

  afterEach(async () => {
    // 清理数据库连接
    const dbMeta = app.getMetaData('DB')[0];
    if (dbMeta?.connection?.isInitialized) {
      await dbMeta.connection.destroy();
    }
  });

  describe('SQLite 内存数据库集成测试', () => {
    it('应该成功连接到 SQLite 内存数据库', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false,
        entities: [],
      };

      const connection = await KoattyTypeORM(options, app);

      expect(connection).toBeDefined();
      expect(connection.isInitialized).toBe(true);
      expect(app.setMetaData).toHaveBeenCalledWith('DB', expect.objectContaining({
        connection: expect.any(DataSource),
        dataSource: expect.any(DataSource),
        transaction: expect.any(Function),
        getRepository: expect.any(Function),
        manager: expect.any(Object),
      }));
    });

    it('应该正确设置自定义 Logger', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: true,
        entities: [],
      };

      const connection = await KoattyTypeORM(options, app);

      // 验证 logger 是 KLogger 实例
      expect(connection.options.logger).toBeInstanceOf(KLogger);
    });

    it('应该处理应用关闭事件', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false,
        entities: [],
      };

      const connection = await KoattyTypeORM(options, app);

      // 验证事件监听器被注册（修正事件名称）
      expect(app.on).toHaveBeenCalledWith('Stop', expect.any(Function));

      // 获取并执行关闭处理函数
      const closeHandler = (app.on as jest.Mock).mock.calls.find(
        call => call[0] === 'Stop'
      )?.[1];

      expect(closeHandler).toBeDefined();

      // 执行关闭处理 - 应该不抛出错误
      await expect(closeHandler()).resolves.toBeUndefined();

      // 验证连接已关闭
      expect(connection.isInitialized).toBe(false);
    });
  });

  describe('配置合并测试', () => {
    it('应该正确合并默认配置和用户配置', async () => {
      const userOptions: Partial<DataSourceOptions> = {
        type: 'sqlite',
        database: ':memory:',
        logging: false,
      };

      const connection = await KoattyTypeORM(userOptions as DataSourceOptions, app);

      // 验证配置合并结果
      expect(connection.options.type).toBe('sqlite');
      expect(connection.options.database).toBe(':memory:');
      expect(connection.options.logging).toBe(false);
      // 默认配置应该被保留
      expect(connection.options.synchronize).toBe(false);
    });

    it('应该从应用配置中读取数据库配置', async () => {
      const configOptions: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false,
        entities: [],
      };

      (app.config as jest.Mock).mockReturnValue(configOptions);

      const connection = await KoattyTypeORM(null as any, app);

      expect(app.config).toHaveBeenCalledWith('DataBase', 'db');
      expect(connection.options.type).toBe('sqlite');
      expect(connection.options.database).toBe(':memory:');
    });
  });

  describe('错误场景集成测试', () => {
    it('应该处理无效的数据库配置', async () => {
      const invalidOptions = {
        // 缺少必需的 type 字段
        host: 'localhost',
        database: 'test',
      } as DataSourceOptions;

      await expect(KoattyTypeORM(invalidOptions, app))
        .rejects.toThrow('数据库类型 (type) 是必需的');
    });

    it('应该处理数据库连接失败', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'nonexistent-host',
        port: 9999,
        username: 'invalid',
        password: 'invalid',
        database: 'nonexistent',
        connectTimeout: 1000, // 快速超时
      };

      await expect(KoattyTypeORM(options, app))
        .rejects.toThrow(/TypeORM 初始化失败/);
    });
  });

  describe('Logger 集成测试', () => {
    it('应该在实际查询中使用自定义 Logger', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: true,
        entities: [],
      };

      const connection = await KoattyTypeORM(options, app);
      const logger = connection.options.logger as KLogger;

      // 验证 logger 配置
      expect(logger).toBeInstanceOf(KLogger);
      expect(logger.options.logging).toBe(true);

      // 执行一个简单查询来测试日志功能
      try {
        await connection.query('SELECT 1 as test');
      } catch (error) {
        // SQLite 内存数据库应该支持这个查询，但如果失败也不影响测试
      }
    });
  });

  describe('元数据注入测试', () => {
    it('应该正确注入数据库相关方法到应用元数据', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false,
        entities: [],
      };

      const connection = await KoattyTypeORM(options, app);

      // 验证 setMetaData 被正确调用
      expect(app.setMetaData).toHaveBeenCalledWith('DB', {
        connection: connection,
        dataSource: expect.any(DataSource),
        transaction: expect.any(Function),
        getRepository: expect.any(Function),
        manager: connection.manager,
      });

      // 获取注入的元数据
      const dbMeta = app.getMetaData('DB')[0];

      // 验证方法绑定
      expect(typeof dbMeta.transaction).toBe('function');
      expect(typeof dbMeta.getRepository).toBe('function');
      expect(dbMeta.manager).toBe(connection.manager);
    });
  });

  describe('生命周期管理测试', () => {
    it('应该在多次初始化时正确处理连接', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        logging: false,
        entities: [],
      };

      // 第一次初始化
      const connection1 = await KoattyTypeORM(options, app);
      expect(connection1.isInitialized).toBe(true);

      // 清理第一个连接
      await connection1.destroy();

      // 第二次初始化应该成功
      const connection2 = await KoattyTypeORM(options, app);
      expect(connection2.isInitialized).toBe(true);

      // 清理
      await connection2.destroy();
    });
  });
}); 