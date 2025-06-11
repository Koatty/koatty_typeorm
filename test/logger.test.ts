import 'reflect-metadata';
import { KLogger } from '../src/logger';
import { DataSourceOptions } from 'typeorm';
import { DefaultLogger } from 'koatty_logger';

// Mock koatty_logger
jest.mock('koatty_logger', () => ({
  DefaultLogger: {
    Info: jest.fn(),
    Error: jest.fn(),
    Warn: jest.fn(),
  },
}));

describe('KLogger', () => {
  let options: DataSourceOptions;
  let logger: KLogger;

  beforeEach(() => {
    options = {
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'test',
      password: 'test',
      database: 'test',
      logging: true,
    };
    logger = new KLogger(options);
    
    // 清除所有 mock 调用
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化 KLogger 实例', () => {
      expect(logger).toBeInstanceOf(KLogger);
      expect(logger.options).toEqual(options);
    });

    it('应该处理空选项', () => {
      const emptyLogger = new KLogger({} as DataSourceOptions);
      expect(emptyLogger).toBeInstanceOf(KLogger);
    });
  });

  describe('logQuery', () => {
    it('应该记录查询日志当 logging 为 true 时', () => {
      const query = 'SELECT * FROM users';
      const parameters = ['param1', 'param2'];

      logger.logQuery(query, parameters);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(query, parameters);
    });

    it('应该不记录查询日志当 logging 为 false 时', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);
      
      const query = 'SELECT * FROM users';
      const parameters = ['param1', 'param2'];

      noLoggingLogger.logQuery(query, parameters);

      expect(DefaultLogger.Info).not.toHaveBeenCalled();
    });

    it('应该处理没有参数的查询', () => {
      const query = 'SELECT * FROM users';

      logger.logQuery(query);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(query, undefined);
    });
  });

  describe('logQueryError', () => {
    it('应该记录查询错误日志当 logging 为 true 时', () => {
      const error = new Error('Database connection failed');
      const query = 'SELECT * FROM users';
      const parameters = ['param1'];

      logger.logQueryError(error, query, parameters);

      expect(DefaultLogger.Error).toHaveBeenCalledWith(query, parameters, error);
    });

    it('应该处理字符串错误', () => {
      const error = 'Connection timeout';
      const query = 'SELECT * FROM users';

      logger.logQueryError(error, query);

      expect(DefaultLogger.Error).toHaveBeenCalledWith(query, undefined, error);
    });

    it('应该不记录错误日志当 logging 为 false 时', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);
      
      const error = new Error('Database error');
      const query = 'SELECT * FROM users';

      noLoggingLogger.logQueryError(error, query);

      expect(DefaultLogger.Error).not.toHaveBeenCalled();
    });
  });

  describe('logQuerySlow', () => {
    it('应该记录慢查询日志当 logging 为 true 时', () => {
      const time = 5000;
      const query = 'SELECT * FROM large_table';
      const parameters = ['param1'];

      logger.logQuerySlow(time, query, parameters);

      expect(DefaultLogger.Warn).toHaveBeenCalledWith(
        'QuerySlow',
        query,
        parameters,
        'execution time:',
        time
      );
    });

    it('应该不记录慢查询日志当 logging 为 false 时', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);
      
      const time = 5000;
      const query = 'SELECT * FROM large_table';

      noLoggingLogger.logQuerySlow(time, query);

      expect(DefaultLogger.Warn).not.toHaveBeenCalled();
    });
  });

  describe('logSchemaBuild', () => {
    it('应该记录架构构建日志当 logging 为 true 时', () => {
      const message = 'Schema build completed';

      logger.logSchemaBuild(message);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(message);
    });

    it('应该不记录架构构建日志当 logging 为 false 时', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);
      
      const message = 'Schema build completed';

      noLoggingLogger.logSchemaBuild(message);

      expect(DefaultLogger.Info).not.toHaveBeenCalled();
    });
  });

  describe('logMigration', () => {
    it('应该记录迁移日志当 logging 为 true 时', () => {
      const message = 'Migration completed successfully';

      logger.logMigration(message);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(message);
    });

    it('应该不记录迁移日志当 logging 为 false 时', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);
      
      const message = 'Migration completed successfully';

      noLoggingLogger.logMigration(message);

      expect(DefaultLogger.Info).not.toHaveBeenCalled();
    });
  });

  describe('log', () => {
    it('应该使用 Info 级别记录 "log" 消息', () => {
      const message = 'General log message';

      logger.log('log', message);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(message);
    });

    it('应该使用 Info 级别记录 "info" 消息', () => {
      const message = 'Information message';

      logger.log('info', message);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(message);
    });

    it('应该使用 Warn 级别记录 "warn" 消息', () => {
      const message = 'Warning message';

      logger.log('warn', message);

      expect(DefaultLogger.Warn).toHaveBeenCalledWith(message);
    });

    it('应该提前返回当 logging 为 false 时', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);
      
      const message = 'Test message';

      noLoggingLogger.log('info', message);
      noLoggingLogger.log('warn', message);
      noLoggingLogger.log('log', message);

      expect(DefaultLogger.Info).not.toHaveBeenCalled();
      expect(DefaultLogger.Warn).not.toHaveBeenCalled();
    });

    it('应该处理复杂的消息对象', () => {
      const message = { query: 'SELECT * FROM users', params: [1, 2, 3] };

      logger.log('info', message);

      expect(DefaultLogger.Info).toHaveBeenCalledWith(message);
    });
  });

  describe('日志开关控制', () => {
    it('应该在所有方法中正确处理 logging 开关', () => {
      // 创建新的 logger 实例，logging 为 false
      const noLoggingOptions = { ...options, logging: false };
      const noLoggingLogger = new KLogger(noLoggingOptions);

      // 调用所有日志方法
      noLoggingLogger.logQuery('SELECT * FROM test');
      noLoggingLogger.logQueryError('Error', 'SELECT * FROM test');
      noLoggingLogger.logQuerySlow(1000, 'SELECT * FROM test');
      noLoggingLogger.logSchemaBuild('Schema message');
      noLoggingLogger.logMigration('Migration message');
      noLoggingLogger.log('info', 'Log message');

      // 验证没有任何日志被记录
      expect(DefaultLogger.Info).not.toHaveBeenCalled();
      expect(DefaultLogger.Error).not.toHaveBeenCalled();
      expect(DefaultLogger.Warn).not.toHaveBeenCalled();
    });

    it('应该在 logging 为 true 时记录所有类型的日志', () => {
      // 创建新的 logger 实例，logging 为 true
      const loggingOptions = { ...options, logging: true };
      const loggingLogger = new KLogger(loggingOptions);

      // 调用各种日志方法
      loggingLogger.logQuery('SELECT query');
      loggingLogger.logQueryError('Error message', 'SELECT query');
      loggingLogger.logQuerySlow(2000, 'SLOW query');
      loggingLogger.logSchemaBuild('Schema built');
      loggingLogger.logMigration('Migration done');
      loggingLogger.log('info', 'Info message');
      loggingLogger.log('warn', 'Warn message');

      // 验证所有日志都被记录
      expect(DefaultLogger.Info).toHaveBeenCalledTimes(4); // logQuery, logSchemaBuild, logMigration, log('info')
      expect(DefaultLogger.Error).toHaveBeenCalledTimes(1); // logQueryError
      expect(DefaultLogger.Warn).toHaveBeenCalledTimes(2); // logQuerySlow, log('warn')
    });
  });
}); 