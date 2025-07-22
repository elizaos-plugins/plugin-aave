import { Provider, IAgentRuntime, Memory, elizaLogger, State, ProviderResult } from '@elizaos/core';
import { AaveService } from '../services/aave-service.js';
import { MarketData } from '../types/index.js';
import BigNumber from 'bignumber.js';

/**
 * Provider for Aave V3 market data and lending rates
 * Supplies current market conditions to inform user decisions
 */
export const marketDataProvider: Provider = {
  name: 'AAVE_MARKET_DATA',
  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      elizaLogger.info('Fetching Aave V3 market data...');

      // Get Aave service
      const aaveService = runtime.getService<AaveService>('aave');
      if (!aaveService) {
        return { text: 'Aave service not available - cannot fetch market data.' };
      }

      // Fetch market data
      const marketData: MarketData[] = await aaveService.getMarketData();

      if (!marketData || marketData.length === 0) {
        return { text: 'No market data available for Aave V3 at this time.' };
      }

      // Filter for major assets and sort by total supply
      const majorAssets = marketData
        .filter(data => ['USDC', 'USDT', 'DAI', 'WETH', 'ETH', 'WBTC', 'BTC'].includes(data.asset))
        .sort((a, b) => {
          const comparison = b.totalSupply.comparedTo(a.totalSupply);
          return comparison === null ? 0 : comparison;
        })
        .slice(0, 8); // Top 8 assets

      if (majorAssets.length === 0) {
        return { text: 'Market data not available for major assets.' };
      }

      // Format market data
      let marketSummary = `📊 **Aave V3 Market Overview** (Ethereum)\n\n`;

      // Add market highlights
      const totalLiquidity = majorAssets.reduce(
        (sum, asset) => sum.plus(asset.totalSupply),
        new BigNumber(0)
      );

      const avgSupplyAPY = majorAssets.reduce(
        (sum, asset) => sum + asset.supplyAPY,
        0
      ) / majorAssets.length;

      marketSummary += `💰 **Total Liquidity**: $${formatLargeNumber(totalLiquidity)} across major assets\n`;
      marketSummary += `📈 **Avg Supply APY**: ${avgSupplyAPY.toFixed(2)}%\n\n`;

      // Asset details table
      marketSummary += `**🏦 Lending Rates:**\n`;
      marketSummary += `\`\`\`\n`;
      marketSummary += `Asset   Supply APY  Borrow APY  Utilization\n`;
      marketSummary += `────────────────────────────────────────\n`;

      for (const asset of majorAssets) {
        const assetSymbol = asset.asset.padEnd(6);
        const supplyRate = `${asset.supplyAPY.toFixed(2)}%`.padStart(9);
        const borrowRate = `${asset.variableBorrowAPY.toFixed(2)}%`.padStart(9);
        const utilization = `${(asset.utilizationRate * 100).toFixed(1)}%`.padStart(9);
        
        marketSummary += `${assetSymbol}  ${supplyRate}  ${borrowRate}   ${utilization}\n`;
      }
      marketSummary += `\`\`\`\n\n`;

      // Market insights
      const highYieldAssets = majorAssets
        .filter(asset => asset.supplyAPY > 3.0)
        .sort((a, b) => b.supplyAPY - a.supplyAPY);

      const lowBorrowCostAssets = majorAssets
        .filter(asset => asset.variableBorrowAPY < 5.0)
        .sort((a, b) => a.variableBorrowAPY - b.variableBorrowAPY);

      if (highYieldAssets.length > 0) {
        marketSummary += `🌟 **High Yield Opportunities:**\n`;
        highYieldAssets.slice(0, 3).forEach(asset => {
          marketSummary += `• ${asset.asset}: ${asset.supplyAPY.toFixed(2)}% APY\n`;
        });
        marketSummary += `\n`;
      }

      if (lowBorrowCostAssets.length > 0) {
        marketSummary += `💸 **Low Borrow Costs:**\n`;
        lowBorrowCostAssets.slice(0, 3).forEach(asset => {
          marketSummary += `• ${asset.asset}: ${asset.variableBorrowAPY.toFixed(2)}% APY\n`;
        });
        marketSummary += `\n`;
      }

      // Risk warnings
      const highUtilAssets = majorAssets.filter(asset => asset.utilizationRate > 0.8);
      if (highUtilAssets.length > 0) {
        marketSummary += `⚠️  **High Utilization Warning:**\n`;
        highUtilAssets.forEach(asset => {
          marketSummary += `• ${asset.asset}: ${(asset.utilizationRate * 100).toFixed(1)}% utilized\n`;
        });
        marketSummary += `Higher utilization may impact liquidity and rates.\n\n`;
      }

      marketSummary += `📅 *Data updated: ${new Date().toLocaleString()}*`;

      return { text: marketSummary };

    } catch (error) {
      elizaLogger.error('Failed to get market data:', error);
      return { text: 'Unable to fetch current market data from Aave V3. Please try again later.' };
    }
  }
};

/**
 * Format large numbers in a human-readable way
 */
function formatLargeNumber(num: BigNumber): string {
  if (num.isGreaterThanOrEqualTo(1e9)) {
    return `${num.dividedBy(1e9).toFixed(1)}B`;
  } else if (num.isGreaterThanOrEqualTo(1e6)) {
    return `${num.dividedBy(1e6).toFixed(1)}M`;
  } else if (num.isGreaterThanOrEqualTo(1e3)) {
    return `${num.dividedBy(1e3).toFixed(1)}K`;
  }
  return num.toFixed(2);
}