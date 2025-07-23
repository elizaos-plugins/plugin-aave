import { IAgentRuntime } from '@elizaos/core';
import { SupportedChain } from '../src/types/chains.js';

/**
 * Test configuration and utilities
 */
export const TEST_CONFIG = {
  // Test wallet addresses (don't use for real transactions)
  TEST_WALLET_ADDRESS: '0x742d35Cc6635C0532925a3b8D21C7C98B3ec3A72',
  TEST_PRIVATE_KEY: '0x' + '1'.repeat(64), // Dummy private key for testing
  
  // Test RPC URLs (use public endpoints for testing)
  RPC_URLS: {
    ethereum: 'https://mainnet.infura.io/v3/demo',
    polygon: 'https://polygon-mainnet.infura.io/v3/demo',
    arbitrum: 'https://arbitrum-mainnet.infura.io/v3/demo',
    base: 'https://base-mainnet.infura.io/v3/demo',
    sepolia: 'https://sepolia.infura.io/v3/demo',
  },
  
  // Test amounts (small amounts for testing)
  TEST_AMOUNTS: {
    SMALL: '1',
    MEDIUM: '100',
    LARGE: '1000',
  },
  
  // Test assets
  TEST_ASSETS: {
    STABLE: 'USDC',
    NATIVE: 'WETH',
    VOLATILE: 'WBTC',
  },
};

/**
 * Mock runtime implementation for testing
 */
export class MockRuntime implements Partial<IAgentRuntime> {
  private settings: Map<string, string> = new Map();
  
  constructor(settings: Record<string, string> = {}) {
    Object.entries(settings).forEach(([key, value]) => {
      this.settings.set(key, value);
    });
  }
  
  getSetting(key: string): string | undefined {
    return this.settings.get(key);
  }
  
  setSetting(key: string, value: string): void {
    this.settings.set(key, value);
  }
  
  getService<T>(name: string): T | null {
    // Mock service getter - would return actual services in real implementation
    return null;
  }

  // Mock useModel for action handlers
  async useModel(modelType: any, options: any): Promise<any> {
    // Return a mock response that looks like an LLM response
    return {
      text: `Mock LLM response for: ${options.prompt?.slice(0, 50)}...`,
      success: true,
    };
  }

  // Mock other required methods
  async addMemory(memory: any): Promise<void> {
    console.log('Mock addMemory:', memory);
  }

  async getMemory(options?: any): Promise<any[]> {
    return [];
  }

  // Add other IAgentRuntime methods as needed
  character = {
    name: 'TestAgent',
    description: 'Test agent for Aave integration testing',
  };

  agentId = 'test-agent-id';
  databaseAdapter = null;
  vectorProvider = null;
  logger = console;
}

/**
 * Create mock runtime with test configuration
 */
export function createTestRuntime(overrides: Record<string, string> = {}): MockRuntime {
  const defaultSettings = {
    WALLET_ADDRESS: TEST_CONFIG.TEST_WALLET_ADDRESS,
    WALLET_PRIVATE_KEY: TEST_CONFIG.TEST_PRIVATE_KEY,
    AAVE_CHAIN: 'ethereum',
    AAVE_RPC_URL: TEST_CONFIG.RPC_URLS.ethereum,
  };
  
  return new MockRuntime({ ...defaultSettings, ...overrides });
}

/**
 * Create test runtime for specific chain
 */
export function createChainTestRuntime(chain: SupportedChain, overrides: Record<string, string> = {}): MockRuntime {
  const chainSettings = {
    AAVE_CHAIN: chain,
    AAVE_RPC_URL: TEST_CONFIG.RPC_URLS[chain as keyof typeof TEST_CONFIG.RPC_URLS] || '',
  };
  
  return createTestRuntime({ ...chainSettings, ...overrides });
}

/**
 * Mock memory object for action testing
 */
export function createMockMessage(text: string, source?: string) {
  return {
    content: {
      text,
      source: source || 'test',
    },
    userId: 'test-user',
    id: 'test-message-id',
    roomId: 'test-room',
    createdAt: Date.now(),
    agentId: 'test-agent',
  };
}

/**
 * Helper to skip tests if no RPC URL available
 */
export function skipIfNoRpc(chain: string): boolean {
  const rpcUrl = TEST_CONFIG.RPC_URLS[chain as keyof typeof TEST_CONFIG.RPC_URLS];
  return !rpcUrl || rpcUrl.includes('demo');
}

/**
 * Test data generators
 */
export const TestData = {
  validSupplyCommands: [
    'supply 100 USDC to aave',
    'deposit 0.5 ETH',
    'lend 1000 DAI to earn yield',
    'supply all my USDT',
  ],
  
  validBorrowCommands: [
    'borrow 1000 USDC variable rate',
    'borrow 0.5 ETH stable',
    'take a loan of 500 DAI',
    'borrow maximum USDT variable',
  ],
  
  validWithdrawCommands: [
    'withdraw 100 USDC',
    'withdraw all ETH',
    'take out 500 DAI',
    'withdraw maximum USDT',
  ],
  
  validRepayCommands: [
    'repay 100 USDC variable debt',
    'pay back all ETH stable',
    'repay 500 DAI variable',
    'repay maximum USDT debt',
  ],
  
  invalidCommands: [
    'hello world',
    'what is the weather',
    'supply', // missing amount and asset
    'borrow xyz', // invalid asset
    '', // empty command
  ],
};

/**
 * Test assertion helpers
 */
export const TestHelpers = {
  isValidAddress: (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },
  
  isValidTxHash: (hash: string): boolean => {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  },
  
  isPositiveNumber: (value: any): boolean => {
    const num = Number(value);
    return !isNaN(num) && num > 0;
  },
  
  hasRequiredFields: (obj: any, fields: string[]): boolean => {
    return fields.every(field => obj.hasOwnProperty(field));
  },
};