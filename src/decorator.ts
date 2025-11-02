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
  _totalDuration?: number; // 内部使用：总持续时间累计
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
 * 全局事务配置
 */
export interface GlobalTransactionConfig {
  /**
   * 默认事务超时时间（毫秒）
   */
  defaultTimeout?: number;
  
  /**
   * 默认事务隔离级别
   */
  defaultIsolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  
  /**
   * 最大事务嵌套深度
   */
  maxNestedDepth?: number;
  
  /**
   * 是否启用事务统计
   */
  enableStats?: boolean;
  
  /**
   * 是否启用事务日志
   */
  enableLogging?: boolean;
  
  /**
   * 上下文清理间隔（毫秒）
   */
  cleanupInterval?: number;
  
  /**
   * 上下文最大存活时间（毫秒）
   */
  maxContextAge?: number;
}

/**
 * 改进的事务管理器
 */
export class TransactionManager {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<TransactionContext>();
  private static readonly contexts = new Map<string, TransactionContext>();
  private static cleanupTimer: NodeJS.Timeout;
  
  // 全局配置，支持运行时修改
  private static globalConfig: GlobalTransactionConfig = {
    defaultTimeout: undefined,
    defaultIsolationLevel: undefined,
    maxNestedDepth: 10,
    enableStats: true,
    enableLogging: true,
    cleanupInterval: 5 * 60 * 1000, // 5分钟
    maxContextAge: 30 * 60 * 1000  // 30分钟
  };
  
  // 兼容性常量（从 globalConfig 读取）
  private static get CLEANUP_INTERVAL(): number {
    return this.globalConfig.cleanupInterval || 5 * 60 * 1000;
  }
  
  private static get MAX_TRANSACTION_DURATION(): number {
    return this.globalConfig.maxContextAge || 30 * 60 * 1000;
  }
  
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
   * 配置全局事务选项
   * 
   * 允许在运行时修改全局事务配置，如默认超时时间、隔离级别等
   * 
   * @param {Partial<GlobalTransactionConfig>} config - 部分配置项
   * @example
   * TransactionManager.configure({
   *   defaultTimeout: 5000,
   *   defaultIsolationLevel: 'READ_COMMITTED',
   *   maxNestedDepth: 5
   * });
   */
  static configure(config: Partial<GlobalTransactionConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...config };
    
    // 如果修改了清理间隔，重启定时器
    if (config.cleanupInterval !== undefined) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }
  }

  /**
   * 获取当前全局配置
   * 
   * @returns {Readonly<GlobalTransactionConfig>} 只读的全局配置对象
   */
  static getConfig(): Readonly<GlobalTransactionConfig> {
    return { ...this.globalConfig };
  }

  /**
   * 获取事务统计信息
   */
  static getStats(): TransactionStats {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _totalDuration, ...publicStats } = this.stats;
    return { ...publicStats };
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
      shortestTransaction: 0,
      _totalDuration: 0
    };
  }

  /**
   * 更新统计信息（优化版）
   * 
   * 优化说明：
   * 1. 使用增量更新避免重复计算
   * 2. 使用三元运算符减少条件判断
   * 3. 缓存 _totalDuration 避免乘法运算
   * 
   * @param duration - 事务持续时间（毫秒）
   * @param success - 事务是否成功
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

    // 使用增量更新，避免每次重新计算
    this.stats._totalDuration = (this.stats._totalDuration || 0) + effectiveDuration;
    this.stats.averageDuration = this.stats._totalDuration / this.stats.totalTransactions;

    // 使用三元运算符优化比较
    this.stats.longestTransaction = effectiveDuration > this.stats.longestTransaction 
      ? effectiveDuration 
      : this.stats.longestTransaction;
    
    // 优化最短事务时间的更新
    this.stats.shortestTransaction = this.stats.totalTransactions === 1
      ? effectiveDuration
      : (effectiveDuration < this.stats.shortestTransaction ? effectiveDuration : this.stats.shortestTransaction);
  }

  /**
   * 获取数据源连接池状态
   * 
   * 返回当前事务上下文关联的数据源状态信息
   * 
   * @returns {object|null} 连接池状态对象，包含 isInitialized 和 hasMetadata；如果没有活动上下文则返回 null
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
   * 
   * 从 AsyncLocalStorage 中获取当前异步调用栈的事务上下文
   * 
   * @returns {TransactionContext | undefined} 当前事务上下文，如果不在事务中则返回 undefined
   */
  static getCurrentContext(): TransactionContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * 在指定事务上下文中运行函数
   * 
   * 将事务上下文注入到 AsyncLocalStorage 中，并在该上下文中执行提供的函数
   * 函数执行完成后会自动清理上下文
   * 
   * @template T - 函数返回值类型
   * @param {TransactionContext} context - 要注入的事务上下文
   * @param {() => Promise<T>} fn - 要在上下文中执行的函数
   * @returns {Promise<T>} 函数执行结果
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
   * 
   * 实现原理：
   * 1. 使用 AsyncLocalStorage.exit() 脱离当前上下文
   * 2. 不使用 setImmediate，直接执行以保持调用链
   * 3. 确保异常正确传播
   * 
   * @param fn - 要在无事务上下文中执行的函数
   * @returns Promise<T> 函数执行结果
   */
  static async runWithoutContext<T>(fn: () => Promise<T>): Promise<T> {
    // 使用 exit() 方法完全脱离当前 AsyncLocalStorage 上下文
    return await this.asyncLocalStorage.exit(async () => {
      try {
        return await fn();
      } catch (error) {
        // 确保错误正确传播
        throw error;
      }
    });
  }

  /**
   * 生成唯一的事务上下文 ID
   * 
   * 使用时间戳和随机字符串组合生成唯一标识符
   * 格式: tx_{timestamp}_{random9chars}
   * 
   * @returns {string} 唯一的上下文 ID
   */
  static generateContextId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 启动清理定时器
   * 
   * 定期清理过期的事务上下文，防止内存泄漏
   * 使用 unref() 防止定时器阻止 Node.js 进程退出
   * 
   * @private
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
   * 
   * 遍历所有存储的上下文，清理超过 MAX_CONTEXT_AGE 的上下文
   * 
   * @private
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
   * 停止清理定时器
   * 
   * 清除定时器以防止内存泄漏，通常在应用关闭或测试清理时调用
   */
  static stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
   * 创建保存点（用于嵌套事务）
   * 
   * 保存点命名规则：sp_{contextId}_{depth}
   * - contextId: 事务上下文唯一标识
   * - depth: 当前保存点深度（从 0 开始）
   * 
   * @param context - 事务上下文
   * @param _name - 保留参数，未使用
   * @returns Promise<string> 保存点名称
   */
  static async createSavepoint(context: TransactionContext, _name?: string): Promise<string> {
    // 使用上下文ID和深度生成唯一且简洁的保存点名称
    const savepointName = `sp_${context.contextId}_${context.savepoints.length}`;
    await context.queryRunner.query(`SAVEPOINT ${savepointName}`);
    context.savepoints.push(savepointName);
    return savepointName;
  }

  /**
   * 回滚到指定保存点
   * 
   * 将事务状态回滚到指定保存点，并清除该保存点之后创建的所有保存点
   * 
   * @param {TransactionContext} context - 事务上下文
   * @param {string} savepointName - 保存点名称
   * @returns {Promise<void>}
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
   * 
   * 释放指定保存点，表示该保存点成功完成，不再需要回滚
   * 
   * @param {TransactionContext} context - 事务上下文
   * @param {string} savepointName - 保存点名称
   * @returns {Promise<void>}
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
  async run(args: any[], proceed?: (...args: any[]) => Promise<any>, _aspectOptions?: any): Promise<any> {
    if (!proceed) {
      throw new Error('Proceed function is required for transaction aspect');
    }
    
    const proceedFn = proceed as (...args: any[]) => Promise<any>;
    const txOptions: TransactionOptions = args[0] || {};
    const currentContext = TransactionManager.getCurrentContext();
    
    // 应用全局配置的默认值
    const globalConfig = TransactionManager.getConfig();
    if (txOptions.timeout === undefined && globalConfig.defaultTimeout) {
      txOptions.timeout = globalConfig.defaultTimeout;
    }
    if (txOptions.isolationLevel === undefined && globalConfig.defaultIsolationLevel) {
      txOptions.isolationLevel = globalConfig.defaultIsolationLevel;
    }

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
    // 检查嵌套深度限制
    const globalConfig = TransactionManager.getConfig();
    if (globalConfig.maxNestedDepth && parentContext.depth >= globalConfig.maxNestedDepth) {
      throw new Error(`事务嵌套深度超过限制 (${globalConfig.maxNestedDepth})`);
    }
    
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
   * 创建新事务（重构版）
   * 
   * 将原有的大函数拆分为多个职责单一的小函数：
   * 1. prepareTransactionContext - 准备事务上下文
   * 2. connectAndStartTransaction - 连接并启动事务
   * 3. executeInTransaction - 在事务中执行业务逻辑
   * 4. commitTransaction - 提交事务
   * 5. rollbackTransaction - 回滚事务
   * 6. cleanupTransaction - 清理事务资源
   * 
   * @param options - 事务选项
   * @param proceed - 业务逻辑函数
   * @param parentContext - 父事务上下文（可选）
   * @returns Promise<any> 业务逻辑执行结果
   */
  private async createNewTransaction(
    options: TransactionOptions,
    proceed: (...args: any[]) => Promise<any>,
    parentContext?: TransactionContext
  ): Promise<any> {
    const startTime = Date.now();
    let success = false;
    const context = this.prepareTransactionContext(options, parentContext, startTime);

    try {
      await this.connectAndStartTransaction(context, options);
      const result = await this.executeInTransaction(context, proceed, options);
      await this.commitTransaction(context, options);
      success = true;
      return result;
    } catch (error) {
      await this.rollbackTransaction(context, options, error);
      throw error;
    } finally {
      await this.cleanupTransaction(context, startTime, success);
    }
  }

  /**
   * 准备事务上下文
   * 
   * @param options - 事务选项
   * @param parentContext - 父事务上下文
   * @param startTime - 开始时间
   * @returns TransactionContext 事务上下文
   */
  private prepareTransactionContext(
    options: TransactionOptions,
    parentContext: TransactionContext | undefined,
    startTime: number
  ): TransactionContext {
    const dbConfig = this.app?.getMetaData?.(options.dataSourceName || 'DB');
    if (!dbConfig || !dbConfig.dataSource) {
      throw new Error(`数据源 '${options.dataSourceName || 'DB'}' 未找到或未初始化`);
    }

    const dataSource: DataSource = dbConfig.dataSource;
    const queryRunner = dataSource.createQueryRunner();
    const contextId = TransactionManager.generateContextId();

    return {
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
  }

  /**
   * 连接数据库并启动事务
   * 
   * @param context - 事务上下文
   * @param options - 事务选项
   */
  private async connectAndStartTransaction(
    context: TransactionContext,
    options: TransactionOptions
  ): Promise<void> {
    await context.queryRunner.connect();

    if (options.isolationLevel) {
      const isolationLevel = options.isolationLevel.replace(/_/g, ' ') as any;
      await context.queryRunner.startTransaction(isolationLevel);
    } else {
      await context.queryRunner.startTransaction();
    }

    if (options.readOnly) {
      await context.queryRunner.query('SET TRANSACTION READ ONLY');
    }

    if (options.hooks?.beforeCommit) {
      await options.hooks.beforeCommit();
    }
  }

  /**
   * 在事务上下文中执行业务逻辑
   * 
   * @param context - 事务上下文
   * @param proceed - 业务逻辑函数
   * @param options - 事务选项
   * @returns Promise<any> 业务逻辑执行结果
   */
  private async executeInTransaction(
    context: TransactionContext,
    proceed: (...args: any[]) => Promise<any>,
    options: TransactionOptions
  ): Promise<any> {
    const timeoutPromise = this.createTimeoutPromise(options.timeout, context.contextId);
    const resultPromise = TransactionManager.runInContext(context, proceed);
    
    return options.timeout
      ? await Promise.race([resultPromise, timeoutPromise])
      : await resultPromise;
  }

  /**
   * 提交事务
   * 
   * @param context - 事务上下文
   * @param options - 事务选项
   */
  private async commitTransaction(
    context: TransactionContext,
    options: TransactionOptions
  ): Promise<void> {
    await context.queryRunner.commitTransaction();
    
    Logger.Debug(`事务提交成功: ${context.contextId} (${options.name || 'unnamed'})`);

    if (options.hooks?.afterCommit) {
      try {
        await options.hooks.afterCommit();
      } catch (hookError) {
        Logger.Error(`After commit钩子执行失败: ${hookError.message}`);
      }
    }
  }

  /**
   * 回滚事务
   * 
   * @param context - 事务上下文
   * @param options - 事务选项
   * @param _error - 导致回滚的错误（保留参数，未使用）
   */
  private async rollbackTransaction(
    context: TransactionContext,
    options: TransactionOptions,
    _error: any
  ): Promise<void> {
    if (options.hooks?.beforeRollback) {
      try {
        await options.hooks.beforeRollback();
      } catch (hookError) {
        Logger.Error(`Before rollback钩子执行失败: ${hookError.message}`);
      }
    }

    try {
      if (context.queryRunner.isTransactionActive) {
        await context.queryRunner.rollbackTransaction();
        Logger.Debug(`事务回滚成功: ${context.contextId} (${options.name || 'unnamed'})`);
      }
    } catch (rollbackError) {
      Logger.Error(`事务回滚失败: ${rollbackError.message}`, rollbackError);
    }

    if (options.hooks?.afterRollback) {
      try {
        await options.hooks.afterRollback();
      } catch (hookError) {
        Logger.Error(`After rollback钩子执行失败: ${hookError.message}`);
      }
    }
  }

  /**
   * 清理事务资源
   * 
   * @param context - 事务上下文
   * @param startTime - 事务开始时间
   * @param success - 事务是否成功
   */
  private async cleanupTransaction(
    context: TransactionContext,
    startTime: number,
    success: boolean
  ): Promise<void> {
    const duration = Date.now() - startTime;
    TransactionManager.updateStats(duration, success);

    try {
      if (!context.queryRunner.isReleased) {
        await context.queryRunner.release();
      }
    } catch (releaseError) {
      Logger.Error(`释放查询运行器失败: ${releaseError.message}`, releaseError);
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