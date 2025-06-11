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

  /**
   * Creates an instance of KLogger.
   * @param {ConnectionOptions} options
   * @memberof KLogger
   */
  constructor(options: DataSourceOptions) {
    this.options = options;
  }

  /**
   *
   *
   * @param {string} query
   * @param {any[]} [parameters]
   * @param {QueryRunner} [queryRunner]
   * @memberof KLogger
   */
  logQuery(query: string, parameters?: any[], _queryRunner?: QueryRunner) {
    if (this.options.logging) {
      DefaultLogger.Info(query, parameters);
    }
  }

  /**
   *
   *
   * @param {(string | Error)} error
   * @param {string} query
   * @param {any[]} [parameters]
   * @param {QueryRunner} [queryRunner]
   * @memberof KLogger
   */
  logQueryError(error: string | Error, query: string, parameters?: any[], _queryRunner?: QueryRunner) {
    if (this.options.logging) {
      DefaultLogger.Error(query, parameters, error);
    }
  }

  /**
   *
   *
   * @param {number} time
   * @param {string} query
   * @param {any[]} [parameters]
   * @param {QueryRunner} [queryRunner]
   * @memberof KLogger
   */
  logQuerySlow(time: number, query: string, parameters?: any[], _queryRunner?: QueryRunner) {
    if (this.options.logging) {
      DefaultLogger.Warn("QuerySlow", query, parameters, "execution time:", time);
    }
  }

  /**
   *
   *
   * @param {string} message
   * @param {QueryRunner} [queryRunner]
   * @memberof KLogger
   */
  logSchemaBuild(message: string, _queryRunner?: QueryRunner) {
    if (this.options.logging) {
      DefaultLogger.Info(message);
    }
  }

  /**
   *
   *
   * @param {string} message
   * @param {QueryRunner} [queryRunner]
   * @memberof KLogger
   */
  logMigration(message: string, _queryRunner?: QueryRunner) {
    if (this.options.logging) {
      DefaultLogger.Info(message);
    }
  }

  /**
   * 通用日志方法
   *
   * @param {("log" | "info" | "warn")} level - 日志级别
   * @param {*} message - 日志消息
   * @param {QueryRunner} [queryRunner] - 查询运行器实例
   * @memberof KLogger
   */
  log(level: "log" | "info" | "warn", message: any, _queryRunner?: QueryRunner) {
    if (!this.options.logging) {
      return;
    }

    switch (level) {
      case "log":
      case "info":
        DefaultLogger.Info(message);
        break;
      case "warn":
        DefaultLogger.Warn(message);
        break;
      default:
        DefaultLogger.Info(message);
        break;
    }
  }
}
