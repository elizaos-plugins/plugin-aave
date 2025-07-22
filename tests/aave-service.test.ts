import { describe, it, expect } from 'bun:test';
import { AaveService } from '../src/services/aave-service.js';
import { SupportedChain } from '../src/types/chains.js';
import { InterestRateMode, AaveErrorCode } from '../src/types/index.js';

describe('AaveService Unit Tests', () => {
  describe('Service Configuration', () => {
    it('should have correct service type', () => {
      expect(AaveService.serviceType).toBe('aave');
    });

    it('should have informative description', () => {
      const service = new AaveService();
      expect(service.description).toContain('Aave V3');
      expect(service.description).toContain('lending');
      expect(service.description).toContain('borrowing');
    });

    it('should provide capability description', () => {
      const service = new AaveService();
      const capability = service.capabilityDescription;
      expect(capability).toContain('Aave V3');
      expect(capability).toContain('supply');
      expect(capability).toContain('borrow');
    });
  });

  describe('Chain Configuration', () => {
    it('should resolve chain context correctly', () => {
      const { resolveChainContext } = require('../src/utils/chain-resolver.js');
      
      const ethereumContext = resolveChainContext('ethereum');
      expect(ethereumContext.chain).toBe(SupportedChain.ETHEREUM);
      expect(ethereumContext.config.chainId).toBe(1);
      expect(ethereumContext.addresses.POOL).toBeDefined();
      
      const polygonContext = resolveChainContext('polygon');
      expect(polygonContext.chain).toBe(SupportedChain.POLYGON);
      expect(polygonContext.config.chainId).toBe(137);
    });

    it('should provide RPC URL resolution', () => {
      const { resolveRpcUrl, resolveChainContext } = require('../src/utils/chain-resolver.js');
      
      const chainContext = resolveChainContext('ethereum');
      
      // Should use custom URL when provided
      const customUrl = 'https://custom.rpc.url';
      expect(resolveRpcUrl(chainContext, customUrl)).toBe(customUrl);
      
      // Should use default when no custom URL
      expect(resolveRpcUrl(chainContext)).toBe(chainContext.config.defaultRpcUrl);
    });

    it('should list all supported chains', () => {
      const { getAllSupportedChains } = require('../src/utils/chain-resolver.js');
      
      const chains = getAllSupportedChains();
      expect(chains.length).toBeGreaterThan(10);
      
      // Should include major chains
      const chainNames = chains.map(c => c.chain);
      expect(chainNames).toContain(SupportedChain.ETHEREUM);
      expect(chainNames).toContain(SupportedChain.POLYGON);
      expect(chainNames).toContain(SupportedChain.ARBITRUM);
    });

    it('should throw error for unsupported chain', () => {
      const { resolveChainContext } = require('../src/utils/chain-resolver.js');
      
      expect(() => resolveChainContext('invalid-chain'))
        .toThrow('Unsupported chain');
    });
  });

  describe('Error Handling', () => {
    it('should create proper error objects with context', () => {
      const { AaveError } = require('../src/types/index.js');
      
      const error = new AaveError(
        'Test error message',
        AaveErrorCode.INVALID_PARAMETERS,
        new Error('Original error'),
        { testContext: 'test' }
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe(AaveErrorCode.INVALID_PARAMETERS);
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.context).toEqual({ testContext: 'test' });
    });

    it('should have all required error codes', () => {
      const codes = Object.values(AaveErrorCode);
      expect(codes.length).toBeGreaterThan(10);
      
      // Check for key error codes
      expect(codes).toContain('INVALID_PARAMETERS');
      expect(codes).toContain('SERVICE_NOT_INITIALIZED');
      expect(codes).toContain('WALLET_NOT_CONNECTED');
      expect(codes).toContain('UNSUPPORTED_OPERATION');
    });
  });

  describe('Service Lifecycle', () => {
    it('should create service instance', () => {
      const service = new AaveService();
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AaveService);
    });

    it('should handle stop() gracefully', async () => {
      const service = new AaveService();
      await expect(service.stop()).resolves.toBeUndefined();
    });
  });

  describe('Validation Utilities', () => {
    it('should validate addresses correctly', () => {
      const { validateAddress } = require('../src/utils/simple-validation.js');
      
      // Valid addresses
      expect(() => validateAddress('0x742d35Cc6635C0532925a3b8D21C7C98B3ec3A72')).not.toThrow();
      
      // Invalid addresses
      expect(() => validateAddress('invalid')).toThrow();
      expect(() => validateAddress('')).toThrow();
    });

    it('should parse amounts correctly', () => {
      const { parseAmount } = require('../src/utils/simple-validation.js');
      
      expect(parseAmount('100').toString()).toBe('100');
      expect(parseAmount('1.5').toString()).toBe('1.5');
      
      expect(() => parseAmount('0')).toThrow();
      expect(() => parseAmount('-100')).toThrow();
      expect(() => parseAmount('invalid')).toThrow();
    });

    it('should detect max amounts', () => {
      const { isMaxAmount } = require('../src/utils/simple-validation.js');
      
      expect(isMaxAmount('max')).toBe(true);
      expect(isMaxAmount('all')).toBe(true);
      expect(isMaxAmount('everything')).toBe(true);
      
      expect(isMaxAmount('100')).toBe(false);
      expect(isMaxAmount('1.5')).toBe(false);
    });
  });

  describe('Interest Rate Modes', () => {
    it('should have correct enum values', () => {
      expect(InterestRateMode.STABLE).toBe(1);
      expect(InterestRateMode.VARIABLE).toBe(2);
    });
  });
});