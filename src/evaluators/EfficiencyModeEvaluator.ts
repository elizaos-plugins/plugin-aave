import { Evaluator, IAgentRuntime, Memory } from '@elizaos/core';
import { AaveService } from '../services';
import BigNumber from 'bignumber.js';

export class EfficiencyModeEvaluator implements Evaluator {
    name = 'aaveEfficiencyMode';
    description = 'Evaluates the effectiveness of efficiency mode changes and suggests optimizations';

    async evaluate(runtime: IAgentRuntime, message: Memory): Promise<number> {
        try {
            // Check if the recent interaction involved eMode changes
            const text = message.content.text?.toLowerCase() || '';
            const action = message.content.action;
            
            if (!text.includes('emode') && !text.includes('efficiency mode') && action !== 'AAVE_EMODE') {
                return 0; // Not relevant for eMode evaluation
            }

            const aaveService = runtime.getService('aave') as AaveService;
            const walletService = runtime.getService('wallet');
            
            if (!aaveService || !walletService) {
                return 0;
            }

            const userAddress = await walletService.getAddress();
            const position = await aaveService.getUserPosition(userAddress);

            // Evaluate current eMode effectiveness
            const eModeScore = await this.evaluateEModeEffectiveness(position, aaveService);

            // Store insights in memory for agent learning
            if (eModeScore > 0.7) {
                await this.storeEModeInsight(runtime, position, eModeScore, 'positive');
            } else if (eModeScore < 0.3 && position.eModeEnabled) {
                await this.storeEModeInsight(runtime, position, eModeScore, 'negative');
            }

            return eModeScore;
        } catch (error) {
            console.error('Error evaluating efficiency mode:', error);
            return 0;
        }
    }

    private async evaluateEModeEffectiveness(position: any, aaveService: AaveService): Promise<number> {
        let score = 0;
        
        // Get all assets in the position
        const allAssets = [
            ...position.supplies.map((s: any) => ({ symbol: s.symbol, type: 'supply' })),
            ...position.borrows.map((b: any) => ({ symbol: b.symbol, type: 'borrow' }))
        ];

        if (allAssets.length === 0) {
            return 0; // No position to evaluate
        }

        // Check asset compatibility for eMode
        const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD'];
        const ethAssets = ['ETH', 'WETH', 'stETH', 'wstETH', 'rETH'];

        const stablecoinCount = allAssets.filter(a => stablecoins.includes(a.symbol)).length;
        const ethCount = allAssets.filter(a => ethAssets.includes(a.symbol)).length;
        const totalAssets = allAssets.length;

        // Calculate compatibility scores
        const stablecoinCompatibility = stablecoinCount / totalAssets;
        const ethCompatibility = ethCount / totalAssets;

        // Determine optimal eMode category
        let optimalCategory = 0;
        let maxCompatibility = 0;

        if (stablecoinCompatibility === 1) {
            optimalCategory = 1;
            maxCompatibility = 1;
        } else if (ethCompatibility === 1) {
            optimalCategory = 2;
            maxCompatibility = 1;
        }

        // Base score on compatibility
        score = maxCompatibility * 0.5;

        // Check if current eMode matches optimal
        if (position.eModeEnabled && position.eModeCategory === optimalCategory) {
            score += 0.3;
        } else if (!position.eModeEnabled && optimalCategory === 0) {
            score += 0.2; // Correctly not using eMode when not beneficial
        }

        // Evaluate LTV utilization efficiency
        if (position.eModeEnabled && position.borrows.length > 0) {
            // Check if user is taking advantage of higher LTV
            const ltvUtilization = position.currentLTV / 100; // Convert to decimal
            
            if (position.eModeCategory === 1 && ltvUtilization > 0.8) {
                score += 0.2; // Good utilization of stablecoin eMode
            } else if (position.eModeCategory === 2 && ltvUtilization > 0.7) {
                score += 0.2; // Good utilization of ETH eMode
            }
        }

        return Math.min(score, 1);
    }

    private async storeEModeInsight(
        runtime: IAgentRuntime,
        position: any,
        score: number,
        sentiment: 'positive' | 'negative'
    ): Promise<void> {
        try {
            const insight = {
                type: 'emode_effectiveness',
                timestamp: Date.now(),
                score,
                sentiment,
                data: {
                    eModeEnabled: position.eModeEnabled,
                    eModeCategory: position.eModeCategory,
                    currentLTV: position.currentLTV,
                    assetTypes: this.categorizeAssets(position),
                    recommendation: this.generateRecommendation(position, score)
                }
            };

            // Store insight for future reference
            await runtime.store.set(`emode_insight_${Date.now()}`, JSON.stringify(insight));

            // Update agent's understanding
            if (sentiment === 'positive') {
                console.log(`✅ eMode strategy effective (score: ${score.toFixed(2)})`);
            } else {
                console.log(`⚠️ eMode strategy suboptimal (score: ${score.toFixed(2)})`);
            }
        } catch (error) {
            console.error('Failed to store eMode insight:', error);
        }
    }

    private categorizeAssets(position: any): { stablecoins: string[], ethAssets: string[], other: string[] } {
        const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD'];
        const ethAssets = ['ETH', 'WETH', 'stETH', 'wstETH', 'rETH'];
        
        const allAssets = [
            ...position.supplies.map((s: any) => s.symbol),
            ...position.borrows.map((b: any) => b.symbol)
        ];

        return {
            stablecoins: allAssets.filter(a => stablecoins.includes(a)),
            ethAssets: allAssets.filter(a => ethAssets.includes(a)),
            other: allAssets.filter(a => !stablecoins.includes(a) && !ethAssets.includes(a))
        };
    }

    private generateRecommendation(position: any, score: number): string {
        const assets = this.categorizeAssets(position);
        
        if (score > 0.8) {
            return 'Current eMode strategy is optimal';
        }

        if (assets.other.length > 0) {
            return `Consider moving ${assets.other.join(', ')} positions to compatible assets for eMode benefits`;
        }

        if (assets.stablecoins.length === position.supplies.length + position.borrows.length && !position.eModeEnabled) {
            return 'Enable stablecoin eMode (category 1) for up to 97% LTV';
        }

        if (assets.ethAssets.length === position.supplies.length + position.borrows.length && !position.eModeEnabled) {
            return 'Enable ETH eMode (category 2) for up to 90% LTV';
        }

        if (position.eModeEnabled && position.currentLTV < 50) {
            return 'Consider borrowing more to utilize eMode benefits';
        }

        return 'Current strategy is acceptable';
    }
}