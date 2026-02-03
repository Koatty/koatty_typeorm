/**
 * Jest setup: suppress koatty_logger DEBUG output during tests
 */
import { DefaultLogger } from 'koatty_logger';

DefaultLogger.setLevel('error');
