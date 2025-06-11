/*
 * @Description: 事务装饰器实现
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-01 00:00:00
 * @LastEditTime: 2024-01-01 00:00:00
 */
import 'reflect-metadata';
import { Aspect, Around, IAspect } from 'koatty_container';
import { DataSource, QueryRunner, EntityManager } from 'typeorm';
import { DefaultLogger as Logger } from 'koatty_logger';

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
}

/**
 * 事务管理器
 */
export class TransactionManager {
  private static readonly TRANSACTION_KEY = Symbol('TRANSACTION_CONTEXT');
  private static contexts = new Map<string, TransactionContext>();
  
  /**
   * 获取当前事务上下文
   */
  static getCurrentContext(): TransactionContext | undefined {
    const contextId = this.getCurrentContextId();
    return contextId ? this.contexts.get(contextId) : undefined;
  }
  
  /**
   * 设置事务上下文
   */
  static setContext(contextId: string, context: TransactionContext): void {
    this.contexts.set(contextId, context);
  }
  
  /**
   * 清除事务上下文
   */
  static clearContext(contextId: string): void {
    this.contexts.delete(contextId);
  }
  
  /**
   * 获取当前上下文ID（基于异步上下文）
   */
  static getCurrentContextId(): string | undefined {
    // 这里可以使用 AsyncLocalStorage 或其他方式来获取当前上下文
    // 为了简化，我们使用一个简单的实现
    return (global as any).__TRANSACTION_CONTEXT_ID__;
  }
  
  /**
   * 设置当前上下文ID
   */
  static setCurrentContextId(contextId: string): void {
    (global as any).__TRANSACTION_CONTEXT_ID__ = contextId;
  }
  
  /**
   * 清除当前上下文ID
   */
  static clearCurrentContextId(): void {
    delete (global as any).__TRANSACTION_CONTEXT_ID__;
  }
  
  /**
   * 生成唯一的上下文ID
   */
  static generateContextId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 事务切面实现
 */
@Aspect()
export class TransactionAspect implements IAspect {
  app: any;
  
  constructor() {
    Logger.Info('TransactionAspect initialized');
  }
  
  /**
   * 事务切面执行方法
   */
  async run(args: any[], proceed: (...args: any[]) => Promise<any>): Promise<any> {
    const options: TransactionOptions = args[0] || {};
    const contextId = TransactionManager.generateContextId();
    
    try {
      // 检查传播行为
      const currentContext = TransactionManager.getCurrentContext();
      
      if (currentContext) {
        // 已存在事务
        switch (options.propagation) {
          case 'REQUIRED':
            // 使用现有事务
            return await proceed();
          
          case 'REQUIRES_NEW':
            // 创建新事务（暂停当前事务）
            break;
          
          case 'SUPPORTS':
            // 支持事务，使用现有事务
            return await proceed();
          
          case 'NOT_SUPPORTED':
            // 不支持事务，暂停当前事务
            TransactionManager.clearCurrentContextId();
            try {
              return await proceed();
            } finally {
              TransactionManager.setCurrentContextId(TransactionManager.getCurrentContextId() || '');
            }
          
          case 'NEVER':
            throw new Error('Transaction not allowed (NEVER propagation)');
          
          case 'MANDATORY':
            // 必须在事务中，使用现有事务
            return await proceed();
          
          default:
            // 默认为 REQUIRED
            return await proceed();
        }
      } else {
        // 不存在事务
        switch (options.propagation) {
          case 'SUPPORTS':
          case 'NOT_SUPPORTED':
          case 'NEVER':
            // 不需要事务
            return await proceed();
          
          case 'MANDATORY':
            throw new Error('Transaction required (MANDATORY propagation)');
          
          default:
            // 需要创建新事务
            break;
        }
      }

      // 获取数据源
      const dbConfig = this.app?.getMetaData?.('DB');
      if (!dbConfig || !dbConfig.dataSource) {
        throw new Error('数据源 \'DB\' 未找到或未初始化');
      }

      const dataSource = dbConfig.dataSource;
      const queryRunner = dataSource.createQueryRunner();
      
      // 创建事务上下文
      const context: TransactionContext = {
        queryRunner,
        dataSource,
        isActive: true,
        startTime: Date.now(),
        options
      };

      TransactionManager.setContext(contextId, context);
      TransactionManager.setCurrentContextId(contextId);

      try {
        await queryRunner.connect();
        
        // 开始事务
        if (options.isolationLevel) {
          await queryRunner.startTransaction(options.isolationLevel);
        } else {
          await queryRunner.startTransaction();
        }

        // 设置超时
        let timeoutHandle: NodeJS.Timeout | undefined;
        if (options.timeout && options.timeout > 0) {
          timeoutHandle = setTimeout(() => {
            throw new Error(`Transaction timeout after ${options.timeout}ms`);
          }, options.timeout);
        }

        try {
          // 执行原方法
          const result = await proceed();
          
          // 清除超时
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }

          // 提交事务
          await queryRunner.commitTransaction();
          
          return result;
        } catch (error) {
          // 清除超时
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }

          // 回滚事务
          await queryRunner.rollbackTransaction();
          throw error;
        }
      } finally {
        // 释放查询运行器
        await queryRunner.release();
        
        // 清理上下文
        TransactionManager.clearContext(contextId);
        TransactionManager.clearCurrentContextId();
      }
    } catch (error) {
      // 记录错误
      console.error(`Transaction error in context ${contextId}:`, error);
      throw error;
    }
  }
}

/**
 * 事务装饰器
 * @param options 事务选项
 */
export function Transactional(options: TransactionOptions = {}): MethodDecorator {
  return Around('TransactionAspect', options);
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