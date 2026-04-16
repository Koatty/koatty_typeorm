/*
 * @Description:
 * @Usage:
 * @Author: richen
 * @Date: 2020-12-23 15:19:34
 * @LastEditTime: 2023-12-24 15:03:45
 */
import { Helper } from "koatty_lib";
import { Koatty, AppEvent } from "koatty_core";
import { KLogger } from "./logger";
import { DataSource, DataSourceOptions } from "typeorm";
import { DefaultLogger as Logger } from "koatty_logger";

/**
 * Validate database configuration options
 * 
 * @param {DataSourceOptions} options - Database configuration options
 * @throws {Error} Throws error when configuration is invalid
 */
export function validateDatabaseOptions(options: DataSourceOptions): void {
  if (!options.type) {
    throw new Error("Database type (type) is required");
  }

  // SQLite databases (including sqlite and better-sqlite3) do not require host configuration
  if (options.type !== "sqlite" && options.type !== "better-sqlite3") {
    // Use type assertion to handle configuration for different database types
    const opts = options as any;
    if (!opts.host && !opts.url) {
      throw new Error("Database host or connection string (url) is required");
    }
    
    if (!opts.database && !opts.url) {
      throw new Error("Database name or connection string (url) is required");
    }
  }

  // Validate entity paths
  if (options.entities && Array.isArray(options.entities) && options.entities.length === 0) {
    Logger.Warn("Warning: Entity path not configured, may result in inability to load data models");
  }
}

/**
 * default options
 */
const defaultOptions: any = {
  //Default configuration items
  type: "mysql", //mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb, cordova
  host: "127.0.0.1",
  port: 3306,

  synchronize: false, //true entities will be synchronized with database every time application runs
  logging: true,
  entities: [`${process.env.APP_PATH}/model/*`],
  entityPrefix: "", //Table prefix
  timezone: "Z" // Timezone. Recommended to set database timezone: set global time_zone = '+8:00'; set time_zone = '+8:00';
};

/**
 * Extended DataSource options interface
 */
interface ExtendedDataSourceOptions {
  [key: string]: any;
  logger?: any;
}

/**
 * Initialize TypeORM DataSource and integrate into Koatty application
 * 
 * @export
 * @param {DataSourceOptions} options - TypeORM DataSource configuration options
 * @param {Koatty} app - Koatty application instance
 * @returns {Promise<DataSource>} Returns initialized DataSource instance
 * @throws {Error} Throws error when database connection fails
 */
export async function KoattyTypeORM(options: DataSourceOptions, app: Koatty): Promise<DataSource> {
  try {
    // Get configuration options
    if (Helper.isEmpty(options)) {
      options = app.config("DataBase", "db");
    }
    
    // Validate required configuration items
    if (!options) {
      throw new Error("Database configuration cannot be empty");
    }

    // Validate configuration options validity
    validateDatabaseOptions(options);

    // Merge configuration options, use any type to avoid type conflicts
    const opt: ExtendedDataSourceOptions = { 
      ...defaultOptions, 
      ...options 
    };
    
    // Set custom logger
    opt.logger = opt.logger ?? new KLogger(opt as DataSourceOptions);

    // Create and initialize DataSource, use type assertion
    const db = new DataSource(opt as DataSourceOptions);
    const conn = await db.initialize();
    
    // Validate connection status
    if (!conn.isInitialized) {
      throw new Error("Database connection initialization failed");
    }

    // Inject database related methods into application metadata
    app.setMetaData("DB", {
      connection: conn,
      dataSource: db,
      transaction: conn.transaction.bind(conn),
      getRepository: conn.getRepository.bind(conn),
      manager: conn.manager,
    });

    // Add cleanup logic when application shuts down
    app.once(AppEvent.appStop, async () => {
      if (conn.isInitialized) {
        await conn.destroy();
      }
    });

    return conn;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`TypeORM initialization failed: ${errorMessage}`);
  }
}

// Export transaction decorator related functionality
export {
  Transactional,
  TransactionAspect,
  TransactionManager,
  getCurrentQueryRunner,
  getCurrentEntityManager,
  isInTransaction,
} from './decorator';

export type {
  TransactionOptions,
  TransactionContext
} from './decorator';
