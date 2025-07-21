import { 
    Action, 
    IAgentRuntime, 
    Memory, 
    State, 
    HandlerCallback,
    composeContext,
    generateObject,
    ModelClass
} from '@elizaos/core';
import { z } from 'zod';
import BigNumber from 'bignumber.js';
import { AaveService, WalletService } from '../services';
import { CollateralManagementParams } from '../types';

const collateralTemplate = `You are an AI assistant helping users manage collateral settings on Aave V3 lending protocol on Base L2.

Recent conversation:
{{recentMessages}}

User's request: {{currentMessage}}

Extract the collateral management parameters from the user's request:
- Asset: The supplied token to manage collateral for (e.g., USDC, ETH, DAI)
- Enable: true to enable as collateral, false to disable

Note: Enabling collateral allows borrowing against the asset but exposes it to liquidation risk.

Respond with the extracted parameters in JSON format.`;

const collateralResponseTemplate = `Based on the collateral management operation:

{{#if success}}
✅ Successfully {{#if enabled}}enabled{{else}}disabled{{/if}} {{asset}} as collateral!

Transaction hash: {{transactionHash}}

Impact on your position:
- Health factor: {{healthFactorBefore}} → {{healthFactorAfter}} {{healthFactorChange}}
- Available to borrow: {{borrowsChange}} {{#if borrowsIncreased}}📈{{else}}📉{{/if}}

{{#if enabled}}
Your {{asset}} can now be used as collateral for borrowing.
⚠️ Note: This asset is now subject to liquidation if your health factor drops below 1.0.
{{else}}
Your {{asset}} is no longer used as collateral.
✅ This asset is now protected from liquidation.
{{/if}}

{{#if healthWarning}}
⚠️ Warning: Your health factor is {{healthFactorAfter}}. Monitor your position carefully.
{{/if}}
{{else}}
❌ Collateral management operation failed: {{error}}

{{#if suggestions}}
Suggestions:
{{#each suggestions}}
- {{this}}
{{/each}}
{{/if}}
{{/if}}`;

export class CollateralManagementAction implements Action {
    name = 'AAVE_COLLATERAL_MANAGEMENT';
    description = 'Enable or disable assets as collateral on Aave V3';
    
    validate(runtime: IAgentRuntime, message: Memory): boolean {
        const text = message.content.text.toLowerCase();
        return (text.includes('collateral') || text.includes('enable') || text.includes('disable')) && 
               (text.includes('aave') || text.includes('as collateral'));
    }

    async handler(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> {
        try {
            // Initialize services
            const aaveService = runtime.getService('aave') as AaveService;
            const walletService = runtime.getService('wallet') as WalletService;
            
            if (!aaveService || !walletService) {
                throw new Error('Required services not found');
            }

            // Compose context for parameter extraction
            const context = composeContext({
                state,
                template: collateralTemplate,
                currentMessage: message.content.text,
                recentMessages: state?.recentMessagesStr || ''
            });

            // Extract parameters using AI
            const paramsSchema = z.object({
                asset: z.string().describe('The supplied token symbol'),
                enable: z.boolean().describe('True to enable as collateral, false to disable')
            });

            const extractedParams = await generateObject({
                runtime,
                context,
                schema: paramsSchema,
                modelClass: ModelClass.LARGE
            });

            const params: CollateralManagementParams = {
                asset: extractedParams.data.asset.toUpperCase(),
                enable: extractedParams.data.enable
            };

            // Get user address
            const userAddress = await walletService.getAddress();

            // Get current position to verify supply exists
            const position = await aaveService.getUserPosition(userAddress);
            const supplyPosition = position.supplies.find(
                s => s.asset.toUpperCase() === params.asset
            );

            if (!supplyPosition) {
                throw new Error(`No active ${params.asset} supply position found`);
            }

            // Check if already in desired state
            if (supplyPosition.isCollateral === params.enable) {
                throw new Error(`${params.asset} is already ${params.enable ? 'enabled' : 'disabled'} as collateral`);
            }

            // If disabling collateral with active borrows, check health factor impact
            if (!params.enable && position.borrows.length > 0) {
                const currentHealthFactor = position.healthFactor;
                if (currentHealthFactor < 2.0) {
                    throw new Error(`Cannot disable collateral with health factor ${currentHealthFactor.toFixed(2)}. Improve your position first.`);
                }
            }

            // Execute collateral change
            const result = await aaveService.setUserUseReserveAsCollateral(
                params.asset,
                params.enable
            );

            // Format health factor changes
            const healthFactorBefore = new BigNumber(result.healthFactorBefore.toString()).dividedBy(1e18);
            const healthFactorAfter = new BigNumber(result.healthFactorAfter.toString()).dividedBy(1e18);
            const healthFactorDiff = healthFactorAfter.minus(healthFactorBefore);
            const borrowsIncreased = result.availableBorrowsChange.gt(0);
            
            let healthFactorChange = '';
            if (healthFactorDiff.gt(0)) {
                healthFactorChange = `(+${healthFactorDiff.toFixed(2)}) ✅`;
            } else if (healthFactorDiff.lt(0)) {
                healthFactorChange = `(${healthFactorDiff.toFixed(2)}) ⚠️`;
            } else {
                healthFactorChange = '(unchanged)';
            }

            // Format borrow capacity change
            const borrowsChangeFormatted = new BigNumber(result.availableBorrowsChange.toString())
                .dividedBy(1e18)
                .abs()
                .toFixed(2);

            const borrowsChange = borrowsIncreased 
                ? `+$${borrowsChangeFormatted}`
                : `-$${borrowsChangeFormatted}`;

            const healthWarning = position.borrows.length > 0 && healthFactorAfter.lt(1.5);

            // Generate response
            const responseContext = composeContext({
                state,
                template: collateralResponseTemplate,
                success: true,
                asset: params.asset,
                enabled: params.enable,
                transactionHash: result.transactionHash,
                healthFactorBefore: healthFactorBefore.toFixed(2),
                healthFactorAfter: healthFactorAfter.toFixed(2),
                healthFactorChange,
                borrowsChange,
                borrowsIncreased,
                healthWarning
            });

            const response = await runtime.processTemplate(responseContext);

            if (callback) {
                callback({
                    text: response,
                    action: this.name,
                    data: result
                });
            }

            return true;
        } catch (error: any) {
            const errorContext = composeContext({
                state,
                template: collateralResponseTemplate,
                success: false,
                error: error.message,
                suggestions: this.getErrorSuggestions(error)
            });

            const response = await runtime.processTemplate(errorContext);

            if (callback) {
                callback({
                    text: response,
                    action: this.name,
                    error: error.message
                });
            }

            return false;
        }
    }

    examples = [
        [
            {
                user: 'user',
                content: { text: 'Enable my USDC supply as collateral on Aave' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll enable your USDC supply as collateral, allowing you to borrow against it.',
                    action: 'AAVE_COLLATERAL_MANAGEMENT'
                }
            }
        ],
        [
            {
                user: 'user',
                content: { text: 'Disable ETH as collateral' }
            },
            {
                user: 'assistant',
                content: { 
                    text: 'I\'ll disable your ETH as collateral to protect it from liquidation.',
                    action: 'AAVE_COLLATERAL_MANAGEMENT'
                }
            }
        ]
    ];

    private getErrorSuggestions(error: Error): string[] {
        const message = error.message.toLowerCase();
        const suggestions: string[] = [];

        if (message.includes('no active') || message.includes('supply position')) {
            suggestions.push('You need to supply the asset first before managing collateral');
            suggestions.push('Check your current supply positions');
        }
        if (message.includes('already')) {
            suggestions.push('The collateral setting is already as requested');
            suggestions.push('No change is needed');
        }
        if (message.includes('health factor') || message.includes('cannot disable')) {
            suggestions.push('Disabling collateral would make your position unsafe');
            suggestions.push('Improve your health factor by supplying more assets or repaying debt');
            suggestions.push('Consider disabling collateral on assets not critical to your borrowing capacity');
        }

        return suggestions;
    }
}