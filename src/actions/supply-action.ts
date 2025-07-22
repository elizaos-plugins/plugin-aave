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
import { SupplyParams, SupplyResult } from '../types/index.js';
import { validateSupplyParams } from '../utils/simple-validation.js';

const extractionTemplate = `Given the user's request to supply/deposit assets to Aave, extract the required information.

User request: "{{userMessage}}"

Extract and return ONLY a JSON object with the following structure:
{
  "asset": "asset symbol (e.g., USDC, WETH, DAI) or address",
  "amount": "amount to supply as string (e.g., '100', '0.5')",
  "userAddress": "user's ethereum address if mentioned, otherwise null"
}

Important:
- For ETH mentions, use "WETH" as the asset
- Amount should be the numeric value only (no symbols)
- If amount is "all", "max", or "everything", use "max"
- Asset should be uppercase symbol if recognizable

Return only the JSON object, no other text.`;

export const supplyAction: Action = {
  name: 'SUPPLY_TO_AAVE',
  description: 'Supply assets to Aave V3 to earn yield and receive aTokens',
  similes: ['DEPOSIT_TO_AAVE', 'LEND_TO_AAVE', 'SUPPLY_ASSET', 'DEPOSIT_ASSET'],
  
  examples: [[
    {
      name: 'User',
      content: { text: 'I want to supply 1000 USDC to Aave' }
    },
    {
      name: 'Assistant',
      content: {
        text: '🏦 Supplying 1000 USDC to Aave V3...\n\n✅ Successfully supplied 1000 USDC\n📄 Transaction: 0x123...abc\n🪙 Received: 1000 aUSDC (earning yield)\n💰 Current APY: 3.25%',
        actions: ['SUPPLY_TO_AAVE']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'deposit 0.5 ETH to start earning yield' }
    },
    {
      name: 'Assistant',
      content: {
        text: '🏦 Supplying 0.5 WETH to Aave V3...\n\n✅ Successfully supplied 0.5 WETH\n📄 Transaction: 0x456...def\n🪙 Received: 0.5 aWETH (earning yield)\n💰 Current APY: 2.15%',
        actions: ['SUPPLY_TO_AAVE']
      }
    }
  ], [
    {
      name: 'User',
      content: { text: 'supply all my DAI to aave for lending' }
    },
    {
      name: 'Assistant',
      content: {
        text: '🏦 Supplying all available DAI to Aave V3...\n\n✅ Successfully supplied 2,500 DAI\n📄 Transaction: 0x789...ghi\n🪙 Received: 2,500 aDAI (earning yield)\n💰 Current APY: 4.80%',
        actions: ['SUPPLY_TO_AAVE']
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

      // Check if message content is related to supply/deposit operations
      const text = message.content.text?.toLowerCase() || '';
      
      // Must contain supply-related keywords AND have some indication of amount/asset
      const supplyKeywords = [
        'supply', 'deposit', 'lend', 'provide liquidity'
      ];
      
      const hasSupplyKeyword = supplyKeywords.some(keyword => text.includes(keyword));
      
      // Basic checks for completeness - should have numbers or asset names
      const hasAmount = /\d+/.test(text) || text.includes('all') || text.includes('max');
      const hasAsset = /(usdc|usdt|dai|eth|weth|btc|wbtc|aave|link)/i.test(text);
      
      return hasSupplyKeyword && (hasAmount || hasAsset);
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
      const errorMessage = 'Please specify the asset and amount to supply to Aave.';
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
        const amountAssetMatch = content.match(/(?:supply|deposit|lend)\s+([a-zA-Z\d.,]+)\s+(\w+)/i);
        const assetAmountMatch = content.match(/(\w+)\s+([a-zA-Z\d.,]+)/i);
        
        if (amountAssetMatch) {
          amount = amountAssetMatch[1].replace(/,/g, '');
          asset = amountAssetMatch[2].toUpperCase();
        } else if (assetAmountMatch && assetAmountMatch[2].match(/^\d/)) {
          asset = assetAmountMatch[1].toUpperCase();
          amount = assetAmountMatch[2].replace(/,/g, '');
        } else {
          throw new Error('Could not extract asset and amount from request');
        }

        // Convert ETH to WETH
        if (asset === 'ETH') {
          asset = 'WETH';
        }
      }

      // Prepare and validate supply parameters
      const supplyParams = validateSupplyParams({
        asset,
        amount: amount as any, // Let validation handle string to BigNumber conversion
        user: userAddress || runtime.getSetting('WALLET_ADDRESS') as string
      });

      // Execute supply operation
      const result: SupplyResult = await aaveService.supply(supplyParams);

      // Format success response
      const successMessage = `🏦 **Successfully Supplied to Aave V3**

💰 **Amount**: ${result.suppliedAmount.toFixed(4)} ${asset}
🪙 **Received**: ${result.aTokenAmount.toFixed(4)} a${asset}
📄 **Transaction**: ${result.transactionHash}
💰 **New aToken Balance**: ${result.newATokenBalance.toFixed(4)} a${asset}

Your a${asset} tokens will automatically earn yield! 🌱`;

      await callback?.({ 
        text: successMessage,
        source: message.content.source
      });

      return {
        text: `Successfully supplied ${result.suppliedAmount.toFixed(4)} ${asset} to Aave`,
        success: true,
        data: {
          action: 'supply',
          asset,
          amount: result.suppliedAmount.toString(),
          aTokensReceived: result.aTokenAmount.toString(),
          newBalance: result.newATokenBalance.toString(),
          transactionHash: result.transactionHash
        }
      };

    } catch (error) {
      elizaLogger.error('Supply action failed:', error);
      
      let errorMessage: string;
      if (error instanceof Error) {
        if (error.message.includes('insufficient balance')) {
          errorMessage = `❌ Insufficient ${asset} balance. Please check your wallet balance and try again.`;
        } else if (error.message.includes('allowance')) {
          errorMessage = `❌ Token approval required. The transaction will include approval for ${asset}.`;
        } else if (error.message.includes('reserve inactive')) {
          errorMessage = `❌ ${asset} market is currently inactive on Aave. Please try a different asset.`;
        } else if (error.message.includes('supply cap')) {
          errorMessage = `❌ ${asset} supply cap reached on Aave. Please try a different asset or smaller amount.`;
        } else {
          errorMessage = `❌ Supply failed: ${error.message}`;
        }
      } else {
        errorMessage = '❌ Supply failed due to an unknown error. Please try again.';
      }

      await callback?.({ 
        text: errorMessage,
        source: message.content.source
      });

      return {
        text: errorMessage,
        success: false,
        data: {
          action: 'supply',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
};