/*
 * @Description:
 * @Usage:
 * @Author: richen
 * @Date: 2020-12-23 15:19:34
 * @LastEditTime: 2023-12-24 15:03:45
 */
import { Helper } from "koatty_lib";
import { Koatty } from "koatty_core";
import { KLogger } from "./logger";
import { DataSource, DataSourceOptions } from "typeorm";
import { DefaultLogger as Logger } from "koatty_logger";

/**
 * 验证数据库配置选项
 * 
 * @param {DataSourceOptions} options - 数据库配置选项
 * @throws {Error} 当配置无效时抛出错误
 */
export function validateDatabaseOptions(options: DataSourceOptions): void {
  if (!options.type) {
    throw new Error("数据库类型 (type) 是必需的");
  }

  // SQLite 类型数据库（基于文件，不需要 host）
  const sqliteTypes = ["sqlite", "better-sqlite3", "capacitor", "cordova"];
  // 不需要 host 的数据库类型
  const noHostTypes = [...sqliteTypes, "mongodb", "expo"];
  
  if (!noHostTypes.includes(options.type)) {
    const opts = options as any;
    if (!opts.host && !opts.url) {
      throw new Error(
        `数据库类型 '${options.type}' 需要 host 或 url 配置。` +
        `请在配置中添加 host 属性或使用 url 连接字符串。`
      );
    }
    
    if (!opts.database && !opts.url) {
      throw new Error(
        `数据库类型 '${options.type}' 需要 database 或 url 配置。` +
        `请在配置中添加 database 属性或使用 url 连接字符串。`
      );
    }
  }

  // 验证实体路径
  if (options.entities && Array.isArray(options.entities) && options.entities.length === 0) {
    Logger.Warn("警告: 未配置实体路径，可能导致无法加载数据模型");
  }
}

/**
 * 默认数据库配置选项
 * 
 * 提供基本的数据库连接配置，可以通过应用配置覆盖
 * 
 * @property {string} type - 数据库类型 (mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb, cordova)
 * @property {string} host - 数据库主机地址
 * @property {number} port - 数据库端口号
 * @property {string} username - 数据库用户名
 * @property {string} password - 数据库密码
 * @property {string} database - 数据库名称
 * @property {boolean} synchronize - 是否自动同步实体到数据库（生产环境应设为 false）
 * @property {boolean} logging - 是否启用 SQL 日志
 * @property {string[]} entities - 实体文件路径模式
 * @property {string} entityPrefix - 表名前缀
 * @property {string} timezone - 时区设置（建议在数据库层面设置时区）
 */
const defaultOptions: any = {
  type: "mysql",
  host: "127.0.0.1",
  port: 3306,
  username: "test",
  password: "test",
  database: "test",
  synchronize: false,
  logging: true,
  entities: [`${process.env.APP_PATH}/model/*`],
  entityPrefix: "",
  timezone: "Z"
};

/**
 * 扩展的数据源配置选项接口
 */
interface ExtendedDataSourceOptions {
  [key: string]: any;
  logger?: any;
}

/**
 * 初始化 TypeORM 数据源并集成到 Koatty 应用中
 * 
 * @export
 * @param {DataSourceOptions} options - TypeORM 数据源配置选项
 * @param {Koatty} app - Koatty 应用实例
 * @returns {Promise<DataSource>} 返回初始化后的数据源实例
 * @throws {Error} 当数据库连接失败时抛出错误
 */
export async function KoattyTypeORM(options: DataSourceOptions, app: Koatty): Promise<DataSource> {
  try {
    // 获取配置选项
    if (Helper.isEmpty(options)) {
      options = app.config("DataBase", "db");
    }
    
    // 验证必要的配置项
    if (!options) {
      throw new Error("数据库配置不能为空");
    }

    // 验证配置选项的有效性
    validateDatabaseOptions(options);

    // 合并配置选项，使用 any 类型来避免类型冲突
    const opt: ExtendedDataSourceOptions = { 
      ...defaultOptions, 
      ...options 
    };
    
    // 设置自定义日志器
    opt.logger = opt.logger ?? new KLogger(opt as DataSourceOptions);

    // 创建并初始化数据源，使用类型断言
    const db = new DataSource(opt as DataSourceOptions);
    const conn = await db.initialize();
    
    // 验证连接状态
    if (!conn.isInitialized) {
      throw new Error("数据库连接初始化失败");
    }

    // 将数据库相关方法注入到应用元数据中
    app.setMetaData("DB", {
      connection: conn,
      dataSource: db,
      transaction: conn.transaction.bind(conn),
      getRepository: conn.getRepository.bind(conn),
      manager: conn.manager,
    });

    // 添加应用关闭时的清理逻辑
    app.on('Stop', async () => {
      if (conn.isInitialized) {
        await conn.destroy();
      }
    });

    return conn;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`TypeORM 初始化失败: ${errorMessage}`);
  }
}

// 导出事务装饰器相关功能
export {
  Transactional,
  TransactionAspect,
  TransactionManager,
  getCurrentQueryRunner,
  getCurrentEntityManager,
  isInTransaction,
  TransactionOptions,
  TransactionContext,
  GlobalTransactionConfig,
  TransactionStats,
  TransactionHooks
} from './decorator';