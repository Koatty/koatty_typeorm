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
 * Sensitive field name pattern, used to mask query parameters (SEC-11).
 * Matches keys like password, passwd, secret, token, authorization, apiKey, etc.
 */
const SENSITIVE_FIELD_PATTERN = /^(password|passwd|secret|token|authorization|apikey|api_key|access_token|accesstoken|refresh_token|refreshtoken|privatekey|private_key|credential|credentials)$/i;

/** Mask value substituted for sensitive parameter values */
const MASK_VALUE = "***";

/** Maximum recursion depth when sanitizing nested parameter objects */
const SANITIZE_MAX_DEPTH = 10;

/**
 * Recursively sanitize a query parameter value.
 * Values under sensitive keys (case-insensitive) are replaced with '***'.
 *
 * @param {*} value - parameter value
 * @param {string} [keyName] - the object key this value is stored under
 * @param {number} [depth] - current recursion depth
 * @returns {*} sanitized value
 */
function sanitizeParamValue(value: any, keyName?: string, depth: number = 0): any {
  if (value === null || value === undefined) {
    return value;
  }

  // Whole value under a sensitive key is masked (fail-closed, regardless of type)
  if (keyName && SENSITIVE_FIELD_PATTERN.test(keyName)) {
    return MASK_VALUE;
  }

  // Prevent over-deep recursion
  if (depth > SANITIZE_MAX_DEPTH) {
    return "[Object: too deep]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeParamValue(item, undefined, depth + 1));
  }

  if (typeof value === "object") {
    // Keep non-plain objects (Date, Buffer, etc.) as-is
    if (value.constructor !== Object) {
      return value;
    }
    const clone: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      clone[key] = sanitizeParamValue(value[key], key, depth + 1);
    }
    return clone;
  }

  return value;
}

/**
 * Sanitize query parameters before logging, masking values of sensitive fields (SEC-11).
 *
 * @param {any[]} [parameters] - query parameters
 * @returns {*} sanitized parameters
 */
export function sanitizeLogParams(parameters?: any[]): any[] | undefined {
  if (!parameters || !Array.isArray(parameters)) {
    return parameters;
  }
  return parameters.map((param) => sanitizeParamValue(param, undefined, 0));
}

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
      DefaultLogger.Info(query, sanitizeLogParams(parameters));
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
      DefaultLogger.Error(query, sanitizeLogParams(parameters), error);
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
      DefaultLogger.Warn("QuerySlow", query, sanitizeLogParams(parameters), "execution time:", time);
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
