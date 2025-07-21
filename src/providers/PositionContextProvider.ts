import { Provider, IAgentRuntime, Memory } from '@elizaos/core';
import { AaveService } from '../services';
import BigNumber from 'bignumber.js';

export class PositionContextProvider implements Provider {
    name = 'aavePosition';
    description = 'Provides current Aave V3 position context including supplies, borrows, and health metrics';

    async get(runtime: IAgentRuntime, message: Memory): Promise<string> {
        try {
            const aaveService = runtime.getService('aave') as AaveService;
            const walletService = runtime.getService('wallet');
            
            if (!aaveService || !walletService) {
                return 'Aave services not initialized';
            }

            const userAddress = await walletService.getAddress();
            const position = await aaveService.getUserPosition(userAddress);

            // Format supplies
            let supplyContext = '';
            if (position.supplies.length > 0) {
                supplyContext = 'Supplied assets:\n';
                for (const supply of position.supplies) {
                    const value = supply.balance.toFixed(4);
                    const apy = supply.apy.toFixed(2);
                    const collateral = supply.isCollateral ? '✓ Collateral' : '✗ Not Collateral';
                    supplyContext += `- ${value} ${supply.symbol} (APY: ${apy}%) ${collateral}\n`;
                }
            } else {
                supplyContext = 'No assets supplied\n';
            }

            // Format borrows
            let borrowContext = '';
            if (position.borrows.length > 0) {
                borrowContext = 'Borrowed assets:\n';
                for (const borrow of position.borrows) {
                    const value = borrow.balance.toFixed(4);
                    const rate = borrow.interestRateMode === 1 
                        ? `Stable: ${borrow.stableRate?.toFixed(2)}%` 
                        : `Variable: ${borrow.variableRate?.toFixed(2)}%`;
                    borrowContext += `- ${value} ${borrow.symbol} (${rate})\n`;
                }
            } else {
                borrowContext = 'No active borrows\n';
            }

            // Format position metrics
            const totalCollateral = new BigNumber(position.totalCollateralETH.toString())
                .dividedBy(1e18)
                .toFixed(2);
            const totalDebt = new BigNumber(position.totalDebtETH.toString())
                .dividedBy(1e18)
                .toFixed(2);
            const availableBorrows = new BigNumber(position.availableBorrowsETH.toString())
                .dividedBy(1e18)
                .toFixed(2);

            // Health factor status
            const healthFactorStatus = this.getHealthFactorStatus(position.healthFactor);
            
            // eMode status
            const eModeStatus = position.eModeEnabled 
                ? `Enabled (Category ${position.eModeCategory})`
                : 'Disabled';

            return `Current Aave V3 Position:

${supplyContext}
${borrowContext}
Position Metrics:
- Total Collateral: $${totalCollateral}
- Total Debt: $${totalDebt}
- Available to Borrow: $${availableBorrows}
- Health Factor: ${position.healthFactor.toFixed(2)} ${healthFactorStatus}
- Current LTV: ${position.currentLTV.toFixed(1)}%
- Liquidation Threshold: ${position.liquidationThreshold.toFixed(1)}%
- Efficiency Mode: ${eModeStatus}`;

        } catch (error) {
            console.error('Error getting Aave position context:', error);
            return 'Unable to fetch Aave position data';
        }
    }

    private getHealthFactorStatus(healthFactor: number): string {
        if (healthFactor < 1.1) return '🔴 CRITICAL - Liquidation Risk!';
        if (healthFactor < 1.5) return '🟡 RISKY - Monitor Closely';
        if (healthFactor < 2) return '🟢 MODERATE';
        if (healthFactor < 3) return '🟢 SAFE';
        return '🟢 VERY SAFE';
    }
}