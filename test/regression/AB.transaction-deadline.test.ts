import 'reflect-metadata';
import { DefaultLogger } from 'koatty_logger';
import { TransactionAspect, TransactionManager } from '../../src/decorator';

describe('transaction deadline lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    for (const level of ['Info', 'Debug', 'Warn', 'Error'] as const) {
      jest.spyOn(DefaultLogger, level).mockImplementation(() => DefaultLogger);
    }
  });
  afterEach(() => {
    TransactionManager.stopCleanupTimer();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function fixture() {
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true, isReleased: false,
    };
    const aspect = new TransactionAspect();
    aspect.app = { getMetaData: () => ({ dataSource: { createQueryRunner: () => runner } }) } as any;
    return { aspect, runner };
  }

  it.each(['success', 'failure'])('clears the deadline after %s', async outcome => {
    const { aspect, runner } = fixture();
    const error = new Error('transaction failed');
    const result = aspect.run([], async () => {
      if (outcome === 'failure') throw error;
      return 'done';
    }, { timeout: 60_000 });
    if (outcome === 'failure') await expect(result).rejects.toBe(error);
    else await expect(result).resolves.toBe('done');
    expect(runner.release).toHaveBeenCalledTimes(1);
    // The manager's unref'ed periodic cleanup is independent of request deadlines.
    TransactionManager.stopCleanupTimer();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('still rolls back and releases when the deadline expires', async () => {
    const { aspect, runner } = fixture();
    const result = aspect.run([], () => new Promise(() => {}), { timeout: 50 });
    const rejected = expect(result).rejects.toThrow('Transaction timeout after 50ms');
    await jest.advanceTimersByTimeAsync(50);
    await rejected;
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
    TransactionManager.stopCleanupTimer();
    expect(jest.getTimerCount()).toBe(0);
  });
});
