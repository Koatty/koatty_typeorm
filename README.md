# koatty_typeorm

[![Version](https://img.shields.io/npm/v/koatty_typeorm.svg)](https://www.npmjs.com/package/koatty_typeorm)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/koatty/koatty_typeorm/blob/main/LICENSE)
[![Node.js Version](https://img.shields.io/node/v/koatty_typeorm.svg)](https://www.npmjs.com/package/koatty_typeorm)

TypeORM plugin for Koatty framework, providing seamless database integration with TypeScript support.

## Features

- 🚀 **Easy Integration**: Seamlessly integrates TypeORM with Koatty framework
- 💪 **TypeScript Support**: Full TypeScript support with type definitions
- 🔌 **Multiple Databases**: Supports MySQL, PostgreSQL, SQLite, MSSQL, Oracle, MongoDB, and more
- 🎯 **Type Safety**: Strong typing for configurations and entities
- 📝 **Custom Logger**: Built-in logger integration with Koatty's logging system
- ⚡ **Connection Pooling**: Optimized connection pool configuration
- 🛡️ **Error Handling**: Comprehensive error handling for database operations
- 🔄 **Graceful Shutdown**: Proper connection cleanup on application termination

## Installation

```bash
npm install koatty_typeorm
# or
yarn add koatty_typeorm
# or
pnpm add koatty_typeorm
```

### Peer Dependencies

Ensure you have the following peer dependencies installed:

```bash
npm install koatty_core koatty_lib koatty_logger
```

## Quick Start

### 1. Create Plugin

Generate a TypeORM plugin in your Koatty project:

```bash
koatty plugin Typeorm
```

### 2. Configure Plugin

Edit `plugin/TypeormPlugin.ts`:

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

### 3. Configure Database

Edit `config/plugin.ts`:

```typescript
import type { DataSourceOptions } from 'koatty_typeorm';

export default {
  list: ['TypeormPlugin'], // Plugin loading order
  config: {
    TypeormPlugin: {
      // Database type
      type: "mysql", // mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb
      
      // Connection settings
      host: "127.0.0.1",
      port: 3306,
      username: "your_username",      // ⚠️ Required: Set your database username
      password: "your_password",      // ⚠️ Required: Set your database password
      database: "your_database",      // ⚠️ Required: Set your database name

      // Entity settings
      entities: [`${process.env.APP_PATH}/model/*`],
      entityPrefix: "", // Table prefix
      
      // Schema synchronization
      // ⚠️ WARNING: Set to false in production!
      // Only use true in development environment
      // In production, use migrations instead
      synchronize: false,
      
      // Logging
      logging: true,
      
      // Timezone (recommend setting database timezone)
      // MySQL: SET GLOBAL time_zone = '+8:00'; SET time_zone = '+8:00';
      timezone: "Z",
      
      // Connection pool settings (optional)
      extra: {
        connectionLimit: 10,      // Maximum connections in pool
        acquireTimeout: 30000,    // Timeout for acquiring connection (ms)
        timeout: 30000,           // Query timeout (ms)
      },
    } as DataSourceOptions,
  },
};
```

### 4. Define Entity

Create entity files in `src/model/` directory:

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

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  // Custom query methods
  static findByName(firstName: string, lastName: string) {
    return this.createQueryBuilder("user")
      .where("user.firstName = :firstName", { firstName })
      .andWhere("user.lastName = :lastName", { lastName })
      .getMany();
  }
}
```

### 5. Use in Controller/Service

#### Using Active Record Pattern

```typescript
import { Controller, GetMapping, PostMapping } from "koatty";
import { User } from "../model/User";

@Controller()
export class UserController {
  // Create user
  @PostMapping("/user")
  async create() {
    const user = new User();
    user.firstName = "John";
    user.lastName = "Doe";
    user.isActive = true;
    await user.save();
    
    return { success: true, data: user };
  }

  // Find users
  @GetMapping("/users")
  async list() {
    const users = await User.find();
    return { success: true, data: users };
  }

  // Find by condition
  @GetMapping("/user/:id")
  async findOne(id: number) {
    const user = await User.findOneBy({ id });
    return { success: true, data: user };
  }

  // Update user
  @PostMapping("/user/:id")
  async update(id: number) {
    const user = await User.findOneBy({ id });
    if (user) {
      user.firstName = "Jane";
      await user.save();
    }
    return { success: true, data: user };
  }

  // Delete user
  @PostMapping("/user/:id/delete")
  async remove(id: number) {
    const user = await User.findOneBy({ id });
    if (user) {
      await user.remove();
    }
    return { success: true };
  }

  // Custom query
  @GetMapping("/user/search")
  async search(firstName: string, lastName: string) {
    const users = await User.findByName(firstName, lastName);
    return { success: true, data: users };
  }
}
```

#### Using Repository Pattern

```typescript
import { Controller, GetMapping, Inject } from "koatty";
import { User } from "../model/User";

@Controller()
export class UserController {
  @Inject()
  app: any;

  // Get repository instance
  private getUserRepository() {
    const db = this.app.getMetaData("DB");
    return db.getRepository(User);
  }

  @GetMapping("/users")
  async list() {
    const userRepository = this.getUserRepository();
    const users = await userRepository.find({
      where: { isActive: true },
      order: { id: "DESC" },
      take: 10,
    });
    return { success: true, data: users };
  }

  @GetMapping("/user/count")
  async count() {
    const userRepository = this.getUserRepository();
    const count = await userRepository.count({
      where: { isActive: true }
    });
    return { success: true, data: count };
  }
}
```

#### Using Transactions

```typescript
import { Controller, PostMapping, Inject } from "koatty";
import { User } from "../model/User";

@Controller()
export class UserController {
  @Inject()
  app: any;

  @PostMapping("/user/transfer")
  async transfer() {
    const db = this.app.getMetaData("DB");
    
    await db.transaction(async (manager) => {
      const user1 = await manager.findOneBy(User, { id: 1 });
      const user2 = await manager.findOneBy(User, { id: 2 });
      
      // Your transaction logic here
      user1.balance -= 100;
      user2.balance += 100;
      
      await manager.save(user1);
      await manager.save(user2);
    });
    
    return { success: true };
  }
}
```

## API Reference

### Exported Types

```typescript
import type { DataSourceOptions, DataSource } from 'koatty_typeorm';
```

### Database Metadata

The plugin registers a `DB` metadata to the Koatty application with the following properties:

```typescript
interface DBMetadata {
  connection: DataSource;              // TypeORM DataSource instance
  transaction: Function;               // Transaction helper
  getRepository: Function;             // Get entity repository
  close: () => Promise<void>;         // Close database connection
}
```

### Accessing Database Connection

```typescript
// In controller or service
const db = this.app.getMetaData("DB");

// Get connection
const connection = db.connection;

// Get repository
const userRepo = db.getRepository(User);

// Use transaction
await db.transaction(async (manager) => {
  // Your transaction logic
});

// Close connection (on application shutdown)
await db.close();
```

## Configuration Options

### Common Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | `"mysql"` | Database type |
| `host` | string | `"127.0.0.1"` | Database host |
| `port` | number | `3306` | Database port |
| `username` | string | - | Database username (required) |
| `password` | string | - | Database password (required) |
| `database` | string | - | Database name (required) |
| `synchronize` | boolean | `false` | Auto sync schema (⚠️ disable in production) |
| `logging` | boolean | `true` | Enable SQL logging |
| `entities` | string[] | `[]` | Entity file paths |
| `entityPrefix` | string | `""` | Table name prefix |
| `timezone` | string | `"Z"` | Database timezone |

### Connection Pool Options

```typescript
extra: {
  connectionLimit: 10,      // Maximum connections
  acquireTimeout: 30000,    // Acquire timeout (ms)
  timeout: 30000,           // Query timeout (ms)
}
```

For more configuration options, refer to [TypeORM Documentation](https://typeorm.io/data-source-options).

## Best Practices

### 1. Environment Variables

Use environment variables for sensitive information:

```typescript
export default {
  config: {
    TypeormPlugin: {
      type: "mysql",
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "3306"),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      // ... other options
    },
  },
};
```

### 2. Production Configuration

**⚠️ Important for Production:**

- **Never** set `synchronize: true` in production
- Use database migrations for schema changes
- Enable connection pooling
- Set appropriate timeouts
- Use proper error handling
- Monitor database connections

```typescript
// Production config
{
  synchronize: false,           // ⚠️ Must be false
  logging: false,              // Disable verbose logging
  migrations: ["dist/migration/**/*.js"],
  migrationsRun: true,
  extra: {
    connectionLimit: 20,       // Adjust based on load
    acquireTimeout: 30000,
    timeout: 60000,
  },
}
```

### 3. Using Migrations

Generate migration:

```bash
npx typeorm migration:generate -n CreateUserTable
```

Run migrations:

```bash
npx typeorm migration:run
```

### 4. Error Handling

Always wrap database operations in try-catch:

```typescript
@GetMapping("/user/:id")
async findUser(id: number) {
  try {
    const user = await User.findOneBy({ id });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    return { success: true, data: user };
  } catch (error) {
    console.error("Database error:", error);
    return { success: false, error: "Database operation failed" };
  }
}
```

### 5. Connection Lifecycle

Close database connection on application shutdown:

```typescript
// In your application bootstrap or shutdown hook
process.on('SIGINT', async () => {
  const db = app.getMetaData("DB");
  await db.close();
  console.log('Database connection closed');
  process.exit(0);
});
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to database

**Solutions**:
- Verify database credentials
- Check if database server is running
- Ensure network connectivity
- Check firewall settings
- Verify database exists

### Entity Not Found

**Problem**: Entity is not being loaded

**Solutions**:
- Check `entities` path in configuration
- Ensure `APP_PATH` environment variable is set
- Verify entity file naming and decorators
- Check TypeScript compilation output

### Performance Issues

**Problem**: Slow database queries

**Solutions**:
- Increase connection pool size
- Add database indexes
- Optimize queries (use QueryBuilder)
- Enable query caching
- Monitor slow query logs

## Examples

More examples available in the [examples directory](./examples) (if available).

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

[BSD-3-Clause](./LICENSE)

## Links

- [GitHub Repository](https://github.com/koatty/koatty_typeorm)
- [Koatty Framework](https://github.com/koatty/koatty)
- [TypeORM Documentation](https://typeorm.io)
- [Issue Tracker](https://github.com/koatty/koatty_typeorm/issues)

## Support

If you have any questions or need help:

- 📝 [Open an Issue](https://github.com/koatty/koatty_typeorm/issues)
- 💬 [Discussions](https://github.com/koatty/koatty_typeorm/discussions)

---

Made with ❤️ by [richenlin](https://github.com/richenlin)
