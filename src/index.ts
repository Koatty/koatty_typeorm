/*
 * @Description:
 * @Usage:
 * @Author: richen
 * @Date: 2020-12-23 15:19:34
 * @LastEditTime: 2020-12-23 16:36:15
 */
import * as Helper from "koatty_lib";
import { createConnection, Connection } from "typeorm";

/**
 *
 *
 * @interface DBServerInterface
 */
interface DBServerInterface {
    host: string,
    port: number,
    username?: string,
    password?: string,
    database?: string,
}

/**
 *
 *
 * @interface ReplicationInterface
 */
interface ReplicationInterface {
    master: DBServerInterface,
    slaves: DBServerInterface[]
}

/**
 *
 *
 * @interface OptionsInterface
 */
interface OptionsInterface {
    type: string,
    replication: ReplicationInterface,
    synchronize?: boolean,
    logging?: boolean,
    entities?: any[],
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
    "entities": []
}

/**
 *
 *
 * @export
 * @param {OptionsInterface} options
 * @param {*} app Koatty or Koa instance
 */
export async function TypeORMPlugin(options: OptionsInterface, app: any) {
    const opt: any = { ...defaultOptions, ...options };
    // dbInit
    const dbInit = function () {
        return createConnection(opt).then((connection: Connection) => {
            Helper.define(app, 'DBConnection', connection);
        });
    }

    await dbInit();
    Helper.define(app, 'DBInit', dbInit);
}