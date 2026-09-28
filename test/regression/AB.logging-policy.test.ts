import { KLogger } from '../../src/logger';
import { DefaultLogger } from 'koatty_logger';

describe('AB-03: logger policy is enforced at the logger boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  test('error-only does not emit query, info, warn, schema, or migration logs', () => {
    const info = jest.spyOn(DefaultLogger, 'Info').mockImplementation(() => {});
    const warn = jest.spyOn(DefaultLogger, 'Warn').mockImplementation(() => {});
    const error = jest.spyOn(DefaultLogger, 'Error').mockImplementation(() => {});
    const l = new KLogger({ type: 'mysql', logging: ['error'] });
    l.logQuery('SELECT 1', []); l.logQuerySlow(100, 'SELECT 1', []);
    l.logSchemaBuild('schema'); l.logMigration('migration'); l.log('info', 'info'); l.log('warn', 'warn');
    l.logQueryError('failed', 'SELECT 1');
    expect(info).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledTimes(1);
  });
  test.each([true, 'all', ['query', 'error', 'warn']])('never emits positional secrets with logging=%s', (logging) => {
    const spies = ['Info', 'Warn', 'Error'].map(k => jest.spyOn(DefaultLogger, k as any).mockImplementation(() => {}));
    const l = new KLogger({ type: 'mysql', logging } as any);
    l.logQuery('INSERT INTO users(password) VALUES (?)', ['audit-secret']);
    l.logQueryError('failed', 'UPDATE users SET token=?', ['audit-secret']);
    l.logQuerySlow(100, 'UPDATE users SET token=?', ['audit-secret']);
    expect(JSON.stringify(spies.map(s => s.mock.calls))).not.toContain('audit-secret');
    expect(spies[0]).toHaveBeenCalled();
  });
});
