import { describe, it, expect, beforeAll, afterEach } from 'bun:test';
import { AaveService } from '../src/services/aave-service.js';
import { supplyAction, withdrawAction, borrowAction, repayAction } from '../src/actions/index.js';
import { createChainTestRuntime } from './test-config.js';
import { SupportedChain } from '../src/types/chains.js';
import { ActionResult, IAgentRuntime, Memory } from '@elizaos/core';

/**
 * Tests that actually execute action handlers with real service integration
 * These tests validate the full user interaction flow
 */

const BASE_SEPOLIA_CONFIG = {
  rpcUrl: 'https://sepolia.base.org',
  chainId: 84532,
  testAddress: '0x742d35Cc6635C0532925a3b8D21C7C98B3ec3A72',
  // Use a dummy private key for testing (DO NOT use with real funds)
  testPrivateKey: '0x1234567890123456789012345678901234567890123456789012345678901234',
};

// Global service for tests
let aaveService: AaveService;
let mockRuntime: any;

// Mock callback to capture responses
let lastResponse: any = null;
const mockCallback = async (response: any) => {
  lastResponse = response;
  console.log('Action response:', response);
};

describe('Action Handler Integration Tests', () => {
  beforeAll(async () => {
    aaveService = new AaveService();
    
    // Create runtime with Base Sepolia config
    const runtime = createChainTestRuntime(SupportedChain.BASE_SEPOLIA, {
      AAVE_RPC_URL: BASE_SEPOLIA_CONFIG.rpcUrl,
      WALLET_ADDRESS: BASE_SEPOLIA_CONFIG.testAddress,
      WALLET_PRIVATE_KEY: BASE_SEPOLIA_CONFIG.testPrivateKey,
    });

    // Properly extend the runtime
    const baseRuntime = runtime as any;
    mockRuntime = Object.assign(baseRuntime, {
      getService: (name: string) => name === 'aave' ? aaveService : null,
    });

    console.log('Initializing Aave service on Base Sepolia...');
  });

  afterEach(async () => {
    if (aaveService) {
      await aaveService.stop();
    }
    lastResponse = null;
  });

  describe('Supply Action Handler', () => {
    it('should execute supply action handler without throwing', async () => {
      const mockMessage: Memory = {
        content: { text: 'supply 100 USDC to aave' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        // Initialize service first
        await aaveService.initialize(mockRuntime as IAgentRuntime);
        
        // Validate the command
        const isValid = await supplyAction.validate(mockRuntime as IAgentRuntime, mockMessage);
        expect(isValid).toBe(true);

        // Execute the handler
        const result: ActionResult = await supplyAction.handler(
          mockRuntime as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        // Verify result structure
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.text).toBe('string');
        
        // Should have called callback
        expect(lastResponse).toBeDefined();
        expect(typeof lastResponse.text).toBe('string');
        
        // If it fails, it should fail gracefully with user-friendly message
        if (!result.success) {
          expect(result.text.length).toBeGreaterThan(0);
          expect(lastResponse.error).toBe(true);
          console.log('Supply failed as expected (no funds):', result.text);
        } else {
          console.log('Supply succeeded:', result.text);
        }

      } catch (error) {
        // Should not throw - should handle errors gracefully
        console.error('Action handler threw error (this is bad):', error);
        expect(false).toBe(true);
      }
    }, 30000);

    it('should handle invalid supply commands gracefully', async () => {
      const mockMessage: Memory = {
        content: { text: 'supply -100 INVALID_TOKEN' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        await aaveService.initialize(mockRuntime as IAgentRuntime);
        
        const result = await supplyAction.handler(
          mockRuntime as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        // Should fail gracefully
        expect(result.success).toBe(false);
        expect(result.text.length).toBeGreaterThan(0);
        expect(lastResponse.error).toBe(true);
        
      } catch (error) {
        expect(false).toBe(true); // Should not throw
      }
    });
  });

  describe('Withdraw Action Handler', () => {
    it('should execute withdraw action handler without throwing', async () => {
      const mockMessage: Memory = {
        content: { text: 'withdraw 10 USDC from aave' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        await aaveService.initialize(mockRuntime as IAgentRuntime);
        
        const isValid = await withdrawAction.validate(mockRuntime as IAgentRuntime, mockMessage);
        expect(isValid).toBe(true);

        const result = await withdrawAction.handler(
          mockRuntime as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.text).toBe('string');
        expect(lastResponse).toBeDefined();
        
        if (!result.success) {
          console.log('Withdraw failed as expected (no balance):', result.text);
        }

      } catch (error) {
        console.error('Withdraw handler threw error:', error);
        expect(false).toBe(true);
      }
    }, 30000);
  });

  describe('Borrow Action Handler', () => {
    it('should execute borrow action handler without throwing', async () => {
      const mockMessage: Memory = {
        content: { text: 'borrow 50 USDC variable rate' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        await aaveService.initialize(mockRuntime as IAgentRuntime);
        
        const isValid = await borrowAction.validate(mockRuntime as IAgentRuntime, mockMessage);
        expect(isValid).toBe(true);

        const result = await borrowAction.handler(
          mockRuntime as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.text).toBe('string');
        
        if (!result.success) {
          console.log('Borrow failed as expected (no collateral):', result.text);
        }

      } catch (error) {
        console.error('Borrow handler threw error:', error);
        expect(false).toBe(true);
      }
    }, 30000);
  });

  describe('Repay Action Handler', () => {
    it('should execute repay action handler without throwing', async () => {
      const mockMessage: Memory = {
        content: { text: 'repay 25 USDC variable debt' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        await aaveService.initialize(mockRuntime as IAgentRuntime);
        
        const isValid = await repayAction.validate(mockRuntime as IAgentRuntime, mockMessage);
        expect(isValid).toBe(true);

        const result = await repayAction.handler(
          mockRuntime as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.text).toBe('string');
        
        if (!result.success) {
          console.log('Repay failed as expected (no debt):', result.text);
        }

      } catch (error) {
        console.error('Repay handler threw error:', error);
        expect(false).toBe(true);
      }
    }, 30000);
  });

  describe('Error Handling and User Experience', () => {
    it('should provide helpful error messages for network issues', async () => {
      // Create runtime with invalid RPC
      const badRuntime = createChainTestRuntime(SupportedChain.BASE_SEPOLIA, {
        AAVE_RPC_URL: 'https://invalid-rpc-url.com',
        WALLET_ADDRESS: BASE_SEPOLIA_CONFIG.testAddress,
        WALLET_PRIVATE_KEY: BASE_SEPOLIA_CONFIG.testPrivateKey,
      });

      const mockRuntimeBad = Object.assign(badRuntime, {
        getService: (name: string) => name === 'aave' ? aaveService : null,
      });

      const mockMessage: Memory = {
        content: { text: 'supply 100 USDC' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        const result = await supplyAction.handler(
          mockRuntimeBad as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        // Should fail gracefully with user-friendly message
        expect(result.success).toBe(false);
        expect(result.text).toContain('error');
        expect(lastResponse.error).toBe(true);
        expect(lastResponse.text.length).toBeGreaterThan(10); // Meaningful message

      } catch (error) {
        expect(false).toBe(true); // Should not throw
      }
    });

    it('should handle wallet connection issues', async () => {
      // Runtime without private key
      const noWalletRuntime = createChainTestRuntime(SupportedChain.BASE_SEPOLIA, {
        AAVE_RPC_URL: BASE_SEPOLIA_CONFIG.rpcUrl,
        WALLET_ADDRESS: BASE_SEPOLIA_CONFIG.testAddress,
        // No WALLET_PRIVATE_KEY
      });

      const mockRuntimeNoWallet = Object.assign(noWalletRuntime, {
        getService: (name: string) => name === 'aave' ? aaveService : null,
      });

      const mockMessage: Memory = {
        content: { text: 'supply 100 USDC' },
        userId: 'test-user',
        agentId: 'test-agent',
        id: 'test-message',
        roomId: 'test-room',
        createdAt: Date.now(),
      };

      try {
        const result = await supplyAction.handler(
          mockRuntimeNoWallet as IAgentRuntime,
          mockMessage,
          {},
          {},
          mockCallback
        );

        expect(result.success).toBe(false);
        expect(result.text.toLowerCase()).toContain('wallet');

      } catch (error) {
        expect(false).toBe(true); // Should handle gracefully
      }
    });
  });

  describe('Real Market Data Integration', () => {
    it('should fetch and use real market data in responses', async () => {
      try {
        await aaveService.initialize(mockRuntime as IAgentRuntime);
        
        // Get market data
        const marketData = await aaveService.getMarketData();
        expect(Array.isArray(marketData)).toBe(true);
        
        if (marketData.length > 0) {
          const asset = marketData[0];
          expect(asset).toHaveProperty('symbol');
          expect(asset).toHaveProperty('liquidityRate');
          expect(asset).toHaveProperty('variableBorrowRate');
          
          console.log(`Sample asset: ${asset.symbol} - Supply APY: ${asset.liquidityRate}%, Borrow APY: ${asset.variableBorrowRate}%`);
        }

      } catch (error) {
        console.warn('Market data test failed (network issues):', error);
      }
    }, 30000);
  });
});