/*
 * @Description:
 * @Usage:
 * @Author: richen
 * @Date: 2020-12-23 15:19:34
 * @LastEditTime: 2023-01-13 12:35:53
 */
import * as Helper from "koatty_lib";
import { Koatty } from "koatty_core";
import { KLogger } from "./logger";
import { DataSource, DataSourceOptions } from "typeorm";


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
  entities: [`${process.env.APP_PATH}/model/*`],
  entityPrefix: "", //表前缀
};


/**
 *
 *
 * @export
 * @param {DataSourceOptions} options
 * @param {Koatty} app
 */
export async function typeorm(options: DataSourceOptions, app: Koatty) {
  if (Helper.isEmpty(options)) {
    options = app.config("DataBase", "db");
  }
  const opt: any = { ...defaultOptions, ...options };
  opt.logger = opt.logger ?? new KLogger(opt);

  // createConnection
  const db = new DataSource(opt)
  const conn = await db.initialize();
  app.setMetaData("DB", {
    connection: conn,
    transaction: conn.transaction,
    getRepository: conn.getRepository,
  });
}