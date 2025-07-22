import {
  Action,
  ActionResult,
  Memory,
  State,
  IAgentRuntime,
  ModelType,
  elizaLogger,
} from '@elizaos/core';
import { AaveService } from '../services/aave-service.js';
import { WithdrawParams, WithdrawResult } from '../types/index.js';
import { validateWithdrawParams } from '../utils/simple-validation.js';

const extractionTemplate = `Given the user's request to withdraw/redeem assets from Aave, extract the required information.

User request: "{{userMessage}}"

Extract and return ONLY a JSON object with the following structure:
{
  "asset": "asset symbol (e.g., USDC, WETH, DAI) or address",
  "amount": "amount to withdraw as string (e.g., '100', '0.5', 'max')",
  "userAddress": "user's ethereum address if mentioned, otherwise null"
}

Important:
- For ETH mentions, use "WETH" as the asset
- Amount should be the numeric value only (no symbols)
- If amount is "all", "max", "everything", or similar, use "max"
- Asset should be uppercase symbol if recognizable

Return only the JSON object, no other text.`;

export const withdrawAction: Action = {
  name: 'WITHDRAW_FROM_AAVE',
  description: 'Withdraw supplied assets from Aave V3 by redeeming aTokens',
  similes: ['REDEEM_FROM_AAVE', 'UNSTAKE_FROM_AAVE', 'WITHDRAW_ASSET', 'REDEEM_ATOKEN'],
  
  examples: [[
    {
      name: 'User',
      content: { text: 'I want to withdraw 500 USDC from Aave' }
    },
    {
      name: 'Assistant',
      content: {
        text: '💸 Withdrawing 500 USDC from Aave V3...\n\n✅ Successfully withdrew 500 USDC\n📄 Transaction: 0x123...abc\n🔥 Burned: 500 aUSDC\n💰 Remaining balance: 1,500 aUSDC\n📊 Earning: 3.25% APY on remaining balance',
        actions: ['WITHDRAW_FROM_AAVE']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'redeem 0.1 ETH from my aave position' }
    },
    {
      name: 'Assistant',
      content: {
        text: '💸 Withdrawing 0.1 WETH from Aave V3...\n\n✅ Successfully withdrew 0.1 WETH\n📄 Transaction: 0x456...def\n🔥 Burned: 0.1 aWETH\n💰 Remaining balance: 0.9 aWETH\n📊 Earning: 2.15% APY on remaining balance',
        actions: ['WITHDRAW_FROM_AAVE']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'withdraw all my DAI from aave lending' }
    },
    {
      name: 'Assistant',
      content: {
        text: '💸 Withdrawing all available DAI from Aave V3...\n\n✅ Successfully withdrew 2,500 DAI\n📄 Transaction: 0x789...ghi\n🔥 Burned: 2,500 aDAI\n💰 Remaining balance: 0 aDAI\n🎉 Position fully withdrawn!',
        actions: ['WITHDRAW_FROM_AAVE']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'can I get my 100 USDT back from aave?' }
    },
    {
      name: 'Assistant',
      content: {
        text: '💸 Withdrawing 100 USDT from Aave V3...\n\n✅ Successfully withdrew 100 USDT\n📄 Transaction: 0xabc...xyz\n🔥 Burned: 100 aUSDT\n💰 Remaining balance: 400 aUSDT\n📊 Earning: 4.10% APY on remaining balance',
        actions: ['WITHDRAW_FROM_AAVE']
      }
    }
  ]],

  async validate(runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> {
    try {
      // Check if RPC URL is configured
      const rpcUrl = runtime.getSetting('AAVE_RPC_URL');
      if (!rpcUrl) {
        return false;
      }

      // Check if message content is related to withdraw/redeem operations
      const text = message.content.text?.toLowerCase() || '';
      const withdrawKeywords = [
        'withdraw', 'redeem', 'unstake', 'take out', 'get back',
        'withdraw from aave', 'redeem from aave', 'unstake from aave',
        'cash out', 'exit position'
      ];

      return withdrawKeywords.some(keyword => text.includes(keyword));
    } catch {
      return false;
    }
  },

  async handler(
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: Function
  ): Promise<ActionResult> {
    const content = message.content.text;
    if (!content) {
      const errorMessage = 'Please specify the asset and amount to withdraw from Aave.';
      await callback?.({ text: errorMessage, source: message.content.source });
      return { text: errorMessage, success: false };
    }

    let asset: string = '';
    let amount: string = '';
    let userAddress: string | undefined;

    try {
      // Get Aave service
      const aaveService = runtime.getService<AaveService>('aave');
      if (!aaveService) {
        throw new Error('Aave service not available');
      }

      // Extract parameters using LLM
      const prompt = extractionTemplate.replace('{{userMessage}}', content);
      const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt: prompt });

      try {
        // Strip markdown code blocks if present
        const cleanedResponse = response.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();
        const parsed = JSON.parse(cleanedResponse);
        
        asset = parsed.asset;
        amount = parsed.amount;
        userAddress = parsed.userAddress;

        if (!asset || !amount) {
          throw new Error('Missing required parameters');
        }
      } catch (parseError) {
        elizaLogger.warn('Failed to parse LLM response, falling back to regex:', parseError);
        
        // Fallback regex patterns
        const amountAssetMatch = content.match(/(?:withdraw|redeem|get.*back)\s+([a-zA-Z\d.,]+)\s+(\w+)/i);
        const assetAmountMatch = content.match(/(\w+)\s+([a-zA-Z\d.,]+)/i);
        const maxPatterns = /(?:withdraw|redeem|get).*(?:all|max|everything|full)/i;
        
        if (amountAssetMatch) {
          amount = amountAssetMatch[1].replace(/,/g, '');
          asset = amountAssetMatch[2].toUpperCase();
        } else if (assetAmountMatch && assetAmountMatch[2].match(/^\d/)) {
          asset = assetAmountMatch[1].toUpperCase();
          amount = assetAmountMatch[2].replace(/,/g, '');
        } else if (maxPatterns.test(content)) {
          // Try to extract asset from context
          const assetMatch = content.match(/(?:withdraw|redeem).*?(USDC|WETH|ETH|DAI|USDT|WBTC|LINK|UNI|AAVE|CRV|COMP)/i);
          if (assetMatch) {
            asset = assetMatch[1].toUpperCase();
            amount = 'max';
          } else {
            throw new Error('Could not extract asset from request');
          }
        } else {
          throw new Error('Could not extract asset and amount from request');
        }

        // Convert ETH to WETH
        if (asset === 'ETH') {
          asset = 'WETH';
        }
      }

      // Prepare and validate withdraw parameters
      const withdrawParams = validateWithdrawParams({
        asset,
        amount: amount as any, // Let validation handle string to BigNumber conversion
        user: userAddress || runtime.getSetting('WALLET_ADDRESS') as string
      });

      // Execute withdraw operation
      const result: WithdrawResult = await aaveService.withdraw(withdrawParams);

      // Format success response
      let successMessage: string;
      
      if (result.remainingATokenBalance.isZero()) {
        // Full withdrawal
        successMessage = `💸 **Successfully Withdrew from Aave V3**

🎉 **Full Withdrawal Complete!**
💰 **Amount**: ${result.amountWithdrawn.toFixed(4)} ${asset}
📄 **Transaction**: ${result.transactionHash}
💰 **Remaining Balance**: 0 a${asset}

Your position has been fully withdrawn! 🏁`;
      } else {
        // Partial withdrawal
        successMessage = `💸 **Successfully Withdrew from Aave V3**

💰 **Amount**: ${result.amountWithdrawn.toFixed(4)} ${asset}
📄 **Transaction**: ${result.transactionHash}
💰 **Remaining Balance**: ${result.remainingATokenBalance.toFixed(4)} a${asset}

Your remaining a${asset} tokens continue earning yield! 🌱`;
      }

      await callback?.({ 
        text: successMessage,
        source: message.content.source
      });

      return {
        text: `Successfully withdrew ${result.amountWithdrawn.toFixed(4)} ${asset} from Aave`,
        success: true,
        data: {
          action: 'withdraw',
          asset,
          amount: result.amountWithdrawn.toString(),
          remainingBalance: result.remainingATokenBalance.toString(),
          transactionHash: result.transactionHash,
          isFullWithdrawal: result.remainingATokenBalance.isZero()
        }
      };

    } catch (error) {
      elizaLogger.error('Withdraw action failed:', error);
      
      let errorMessage: string;
      if (error instanceof Error) {
        if (error.message.includes('insufficient atoken') || error.message.includes('no atoken balance')) {
          errorMessage = `❌ Insufficient a${asset || 'Token'} balance. You don't have enough supplied to withdraw this amount.`;
        } else if (error.message.includes('exceeds balance')) {
          errorMessage = `❌ Withdrawal amount exceeds your a${asset || 'Token'} balance. Check your supplied position and try a smaller amount.`;
        } else if (error.message.includes('reserve frozen')) {
          errorMessage = `❌ ${asset || 'Asset'} withdrawals are currently frozen on Aave. Only emergency withdrawals may be available.`;
        } else if (error.message.includes('reserve paused')) {
          errorMessage = `❌ ${asset || 'Asset'} operations are temporarily paused on Aave. Please try again later.`;
        } else if (error.message.includes('health factor')) {
          errorMessage = `❌ Cannot withdraw - would leave position with insufficient collateral. Supply more collateral or reduce borrows first.`;
        } else if (error.message.includes('reserve inactive')) {
          errorMessage = `❌ ${asset || 'Asset'} market is currently inactive on Aave. Please try a different asset.`;
        } else {
          errorMessage = `❌ Withdrawal failed: ${error.message}`;
        }
      } else {
        errorMessage = '❌ Withdrawal failed due to an unknown error. Please try again.';
      }

      await callback?.({ 
        text: errorMessage,
        source: message.content.source
      });

      return {
        text: errorMessage,
        success: false,
        data: {
          action: 'withdraw',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
};