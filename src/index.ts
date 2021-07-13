/*
 * @Description:
 * @Usage:
 * @Author: richen
 * @Date: 2020-12-23 15:19:34
 * @LastEditTime: 2021-07-13 09:49:02
 */
import * as Helper from "koatty_lib";
import { Koatty } from "koatty_core";
import { createConnection, getConnection, getRepository } from "typeorm";

/**
 *
 *
 * @interface DBServerInterface
 */
interface DBServerInterface {
    host: string;
    port: number;
    username?: string;
    password?: string;
    database?: string;
}

/**
 *
 *
 * @interface ReplicationInterface
 */
interface ReplicationInterface {
    master: DBServerInterface;
    slaves: DBServerInterface[];
}

/**
 *
 *
 * @interface OptionsInterface
 */
interface OptionsInterface {
    type: string;
    replication: ReplicationInterface;
    synchronize?: boolean;
    logging?: boolean;
    entities?: any[];
}

/**
 * default options
 */
const defaultOptions: OptionsInterface = {
    //默认配置项
    "type": "mysql", //mysql, mariadb, postgres, sqlite, mssql, oracle, mongodb, cordova
    replication: {
        master: {
            host: "127.0.0.1",
            port: 3306,
            username: "test",
            password: "test",
            database: "test"
        },
        slaves: [{
            host: "127.0.0.1",
            port: 3306,
            username: "test",
            password: "test",
            database: "test"
        }]
    },
    "synchronize": false, //true 每次运行应用程序时实体都将与数据库同步
    "logging": true,
    "entities": [`${process.env.APP_PATH}/model/*`]
};


/**
 *
 *
 * @export
 * @param {OptionsInterface} options
 * @param {Koatty} app
 */
export async function plugin(options: OptionsInterface, app: Koatty) {
    const opt: any = { ...defaultOptions, ...options };
    // 自动在项目目录生成 ormconfig.json
    app.once("appStart", function () {
        const data = JSON.stringify(opt);
        return Helper.writeFile(`${app.appPath}/ormconfig.json`, data);
    });

    Helper.define(app, "DB", {
        createConnection,
        getConnection,
        getRepository,
    })
};