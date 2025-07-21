import { describe, it, expect, beforeEach } from 'bun:test';
import { aavePlugin } from '../src/plugin';
import { z } from 'zod';

describe('aavePlugin', () => {
  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.BASE_RPC_URL;
    delete process.env.WALLET_PRIVATE_KEY;
    delete process.env.HEALTH_FACTOR_ALERT;
    delete process.env.FLASH_LOAN_MAX_FEE;
    delete process.env.AAVE_NETWORK;
  });

  describe('plugin structure', () => {
    it('should have required properties', () => {
      expect(aavePlugin.name).toBe('aave');
      expect(aavePlugin.description).toBeDefined();
      expect(aavePlugin.config).toBeDefined();
      expect(aavePlugin.init).toBeDefined();
      expect(aavePlugin.actions).toBeDefined();
      expect(aavePlugin.services).toBeDefined();
      expect(aavePlugin.providers).toBeDefined();
      expect(aavePlugin.evaluators).toBeDefined();
    });

    it('should have correct description', () => {
      expect(aavePlugin.description).toBe(
        'Aave V3 DeFi plugin for lending, borrowing, flash loans, and advanced DeFi operations'
      );
    });

    it('should have default config values', () => {
      expect(aavePlugin.config.HEALTH_FACTOR_ALERT).toBe('1.5');
      expect(aavePlugin.config.FLASH_LOAN_MAX_FEE).toBe('0.1');
      expect(aavePlugin.config.AAVE_NETWORK).toBe('base');
    });
  });

  describe('init', () => {
    it('should initialize with valid config', async () => {
      const config = {
        BASE_RPC_URL: 'https://mainnet.base.org',
        WALLET_PRIVATE_KEY: '0x' + '0'.repeat(64),
        HEALTH_FACTOR_ALERT: '2.0',
        FLASH_LOAN_MAX_FEE: '0.05',
        AAVE_NETWORK: 'base',
      };

      await expect(aavePlugin.init(config)).resolves.toBeUndefined();

      // Check environment variables were set
      expect(process.env.BASE_RPC_URL).toBe(config.BASE_RPC_URL);
      expect(process.env.WALLET_PRIVATE_KEY).toBe(config.WALLET_PRIVATE_KEY);
      expect(process.env.HEALTH_FACTOR_ALERT).toBe('2');
      expect(process.env.FLASH_LOAN_MAX_FEE).toBe('0.05');
      expect(process.env.AAVE_NETWORK).toBe('base');
    });

    it('should use default values for optional config', async () => {
      const config = {
        BASE_RPC_URL: 'https://mainnet.base.org',
      };

      await expect(aavePlugin.init(config)).resolves.toBeUndefined();

      expect(process.env.HEALTH_FACTOR_ALERT).toBe('1.5');
      expect(process.env.FLASH_LOAN_MAX_FEE).toBe('0.1');
      expect(process.env.AAVE_NETWORK).toBe('base');
    });

    it('should throw error without required BASE_RPC_URL', async () => {
      const config = {
        WALLET_PRIVATE_KEY: '0x' + '0'.repeat(64),
      };

      await expect(aavePlugin.init(config)).rejects.toThrow(
        'Invalid Aave plugin configuration: BASE_RPC_URL: Required'
      );
    });

    it('should validate health factor alert threshold', async () => {
      const config = {
        BASE_RPC_URL: 'https://mainnet.base.org',
        HEALTH_FACTOR_ALERT: '0.5', // Too low
      };

      await expect(aavePlugin.init(config)).rejects.toThrow(
        'Invalid Aave plugin configuration: HEALTH_FACTOR_ALERT: HEALTH_FACTOR_ALERT must be greater than 1'
      );
    });

    it('should validate flash loan max fee range', async () => {
      const config = {
        BASE_RPC_URL: 'https://mainnet.base.org',
        FLASH_LOAN_MAX_FEE: '1.5', // Too high
      };

      await expect(aavePlugin.init(config)).rejects.toThrow(
        'Invalid Aave plugin configuration: FLASH_LOAN_MAX_FEE: FLASH_LOAN_MAX_FEE must be between 0 and 1'
      );
    });

    it('should validate network selection', async () => {
      const config = {
        BASE_RPC_URL: 'https://mainnet.base.org',
        AAVE_NETWORK: 'invalid-network',
      };

      await expect(aavePlugin.init(config)).rejects.toThrow('Invalid Aave plugin configuration');
    });

    it('should accept base-sepolia network', async () => {
      const config = {
        BASE_RPC_URL: 'https://sepolia.base.org',
        AAVE_NETWORK: 'base-sepolia',
      };

      await expect(aavePlugin.init(config)).resolves.toBeUndefined();
      expect(process.env.AAVE_NETWORK).toBe('base-sepolia');
    });

    it('should validate URL format', async () => {
      const config = {
        BASE_RPC_URL: 'not-a-url',
      };

      await expect(aavePlugin.init(config)).rejects.toThrow(
        'Invalid Aave plugin configuration: BASE_RPC_URL: BASE_RPC_URL must be a valid URL'
      );
    });

    it('should handle Zod validation errors properly', async () => {
      const config = {
        BASE_RPC_URL: '',
        HEALTH_FACTOR_ALERT: 'invalid-number',
      };

      await expect(aavePlugin.init(config)).rejects.toThrow('Invalid Aave plugin configuration');
    });
  });

  describe('plugin components', () => {
    it('should have actions defined', () => {
      expect(aavePlugin.actions).toBeArray();
      expect(aavePlugin.actions.length).toBeGreaterThan(0);

      // Check that actions are plain objects with required properties
      aavePlugin.actions.forEach((action) => {
        expect(action).toHaveProperty('name');
        expect(action).toHaveProperty('description');
        expect(action).toHaveProperty('validate');
        expect(action).toHaveProperty('handler');
        expect(action).toHaveProperty('examples');
        expect(typeof action.validate).toBe('function');
        expect(typeof action.handler).toBe('function');
      });
    });

    it('should have services defined', () => {
      expect(aavePlugin.services).toBeArray();
      expect(aavePlugin.services.length).toBeGreaterThan(0);
    });

    it('should have providers defined', () => {
      expect(aavePlugin.providers).toBeArray();
      expect(aavePlugin.providers.length).toBeGreaterThan(0);
    });

    it('should have evaluators defined', () => {
      expect(aavePlugin.evaluators).toBeArray();
      expect(aavePlugin.evaluators.length).toBeGreaterThan(0);
    });
  });
});
