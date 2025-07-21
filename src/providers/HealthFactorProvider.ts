import { Provider, IAgentRuntime, Memory } from '@elizaos/core';
import { AaveService } from '../services';
import BigNumber from 'bignumber.js';

export class HealthFactorProvider implements Provider {
    name = 'aaveHealthFactor';
    description = 'Provides detailed health factor analysis and risk assessment for Aave V3 positions';

    async get(runtime: IAgentRuntime, message: Memory): Promise<string> {
        try {
            const aaveService = runtime.getService('aave') as AaveService;
            const walletService = runtime.getService('wallet');
            
            if (!aaveService || !walletService) {
                return 'Aave services not initialized';
            }

            const userAddress = await walletService.getAddress();
            const [position, accountData] = await Promise.all([
                aaveService.getUserPosition(userAddress),
                aaveService.getUserAccountData(userAddress)
            ]);

            // Convert health factor to readable format
            const healthFactor = new BigNumber(accountData.healthFactor.toString()).dividedBy(1e18);
            const healthFactorFormatted = healthFactor.isFinite() 
                ? healthFactor.toFixed(2) 
                : '∞';

            // Calculate health factor status and risk level
            const { status, riskLevel, emoji } = this.analyzeHealthFactor(healthFactor);

            // Calculate liquidation details if at risk
            let liquidationInfo = '';
            if (healthFactor.lt(1.5) && healthFactor.isFinite()) {
                const totalCollateral = new BigNumber(accountData.totalCollateralETH.toString()).dividedBy(1e18);
                const totalDebt = new BigNumber(accountData.totalDebtETH.toString()).dividedBy(1e18);
                const liquidationThreshold = new BigNumber(accountData.currentLiquidationThreshold.toString()).dividedBy(10000);
                
                // Calculate how much collateral drop would trigger liquidation
                const collateralDropToLiquidation = totalCollateral.times(
                    healthFactor.minus(1).dividedBy(healthFactor)
                ).times(100);

                liquidationInfo = `
Liquidation Risk Analysis:
- Collateral can drop ${collateralDropToLiquidation.toFixed(1)}% before liquidation
- Liquidation occurs when health factor < 1.0
- Current liquidation threshold: ${liquidationThreshold.times(100).toFixed(1)}%`;
            }

            // Generate recommendations based on health factor
            const recommendations = this.getRecommendations(healthFactor, position);

            // Calculate safety metrics
            const ltv = new BigNumber(accountData.ltv.toString()).dividedBy(10000);
            const currentLtv = position.currentLTV;
            const ltvUtilization = ltv.gt(0) ? (currentLtv / ltv.toNumber() * 100).toFixed(1) : '0';

            return `Health Factor Analysis:

${emoji} Health Factor: ${healthFactorFormatted}
Status: ${status}
Risk Level: ${riskLevel}

Safety Metrics:
- Current LTV: ${currentLtv.toFixed(1)}% / Max LTV: ${ltv.times(100).toFixed(1)}%
- LTV Utilization: ${ltvUtilization}%
- Liquidation Threshold: ${position.liquidationThreshold.toFixed(1)}%
${liquidationInfo}

Recommendations:
${recommendations.map(r => `- ${r}`).join('\n')}

Remember: Health Factor > 1.0 prevents liquidation. Aim for > 1.5 for safety.`;

        } catch (error) {
            console.error('Error getting health factor context:', error);
            return 'Unable to fetch health factor data';
        }
    }

    private analyzeHealthFactor(healthFactor: BigNumber): {
        status: string;
        riskLevel: string;
        emoji: string;
    } {
        if (!healthFactor.isFinite()) {
            return {
                status: 'No Debt Position',
                riskLevel: 'No Risk',
                emoji: '🟢'
            };
        }

        if (healthFactor.lt(1)) {
            return {
                status: 'LIQUIDATABLE',
                riskLevel: 'EXTREME - Liquidation Active',
                emoji: '🔴🚨'
            };
        } else if (healthFactor.lt(1.1)) {
            return {
                status: 'CRITICAL',
                riskLevel: 'Very High - Immediate Action Required',
                emoji: '🔴'
            };
        } else if (healthFactor.lt(1.5)) {
            return {
                status: 'RISKY',
                riskLevel: 'High - Monitor Closely',
                emoji: '🟡'
            };
        } else if (healthFactor.lt(2)) {
            return {
                status: 'MODERATE',
                riskLevel: 'Medium - Acceptable Risk',
                emoji: '🟢'
            };
        } else if (healthFactor.lt(3)) {
            return {
                status: 'SAFE',
                riskLevel: 'Low',
                emoji: '🟢'
            };
        } else {
            return {
                status: 'VERY SAFE',
                riskLevel: 'Very Low',
                emoji: '🟢'
            };
        }
    }

    private getRecommendations(healthFactor: BigNumber, position: any): string[] {
        const recommendations: string[] = [];

        if (!healthFactor.isFinite()) {
            recommendations.push('Consider borrowing against your collateral to put it to work');
            recommendations.push('Your position is risk-free with no debt');
            return recommendations;
        }

        if (healthFactor.lt(1.1)) {
            recommendations.push('🚨 URGENT: Add collateral immediately to avoid liquidation');
            recommendations.push('🚨 URGENT: Repay debt to improve health factor');
            recommendations.push('Consider using a flash loan to restructure your position');
        } else if (healthFactor.lt(1.5)) {
            recommendations.push('Add more collateral to create a safety buffer');
            recommendations.push('Consider repaying some debt to improve your position');
            recommendations.push('Monitor market prices closely for your assets');
            recommendations.push('Set up alerts for health factor changes');
        } else if (healthFactor.lt(2)) {
            recommendations.push('Your position is relatively safe but monitor regularly');
            recommendations.push('Consider your risk tolerance before borrowing more');
        } else {
            recommendations.push('Your position is very safe');
            recommendations.push('You have room to borrow more if needed');
            
            if (position.eModeEnabled) {
                recommendations.push('eMode is maximizing your capital efficiency');
            } else if (this.canBenefitFromEMode(position)) {
                recommendations.push('Consider enabling eMode for better capital efficiency');
            }
        }

        // Add collateral-specific recommendations
        const nonCollateralSupplies = position.supplies.filter((s: any) => !s.isCollateral);
        if (nonCollateralSupplies.length > 0) {
            recommendations.push(`Enable collateral on ${nonCollateralSupplies.map((s: any) => s.symbol).join(', ')} for more borrowing power`);
        }

        return recommendations;
    }

    private canBenefitFromEMode(position: any): boolean {
        const allAssets = [
            ...position.supplies.map((s: any) => s.symbol),
            ...position.borrows.map((b: any) => b.symbol)
        ];

        // Check for stablecoin positions
        const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX'];
        const hasOnlyStables = allAssets.every(asset => stablecoins.includes(asset));

        // Check for ETH positions
        const ethAssets = ['ETH', 'WETH', 'stETH', 'wstETH'];
        const hasOnlyEth = allAssets.every(asset => ethAssets.includes(asset));

        return (hasOnlyStables || hasOnlyEth) && !position.eModeEnabled;
    }
}