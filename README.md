# koatty_typeorm

🚀 功能强大的 TypeORM 插件，专为 Koatty 框架设计，提供企业级数据库操作和事务管理功能。

[![NPM version](https://img.shields.io/npm/v/koatty_typeorm.svg?style=flat-square)](https://www.npmjs.com/package/koatty_typeorm)
[![License](https://img.shields.io/npm/l/koatty_typeorm.svg?style=flat-square)](LICENSE)

## ✨ 特性

- 🔗 **无缝集成** - 与 Koatty 框架完美集成，零配置即可使用
- 🔄 **智能事务管理** - 提供声明式事务装饰器，支持嵌套事务和多种传播行为
- 📊 **统计监控** - 内置事务性能统计和监控功能
- ⚡ **高性能** - 支持连接池管理和异步操作优化
- 🛡️ **类型安全** - 完整的 TypeScript 支持
- 🔧 **易于配置** - 支持多种数据库类型和灵活的配置选项
- 🎯 **企业级** - 支持超时控制、钩子函数、保存点等高级特性

## 📦 安装

```bash
npm i koatty_typeorm
```

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
      type: "mysql", // 支持: mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb
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
    app.once(AppEvent.appStop, async () => {
      await dataSource.destroy();
    });
   ```

## 📄 License

[BSD-3-Clause](LICENSE)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📚 相关链接

- [Koatty 框架](https://github.com/koatty/koatty)
- [TypeORM 文档](https://typeorm.io/)
- [更新日志](CHANGELOG.md)