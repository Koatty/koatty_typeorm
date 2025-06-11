/*
 * @Description: 事务装饰器实现（改进版）
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-01 00:00:00
 * @LastEditTime: 2024-01-01 00:00:00
 */
import 'reflect-metadata';
import { AsyncLocalStorage } from 'async_hooks';
import { Around, IAspect } from 'koatty_container';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';
import { DefaultLogger as Logger } from 'koatty_logger';

/**
 * 事务钩子接口
 */
export interface TransactionHooks {
  beforeCommit?: () => Promise<void>;
  afterCommit?: () => Promise<void>;
  beforeRollback?: () => Promise<void>;
  afterRollback?: () => Promise<void>;
}

/**
 * 事务统计信息
 */
export interface TransactionStats {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageDuration: number;
  longestTransaction: number;
  shortestTransaction: number;
}

/**
 * 事务配置选项
 */
export interface TransactionOptions {
  /**
   * 事务隔离级别
   */
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  
  /**
   * 事务超时时间（毫秒）
   */
  timeout?: number;
  
  /**
   * 是否只读事务
   */
  readOnly?: boolean;
  
  /**
   * 事务传播行为
   */
  propagation?: 'REQUIRED' | 'REQUIRES_NEW' | 'SUPPORTS' | 'NOT_SUPPORTED' | 'NEVER' | 'NESTED' | 'MANDATORY';
  
  /**
   * 自定义数据源名称（默认使用 'DB'）
   */
  dataSourceName?: string;

  /**
   * 事务钩子
   */
  hooks?: TransactionHooks;

  /**
   * 事务名称（用于调试和日志）
   */
  name?: string;
}

/**
 * 事务上下文
 */
export interface TransactionContext {
  queryRunner: QueryRunner;
  dataSource: DataSource;
  isActive: boolean;
  startTime: number;
  options: TransactionOptions;
  contextId: string;
  parentContext?: TransactionContext;
  savepoints: string[]; // 用于嵌套事务的保存点
  depth: number; // 事务嵌套深度
}

/**
 * 改进的事务管理器
 */
export class TransactionManager {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<TransactionContext>();
  private static readonly contexts = new Map<string, TransactionContext>();
  private static readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5分钟
  private static readonly MAX_TRANSACTION_DURATION = 30 * 60 * 1000; // 30分钟
  private static cleanupTimer: NodeJS.Timeout;
  private static stats: TransactionStats = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    averageDuration: 0,
    longestTransaction: 0,
    shortestTransaction: 0
  };

  static {
    // 启动清理定时器
    this.startCleanupTimer();
  }

  /**
   * 获取事务统计信息
   */
  static getStats(): TransactionStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  static resetStats(): void {
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      averageDuration: 0,
      longestTransaction: 0,
      shortestTransaction: 0
    };
  }

  /**
   * 更新统计信息
   */
  static updateStats(duration: number, success: boolean): void {
    // 确保至少有1ms的持续时间以避免0值统计
    const effectiveDuration = Math.max(duration, 1);
    
    this.stats.totalTransactions++;
    
    if (success) {
      this.stats.successfulTransactions++;
    } else {
      this.stats.failedTransactions++;
    }

    // 更新平均持续时间
    const totalDuration = this.stats.averageDuration * (this.stats.totalTransactions - 1) + effectiveDuration;
    this.stats.averageDuration = totalDuration / this.stats.totalTransactions;

    // 更新最长和最短事务时间
    this.stats.longestTransaction = Math.max(this.stats.longestTransaction, effectiveDuration);
    
    // 如果这是第一个事务，直接设置最短时间，否则取最小值
    if (this.stats.totalTransactions === 1) {
      this.stats.shortestTransaction = effectiveDuration;
    } else {
      this.stats.shortestTransaction = Math.min(this.stats.shortestTransaction, effectiveDuration);
    }
  }

  /**
   * 获取连接池状态
   */
  static getConnectionPoolStatus(): any {
    const currentContext = this.getCurrentContext();
    if (!currentContext) return null;
    
    const dataSource = currentContext.dataSource;
    return {
      isInitialized: dataSource.isInitialized,
      hasMetadata: dataSource.hasMetadata,
      // 可以根据不同的数据库驱动添加更多信息
    };
  }

  /**
   * 获取当前事务上下文
   */
  static getCurrentContext(): TransactionContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * 在事务上下文中运行
   */
  static async runInContext<T>(context: TransactionContext, fn: () => Promise<T>): Promise<T> {
    this.contexts.set(context.contextId, context);
    try {
      return await this.asyncLocalStorage.run(context, fn);
    } finally {
      this.contexts.delete(context.contextId);
    }
  }

  /**
   * 在无事务上下文中运行（确保完全脱离当前事务上下文）
   */
  static async runWithoutContext<T>(fn: () => Promise<T>): Promise<T> {
    // 使用AsyncLocalStorage.exit()确保完全脱离当前上下文
    return await new Promise<T>((resolve, reject) => {
      setImmediate(() => {
        this.asyncLocalStorage.exit(async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  }

  /**
   * 生成唯一的上下文ID
   */
  static generateContextId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 启动清理定时器
   */
  private static startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredContexts();
    }, this.CLEANUP_INTERVAL);

    // 防止定时器阻止程序退出
    this.cleanupTimer.unref();
  }

  /**
   * 清理过期的事务上下文
   */
  private static cleanupExpiredContexts(): void {
    const now = Date.now();
    const expiredContexts: string[] = [];

    // 使用Array.from来避免迭代器问题
    Array.from(this.contexts.entries()).forEach(([contextId, context]) => {
      if (now - context.startTime > this.MAX_TRANSACTION_DURATION) {
        expiredContexts.push(contextId);
        Logger.Warn(`清理过期事务上下文: ${contextId}`);
      }
    });

    for (const contextId of expiredContexts) {
      const context = this.contexts.get(contextId);
      if (context && context.queryRunner && !context.queryRunner.isReleased) {
        context.queryRunner.rollbackTransaction().catch(err => {
          Logger.Error(`回滚过期事务失败: ${err.message}`);
        }).finally(() => {
          context.queryRunner.release().catch(err => {
            Logger.Error(`释放过期查询运行器失败: ${err.message}`);
          });
        });
      }
      this.contexts.delete(contextId);
    }
  }

  /**
   * 停止清理定时器（用于测试或程序关闭）
   */
  static stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * 创建保存点（用于嵌套事务）
   */
  static async createSavepoint(context: TransactionContext, _name?: string): Promise<string> {
    // 总是生成标准格式的保存点名称，即使提供了自定义名称
    const savepointName = `sp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await context.queryRunner.query(`SAVEPOINT ${savepointName}`);
    context.savepoints.push(savepointName);
    return savepointName;
  }

  /**
   * 回滚到保存点
   */
  static async rollbackToSavepoint(context: TransactionContext, savepointName: string): Promise<void> {
    await context.queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    
    // 移除该保存点之后的所有保存点
    const index = context.savepoints.indexOf(savepointName);
    if (index >= 0) {
      context.savepoints.splice(index + 1);
    }
  }

  /**
   * 释放保存点
   */
  static async releaseSavepoint(context: TransactionContext, savepointName: string): Promise<void> {
    await context.queryRunner.query(`RELEASE SAVEPOINT ${savepointName}`);
    
    const index = context.savepoints.indexOf(savepointName);
    if (index >= 0) {
      context.savepoints.splice(index, 1);
    }
  }
}

/**
 * 改进的事务切面实现
 */
export class TransactionAspect implements IAspect {
  app: any;
  
  constructor() {
    Logger.Info('TransactionAspect initialized');
  }

  /**
   * 事务切面执行方法
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  async run(args: any[], proceed?: Function, _aspectOptions?: any): Promise<any> {
    if (!proceed) {
      throw new Error('Proceed function is required for transaction aspect');
    }
    
    const proceedFn = proceed as (...args: any[]) => Promise<any>;
    const txOptions: TransactionOptions = args[0] || {};
    const currentContext = TransactionManager.getCurrentContext();

    // 处理嵌套事务
    if (txOptions.propagation === 'NESTED' && currentContext) {
      return await this.handleNestedTransaction(currentContext, txOptions, proceedFn);
    }

    // 处理事务传播行为
    const propagationResult = await this.handlePropagation(txOptions, currentContext, proceedFn);
    if (propagationResult !== undefined) {
      return propagationResult;
    }

    // 创建新事务
    return await this.createNewTransaction(txOptions, proceedFn, currentContext);
  }

  /**
   * 处理嵌套事务
   */
  private async handleNestedTransaction(
    parentContext: TransactionContext,
    options: TransactionOptions,
    proceed: (...args: any[]) => Promise<any>
  ): Promise<any> {
    const savepointName = await TransactionManager.createSavepoint(parentContext, options.name);
    
    try {
      // 执行嵌套事务中的代码
      const result = await proceed();
      
      // 释放保存点
      await TransactionManager.releaseSavepoint(parentContext, savepointName);
      
      return result;
    } catch (error) {
      // 回滚到保存点
      await TransactionManager.rollbackToSavepoint(parentContext, savepointName);
      throw error;
    }
  }

  /**
   * 处理事务传播行为
   */
  private async handlePropagation(
    options: TransactionOptions,
    currentContext: TransactionContext | undefined,
    proceed: (...args: any[]) => Promise<any>
  ): Promise<any> {
    if (currentContext) {
      // 已存在事务
      switch (options.propagation) {
        case 'REQUIRED':
        case 'SUPPORTS':
        case 'MANDATORY':
          // 使用现有事务，需要统计
          return await this.runWithStats(proceed);
        
        case 'REQUIRES_NEW':
          // 创建新事务（需要特殊处理）
          break;
        
        case 'NOT_SUPPORTED':
          // 暂停当前事务 - 在一个全新的异步上下文中运行
          return await this.runInNewContext(proceed);
        
        case 'NEVER':
          throw new Error('Transaction not allowed (NEVER propagation)');
        
        default:
          // 默认为 REQUIRED
          return await this.runWithStats(proceed);
      }
    } else {
      // 不存在事务
      switch (options.propagation) {
        case 'SUPPORTS':
        case 'NOT_SUPPORTED':
        case 'NEVER':
          // 不需要事务，但需要统计
          return await this.runWithStats(proceed);
        
        case 'MANDATORY':
          throw new Error('Transaction required (MANDATORY propagation)');
        
        default:
          // 需要创建新事务
          break;
      }
    }

    return undefined; // 需要创建新事务
  }

  /**
   * 在无事务环境中运行
   */
  private async runWithoutTransaction(proceed: (...args: any[]) => Promise<any>): Promise<any> {
    // 在新的异步上下文中运行，不继承事务上下文
    return await new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          const result = await proceed();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * 运行并统计执行时间
   */
  private async runWithStats(proceed: (...args: any[]) => Promise<any>): Promise<any> {
    const startTime = Date.now();
    let success = false;

    try {
      const result = await proceed();
      success = true;
      return result;
    } catch (error) {
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      TransactionManager.updateStats(duration, success);
    }
  }

  /**
   * 在全新上下文中运行（用于NOT_SUPPORTED传播行为）
   */
  private async runInNewContext(proceed: (...args: any[]) => Promise<any>): Promise<any> {
    const startTime = Date.now();
    let success = false;

    try {
      // 使用AsyncLocalStorage.exit()确保完全脱离事务上下文
      const result = await TransactionManager.runWithoutContext(async () => {
        return await proceed();
      });
      success = true;
      return result;
    } catch (error) {
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      TransactionManager.updateStats(duration, success);
    }
  }

  /**
   * 在无事务环境中运行并统计
   */
  private async runWithoutTransactionWithStats(proceed: (...args: any[]) => Promise<any>): Promise<any> {
    const startTime = Date.now();
    let success = false;

    try {
      // 在新的异步上下文中运行，不继承事务上下文
      const result = await new Promise<any>((resolve, reject) => {
        setImmediate(async () => {
          try {
            // 在一个全新的异步上下文中执行，确保不继承任何事务上下文
            const result = await new Promise<any>((innerResolve, innerReject) => {
              process.nextTick(async () => {
                try {
                  const result = await proceed();
                  innerResolve(result);
                } catch (error) {
                  innerReject(error);
                }
              });
            });
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
      success = true;
      return result;
    } catch (error) {
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      TransactionManager.updateStats(duration, success);
    }
  }

  /**
   * 创建新事务
   */
  private async createNewTransaction(
    options: TransactionOptions,
    proceed: (...args: any[]) => Promise<any>,
    parentContext?: TransactionContext
  ): Promise<any> {
    const startTime = Date.now();
    let success = false;

    // 获取数据源
    const dbConfig = this.app?.getMetaData?.(options.dataSourceName || 'DB');
    if (!dbConfig || !dbConfig.dataSource) {
      throw new Error(`数据源 '${options.dataSourceName || 'DB'}' 未找到或未初始化`);
    }

    const dataSource: DataSource = dbConfig.dataSource;
    const queryRunner = dataSource.createQueryRunner();
    const contextId = TransactionManager.generateContextId();

    // 创建事务上下文
    const context: TransactionContext = {
      queryRunner,
      dataSource,
      isActive: true,
      startTime,
      options,
      contextId,
      parentContext,
      savepoints: [],
      depth: parentContext ? parentContext.depth + 1 : 0
    };

    try {
      await queryRunner.connect();

      // 开始事务
      if (options.isolationLevel) {
        const isolationLevel = options.isolationLevel.replace(/_/g, ' ') as any;
        await queryRunner.startTransaction(isolationLevel);
      } else {
        await queryRunner.startTransaction();
      }

      // 设置只读模式
      if (options.readOnly) {
        await queryRunner.query('SET TRANSACTION READ ONLY');
      }

      // 执行before commit钩子
      if (options.hooks?.beforeCommit) {
        await options.hooks.beforeCommit();
      }

      // 设置超时处理
      const timeoutPromise = this.createTimeoutPromise(options.timeout, contextId);

      try {
        // 在事务上下文中执行
        const resultPromise = TransactionManager.runInContext(context, proceed);
        
        const result = options.timeout
          ? await Promise.race([resultPromise, timeoutPromise])
          : await resultPromise;

        // 提交事务
        await queryRunner.commitTransaction();
        
        // 执行after commit钩子
        if (options.hooks?.afterCommit) {
          try {
            await options.hooks.afterCommit();
          } catch (hookError) {
            Logger.Error(`After commit钩子执行失败: ${hookError.message}`);
            // after commit钩子失败不应该影响事务结果
          }
        }
        
        success = true;
        Logger.Debug(`事务提交成功: ${contextId} (${options.name || 'unnamed'})`);
        return result;

      } catch (error) {
        // 执行before rollback钩子
        if (options.hooks?.beforeRollback) {
          try {
            await options.hooks.beforeRollback();
          } catch (hookError) {
            Logger.Error(`Before rollback钩子执行失败: ${hookError.message}`);
          }
        }

        // 回滚事务
        try {
          if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
            Logger.Debug(`事务回滚成功: ${contextId} (${options.name || 'unnamed'})`);
          }
        } catch (rollbackError) {
          Logger.Error(`事务回滚失败: ${rollbackError.message}`, rollbackError);
        }

        // 执行after rollback钩子
        if (options.hooks?.afterRollback) {
          try {
            await options.hooks.afterRollback();
          } catch (hookError) {
            Logger.Error(`After rollback钩子执行失败: ${hookError.message}`);
          }
        }

        throw error;
      }

    } finally {
      // 更新统计信息
      const duration = Date.now() - startTime;
      TransactionManager.updateStats(duration, success);

      // 释放查询运行器
      try {
        if (!queryRunner.isReleased) {
          await queryRunner.release();
        }
      } catch (releaseError) {
        Logger.Error(`释放查询运行器失败: ${releaseError.message}`, releaseError);
      }
    }
  }

  /**
   * 创建超时Promise
   */
  private createTimeoutPromise(timeout?: number, contextId?: string): Promise<never> {
    if (!timeout || timeout <= 0) {
      return new Promise(() => { /* 永不resolve的Promise */ }); 
    }

    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Transaction timeout after ${timeout}ms (context: ${contextId})`));
      }, timeout);
    });
  }
}

/**
 * 事务装饰器
 * @param options 事务选项
 */
export function Transactional(options: TransactionOptions = {}): MethodDecorator {
  return Around(TransactionAspect, options);
}

/**
 * 获取当前事务的查询运行器
 */
export function getCurrentQueryRunner(): QueryRunner | undefined {
  const context = TransactionManager.getCurrentContext();
  return context?.queryRunner;
}

/**
 * 获取当前事务的实体管理器
 */
export function getCurrentEntityManager(): EntityManager | undefined {
  const context = TransactionManager.getCurrentContext();
  return context?.queryRunner?.manager;
}

/**
 * 检查当前是否在事务中
 */
export function isInTransaction(): boolean {
  const context = TransactionManager.getCurrentContext();
  return context?.isActive === true;
}

/**
 * 获取当前事务的数据源
 */
export function getCurrentDataSource(): DataSource | undefined {
  const context = TransactionManager.getCurrentContext();
  return context?.dataSource;
}

/**
 * 获取当前事务的选项
 */
export function getCurrentTransactionOptions(): TransactionOptions | undefined {
  const context = TransactionManager.getCurrentContext();
  return context?.options;
}

/**
 * 获取当前事务的开始时间
 */
export function getCurrentTransactionStartTime(): number | undefined {
  const context = TransactionManager.getCurrentContext();
  return context?.startTime;
}

/**
 * 获取当前事务的持续时间（毫秒）
 */
export function getCurrentTransactionDuration(): number | undefined {
  const startTime = getCurrentTransactionStartTime();
  return startTime ? Date.now() - startTime : undefined;
} 