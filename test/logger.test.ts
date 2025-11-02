import { KLogger } from '../src/logger';
import { DataSourceOptions } from 'typeorm';

describe('KLogger', () => {
  let logger: KLogger;

  describe('with logging enabled', () => {
    beforeEach(() => {
      const options: DataSourceOptions = {
        type: 'mysql',
        logging: true,
      };
      logger = new KLogger(options);
    });

    it('should cache logging flag on initialization', () => {
      expect((logger as any).loggingEnabled).toBe(true);
    });

    it('should log query when logging is enabled', () => {
      // 测试 logQuery 方法存在且可调用
      expect(() => {
        logger.logQuery('SELECT * FROM users');
      }).not.toThrow();
    });

    it('should log query error when logging is enabled', () => {
      expect(() => {
        logger.logQueryError(new Error('Test error'), 'SELECT * FROM users');
      }).not.toThrow();
    });

    it('should log slow query when logging is enabled', () => {
      expect(() => {
        logger.logQuerySlow(1000, 'SELECT * FROM users');
      }).not.toThrow();
    });

    it('should log schema build when logging is enabled', () => {
      expect(() => {
        logger.logSchemaBuild('Building schema');
      }).not.toThrow();
    });

    it('should log migration when logging is enabled', () => {
      expect(() => {
        logger.logMigration('Running migration');
      }).not.toThrow();
    });

    it('should log with different levels', () => {
      expect(() => {
        logger.log('info', 'Info message');
        logger.log('warn', 'Warning message');
        logger.log('log', 'Log message');
      }).not.toThrow();
    });
  });

  describe('with logging disabled', () => {
    beforeEach(() => {
      const options: DataSourceOptions = {
        type: 'mysql',
        logging: false,
      };
      logger = new KLogger(options);
    });

    it('should cache logging flag as false on initialization', () => {
      expect((logger as any).loggingEnabled).toBe(false);
    });

    it('should not throw when logging is disabled', () => {
      expect(() => {
        logger.logQuery('SELECT * FROM users');
        logger.logQueryError(new Error('Test error'), 'SELECT * FROM users');
        logger.logQuerySlow(1000, 'SELECT * FROM users');
        logger.logSchemaBuild('Building schema');
        logger.logMigration('Running migration');
        logger.log('info', 'Info message');
      }).not.toThrow();
    });
  });
});

