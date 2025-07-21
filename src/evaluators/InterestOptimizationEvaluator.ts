import { Evaluator, IAgentRuntime, Memory } from '@elizaos/core';
import { AaveService } from '../services';
import BigNumber from 'bignumber.js';

export class InterestOptimizationEvaluator implements Evaluator {
    name = 'aaveInterestOptimization';
    description = 'Evaluates interest rate decisions and suggests rate optimizations';

    async evaluate(runtime: IAgentRuntime, message: Memory): Promise<number> {
        try {
            // Check if the recent interaction involved rate-related actions
            const text = message.content.text?.toLowerCase() || '';
            const action = message.content.action;
            
            const isRateRelated = text.includes('rate') || 
                                 text.includes('interest') || 
                                 text.includes('borrow') ||
                                 text.includes('supply') ||
                                 action === 'AAVE_RATE_SWITCH' ||
                                 action === 'AAVE_BORROW';
            
            if (!isRateRelated) {
                return 0; // Not relevant for interest optimization
            }

            const aaveService = runtime.getService('aave') as AaveService;
            const walletService = runtime.getService('wallet');
            
            if (!aaveService || !walletService) {
                return 0;
            }

            const userAddress = await walletService.getAddress();
            const position = await aaveService.getUserPosition(userAddress);

            // Evaluate interest optimization
            const optimizationScore = await this.evaluateInterestOptimization(position, aaveService);

            // Store insights for agent learning
            if (optimizationScore > 0.7 || optimizationScore < 0.3) {
                await this.storeInterestInsight(runtime, position, optimizationScore);
            }

            return optimizationScore;
        } catch (error) {
            console.error('Error evaluating interest optimization:', error);
            return 0;
        }
    }

    private async evaluateInterestOptimization(position: any, aaveService: AaveService): Promise<number> {
        let totalScore = 0;
        let weights = 0;

        // Evaluate supply side optimization
        if (position.supplies.length > 0) {
            const supplyScore = await this.evaluateSupplyRates(position.supplies);
            totalScore += supplyScore * 0.4;
            weights += 0.4;
        }

        // Evaluate borrow side optimization
        if (position.borrows.length > 0) {
            const borrowScore = await this.evaluateBorrowRates(position.borrows);
            totalScore += borrowScore * 0.6; // Borrowing costs typically have more impact
            weights += 0.6;
        }

        // If no positions, return neutral score
        if (weights === 0) {
            return 0.5;
        }

        return totalScore / weights;
    }

    private async evaluateSupplyRates(supplies: any[]): Promise<number> {
        if (supplies.length === 0) return 0.5;

        let totalValue = new BigNumber(0);
        let weightedAPY = new BigNumber(0);

        // Calculate weighted average APY
        for (const supply of supplies) {
            const value = supply.balance;
            totalValue = totalValue.plus(value);
            weightedAPY = weightedAPY.plus(value.times(supply.apy));
        }

        if (totalValue.eq(0)) return 0.5;

        const averageAPY = weightedAPY.dividedBy(totalValue).toNumber();

        // Score based on APY thresholds
        // These thresholds should be adjusted based on market conditions
        if (averageAPY >= 5) return 1.0;      // Excellent
        if (averageAPY >= 3) return 0.8;      // Good
        if (averageAPY >= 2) return 0.6;      // Acceptable
        if (averageAPY >= 1) return 0.4;      // Below average
        return 0.2;                            // Poor
    }

    private async evaluateBorrowRates(borrows: any[]): Promise<number> {
        if (borrows.length === 0) return 0.5;

        let totalDebt = new BigNumber(0);
        let weightedRate = new BigNumber(0);
        let stableRateCount = 0;
        let variableRateCount = 0;

        // Calculate weighted average rate and rate mode distribution
        for (const borrow of borrows) {
            const debt = borrow.balance;
            totalDebt = totalDebt.plus(debt);
            
            const rate = borrow.interestRateMode === 1 
                ? borrow.stableRate 
                : borrow.variableRate;
            
            weightedRate = weightedRate.plus(debt.times(rate));

            if (borrow.interestRateMode === 1) {
                stableRateCount++;
            } else {
                variableRateCount++;
            }
        }

        if (totalDebt.eq(0)) return 0.5;

        const averageRate = weightedRate.dividedBy(totalDebt).toNumber();

        // Base score on rate levels (inverse of supply - lower is better)
        let rateScore = 0;
        if (averageRate <= 3) rateScore = 1.0;      // Excellent
        else if (averageRate <= 5) rateScore = 0.8; // Good
        else if (averageRate <= 7) rateScore = 0.6; // Acceptable
        else if (averageRate <= 10) rateScore = 0.4; // High
        else rateScore = 0.2;                        // Very high

        // Adjust for rate mode strategy
        const rateModeScore = this.evaluateRateModeStrategy(
            stableRateCount,
            variableRateCount,
            borrows
        );

        // Combined score (70% rate level, 30% rate mode strategy)
        return rateScore * 0.7 + rateModeScore * 0.3;
    }

    private evaluateRateModeStrategy(
        stableCount: number,
        variableCount: number,
        borrows: any[]
    ): number {
        // In general, variable rates are often lower in stable markets
        // But stable rates provide predictability

        // If all borrows are in one mode, that's a clear strategy
        if (stableCount === 0 || variableCount === 0) {
            return 0.8; // Consistent strategy
        }

        // Mixed strategy might indicate optimization attempts
        // Check if higher value borrows are in lower rate mode
        let optimizedCount = 0;
        for (const borrow of borrows) {
            const isStable = borrow.interestRateMode === 1;
            const stableRate = borrow.stableRate || 0;
            const variableRate = borrow.variableRate || 0;
            
            // Check if the chosen mode has the lower rate
            if ((isStable && stableRate < variableRate) || 
                (!isStable && variableRate < stableRate)) {
                optimizedCount++;
            }
        }

        return optimizedCount / borrows.length;
    }

    private async storeInterestInsight(
        runtime: IAgentRuntime,
        position: any,
        score: number
    ): Promise<void> {
        try {
            const insight = {
                type: 'interest_optimization',
                timestamp: Date.now(),
                score,
                data: {
                    supplies: position.supplies.map((s: any) => ({
                        asset: s.symbol,
                        apy: s.apy,
                        balance: s.balance.toString()
                    })),
                    borrows: position.borrows.map((b: any) => ({
                        asset: b.symbol,
                        rateMode: b.interestRateMode === 1 ? 'stable' : 'variable',
                        rate: b.interestRateMode === 1 ? b.stableRate : b.variableRate,
                        balance: b.balance.toString()
                    })),
                    recommendation: this.generateOptimizationRecommendation(position, score)
                }
            };

            // Store insight for future reference
            await runtime.store.set(`interest_insight_${Date.now()}`, JSON.stringify(insight));

            // Log optimization status
            if (score > 0.7) {
                console.log(`✅ Interest rates well optimized (score: ${score.toFixed(2)})`);
            } else if (score < 0.3) {
                console.log(`⚠️ Interest rates could be optimized (score: ${score.toFixed(2)})`);
            }
        } catch (error) {
            console.error('Failed to store interest insight:', error);
        }
    }

    private generateOptimizationRecommendation(position: any, score: number): string {
        const recommendations: string[] = [];

        if (score > 0.8) {
            return 'Interest rates are well optimized';
        }

        // Check supply optimization
        if (position.supplies.length > 0) {
            const lowAPYSupplies = position.supplies.filter((s: any) => s.apy < 2);
            if (lowAPYSupplies.length > 0) {
                recommendations.push(
                    `Consider moving ${lowAPYSupplies.map((s: any) => s.symbol).join(', ')} to higher yield opportunities`
                );
            }
        }

        // Check borrow optimization
        if (position.borrows.length > 0) {
            for (const borrow of position.borrows) {
                const stableRate = borrow.stableRate || 0;
                const variableRate = borrow.variableRate || 0;
                
                if (borrow.interestRateMode === 1 && variableRate < stableRate * 0.9) {
                    recommendations.push(
                        `Switch ${borrow.symbol} from stable (${stableRate.toFixed(2)}%) to variable (${variableRate.toFixed(2)}%) rate`
                    );
                } else if (borrow.interestRateMode === 2 && stableRate < variableRate * 0.9) {
                    recommendations.push(
                        `Switch ${borrow.symbol} from variable (${variableRate.toFixed(2)}%) to stable (${stableRate.toFixed(2)}%) rate`
                    );
                }
            }
        }

        // General recommendations
        if (position.borrows.length > 0 && position.healthFactor > 3) {
            recommendations.push('Consider borrowing more to leverage your position at these rates');
        }

        return recommendations.length > 0 
            ? recommendations.join('; ')
            : 'Current interest rate strategy is acceptable';
    }
}