import { Provider, IAgentRuntime, Memory, elizaLogger, State, ProviderResult } from '@elizaos/core';
import { AaveService } from '../services/aave-service.js';
import { UserPosition, SimplePosition } from '../types/index.js';
import BigNumber from 'bignumber.js';

/**
 * Provider for user's Aave V3 position data
 * Shows current supply, borrow positions, and health metrics
 */
export const positionProvider: Provider = {
  name: 'AAVE_POSITION',
  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      elizaLogger.info('Fetching user Aave V3 position...');

      // Get user address from runtime settings
      const userAddress = runtime.getSetting('WALLET_ADDRESS');
      if (!userAddress) {
        return { text: 'Wallet address not configured. Please set WALLET_ADDRESS to view your position.' };
      }

      // Get Aave service
      const aaveService = runtime.getService<AaveService>('aave');
      if (!aaveService) {
        return { text: 'Aave service not available - cannot fetch position data.' };
      }

      // Fetch user position
      const position: UserPosition = await aaveService.getUserPosition(userAddress);

      if (!position) {
        return { text: 'Unable to fetch your Aave V3 position at this time.' };
      }

      // Check if user has any positions
      const hasSupplyPositions = position.positions.some(p => p.suppliedAmount.isGreaterThan(0));
      const hasBorrowPositions = position.positions.some(p => 
        p.borrowedAmountVariable.isGreaterThan(0) || p.borrowedAmountStable.isGreaterThan(0)
      );

      if (!hasSupplyPositions && !hasBorrowPositions) {
        return { text: `💼 **Your Aave V3 Position**

🏦 **No active positions found**

You don't have any supplies or borrows on Aave V3 yet.
Ready to start your DeFi journey? Try:
• "supply 1000 USDC" to start earning yield
• Check current "market rates" for opportunities` };
      }

      // Format position summary
      let positionSummary = `💼 **Your Aave V3 Position**\n\n`;
      
      // Address (shortened)
      const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
      positionSummary += `👤 **Address**: ${shortAddress}\n\n`;

      // Overall health metrics
      positionSummary += `🏥 **Health Overview:**\n`;
      positionSummary += `• Health Factor: ${position.healthFactor.isFinite() ? position.healthFactor.toFixed(3) : '∞'}\n`;
      positionSummary += `• Total Collateral: $${position.totalCollateralETH.toFixed(2)}\n`;
      positionSummary += `• Total Debt: $${position.totalDebtETH.toFixed(2)}\n`;
      
      if (position.totalDebtETH.isGreaterThan(0)) {
        positionSummary += `• Available to Borrow: $${position.availableBorrowsETH.toFixed(2)}\n`;
        positionSummary += `• LTV Ratio: ${(position.ltv * 100).toFixed(1)}%\n`;
      }
      positionSummary += `\n`;

      // Health factor warning
      if (position.healthFactor.isFinite() && position.healthFactor.isLessThan(1.5)) {
        positionSummary += `⚠️  **HEALTH FACTOR WARNING**\n`;
        if (position.healthFactor.isLessThan(1.1)) {
          positionSummary += `🚨 **CRITICAL**: Your position is near liquidation!\n`;
        } else {
          positionSummary += `⚡ **CAUTION**: Consider adding collateral or reducing debt\n`;
        }
        positionSummary += `\n`;
      }

      // Supply positions
      const supplies = position.positions.filter(p => p.suppliedAmount.isGreaterThan(0));
      if (supplies.length > 0) {
        positionSummary += `💰 **Supply Positions:**\n`;
        positionSummary += `\`\`\`\n`;
        positionSummary += `Asset    Amount     APY    Collateral\n`;
        positionSummary += `────────────────────────────────\n`;
        
        for (const supply of supplies) {
          const asset = supply.asset.padEnd(6);
          const amount = formatNumber(supply.suppliedAmount).padStart(10);
          const apy = `${supply.supplyAPY.toFixed(2)}%`.padStart(6);
          const collateral = (supply.isCollateral ? '✅' : '❌').padStart(10);
          
          positionSummary += `${asset}  ${amount}  ${apy}  ${collateral}\n`;
        }
        positionSummary += `\`\`\`\n\n`;
      }

      // Borrow positions
      const borrows = position.positions.filter(p => 
        p.borrowedAmountVariable.isGreaterThan(0) || p.borrowedAmountStable.isGreaterThan(0)
      );
      
      if (borrows.length > 0) {
        positionSummary += `💸 **Borrow Positions:**\n`;
        positionSummary += `\`\`\`\n`;
        positionSummary += `Asset    Amount     APY    Type\n`;
        positionSummary += `──────────────────────────────\n`;
        
        for (const borrow of borrows) {
          // Variable debt
          if (borrow.borrowedAmountVariable.isGreaterThan(0)) {
            const asset = borrow.asset.padEnd(6);
            const amount = formatNumber(borrow.borrowedAmountVariable).padStart(10);
            const apy = `${borrow.variableBorrowAPY.toFixed(2)}%`.padStart(6);
            const type = 'Variable'.padStart(8);
            
            positionSummary += `${asset}  ${amount}  ${apy}  ${type}\n`;
          }
          
          // Stable debt
          if (borrow.borrowedAmountStable.isGreaterThan(0)) {
            const asset = borrow.asset.padEnd(6);
            const amount = formatNumber(borrow.borrowedAmountStable).padStart(10);
            const apy = `${borrow.stableBorrowAPY.toFixed(2)}%`.padStart(6);
            const type = 'Stable'.padStart(8);
            
            positionSummary += `${asset}  ${amount}  ${apy}  ${type}\n`;
          }
        }
        positionSummary += `\`\`\`\n\n`;
      }

      // Position insights and recommendations
      positionSummary += `💡 **Position Insights:**\n`;
      
      if (hasSupplyPositions && !hasBorrowPositions) {
        positionSummary += `• You're earning yield as a pure lender 🏦\n`;
        positionSummary += `• Consider borrowing stablecoins for leverage or other opportunities\n`;
      } else if (hasBorrowPositions) {
        if (position.healthFactor.isGreaterThan(2.0)) {
          positionSummary += `• Healthy leveraged position 💪\n`;
          positionSummary += `• You have room to borrow more if needed\n`;
        } else if (position.healthFactor.isGreaterThan(1.5)) {
          positionSummary += `• Moderate risk leveraged position ⚖️\n`;
          positionSummary += `• Monitor health factor closely\n`;
        }
      }

      // Non-collateral assets warning
      const nonCollateralAssets = supplies.filter(s => !s.isCollateral);
      if (nonCollateralAssets.length > 0) {
        positionSummary += `• Some assets not used as collateral - enable for more borrowing power\n`;
      }

      positionSummary += `\n📅 *Position updated: ${new Date().toLocaleString()}*`;

      return { text: positionSummary };

    } catch (error) {
      elizaLogger.error('Failed to get user position:', error);
      return { text: 'Unable to fetch your current position from Aave V3. Please try again later.' };
    }
  }
};

/**
 * Format numbers in a compact, readable way
 */
function formatNumber(num: BigNumber): string {
  if (num.isGreaterThanOrEqualTo(1e6)) {
    return `${num.dividedBy(1e6).toFixed(2)}M`;
  } else if (num.isGreaterThanOrEqualTo(1e3)) {
    return `${num.dividedBy(1e3).toFixed(1)}K`;
  } else if (num.isGreaterThanOrEqualTo(1)) {
    return num.toFixed(2);
  } else {
    return num.toFixed(4);
  }
}