import { KoattyTypeORM } from '../src/index';

// 注意：这些测试需要 mock Koatty 和 TypeORM 的 DataSource
// 由于项目依赖问题，这里只提供基础结构

describe('KoattyTypeORM', () => {
  it('should be a function', () => {
    expect(typeof KoattyTypeORM).toBe('function');
  });

  // TODO: 添加更多测试用例
  // - 测试配置合并
  // - 测试错误处理
  // - 测试连接初始化
  // 这些测试需要 mock DataSource 以避免实际连接数据库
});

