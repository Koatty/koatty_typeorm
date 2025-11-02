import 'reflect-metadata';
import { KoattyTypeORM } from '../src/index';
import { KLogger } from '../src/logger';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Koatty } from 'koatty_core';

// Mock dependencies
jest.mock('typeorm');
jest.mock('koatty_core');
jest.mock('../src/logger');

describe('KoattyTypeORM', () => {
  let mockApp: jest.Mocked<Koatty>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockConnection: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock Koatty app
    mockApp = {
      config: jest.fn(),
      setMetaData: jest.fn(),
      on: jest.fn(),
    } as any;

    // Mock DataSource connection - 使用普通对象而不是 jest.Mocked
    mockConnection = {
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(),
      getRepository: jest.fn(),
      manager: {},
      // 添加 TypeORM DataSource 需要的其他属性
      findMetadata: jest.fn(),
      buildMetadatas: jest.fn(),
    };

    // Mock DataSource constructor
    mockDataSource = mockConnection;
    (DataSource as jest.MockedClass<typeof DataSource>).mockImplementation(() => mockDataSource);
  });

  describe('正常情况测试', () => {
    it('应该成功初始化 TypeORM 连接', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'test',
        password: 'test',
        database: 'test_db',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      const result = await KoattyTypeORM(options, mockApp);

      expect(DataSource).toHaveBeenCalledWith(expect.objectContaining({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'test',
        password: 'test',
        database: 'test_db',
      }));
      expect(mockDataSource.initialize).toHaveBeenCalled();
      expect(mockApp.setMetaData).toHaveBeenCalledWith('DB', expect.objectContaining({
        connection: mockConnection,
        dataSource: mockDataSource,
      }));
      expect(result).toBe(mockConnection);
    });

    it('应该使用默认配置当选项为空时', async () => {
      const configOptions = {
        type: 'postgres',
        host: 'config-host',
        database: 'config-db',
      };

      mockApp.config.mockReturnValue(configOptions);
      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await KoattyTypeORM(null as any, mockApp);

      expect(mockApp.config).toHaveBeenCalledWith('DataBase', 'db');
      expect(DataSource).toHaveBeenCalledWith(expect.objectContaining({
        type: 'postgres',
        host: 'config-host',
        database: 'config-db',
      }));
    });

    it('应该合并默认配置和用户配置', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'custom-host',
        database: 'custom-db',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await KoattyTypeORM(options, mockApp);

      expect(DataSource).toHaveBeenCalledWith(expect.objectContaining({
        type: 'mysql',
        host: 'custom-host',
        port: 3306, // 来自默认配置
        username: 'test', // 来自默认配置
        database: 'custom-db',
      }));
    });

    it('应该设置自定义 Logger', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await KoattyTypeORM(options, mockApp);

      expect(KLogger).toHaveBeenCalled();
      expect(DataSource).toHaveBeenCalledWith(expect.objectContaining({
        logger: expect.any(Object),
      }));
    });

    it('应该注册应用关闭事件监听器', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await KoattyTypeORM(options, mockApp);

      expect(mockApp.on).toHaveBeenCalledWith('Stop', expect.any(Function));
    });
  });

  describe('错误处理测试', () => {
    it('应该抛出错误当配置为空时', async () => {
      mockApp.config.mockReturnValue(null);

      await expect(KoattyTypeORM(null as any, mockApp))
        .rejects.toThrow('数据库配置不能为空');
    });

    it('应该抛出错误当数据库类型未指定时', async () => {
      const options = {
        host: 'localhost',
        database: 'test',
      } as DataSourceOptions;

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow('数据库类型 (type) 是必需的');
    });

    it('应该抛出错误当 MySQL 缺少主机信息时', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        database: 'test',
      };

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow(/数据库类型 'mysql' 需要 host 或 url 配置/);
    });

    it('应该抛出错误当 MySQL 缺少数据库名称时', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
      };

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow(/数据库类型 'mysql' 需要 database 或 url 配置/);
    });

    it('应该处理数据库连接初始化失败', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      };

      mockDataSource.initialize.mockRejectedValue(new Error('连接失败'));

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow('TypeORM 初始化失败: 连接失败');
    });

    it('应该抛出错误当连接未正确初始化时', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      };

      // 创建一个未初始化的连接对象
      const uninitializedConnection = {
        ...mockConnection,
        isInitialized: false,
      };

      mockDataSource.initialize.mockResolvedValue(uninitializedConnection);

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow('数据库连接初始化失败');
    });
  });

  describe('SQLite 特殊情况测试', () => {
    it('应该允许 SQLite 不需要主机和数据库配置', async () => {
      const options: DataSourceOptions = {
        type: 'sqlite',
        database: ':memory:',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await expect(KoattyTypeORM(options, mockApp)).resolves.toBe(mockConnection);
    });

    it('应该允许 better-sqlite3 不需要主机配置', async () => {
      const options: DataSourceOptions = {
        type: 'better-sqlite3',
        database: 'test.db',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await expect(KoattyTypeORM(options, mockApp)).resolves.toBe(mockConnection);
    });
  });

  describe('增强的配置验证', () => {
    it('应该允许 MongoDB 不需要 host', async () => {
      const options: DataSourceOptions = {
        type: 'mongodb',
        url: 'mongodb://localhost:27017/test',
      } as any;

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await expect(KoattyTypeORM(options, mockApp)).resolves.toBe(mockConnection);
    });

    it('应该允许 Capacitor SQLite 不需要 host', async () => {
      const options: DataSourceOptions = {
        type: 'capacitor',
        database: 'test.db',
      } as any;

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await expect(KoattyTypeORM(options, mockApp)).resolves.toBe(mockConnection);
    });

    it('应该为 PostgreSQL 缺少 host 时提供详细错误', async () => {
      const options: DataSourceOptions = {
        type: 'postgres',
        database: 'test',
      };

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow(/数据库类型 'postgres' 需要 host 或 url 配置/);
    });

    it('应该为 PostgreSQL 缺少 database 时提供详细错误', async () => {
      const options: DataSourceOptions = {
        type: 'postgres',
        host: 'localhost',
      };

      await expect(KoattyTypeORM(options, mockApp))
        .rejects.toThrow(/数据库类型 'postgres' 需要 database 或 url 配置/);
    });
  });

  describe('应用关闭处理测试', () => {
    it('应该在应用关闭时销毁数据库连接', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await KoattyTypeORM(options, mockApp);

      // 获取注册的关闭处理函数
      const closeHandler = mockApp.on.mock.calls.find(call => call[0] === 'Stop')?.[1];
      expect(closeHandler).toBeDefined();

      // 执行关闭处理函数
      await closeHandler();

      expect(mockConnection.destroy).toHaveBeenCalled();
    });

    it('应该跳过销毁未初始化的连接', async () => {
      const options: DataSourceOptions = {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      };

      mockDataSource.initialize.mockResolvedValue(mockConnection);

      await KoattyTypeORM(options, mockApp);

      // 创建一个未初始化的连接状态
      const uninitializedConnection = {
        ...mockConnection,
        isInitialized: false,
      };

      // 重新设置 mockDataSource.initialize 返回未初始化的连接
      mockDataSource.initialize.mockResolvedValue(uninitializedConnection);

      const closeHandler = mockApp.on.mock.calls.find(call => call[0] === 'Stop')?.[1];
      
      // 模拟连接状态变为未初始化
      mockConnection.isInitialized = false;
      
      await closeHandler();

      expect(mockConnection.destroy).not.toHaveBeenCalled();
    });
  });
}); 