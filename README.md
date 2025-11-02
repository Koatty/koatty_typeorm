# koatty_typeorm

🚀 功能强大的 TypeORM 插件，专为 Koatty 框架设计，提供企业级数据库操作和事务管理功能。

[![NPM version](https://img.shields.io/npm/v/koatty_typeorm.svg?style=flat-square)](https://www.npmjs.com/package/koatty_typeorm)
[![License](https://img.shields.io/npm/l/koatty_typeorm.svg?style=flat-square)](LICENSE)

## ✨ 特性

- 🔗 **无缝集成** - 与 Koatty 框架完美集成，零配置即可使用
- 🔄 **智能事务管理** - 提供声明式事务装饰器，支持嵌套事务和 7 种传播行为
- 📊 **统计监控** - 内置事务性能统计和监控功能，实时追踪事务指标
- ⚡ **高性能** - 优化的事务统计算法，支持连接池管理和并发事务处理
- 🛡️ **类型安全** - 完整的 TypeScript 支持，提供详细的 JSDoc 注释
- 🔧 **易于配置** - 支持 10+ 种数据库类型和灵活的全局/局部配置
- 🎯 **企业级** - 支持超时控制、钩子函数、保存点、并发事务等高级特性
- 🌐 **多数据源** - 支持同时连接和管理多个数据库

## 📦 安装

```bash
npm i koatty_typeorm
```

**环境要求**
- Node.js >= 14.0.0
- TypeScript >= 4.0.0
- Koatty >= 1.0.0

## 🚀 快速开始

### 1. 添加插件

```sh
koatty plugin Typeorm
```

### 2. 配置插件

修改 `plugin/TypeormPlugin.ts`：

```typescript
import { Koatty, Plugin, IPlugin } from "koatty";
import { KoattyTypeORM } from 'koatty_typeorm';

@Plugin()
export class TypeormPlugin implements IPlugin {
  run(options: any, app: Koatty) {
    return KoattyTypeORM(options, app);
  }
}
```

### 3. 数据库配置

配置文件 `config/plugin.ts`：

```typescript
// src/config/plugin.ts
export default {
  list: ['TypeormPlugin'], // 插件加载列表
  config: {
    TypeormPlugin: {
      // 基础配置
      type: "mysql", // 支持: mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb, cordova, capacitor, expo 等
      host: "127.0.0.1",
      port: 3306,
      username: "test",
      password: "test",
      database: "test",
      
      // 高级配置
      synchronize: false, // 生产环境建议设为 false
      logging: true,
      entities: [`${process.env.APP_PATH}/model/*`],
      entityPrefix: "", // 表前缀
      timezone: "Z", // 时区设置
      
      // 连接池配置
      extra: {
        connectionLimit: 10,
        acquireTimeout: 60000,
        timeout: 60000,
      }
    }
  },
};
```

### 4. 定义数据模型

```typescript
import { BaseEntity, Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column()
    isActive: boolean;

    // 自定义查询方法
    static findByName(firstName: string, lastName: string) {
        return this.createQueryBuilder("user")
            .where("user.firstName = :firstName", { firstName })
            .andWhere("user.lastName = :lastName", { lastName })
            .getMany();
    }
}
```

### 5. 基础数据操作

```typescript
// 创建实体
const user = new User();
user.firstName = "Timber";
user.lastName = "Saw";
user.isActive = true;
await user.save();

// 查询实体
const users = await User.find({ skip: 2, take: 5 });
const activeUsers = await User.findBy({ isActive: true });
const timber = await User.findOneBy({ firstName: "Timber", lastName: "Saw" });

// 删除实体
await user.remove();
```

## 🔄 事务管理

### 基础事务装饰器

```typescript
import { Transactional, TransactionOptions } from 'koatty_typeorm';

export class UserService {
    @Transactional()
    async createUser(userData: any): Promise<User> {
        const user = new User();
        user.firstName = userData.firstName;
        user.lastName = userData.lastName;
        user.isActive = true;
        
        return await user.save();
    }
}
```

### 高级事务配置

```typescript
export class UserService {
    @Transactional({
        isolationLevel: 'READ_COMMITTED',
        timeout: 30000, // 30秒超时
        readOnly: false,
        name: 'create-user-transaction'
    })
    async createUserAdvanced(userData: any): Promise<User> {
        // 事务逻辑
        return await this.processUserCreation(userData);
    }
}
```

### 事务传播行为

```typescript
export class UserService {
    // 需要事务，如果不存在则创建新事务
    @Transactional({ propagation: 'REQUIRED' })
    async createUser(userData: any): Promise<User> {
        return await this.saveUser(userData);
    }

    // 总是创建新事务
    @Transactional({ propagation: 'REQUIRES_NEW' })
    async createAuditLog(action: string): Promise<void> {
        // 独立事务，不受外部事务影响
    }

    // 不支持事务
    @Transactional({ propagation: 'NOT_SUPPORTED' })
    async sendNotification(): Promise<void> {
        // 在非事务环境中执行
    }

    // 必须在事务中执行
    @Transactional({ propagation: 'MANDATORY' })
    async updateCriticalData(): Promise<void> {
        // 如果没有活动事务会抛出错误
    }
}
```

### 嵌套事务与保存点

```typescript
export class UserService {
    @Transactional()
    async bulkCreateUsers(usersData: any[]): Promise<User[]> {
        const results: User[] = [];
        
        for (const userData of usersData) {
            try {
                // 使用嵌套事务处理每个用户
                const user = await this.createUserNested(userData);
                results.push(user);
            } catch (error) {
                // 单个用户失败不影响其他用户的创建
                console.error(`创建用户失败: ${error.message}`);
            }
        }
        
        return results;
    }

    @Transactional({ propagation: 'NESTED' })
    async createUserNested(userData: any): Promise<User> {
        if (!userData.email) {
            throw new Error('邮箱不能为空');
        }
        
        const user = new User();
        user.firstName = userData.firstName;
        user.lastName = userData.lastName;
        user.email = userData.email;
        
        return await user.save();
    }
}
```

### 事务钩子函数

```typescript
export class UserService {
    @Transactional({
        hooks: {
            beforeCommit: async () => {
                console.log('准备提交事务...');
            },
            afterCommit: async () => {
                console.log('事务已成功提交');
                // 发送通知等后续处理
            },
            beforeRollback: async () => {
                console.log('准备回滚事务...');
            },
            afterRollback: async () => {
                console.log('事务已回滚');
                // 错误日志记录
            }
        }
    })
    async criticalOperation(): Promise<void> {
        // 关键业务操作
    }
}
```

## 🛠️ 工具函数

```typescript
import {
    getCurrentQueryRunner,
    getCurrentEntityManager,
    isInTransaction,
    getCurrentDataSource,
    getCurrentTransactionOptions
} from 'koatty_typeorm';

export class UserService {
    @Transactional()
    async businessLogic(): Promise<void> {
        // 检查是否在事务中
        if (isInTransaction()) {
            console.log('当前在事务中执行');
        }

        // 获取当前查询运行器
        const queryRunner = getCurrentQueryRunner();
        if (queryRunner) {
            await queryRunner.query('SELECT 1');
        }

        // 获取实体管理器
        const entityManager = getCurrentEntityManager();
        if (entityManager) {
            await entityManager.save(new User());
        }

        // 获取事务配置
        const options = getCurrentTransactionOptions();
        console.log('事务名称:', options?.name);
    }
}
```

## 📊 性能监控

```typescript
import { TransactionManager } from 'koatty_typeorm';

// 获取事务统计信息
const stats = TransactionManager.getStats();
console.log('事务统计:', {
    总事务数: stats.totalTransactions,
    成功事务数: stats.successfulTransactions,
    失败事务数: stats.failedTransactions,
    平均耗时: stats.averageDuration,
    最长耗时: stats.longestTransaction,
    最短耗时: stats.shortestTransaction
});

// 重置统计信息
TransactionManager.resetStats();

// 获取连接池状态
const poolStatus = TransactionManager.getConnectionPoolStatus();
console.log('连接池状态:', poolStatus);
```

## 🔧 全局事务配置

从 v1.4.0 开始，支持运行时配置全局事务选项：

```typescript
import { TransactionManager } from 'koatty_typeorm';

// 配置全局默认值
TransactionManager.configure({
    // 默认事务超时时间（毫秒）
    defaultTimeout: 30000,
    
    // 默认事务隔离级别
    defaultIsolationLevel: 'READ_COMMITTED',
    
    // 最大事务嵌套深度
    maxNestedDepth: 10,
    
    // 是否启用事务统计
    enableStats: true,
    
    // 是否启用事务日志
    enableLogging: true,
    
    // 上下文清理间隔（毫秒）
    cleanupInterval: 5 * 60 * 1000,
    
    // 上下文最大存活时间（毫秒）
    maxContextAge: 30 * 60 * 1000
});

// 获取当前配置
const config = TransactionManager.getConfig();
console.log('当前配置:', config);
```

**配置说明：**
- `defaultTimeout`: 如果事务装饰器未指定 timeout，将使用此默认值
- `defaultIsolationLevel`: 如果事务装饰器未指定隔离级别，将使用此默认值
- `maxNestedDepth`: 防止过深的事务嵌套导致的性能问题
- `enableStats`: 控制是否收集事务统计信息
- `enableLogging`: 控制是否输出事务相关日志
- `cleanupInterval`: 自动清理过期事务上下文的间隔时间
- `maxContextAge`: 事务上下文的最大存活时间，超时将被自动清理

## ⚙️ 高级配置

### 多数据源配置

```typescript
// 配置多个数据源
export default {
  config: {
    TypeormPlugin: [
      {
        // 主数据库
        name: 'default',
        type: "mysql",
        host: "127.0.0.1",
        database: "main_db",
        entities: [`${process.env.APP_PATH}/model/main/*`]
      },
      {
        // 日志数据库
        name: 'logs',
        type: "postgres",
        host: "127.0.0.1",
        database: "logs_db",
        entities: [`${process.env.APP_PATH}/model/logs/*`]
      }
    ]
  }
};

// 使用指定数据源
@Transactional({ dataSourceName: 'logs' })
async createLogEntry(): Promise<void> {
    // 使用日志数据库
}
```

### 自定义日志器

```typescript
import { KLogger } from 'koatty_typeorm';

const customLogger = new KLogger({
    type: 'mysql',
    logging: true,
    // 其他配置...
});
```

## 🔧 API 参考

### TransactionOptions

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `isolationLevel` | `string` | - | 事务隔离级别 |
| `timeout` | `number` | - | 超时时间（毫秒） |
| `readOnly` | `boolean` | `false` | 是否只读事务 |
| `propagation` | `string` | `'REQUIRED'` | 事务传播行为 |
| `dataSourceName` | `string` | `'DB'` | 数据源名称 |
| `hooks` | `TransactionHooks` | - | 事务钩子函数 |
| `name` | `string` | - | 事务名称 |

### 传播行为类型

- `REQUIRED` - 需要事务，如果不存在则创建
- `REQUIRES_NEW` - 总是创建新事务
- `SUPPORTS` - 支持事务，如果存在则使用
- `NOT_SUPPORTED` - 不支持事务
- `NEVER` - 不允许事务
- `NESTED` - 嵌套事务（使用保存点）
- `MANDATORY` - 必须在事务中执行

## 🚀 性能优化与最佳实践

### 1. 并发事务处理

koatty_typeorm 从 v1.4.0 开始优化了并发事务处理能力：

```typescript
export class UserService {
    @Transactional()
    async batchCreateUsers(usersData: any[]): Promise<User[]> {
        // 并发处理多个用户创建请求
        // 每个请求都有独立的事务上下文，互不干扰
        const promises = usersData.map(data => this.createUser(data));
        return await Promise.all(promises);
    }

    @Transactional({ propagation: 'REQUIRES_NEW' })
    async createUser(userData: any): Promise<User> {
        const user = new User();
        Object.assign(user, userData);
        return await user.save();
    }
}
```

### 2. 优化的统计算法

新版本使用增量更新算法，减少重复计算：

```typescript
// 自动优化的性能统计
const stats = TransactionManager.getStats();
// 统计信息实时更新，无需额外性能开销
```

### 3. 嵌套深度限制

防止过深嵌套导致的性能问题：

```typescript
TransactionManager.configure({
    maxNestedDepth: 5  // 限制最大嵌套深度为 5 层
});
```

### 4. 保存点命名优化

使用确定性命名策略，提升嵌套事务性能：

```typescript
// 自动生成的保存点名称格式: sp_{contextId}_{depth}
// 避免了随机字符串生成的性能开销
@Transactional({ propagation: 'NESTED' })
async nestedOperation(): Promise<void> {
    // 保存点会自动管理
}
```

### 5. 最佳实践建议

#### ✅ 推荐做法

```typescript
// 1. 合理设置事务超时
@Transactional({ timeout: 5000 })
async quickOperation(): Promise<void> {
    // 快速操作，设置较短超时
}

// 2. 使用只读事务优化查询
@Transactional({ readOnly: true })
async getStatistics(): Promise<any> {
    // 只读操作，提升性能
}

// 3. 独立的审计日志事务
@Transactional({ propagation: 'REQUIRES_NEW' })
async createAuditLog(action: string): Promise<void> {
    // 审计日志独立事务，不受业务事务影响
}

// 4. 合理使用事务传播行为
@Transactional({ propagation: 'NOT_SUPPORTED' })
async sendEmail(to: string, content: string): Promise<void> {
    // 发送邮件等非事务操作，避免不必要的事务开销
}
```

#### ❌ 避免做法

```typescript
// 1. 避免在事务中执行耗时操作
@Transactional()
async badPractice(): Promise<void> {
    await this.saveData();
    await this.callExternalAPI();  // ❌ 外部 API 调用
    await this.sendEmail();         // ❌ 发送邮件
    await this.sleep(5000);         // ❌ 长时间等待
}

// 2. 避免过深的事务嵌套
@Transactional()
async deepNesting(): Promise<void> {
    await this.level1();  // level1 调用 level2，level2 调用 level3...
    // ❌ 嵌套过深影响性能和可维护性
}

// 3. 避免大批量操作不分批
@Transactional()
async batchInsert(data: any[]): Promise<void> {
    for (const item of data) {  // ❌ 如果 data 很大会导致长事务
        await this.insert(item);
    }
}
```

#### ✅ 改进方案

```typescript
// 1. 将耗时操作移出事务
@Transactional()
async improvedPractice(): Promise<void> {
    await this.saveData();
    // 事务结束
}

async afterTransaction(): Promise<void> {
    await this.callExternalAPI();  // ✅ 在事务外执行
    await this.sendEmail();         // ✅ 在事务外执行
}

// 2. 大批量操作分批处理
async batchInsertImproved(data: any[]): Promise<void> {
    const BATCH_SIZE = 100;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        await this.insertBatch(batch);  // 每批使用独立事务
    }
}

@Transactional({ propagation: 'REQUIRES_NEW' })
async insertBatch(batch: any[]): Promise<void> {
    // 小批量操作，快速提交
}
```

## 🐛 故障排除

### 常见问题

1. **连接超时**
   ```typescript
   // 增加连接超时时间
   extra: {
     acquireTimeout: 60000,
     timeout: 60000
   }
   ```

2. **事务死锁**
   ```typescript
   // 设置合适的隔离级别
   @Transactional({ isolationLevel: 'READ_COMMITTED' })
   ```

3. **内存泄漏**
   ```typescript
   // 确保正确释放连接
   app.on('Stop', async () => {
     await dataSource.destroy();
   });
   ```

## 📄 License

[BSD-3-Clause](LICENSE)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！



