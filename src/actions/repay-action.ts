import {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  elizaLogger,
} from '@elizaos/core';
import { AaveService } from '../services/aave-service.js';
import { InterestRateMode, RepayParams } from '../types/index.js';
import { parseAmount, isMaxAmount } from '../utils/simple-validation.js';
import BigNumber from 'bignumber.js';

/**
 * Template for repay operation prompts - used by LLM to extract parameters
 */
export const repayTemplate = `Extract the repayment parameters from the user's request.

Examples:
- "repay 1000 USDC variable debt" → asset: USDC, amount: 1000, interestRateMode: VARIABLE
- "repay 0.5 ETH stable debt" → asset: ETH, amount: 0.5, interestRateMode: STABLE
- "repay all DAI variable" → asset: DAI, amount: max, interestRateMode: VARIABLE  
- "pay back 500 USDT stable rate debt" → asset: USDT, amount: 500, interestRateMode: STABLE
- "repay maximum USDC debt" → asset: USDC, amount: max, interestRateMode: VARIABLE

The user wants to repay: {{user_request}}

Respond with a JSON object containing:
{
  "asset": "asset_symbol_or_address",
  "amount": "numeric_amount_or_max",
  "interestRateMode": "STABLE_or_VARIABLE",
  "user": "user_wallet_address"
}

Important:
- interestRateMode must be either "STABLE" or "VARIABLE" based on the debt type being repaid
- For stable debt repayment, use "STABLE"
- For variable debt repayment, use "VARIABLE" 
- If not specified, default to "VARIABLE" (most common)
- amount should be a number or "max" for full repayment`;

/**
 * Action for repaying debt to Aave V3
 */
export const repayAction: Action = {
  name: 'AAVE_REPAY',
  similes: [
    'REPAY_TO_AAVE',
    'AAVE_REPAYMENT',
    'PAY_BACK',
    'REPAY_DEBT',
    'DEFI_REPAY',
    'PAYBACK_LOAN'
  ],
  description: 'Repay borrowed assets to Aave V3 protocol',
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const content = message.content?.text?.toLowerCase();
    if (!content) return false;
    
    // Check for repay-related keywords
    const repayKeywords = [
      'repay', 'pay back', 'payback', 'pay off',
      'repayment', 'debt', 'loan repay', 'close position'
    ];
    
    const hasRepayKeyword = repayKeywords.some(keyword => 
      content.includes(keyword)
    );
    
    if (!hasRepayKeyword) return false;
    
    // Check for asset mentions, amounts, or max keywords
    const hasAssetOrAmount = /\b(usdc|usdt|dai|eth|weth|btc|wbtc|\d+\.?\d*|all|everything|max|maximum)\b/i.test(content);
    
    return hasAssetOrAmount;
  },

  examples: [[
    {
      name: 'User',
      content: { text: 'I want to repay 1000 USDC variable debt to Aave' }
    },
    {
      name: 'Assistant',
      content: {
        text: 'I\'ll help you repay 1000 USDC variable debt to Aave V3.',
        actions: ['AAVE_REPAY']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'Pay back all my ETH debt with stable rate' }
    },
    {
      name: 'Assistant',
      content: {
        text: 'I\'ll process the full repayment of your ETH stable debt.',
        actions: ['AAVE_REPAY']
      }
    }
  ]],

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: any,
    options?: any,
    callback?: any
  ): Promise<ActionResult> => {
    // Parse asset and amount outside try block for error handling scope
    let asset: string = '';
    let amount: string = '';
    
    try {
      elizaLogger.info('Starting Aave repay operation...');
      
      // Get Aave service
      const aaveService = runtime.getService<AaveService>('aave');
      if (!aaveService) {
        throw new Error('Aave service not available');
      }

      // Extract repay parameters using regex
      const content = message.content?.text;
      if (!content) {
        throw new Error('No message content provided');
      }
      
      // Parse asset and amount
      let rateMode: InterestRateMode = InterestRateMode.VARIABLE; // Default to variable
      
      // Match patterns like "repay 1000 USDC", "pay back 0.5 ETH", etc.
      const amountAssetMatch = content.match(/(?:repay|pay back|payback|pay off)(?:\s+(?:all|full|maximum|max))?\s+([a-zA-Z\d.,]+)\s+(\w+)/i);
      const assetAmountMatch = content.match(/(\w+)\s+([a-zA-Z\d.,]+)/i);
      const maxRepayMatch = content.match(/(?:repay|pay back|payback|pay off)\s+(?:all|full|maximum|max|everything)(?:\s+(\w+))?/i);
      
      if (maxRepayMatch) {
        // Handle "repay all USDC" or "pay back everything"
        amount = 'max';
        asset = maxRepayMatch[1]?.toUpperCase() || 'USDC'; // Default to USDC if not specified
      } else if (amountAssetMatch) {
        amount = amountAssetMatch[1].replace(/,/g, '');
        asset = amountAssetMatch[2].toUpperCase();
      } else if (assetAmountMatch && assetAmountMatch[2].match(/^\d/)) {
        asset = assetAmountMatch[1].toUpperCase();
        amount = assetAmountMatch[2].replace(/,/g, '');
      } else {
        throw new Error('Could not extract asset and amount from request. Please specify like "repay 1000 USDC"');
      }
      
      // Determine interest rate mode
      if (content.toLowerCase().includes('stable')) {
        rateMode = InterestRateMode.STABLE;
      }
      
      // Convert ETH to WETH
      if (asset === 'ETH') {
        asset = 'WETH';
      }

      // Get user address from runtime settings
      const userAddress = runtime.getSetting('WALLET_ADDRESS');
      if (!userAddress) {
        throw new Error('Wallet address not configured. Please set WALLET_ADDRESS in settings.');
      }

      // Parse amount
      const parsedAmount = parseAmount(amount);
      const isFullRepayment = isMaxAmount(parsedAmount);

      elizaLogger.info(`Repaying ${isFullRepayment ? 'full' : amount} ${asset} ${rateMode === InterestRateMode.STABLE ? 'stable' : 'variable'} debt for ${userAddress}`);

      // Create repay parameters
      const params: RepayParams = {
        asset,
        amount: parsedAmount,
        interestRateMode: rateMode,
        user: userAddress,
      };

      // Execute repay operation
      const result = await aaveService.repay(params);

      if (!result.success) {
        throw new Error(`Repay operation failed: ${result.error?.message}`);
      }

      // Format success response
      const rateTypeText = rateMode === InterestRateMode.STABLE ? 'stable' : 'variable';
      let successMessage: string;
      
      if (result.remainingDebt.isZero()) {
        // Full debt repayment
        successMessage = `💸 **Successfully Repaid Debt to Aave V3**

🎉 **Debt Fully Repaid!**
💰 **Amount**: ${result.amountRepaid.toFixed(4)} ${asset}
📈 **Debt Type**: ${rateTypeText.charAt(0).toUpperCase() + rateTypeText.slice(1)} rate
📄 **Transaction**: ${result.transactionHash}
${result.approvalTransactionHash ? `🔓 **Approval**: ${result.approvalTransactionHash}` : ''}
🏥 **Health Factor**: ${result.newHealthFactor.toFixed(3)}
💰 **Remaining Debt**: $0.00

🎊 Congratulations! You've completely paid off your ${asset} debt!`;
      } else {
        // Partial repayment
        successMessage = `💸 **Successfully Repaid Debt to Aave V3**

💰 **Amount**: ${result.amountRepaid.toFixed(4)} ${asset}
📈 **Debt Type**: ${rateTypeText.charAt(0).toUpperCase() + rateTypeText.slice(1)} rate
📄 **Transaction**: ${result.transactionHash}
${result.approvalTransactionHash ? `🔓 **Approval**: ${result.approvalTransactionHash}` : ''}
🏥 **Health Factor**: ${result.newHealthFactor.toFixed(3)}
💰 **Remaining Debt**: ${result.remainingDebt.toFixed(4)} ETH equivalent

✅ Your position health has improved!`;
      }

      await callback?.({ 
        text: successMessage,
        source: message.content.source
      });

      return {
        text: `Successfully repaid ${result.amountRepaid.toFixed(4)} ${asset} to Aave`,
        success: true,
        data: {
          action: 'repay',
          asset,
          amount: result.amountRepaid.toString(),
          interestRateMode: rateTypeText,
          transactionHash: result.transactionHash,
          approvalTransactionHash: result.approvalTransactionHash,
          healthFactor: result.newHealthFactor,
          remainingDebt: result.remainingDebt.toString(),
          isFullRepayment: result.remainingDebt.isZero()
        }
      };

    } catch (error) {
      elizaLogger.error('Repay action failed:', error);
      
      let errorMessage: string;
      if (error instanceof Error) {
        if (error.message.includes('insufficient balance')) {
          errorMessage = `❌ **Insufficient Balance**

You don't have enough ${asset || 'tokens'} to repay this amount.
💡 **Try this:**
• Check your wallet balance
• Reduce the repay amount
• Get more tokens first`;
        } else if (error.message.includes('no debt')) {
          errorMessage = `❌ **No Debt Found**

You don't have any debt for this asset/rate type on Aave V3.
💡 **Check your position to see current debts**`;
        } else if (error.message.includes('allowance')) {
          errorMessage = `❌ **Token Approval Failed**

Could not approve tokens for repayment.
💡 **This might be a temporary issue - please try again**`;
        } else {
          errorMessage = `❌ **Repay Failed**: ${error.message}`;
        }
      } else {
        errorMessage = '❌ **Repayment operation failed**. Please try again or check your parameters.';
      }

      await callback?.({ 
        text: errorMessage,
        error: true
      });

      return {
        text: error instanceof Error ? error.message : 'Repay operation failed',
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
};