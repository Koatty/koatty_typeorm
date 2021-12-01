/*
 * @Description: 
 * @Usage: 
 * @Author: richen
 * @Date: 2021-11-20 23:49:20
 * @LastEditTime: 2021-11-23 15:34:54
 */
import { DefaultLogger } from "koatty_logger";
import { ConnectionOptions, Logger, QueryRunner } from "typeorm";

/**
 *
 *
 * @class KLogger
 * @implements {Logger}
 */
export class KLogger implements Logger {
    options: ConnectionOptions;

    /**
     * Creates an instance of KLogger.
     * @param {ConnectionOptions} options
     * @memberof KLogger
     */
    constructor(options: ConnectionOptions) {
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
    logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner) {
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
    logQueryError(error: string | Error, query: string, parameters?: any[], queryRunner?: QueryRunner) {
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
    logQuerySlow(time: number, query: string, parameters?: any[], queryRunner?: QueryRunner) {
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
    logSchemaBuild(message: string, queryRunner?: QueryRunner) {
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
    logMigration(message: string, queryRunner?: QueryRunner) {
        if (this.options.logging) {
            DefaultLogger.Info(message);
        }
    }

    /**
     *
     *
     * @param {("log" | "info" | "warn")} level
     * @param {*} message
     * @param {QueryRunner} [queryRunner]
     * @memberof KLogger
     */
    log(level: "log" | "info" | "warn", message: any, queryRunner?: QueryRunner) {
        switch (level) {
            case "log":
            case "info":
                if (this.options.logging) {
                    DefaultLogger.Info(message);
                }
                break;
            case "warn":
                if (this.options.logging) {
                    DefaultLogger.Warn(message);
                }
            default:
                break;
        }
    }
}
