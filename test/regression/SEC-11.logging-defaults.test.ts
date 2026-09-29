import 'reflect-metadata';
import { KLogger, sanitizeLogParams } from '../../src/logger';
import { DefaultLogger } from 'koatty_logger';
import { DataSourceOptions } from 'typeorm';

/**
 * SEC-11 regression tests:
 * 1. In production the default `logging` option must be ['error'] (not `true`)
 *    so query logs do not leak sensitive data by default.
 * 2. Query parameters passed to the logger must have sensitive field values masked.
 */

// Mock typeorm: only DataSource needs to be mocked, capture constructor options
jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return {
    ...actual,
    DataSource: jest.fn(),
  };
});

describe('SEC-11: TypeORM logging defaults and query parameter masking', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    jest.restoreAllMocks();
  });

  /**
   * Load src/index in an isolated module registry with the given NODE_ENV,
   * then run KoattyTypeORM against a mocked DataSource.
   */
  async function initInEnv(nodeEnv: string | undefined, options: DataSourceOptions) {
    process.env.NODE_ENV = nodeEnv;

    let indexMod: any;
    let typeormMod: any;
    jest.isolateModules(() => {
      indexMod = require('../../src/index');
      typeormMod = require('typeorm');
    });

    const connection = {
      isInitialized: true,
      destroy: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn(),
      getRepository: jest.fn(),
      manager: {},
    };
    const instance = {
      initialize: jest.fn().mockResolvedValue(connection),
    };
    (typeormMod.DataSource as jest.Mock).mockImplementation(() => instance);

    const mockApp = {
      config: jest.fn(),
      setMetaData: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };

    await indexMod.KoattyTypeORM(options, mockApp);

    expect((typeormMod.DataSource as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    const ctorOptions = (typeormMod.DataSource as jest.Mock).mock.calls[0][0];
    return { ctorOptions, connection, mockApp };
  }

  it('KOATTY_ENV production overrides NODE_ENV development', async () => {
    const previous = process.env.KOATTY_ENV;
    try { process.env.KOATTY_ENV = 'production'; const { ctorOptions } = await initInEnv('development', { type: 'mysql', host: 'localhost', database: 'fixture' }); expect(ctorOptions.logging).toEqual(['error']); }
    finally { if (previous === undefined) delete process.env.KOATTY_ENV; else process.env.KOATTY_ENV = previous; }
  });

  describe('default logging option (SEC-11)', () => {
    it('defaults logging to ["error"] when NODE_ENV is production', async () => {
      const { ctorOptions } = await initInEnv('production', {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      } as DataSourceOptions);

      expect(ctorOptions.logging).toEqual(['error']);
    });

    it('defaults logging to true when NODE_ENV is not production', async () => {
      const { ctorOptions } = await initInEnv('development', {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      } as DataSourceOptions);

      expect(ctorOptions.logging).toBe(true);
    });

    it('defaults logging to true when NODE_ENV is unset', async () => {
      const { ctorOptions } = await initInEnv(undefined, {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
      } as DataSourceOptions);

      expect(ctorOptions.logging).toBe(true);
    });

    it('does not override an explicit user logging option in production', async () => {
      const { ctorOptions } = await initInEnv('production', {
        type: 'mysql',
        host: 'localhost',
        database: 'test',
        logging: ['query', 'error'],
      } as unknown as DataSourceOptions);

      expect(ctorOptions.logging).toEqual(['query', 'error']);
    });
  });

  describe('query parameter masking (SEC-11)', () => {
    const baseOptions = {
      type: 'mysql',
      host: 'localhost',
      database: 'test',
      logging: true,
    } as DataSourceOptions;

    it('masks sensitive field values in logQuery parameters', () => {
      const infoSpy = jest.spyOn(DefaultLogger, 'Info').mockImplementation(() => { /* silence */ });
      const logger = new KLogger(baseOptions);

      logger.logQuery('SELECT * FROM users WHERE name = ?', [
        { name: 'bob', password: 's3cr3t-P@ss', token: 'tok-abc123', apiKey: 'key-xyz' },
        'plain-value',
      ] as any);

      expect(infoSpy).toHaveBeenCalledTimes(1);
      const loggedArgs = infoSpy.mock.calls[0];
      const serialized = JSON.stringify(loggedArgs);

      expect(serialized).not.toContain('s3cr3t-P@ss');
      expect(serialized).not.toContain('tok-abc123');
      expect(serialized).not.toContain('key-xyz');
      // non-sensitive values remain visible
      expect(serialized).toContain('bob');
      // Positional parameters cannot be mapped safely to field names.
      expect(serialized).not.toContain('plain-value');
      expect(serialized).toContain('***');
    });

    it('masks sensitive values in nested objects and arrays', () => {
      const infoSpy = jest.spyOn(DefaultLogger, 'Info').mockImplementation(() => { /* silence */ });
      const logger = new KLogger(baseOptions);

      logger.logQuery('INSERT INTO users SET ?', [
        { profile: { passwd: 'nested-secret' }, tags: [{ secret: 'tag-secret' }, 'visible'] },
      ] as any);

      const serialized = JSON.stringify(infoSpy.mock.calls);
      expect(serialized).not.toContain('nested-secret');
      expect(serialized).not.toContain('tag-secret');
      expect(serialized).toContain('visible');
    });

    it('masks sensitive values in logQueryError and logQuerySlow', () => {
      const errorSpy = jest.spyOn(DefaultLogger, 'Error').mockImplementation(() => { /* silence */ });
      const warnSpy = jest.spyOn(DefaultLogger, 'Warn').mockImplementation(() => { /* silence */ });
      const logger = new KLogger(baseOptions);

      logger.logQueryError('syntax error', 'UPDATE users SET password = ?', [{ password: 'leak-me' }] as any);
      logger.logQuerySlow(1500, 'SELECT * FROM users', [{ authorization: 'Bearer leak-me' }] as any);

      const errSerialized = JSON.stringify(errorSpy.mock.calls);
      const warnSerialized = JSON.stringify(warnSpy.mock.calls);
      expect(errSerialized).not.toContain('leak-me');
      expect(warnSerialized).not.toContain('Bearer leak-me');
    });

    it('sanitizeLogParams masks known sensitive keys case-insensitively', () => {
      const sanitized = sanitizeLogParams([
        { Password: 'a', PASSWORD: 'b', Secret: 'c' },
        { normal: 'keep-me' },
      ] as any);

      expect(sanitized).toEqual([
        { Password: '***', PASSWORD: '***', Secret: '***' },
        { normal: 'keep-me' },
      ]);
    });

    it('sanitizeLogParams passes through non-array parameters untouched', () => {
      expect(sanitizeLogParams(undefined)).toBeUndefined();
      const params: any = 'not-an-array';
      expect(sanitizeLogParams(params)).toBe('not-an-array');
    });
  });
});
