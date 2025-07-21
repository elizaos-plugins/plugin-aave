import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { supplyAction } from '../../src/actions/supply';
import BigNumber from 'bignumber.js';
import { ModelClass, ModelType } from '@elizaos/core';

// Mock services
const mockAaveService = {
  supply: mock(async (asset: string, amount: BigNumber, userAddress: string, referralCode: number) => ({
    transactionHash: '0x' + '1'.repeat(64),
    aTokenBalance: new BigNumber(1000),
    apy: 5.5,
    collateralEnabled: true
  })),
  setUserUseReserveAsCollateral: mock(async () => {})
};

const mockWalletService = {
  getAddress: mock(async () => '0x' + '1'.repeat(40)),
  getBalance: mock(async (asset: string) => new BigNumber(2000))
};

// Mock runtime
const mockRuntime = {
  getService: (serviceName: string) => {
    if (serviceName === 'aave') return mockAaveService;
    if (serviceName === 'wallet') return mockWalletService;
    return null;
  },
  useModel: mock(async (modelType: string, options: any) => {
    // If the prompt contains parameter extraction template, return JSON
    if (options.prompt.includes('Extract the supply parameters')) {
      return `\`\`\`json
{
  "asset": "USDC",
  "amount": "1000",
  "enableCollateral": true
}
\`\`\``;
    }
    // Otherwise return a success response
    return '✅ Successfully supplied 1000 USDC to Aave V3!';
  })
};

describe('supplyAction', () => {
  beforeEach(() => {
    // Reset mocks
    mockAaveService.supply.mockClear();
    mockAaveService.setUserUseReserveAsCollateral.mockClear();
    mockWalletService.getAddress.mockClear();
    mockWalletService.getBalance.mockClear();
    mockRuntime.useModel.mockClear();
  });

  describe('basic properties', () => {
    it('should have correct name and description', () => {
      expect(supplyAction.name).toBe('AAVE_SUPPLY');
      expect(supplyAction.description).toBe('Supply assets to Aave V3 lending protocol');
    });

    it('should have examples', () => {
      expect(supplyAction.examples).toBeDefined();
      expect(supplyAction.examples).toHaveLength(2);
    });
  });

  describe('validate', () => {
    it('should validate supply intent with aave keyword', () => {
      const message = {
        content: { text: 'I want to supply 1000 USDC to Aave' }
      };

      const result = supplyAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should validate supply intent with lend keyword', () => {
      const message = {
        content: { text: 'Supply 100 DAI and lend it out' }
      };

      const result = supplyAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should validate supply intent with deposit keyword', () => {
      const message = {
        content: { text: 'I want to supply and deposit ETH' }
      };

      const result = supplyAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(true);
    });

    it('should not validate without supply keyword', () => {
      const message = {
        content: { text: 'I want to borrow 1000 USDC from Aave' }
      };

      const result = supplyAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(false);
    });

    it('should not validate supply without lending context', () => {
      const message = {
        content: { text: 'Supply chain management is important' }
      };

      const result = supplyAction.validate(mockRuntime as any, message as any);
      expect(result).toBe(false);
    });
  });

  describe('handler', () => {
    it('should handle successful supply operation', async () => {
      const message = {
        content: { text: 'Supply 1000 USDC to Aave' }
      };

      const mockCallback = mock();

      const result = await supplyAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        mockCallback
      );

      expect(result).toBe(true);

      // Verify services were called
      expect(mockWalletService.getAddress).toHaveBeenCalledTimes(1);
      expect(mockWalletService.getBalance).toHaveBeenCalledTimes(1);
      expect(mockWalletService.getBalance).toHaveBeenCalledWith('USDC');

      expect(mockAaveService.supply).toHaveBeenCalledTimes(1);
      const supplyCall = mockAaveService.supply.mock.calls[0];
      expect(supplyCall[0]).toBe('USDC');
      expect(supplyCall[1].toString()).toBe('1000');
      expect(supplyCall[2]).toBe('0x' + '1'.repeat(40));
      expect(supplyCall[3]).toBe(0);

      // Verify callback was called with success message
      expect(mockCallback).toHaveBeenCalledTimes(1);
      const callbackData = mockCallback.mock.calls[0][0];
      expect(callbackData.text).toContain('Successfully supplied');
      expect(callbackData.actions).toEqual(['AAVE_SUPPLY']);
      expect(callbackData.data).toBeDefined();
    });

    it('should enable collateral if requested', async () => {
      const message = {
        content: { text: 'Supply 1000 USDC as collateral' }
      };

      // Mock supply result without collateral enabled
      mockAaveService.supply.mockResolvedValueOnce({
        transactionHash: '0x' + '1'.repeat(64),
        aTokenBalance: new BigNumber(1000),
        apy: 5.5,
        collateralEnabled: false
      });

      await supplyAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {}
      );

      // Verify setUserUseReserveAsCollateral was called
      expect(mockAaveService.setUserUseReserveAsCollateral).toHaveBeenCalledTimes(1);
      expect(mockAaveService.setUserUseReserveAsCollateral).toHaveBeenCalledWith('USDC', true);
    });

    it('should not enable collateral if already enabled', async () => {
      const message = {
        content: { text: 'Supply 1000 USDC' }
      };

      // Mock supply result with collateral already enabled
      mockAaveService.supply.mockResolvedValueOnce({
        transactionHash: '0x' + '1'.repeat(64),
        aTokenBalance: new BigNumber(1000),
        apy: 5.5,
        collateralEnabled: true
      });

      await supplyAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {}
      );

      // Verify setUserUseReserveAsCollateral was NOT called
      expect(mockAaveService.setUserUseReserveAsCollateral).not.toHaveBeenCalled();
    });

    it('should handle insufficient balance error', async () => {
      mockWalletService.getBalance.mockResolvedValueOnce(new BigNumber(500));

      const message = {
        content: { text: 'Supply 1000 USDC to Aave' }
      };

      const mockCallback = mock();

      const result = await supplyAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        mockCallback
      );

      expect(result).toBe(false);

      // Verify callback was called with error message
      expect(mockCallback).toHaveBeenCalledTimes(1);
      const callbackData = mockCallback.mock.calls[0][0];
      expect(callbackData.text).toContain('Supply operation failed');
      expect(callbackData.text).toContain('Insufficient balance');

      // Verify supply was not called
      expect(mockAaveService.supply).not.toHaveBeenCalled();
    });

    it('should handle missing services error', async () => {
      const badRuntime = {
        ...mockRuntime,
        getService: () => null
      };

      const message = {
        content: { text: 'Supply 1000 USDC' }
      };

      const mockCallback = mock();

      const result = await supplyAction.handler(
        badRuntime as any,
        message as any,
        undefined,
        {},
        mockCallback
      );

      expect(result).toBe(false);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      const callbackData = mockCallback.mock.calls[0][0];
      expect(callbackData.text).toContain('Required services not found');
    });

    it('should handle parameter extraction failure', async () => {
      mockRuntime.useModel.mockResolvedValueOnce('Invalid JSON response');

      const message = {
        content: { text: 'Supply tokens to Aave' }
      };

      const mockCallback = mock();

      const result = await supplyAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        mockCallback
      );

      expect(result).toBe(false);
    });

    it('should handle supply service error', async () => {
      mockAaveService.supply.mockRejectedValueOnce(new Error('Network error'));

      const message = {
        content: { text: 'Supply 1000 USDC to Aave' }
      };

      const mockCallback = mock();

      const result = await supplyAction.handler(
        mockRuntime as any,
        message as any,
        undefined,
        {},
        mockCallback
      );

      expect(result).toBe(false);
      expect(mockCallback).toHaveBeenCalledTimes(1);
      const callbackData = mockCallback.mock.calls[0][0];
      expect(callbackData.text).toContain('Network error');
    });

    it('should use state for context if provided', async () => {
      const message = {
        content: { text: 'Supply 1000 USDC' }
      };

      const state = {
        recentMessagesStr: 'User asked about lending rates earlier'
      };

      await supplyAction.handler(
        mockRuntime as any,
        message as any,
        state as any,
        {}
      );

      // Verify useModel was called with context including state
      expect(mockRuntime.useModel).toHaveBeenCalled();
      const modelCall = mockRuntime.useModel.mock.calls[0][1];
      expect(modelCall.prompt).toContain('User asked about lending rates earlier');
    });
  });

  describe('examples', () => {
    it('should have valid example structures', () => {
      expect(supplyAction.examples).toBeDefined();
      expect(supplyAction.examples).toHaveLength(2);

      supplyAction.examples.forEach(example => {
        expect(example).toHaveLength(2);

        const [userMessage, assistantMessage] = example;

        expect(userMessage.user).toBe('user');
        expect(userMessage.content).toHaveProperty('text');

        expect(assistantMessage.user).toBe('assistant');
        expect(assistantMessage.content).toHaveProperty('text');
        expect(assistantMessage.content).toHaveProperty('action');
        expect(assistantMessage.content.action).toBe('AAVE_SUPPLY');
      });
    });

    it('should have USDC supply example', () => {
      const usdcExample = supplyAction.examples[0];
      const userText = usdcExample[0].content.text;
      const assistantText = usdcExample[1].content.text;

      expect(userText).toContain('1000 USDC');
      expect(userText).toContain('Aave');
      expect(assistantText).toContain('1000 USDC');
      expect(assistantText).toContain('Aave V3');
    });

    it('should have ETH collateral example', () => {
      const ethExample = supplyAction.examples[1];
      const userText = ethExample[0].content.text;
      const assistantText = ethExample[1].content.text;

      expect(userText).toContain('0.5 ETH');
      expect(userText).toContain('collateral');
      expect(assistantText).toContain('0.5 ETH');
      expect(assistantText).toContain('collateral');
    });
  });
});
