/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-20 23:49:20
 * @LastEditTime: 2023-01-13 12:35:59
 */
import { DefaultLogger } from "koatty_logger";
import { DataSourceOptions, Logger, QueryRunner } from "typeorm";

/**
 *
 *
 * @class KLogger
 * @implements {Logger}
 */
export class KLogger implements Logger {
  options: DataSourceOptions;
  private loggingEnabled: boolean;

  /**
   * Creates an instance of KLogger.
   * @param {ConnectionOptions} options
   * @memberof KLogger
   */
  constructor(options: DataSourceOptions) {
    this.options = options;
    this.loggingEnabled = !!this.options.logging;
  }

  /**
   * 记录 SQL 查询日志
   *
   * @param {string} query - SQL 查询语句
   * @param {any[]} [parameters] - 查询参数
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  logQuery(query: string, parameters?: any[], _queryRunner?: QueryRunner) {
    if (this.loggingEnabled) {
      DefaultLogger.Info(query, parameters);
    }
  }

  /**
   * 记录 SQL 查询错误日志
   *
   * @param {(string | Error)} error - 错误信息或错误对象
   * @param {string} query - 失败的 SQL 查询语句
   * @param {any[]} [parameters] - 查询参数
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  logQueryError(error: string | Error, query: string, parameters?: any[], _queryRunner?: QueryRunner) {
    if (this.loggingEnabled) {
      DefaultLogger.Error(query, parameters, error);
    }
  }

  /**
   * 记录慢查询日志
   *
   * @param {number} time - 查询执行时间（毫秒）
   * @param {string} query - 慢查询的 SQL 语句
   * @param {any[]} [parameters] - 查询参数
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  logQuerySlow(time: number, query: string, parameters?: any[], _queryRunner?: QueryRunner) {
    if (this.loggingEnabled) {
      DefaultLogger.Warn("QuerySlow", query, parameters, "execution time:", time);
    }
  }

  /**
   * 记录数据库架构构建日志
   *
   * @param {string} message - 构建信息
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  logSchemaBuild(message: string, _queryRunner?: QueryRunner) {
    if (this.loggingEnabled) {
      DefaultLogger.Info(message);
    }
  }

  /**
   * 记录数据库迁移日志
   *
   * @param {string} message - 迁移信息
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  logMigration(message: string, _queryRunner?: QueryRunner) {
    if (this.loggingEnabled) {
      DefaultLogger.Info(message);
    }
  }

  /**
   * 根据日志级别记录日志
   *
   * @param {("log" | "info" | "warn")} level - 日志级别
   * @param {*} message - 日志消息
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  log(level: "log" | "info" | "warn", message: any, _queryRunner?: QueryRunner) {
    switch (level) {
      case "log":
      case "info":
        if (this.loggingEnabled) {
          DefaultLogger.Info(message);
        }
        break;
      case "warn":
        if (this.loggingEnabled) {
          DefaultLogger.Warn(message);
        }
        break;
      default:
        break;
    }
  }
}
