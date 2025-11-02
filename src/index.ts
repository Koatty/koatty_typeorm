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

// 导出类型供用户使用
export type { DataSourceOptions, DataSource };


/**
 * Get default entities path
 */
const getDefaultEntities = (): string[] => {
  if (process.env.APP_PATH) {
    return [`${process.env.APP_PATH}/model/*`];
  }
  return [];
};

/**
 * default options
 */
const defaultOptions: DataSourceOptions = {
  //默认配置项
  type: "mysql", //mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb, cordova
  host: "127.0.0.1",
  port: 3306,
  username: "test",
  password: "test",
  database: "test",

  synchronize: false, //true 每次运行应用程序时实体都将与数据库同步
  logging: true,
  entities: getDefaultEntities(),
  entityPrefix: "", //表前缀
  timezone: "Z", // 时区。建议设置数据库时区: set global time_zone = '+8:00'; set time_zone = '+8:00';
  extra: {
    connectionLimit: 10, // 连接池最大连接数
    acquireTimeout: 30000, // 获取连接超时时间（毫秒）
    timeout: 30000, // 查询超时时间（毫秒）
  },
};


/**
 * 初始化 TypeORM 数据库连接并注册到 Koatty 应用
 * 
 * @export
 * @param {DataSourceOptions} options - TypeORM 数据源配置选项。如果为空，将从应用配置中读取
 * @param {Koatty} app - Koatty 应用实例
 * @returns {Promise<void>} Promise，连接初始化完成时解析
 * @throws {Error} 当数据库连接失败时抛出错误
 * 
 * @example
 * ```typescript
 * await KoattyTypeORM({
 *   type: 'mysql',
 *   host: 'localhost',
 *   port: 3306,
 *   username: 'root',
 *   password: 'password',
 *   database: 'mydb',
 * }, app);
 * ```
 */
export async function KoattyTypeORM(options: DataSourceOptions, app: Koatty) {
  if (Helper.isEmpty(options)) {
    options = app.config("DataBase", "db");
  }
  const mergedOptions = { ...defaultOptions, ...options };
  const opt: DataSourceOptions = {
    ...mergedOptions,
    logger: options.logger ?? new KLogger(mergedOptions as DataSourceOptions),
  } as DataSourceOptions;

  // createConnection
  const db = new DataSource(opt);
  try {
    const conn = await db.initialize();
    app.setMetaData("DB", {
      connection: conn,
      transaction: conn.transaction,
      getRepository: conn.getRepository,
      close: async () => {
        if (conn.isInitialized) {
          await conn.destroy();
        }
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Database connection failed: ${errorMessage}`);
  }
}