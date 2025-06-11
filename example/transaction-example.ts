/*
 * @Description: 事务装饰器使用示例
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-01 00:00:00
 * @LastEditTime: 2024-01-01 00:00:00
 */
import 'reflect-metadata';
import { Component, Container } from 'koatty_container';
import { 
  Transactional, 
  TransactionAspect,
  getCurrentQueryRunner,
  getCurrentEntityManager,
  isInTransaction,
  TransactionOptions
} from '../src/index';

// 示例实体类
export class User {
  id?: number;
  name: string;
  email: string;
  createdAt?: Date;

  constructor(name: string, email: string) {
    this.name = name;
    this.email = email;
  }
}

export class Order {
  id?: number;
  userId: number;
  amount: number;
  status: string;
  createdAt?: Date;

  constructor(userId: number, amount: number, status: string = 'pending') {
    this.userId = userId;
    this.amount = amount;
    this.status = status;
  }
}

/**
 * 用户服务类 - 展示基本事务使用
 */
@Component()
export class UserService {

  /**
   * 创建用户 - 基本事务使用
   */
  @Transactional()
  async createUser(userData: { name: string; email: string }): Promise<User> {
    console.log('Creating user in transaction...');
    
    // 检查是否在事务中
    if (isInTransaction()) {
      console.log('✓ Currently in transaction');
    }
    
    // 获取事务实体管理器
    const manager = getCurrentEntityManager();
    if (manager) {
      console.log('✓ Got transaction entity manager');
      // 在实际应用中，这里会使用 manager 来保存实体
      // const user = await manager.save(User, userData);
    }
    
    // 模拟数据库操作
    const user = new User(userData.name, userData.email);
    user.id = Math.floor(Math.random() * 1000);
    user.createdAt = new Date();
    
    console.log('User created:', user);
    return user;
  }

  /**
   * 更新用户 - 带超时的事务
   */
  @Transactional({
    timeout: 5000,
    isolationLevel: 'READ_COMMITTED'
  })
  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    console.log(`Updating user ${id} with timeout...`);
    
    // 模拟长时间操作
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const queryRunner = getCurrentQueryRunner();
    if (queryRunner) {
      console.log('✓ Got transaction query runner');
      // 在实际应用中，这里会使用 queryRunner 执行查询
      // const result = await queryRunner.query('UPDATE users SET ... WHERE id = ?', [id]);
    }
    
    // 模拟更新结果
    const updatedUser = new User(userData.name || 'Updated Name', userData.email || 'updated@example.com');
    updatedUser.id = id;
    updatedUser.createdAt = new Date();
    
    console.log('User updated:', updatedUser);
    return updatedUser;
  }

  /**
   * 删除用户 - 只读事务
   */
  @Transactional({
    readOnly: true,
    propagation: 'SUPPORTS'
  })
  async getUserById(id: number): Promise<User | null> {
    console.log(`Getting user ${id} in read-only transaction...`);
    
    // 模拟查询操作
    const user = new User('John Doe', 'john@example.com');
    user.id = id;
    user.createdAt = new Date();
    
    console.log('User found:', user);
    return user;
  }
}

/**
 * 订单服务类 - 展示事务传播行为
 */
@Component()
export class OrderService {

  constructor(private userService: UserService) {}

  /**
   * 创建订单 - 需要新事务
   */
  @Transactional({
    propagation: 'REQUIRES_NEW',
    isolationLevel: 'REPEATABLE_READ'
  })
  async createOrder(userId: number, amount: number): Promise<Order> {
    console.log('Creating order in new transaction...');
    
    // 模拟订单创建
    const order = new Order(userId, amount);
    order.id = Math.floor(Math.random() * 1000);
    order.createdAt = new Date();
    
    console.log('Order created:', order);
    return order;
  }

  /**
   * 处理订单 - 嵌套事务
   */
  @Transactional({
    propagation: 'NESTED'
  })
  async processOrder(orderId: number): Promise<void> {
    console.log(`Processing order ${orderId} in nested transaction...`);
    
    // 模拟订单处理逻辑
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`Order ${orderId} processed successfully`);
  }
}

/**
 * 业务服务类 - 展示复杂事务场景
 */
@Component()
export class BusinessService {

  constructor(
    private userService: UserService,
    private orderService: OrderService
  ) {}

  /**
   * 创建用户和订单 - 复合事务操作
   */
  @Transactional({
    isolationLevel: 'READ_COMMITTED',
    timeout: 10000
  })
  async createUserAndOrder(userData: { name: string; email: string }, orderAmount: number): Promise<{ user: User; order: Order }> {
    console.log('Starting complex transaction: create user and order...');
    
    try {
      // 1. 创建用户（会使用当前事务，因为默认传播行为是 REQUIRED）
      const user = await this.userService.createUser(userData);
      
      // 2. 创建订单（会创建新事务，因为设置了 REQUIRES_NEW）
      const order = await this.orderService.createOrder(user.id!, orderAmount);
      
      // 3. 处理订单（会创建嵌套事务）
      await this.orderService.processOrder(order.id!);
      
      console.log('Complex transaction completed successfully');
      return { user, order };
      
    } catch (error) {
      console.error('Complex transaction failed:', error);
      throw error;
    }
  }

  /**
   * 批量操作 - 展示事务回滚
   */
  @Transactional()
  async batchCreateUsers(usersData: { name: string; email: string }[]): Promise<User[]> {
    console.log('Starting batch user creation...');
    
    const users: User[] = [];
    
    for (let i = 0; i < usersData.length; i++) {
      const userData = usersData[i];
      
      // 模拟某个用户创建失败
      if (userData.email === 'fail@example.com') {
        throw new Error('Simulated user creation failure');
      }
      
      const user = await this.userService.createUser(userData);
      users.push(user);
    }
    
    console.log(`Batch created ${users.length} users`);
    return users;
  }
}

/**
 * 示例使用函数
 */
export async function runTransactionExamples() {
  console.log('=== 事务装饰器使用示例 ===\n');
  
  // 初始化容器
  const container = Container.getInstance();
  
  // 注册事务切面
  container.reg('TransactionAspect', TransactionAspect);
  
  // 注册服务
  container.reg('UserService', UserService);
  container.reg('OrderService', OrderService);
  container.reg('BusinessService', BusinessService);
  
  // 获取服务实例
  const userService = container.get<UserService>('UserService');
  const orderService = container.get<OrderService>('OrderService');
  const businessService = container.get<BusinessService>('BusinessService');
  
  try {
    console.log('1. 基本事务使用：');
    const user1 = await userService.createUser({
      name: 'Alice',
      email: 'alice@example.com'
    });
    console.log('Result:', user1);
    console.log('');
    
    console.log('2. 带超时的事务：');
    const user2 = await userService.updateUser(1, {
      name: 'Alice Updated',
      email: 'alice.updated@example.com'
    });
    console.log('Result:', user2);
    console.log('');
    
    console.log('3. 只读事务：');
    const user3 = await userService.getUserById(1);
    console.log('Result:', user3);
    console.log('');
    
    console.log('4. 复合事务操作：');
    const result = await businessService.createUserAndOrder(
      { name: 'Bob', email: 'bob@example.com' },
      99.99
    );
    console.log('Result:', result);
    console.log('');
    
    console.log('5. 批量操作（成功）：');
    const users = await businessService.batchCreateUsers([
      { name: 'Charlie', email: 'charlie@example.com' },
      { name: 'David', email: 'david@example.com' }
    ]);
    console.log('Result:', users);
    console.log('');
    
    console.log('6. 批量操作（失败回滚）：');
    try {
      await businessService.batchCreateUsers([
        { name: 'Eve', email: 'eve@example.com' },
        { name: 'Fail', email: 'fail@example.com' }, // 这个会失败
        { name: 'Frank', email: 'frank@example.com' }
      ]);
    } catch (error) {
      console.log('Expected error caught:', error.message);
    }
    
  } catch (error) {
    console.error('Example execution failed:', error);
  }
  
  console.log('\n=== 示例执行完成 ===');
}

// 如果直接运行此文件
if (require.main === module) {
  runTransactionExamples().catch(console.error);
} 