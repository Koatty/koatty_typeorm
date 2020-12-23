# koatty_typeorm
TypeORM plugin for Koatty.

## 安装

```shell
npm i koatty_typeorm
```

## 使用

新建插件 TypeormPlugin:

```javascript
// src/plugin/TypeormPlugin.ts
import { IPlugin, Plugin, Koatty } from 'koatty';
import typeorm from 'koatty_typeorm';

@Plugin()
export class TypeormPlugin implements IPlugin {
  run(options: any, app: Koatty) {
    return typeorm(options, app);
  }
}
```
配置插件属性并加载:
```
// src/config/plugin.ts
export default {
  list: ['TypeormPlugin'], // 加载的插件列表,执行顺序按照数组元素顺序
  config: { // 插件配置
    TypeormPlugin: {
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
    }
  },
};

```
