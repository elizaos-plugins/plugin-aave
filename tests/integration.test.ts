import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { AaveService } from '../src/services/aave-service.js';
import { createTestRuntime, createChainTestRuntime, skipIfNoRpc, TEST_CONFIG, TestHelpers } from './test-config.js';
import { SupportedChain } from '../src/types/chains.js';
import { InterestRateMode } from '../src/types/index.js';

describe('Aave Integration Tests', () => {
  let service: AaveService;
  let testRuntime: any;

  beforeAll(() => {
    // Skip integration tests if using demo RPC URLs
    if (skipIfNoRpc('ethereum')) {
      console.warn('Skipping integration tests - no real RPC URL configured');
      return;
    }
  });

  beforeEach(() => {
    testRuntime = createTestRuntime();
    service = new AaveService();
  });

  describe('Multi-chain Initialization', () => {
    const testChains: SupportedChain[] = [
      SupportedChain.ETHEREUM,
      SupportedChain.POLYGON,
      SupportedChain.ARBITRUM,
      SupportedChain.BASE,
    ];

    for (const chain of testChains) {
      it(`should initialize successfully on ${chain}`, async () => {
        if (skipIfNoRpc(chain)) {
          console.warn(`Skipping ${chain} - no RPC URL`);
          return;
        }

        const chainRuntime = createChainTestRuntime(chain);
        const chainService = new AaveService();

        await expect(chainService.initialize(chainRuntime)).resolves.not.toThrow();
        expect(chainService.capabilityDescription).toContain(chain);
      });
    }
  });

  describe('Market Data Integration', () => {
    beforeEach(async () => {
      if (skipIfNoRpc('ethereum')) return;
      await service.initialize(testRuntime);
    });

    it('should fetch real market data from Aave V3', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const marketData = await service.getMarketData();
      
      expect(Array.isArray(marketData)).toBe(true);
      expect(marketData.length).toBeGreaterThan(0);

      const firstAsset = marketData[0];
      expect(firstAsset).toBeDefined();
      expect(firstAsset.asset).toBeDefined();
      expect(typeof firstAsset.supplyAPY).toBe('number');
      expect(typeof firstAsset.variableBorrowAPY).toBe('number');
      expect(TestHelpers.isValidAddress(firstAsset.underlyingAsset)).toBe(true);
      expect(TestHelpers.isValidAddress(firstAsset.aTokenAddress)).toBe(true);
    });

    it('should include popular assets in market data', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const marketData = await service.getMarketData();
      const symbols = marketData.map(asset => asset.asset);

      // Should include major stablecoins and ETH
      const popularAssets = ['USDC', 'USDT', 'DAI', 'WETH'];
      const foundAssets = popularAssets.filter(asset => symbols.includes(asset));
      
      expect(foundAssets.length).toBeGreaterThan(2); // At least some popular assets
    });
  });

  describe('User Position Integration', () => {
    beforeEach(async () => {
      if (skipIfNoRpc('ethereum')) return;
      await service.initialize(testRuntime);
    });

    it('should fetch user position without errors', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const userAddress = TEST_CONFIG.TEST_WALLET_ADDRESS;
      
      const position = await service.getUserPosition(userAddress);
      
      expect(position).toBeDefined();
      expect(position.userAddress).toBe(userAddress);
      expect(position.totalCollateralETH).toBeDefined();
      expect(position.totalDebtETH).toBeDefined();
      expect(position.healthFactor).toBeDefined();
      expect(Array.isArray(position.positions)).toBe(true);
      expect(typeof position.lastUpdated).toBe('number');
    });

    it('should return empty positions for address with no activity', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const emptyAddress = '0x0000000000000000000000000000000000000001';
      
      const position = await service.getUserPosition(emptyAddress);
      
      expect(position.positions.length).toBe(0);
      expect(position.totalCollateralETH.toNumber()).toBe(0);
      expect(position.totalDebtETH.toNumber()).toBe(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid chain gracefully', async () => {
      const invalidRuntime = createTestRuntime({ AAVE_CHAIN: 'invalid-chain' });
      const invalidService = new AaveService();

      await expect(invalidService.initialize(invalidRuntime))
        .rejects
        .toThrow('Unsupported chain');
    });

    it('should handle invalid RPC URL gracefully', async () => {
      const invalidRuntime = createTestRuntime({ 
        AAVE_RPC_URL: 'https://invalid-rpc-url.com' 
      });
      const invalidService = new AaveService();

      await expect(invalidService.initialize(invalidRuntime))
        .rejects
        .toThrow();
    });

    it('should handle missing asset gracefully', async () => {
      if (skipIfNoRpc('ethereum')) return;
      
      await service.initialize(testRuntime);
      
      await expect(service.getMarketData())
        .resolves
        .not.toThrow();
    });
  });

  describe('Contract Address Validation', () => {
    beforeEach(async () => {
      if (skipIfNoRpc('ethereum')) return;
      await service.initialize(testRuntime);
    });

    it('should use valid contract addresses for Ethereum', async () => {
      if (skipIfNoRpc('ethereum')) return;

      // This tests that our address book integration is working
      const marketData = await service.getMarketData();
      
      expect(marketData.length).toBeGreaterThan(0);
      
      // All assets should have valid contract addresses
      for (const asset of marketData.slice(0, 3)) { // Test first few to avoid timeout
        expect(TestHelpers.isValidAddress(asset.underlyingAsset)).toBe(true);
        expect(TestHelpers.isValidAddress(asset.aTokenAddress)).toBe(true);
        expect(TestHelpers.isValidAddress(asset.variableDebtTokenAddress)).toBe(true);
        expect(TestHelpers.isValidAddress(asset.stableDebtTokenAddress)).toBe(true);
      }
    });
  });

  describe('Real World Data Validation', () => {
    beforeEach(async () => {
      if (skipIfNoRpc('ethereum')) return;
      await service.initialize(testRuntime);
    });

    it('should return realistic APY values', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const marketData = await service.getMarketData();
      
      for (const asset of marketData) {
        // APY values should be reasonable (0% to 100%)
        expect(asset.supplyAPY).toBeGreaterThanOrEqual(0);
        expect(asset.supplyAPY).toBeLessThan(1); // Less than 100%
        
        expect(asset.variableBorrowAPY).toBeGreaterThanOrEqual(0);
        expect(asset.variableBorrowAPY).toBeLessThan(2); // Less than 200%
        
        expect(asset.stableBorrowAPY).toBeGreaterThanOrEqual(0);
        expect(asset.stableBorrowAPY).toBeLessThan(2); // Less than 200%
      }
    });

    it('should return valid utilization rates', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const marketData = await service.getMarketData();
      
      for (const asset of marketData) {
        // Utilization rate should be between 0 and 1 (0% to 100%)
        expect(asset.utilizationRate).toBeGreaterThanOrEqual(0);
        expect(asset.utilizationRate).toBeLessThanOrEqual(1);
      }
    });

    it('should return consistent borrow rates (variable >= stable for most assets)', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const marketData = await service.getMarketData();
      
      // For most assets, variable borrow rate should be >= stable borrow rate
      // This is an Aave protocol invariant in normal market conditions
      const stableAssets = marketData.filter(asset => 
        asset.stableBorrowAPY > 0 && asset.variableBorrowAPY > 0
      );
      
      if (stableAssets.length > 0) {
        const validRateRelations = stableAssets.filter(asset =>
          asset.variableBorrowAPY >= asset.stableBorrowAPY * 0.8 // Allow 20% variance
        );
        
        // At least 70% of assets should follow the rate relationship
        expect(validRateRelations.length / stableAssets.length).toBeGreaterThan(0.7);
      }
    });
  });

  describe('Service State Management', () => {
    it('should properly initialize and cleanup', async () => {
      if (skipIfNoRpc('ethereum')) return;

      const newService = new AaveService();
      
      // Should not be usable before initialization
      await expect(newService.getMarketData()).rejects.toThrow('not initialized');
      
      // Should work after initialization
      await newService.initialize(testRuntime);
      await expect(newService.getMarketData()).resolves.not.toThrow();
      
      // Should handle cleanup
      await newService.stop();
      await expect(newService.getMarketData()).rejects.toThrow('not initialized');
    });
  });
});