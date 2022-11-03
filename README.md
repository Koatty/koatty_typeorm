# koatty_typeorm
TypeORM plugin for Koatty.

# 安装
-----

```
npm i koatty_typeorm
```

# 使用
-----

## Koatty

1、项目中增加plugin

```sh
koatty plugin Typeorm;
```

2、修改 plugin/TypeormPlugin.ts:

```js
import { Koatty, Plugin, IPlugin } from "koatty";
import typeorm from 'koatty_typeorm';

@Plugin()
export class TypeormPlugin implements IPlugin {
  run(options: any, app: Koatty) {
    return typeorm(options, app);
  }
}
```

3、项目plugin配置 config/plugin.ts:

```js
// src/config/plugin.ts
export default {
  list: ['TypeormPlugin'], // 加载的插件列表,执行顺序按照数组元素顺序
  config: { // 插件配置
    TypeormPlugin: {
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
    }
  },
};

```
4、定义model

```js

import {BaseEntity, Entity, PrimaryGeneratedColumn, Column} from "typeorm";

@Entity()
export class User extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    firstName: string;

    @Column()
    lastName: string;

    @Column()
    isActive: boolean;

    static findByName(firstName: string, lastName: string) {
        return this.createQueryBuilder("user")
            .where("user.firstName = :firstName", { firstName })
            .andWhere("user.lastName = :lastName", { lastName })
            .getMany();
    }

}
```

5、CURD

```js
// example how to save AR entity
const user = new User();
user.firstName = "Timber";
user.lastName = "Saw";
user.isActive = true;
await user.save();

// example how to remove AR entity
await user.remove();

// example how to load AR entities
const users = await User.findBy({ skip: 2, take: 5 });
const newUsers = await User.findBy({ isActive: true });
const timber = await User.findOneBy({ firstName: "Timber", lastName: "Saw" });

```