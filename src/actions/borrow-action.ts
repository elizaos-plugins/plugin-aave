import {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  elizaLogger,
} from '@elizaos/core';
import { AaveService } from '../services/aave-service.js';
import { InterestRateMode, BorrowParams } from '../types/index.js';
import { parseAmount } from '../utils/simple-validation.js';
import BigNumber from 'bignumber.js';

/**
 * Template for borrow operation prompts - used by LLM to extract parameters
 */
export const borrowTemplate = `Extract the borrowing parameters from the user's request.

Examples:
- "borrow 1000 USDC variable rate" → asset: USDC, amount: 1000, interestRateMode: VARIABLE
- "borrow 0.5 ETH stable" → asset: ETH, amount: 0.5, interestRateMode: STABLE  
- "take a loan of 500 DAI with variable interest" → asset: DAI, amount: 500, interestRateMode: VARIABLE
- "borrow maximum USDT variable rate" → asset: USDT, amount: max, interestRateMode: VARIABLE

The user wants to borrow: {{user_request}}

Respond with a JSON object containing:
{
  "asset": "asset_symbol_or_address",
  "amount": "numeric_amount_or_max",
  "interestRateMode": "STABLE_or_VARIABLE",
  "user": "user_wallet_address"
}

Important:
- interestRateMode must be either "STABLE" or "VARIABLE" 
- For stable rates, use "STABLE"
- For variable rates, use "VARIABLE"
- If not specified, default to "VARIABLE"
- amount should be a number or "max" for maximum available`;

/**
 * Action for borrowing assets from Aave V3
 */
export const borrowAction: Action = {
  name: 'AAVE_BORROW',
  similes: [
    'BORROW_FROM_AAVE',
    'AAVE_LOAN',
    'TAKE_LOAN',
    'BORROW_ASSET',
    'DEFI_BORROW'
  ],
  description: 'Borrow assets from Aave V3 protocol with specified interest rate mode',
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const content = message.content?.text?.toLowerCase();
    if (!content) return false;
    
    // Check for borrow-related keywords
    const borrowKeywords = [
      'borrow', 'loan', 'take loan', 'get loan',
      'variable rate', 'stable rate', 'interest rate'
    ];
    
    const hasBorrowKeyword = borrowKeywords.some(keyword => 
      content.includes(keyword)
    );
    
    if (!hasBorrowKeyword) return false;
    
    // Check for asset mentions or amounts
    const hasAssetOrAmount = /\b(usdc|usdt|dai|eth|weth|btc|wbtc|\d+\.?\d*)\b/i.test(content);
    
    return hasAssetOrAmount;
  },

  examples: [[
    {
      name: 'User',
      content: { text: 'I want to borrow 1000 USDC with variable rate from Aave' }
    },
    {
      name: 'Assistant',
      content: {
        text: 'I\'ll help you borrow 1000 USDC with variable interest rate from Aave V3.',
        actions: ['AAVE_BORROW']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'Take a loan of 0.5 ETH with stable rate' }
    },
    {
      name: 'Assistant',
      content: {
        text: 'I\'ll process your loan of 0.5 ETH with stable interest rate from Aave.',
        actions: ['AAVE_BORROW']
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
    try {
      elizaLogger.info('Starting Aave borrow operation...');
      
      // Get Aave service
      const aaveService = runtime.getService<AaveService>('aave');
      if (!aaveService) {
        throw new Error('Aave service not available');
      }

      // Extract borrow parameters using regex
      const content = message.content?.text;
      if (!content) {
        throw new Error('No message content provided');
      }
      
      // Parse asset and amount
      let asset: string = '';
      let amount: string = '';
      let rateMode: InterestRateMode = InterestRateMode.VARIABLE; // Default to variable
      
      // Match patterns like "borrow 1000 USDC", "take loan of 0.5 ETH", etc.
      const amountAssetMatch = content.match(/(?:borrow|loan|take loan|get loan)(?:\s+of)?\s+([a-zA-Z\d.,]+)\s+(\w+)/i);
      const assetAmountMatch = content.match(/(\w+)\s+([a-zA-Z\d.,]+)/i);
      
      if (amountAssetMatch) {
        amount = amountAssetMatch[1].replace(/,/g, '');
        asset = amountAssetMatch[2].toUpperCase();
      } else if (assetAmountMatch && assetAmountMatch[2].match(/^\d/)) {
        asset = assetAmountMatch[1].toUpperCase();
        amount = assetAmountMatch[2].replace(/,/g, '');
      } else {
        throw new Error('Could not extract asset and amount from request. Please specify like "borrow 1000 USDC"');
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

      elizaLogger.info(`Borrowing ${parsedAmount} ${asset} with ${rateMode === InterestRateMode.STABLE ? 'stable' : 'variable'} rate for ${userAddress}`);

      // Create borrow parameters
      const params: BorrowParams = {
        asset,
        amount: parsedAmount,
        interestRateMode: rateMode,
        user: userAddress,
      };

      // Execute borrow operation
      const result = await aaveService.borrow(params);

      if (!result.success) {
        throw new Error(`Borrow operation failed: ${result.error?.message}`);
      }

      // Format success response
      const rateTypeText = rateMode === InterestRateMode.STABLE ? 'stable' : 'variable';
      const successMessage = `💰 **Successfully Borrowed from Aave V3**

🎉 **Loan Approved!**
💸 **Amount**: ${result.amountBorrowed.toFixed(4)} ${asset}
📈 **Interest Rate**: ${rateTypeText.charAt(0).toUpperCase() + rateTypeText.slice(1)} (${result.currentBorrowAPY.toFixed(2)}% APY)
📄 **Transaction**: ${result.transactionHash}
🏥 **Health Factor**: ${result.newHealthFactor.toFixed(3)}

${result.newHealthFactor < 1.5 ? 
  '⚠️  **Warning**: Your health factor is getting low. Consider adding more collateral!' : 
  '✅ Your position looks healthy! Monitor your health factor regularly.'
}`;

      await callback?.({ 
        text: successMessage,
        source: message.content.source
      });

      return {
        text: `Successfully borrowed ${result.amountBorrowed.toFixed(4)} ${asset} from Aave`,
        success: true,
        data: {
          action: 'borrow',
          asset,
          amount: result.amountBorrowed.toString(),
          interestRateMode: rateTypeText,
          currentAPY: result.currentBorrowAPY,
          transactionHash: result.transactionHash,
          healthFactor: result.newHealthFactor
        }
      };

    } catch (error) {
      elizaLogger.error('Borrow action failed:', error);
      
      let errorMessage: string;
      if (error instanceof Error) {
        if (error.message.includes('insufficient collateral')) {
          errorMessage = `❌ **Insufficient Collateral**

You don't have enough collateral to borrow this amount. 
💡 **Try this:**
• Supply more assets as collateral first
• Reduce the borrow amount
• Check your health factor`;
        } else if (error.message.includes('borrowing not enabled')) {
          errorMessage = `❌ **Borrowing Not Available**

This asset cannot be borrowed on Aave V3 currently.
💡 **Try borrowing a different asset like USDC, USDT, or DAI**`;
        } else if (error.message.includes('health factor')) {
          errorMessage = `❌ **Health Factor Too Low**

This borrow would put your position at risk of liquidation.
💡 **Add more collateral or reduce borrow amount**`;
        } else {
          errorMessage = `❌ **Borrow Failed**: ${error.message}`;
        }
      } else {
        errorMessage = '❌ **Borrow operation failed**. Please try again or check your parameters.';
      }

      await callback?.({ 
        text: errorMessage,
        error: true
      });

      return {
        text: error instanceof Error ? error.message : 'Borrow operation failed',
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
};