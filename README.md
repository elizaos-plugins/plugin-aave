# @elizaos/plugin-aave

Aave V3 integration plugin for ElizaOS, enabling AI agents to interact with the Aave lending protocol on Base L2.

## Overview

The Aave plugin provides comprehensive DeFi lending and borrowing capabilities through natural language interactions. It integrates with Aave V3 protocol on Base L2, allowing agents to:

- Supply assets to earn yield
- Borrow assets with flexible interest rates
- Manage collateral and health factors
- Execute flash loans
- Optimize interest rates and capital efficiency

## Features

### Core Lending Operations
- **Supply Assets**: Deposit tokens to earn interest with automatic APY tracking
- **Borrow Assets**: Take loans with stable or variable rates
- **Repay Debt**: Pay back borrowed assets partially or fully
- **Withdraw Assets**: Remove supplied tokens while maintaining safe positions

### Advanced Features
- **Rate Switching**: Switch between stable and variable interest rates to optimize costs
- **Collateral Management**: Enable/disable assets as collateral with risk analysis
- **Efficiency Mode (eMode)**: Maximize capital efficiency for correlated assets (up to 97% LTV for stablecoins)
- **Flash Loans**: Execute complex DeFi strategies without upfront capital

### Risk Management
- **Health Factor Monitoring**: Real-time position health tracking with alerts
- **Liquidation Prevention**: Proactive alerts and recommendations to avoid liquidation
- **Position Analysis**: Comprehensive view of supplies, borrows, and risk metrics

## Installation

```bash
bun add @elizaos/plugin-aave
```

## Configuration

### Required Environment Variables

```env
# Network Configuration
AAVE_NETWORK=base              # or 'base-sepolia' for testnet
BASE_RPC_URL=https://...       # Base L2 RPC endpoint

# Wallet Configuration
WALLET_PRIVATE_KEY=0x...       # Private key for transactions

# Optional Settings
HEALTH_FACTOR_ALERT=1.5        # Health factor threshold for alerts (default: 1.5)
FLASH_LOAN_MAX_FEE=0.1         # Maximum acceptable flash loan fee % (default: 0.1)
```

## Usage

### Register the Plugin

```typescript
import { aavePlugin } from '@elizaos/plugin-aave';
import { ElizaAgent } from '@elizaos/core';

const agent = new ElizaAgent({
  plugins: [aavePlugin],
  // ... other configuration
});
```

### Using Individual Actions

You can import and use individual actions:

```typescript
import { supplyAction, borrowAction, repayAction } from '@elizaos/plugin-aave';

console.log(supplyAction.name); // "AAVE_SUPPLY"
console.log(supplyAction.description); // "Supply assets to Aave V3 lending protocol"

// Validate a message
const isValid = supplyAction.validate(runtime, message);

// Handle a message
const result = await supplyAction.handler(runtime, message, state, options, callback);
```

### Example Interactions

#### Supply Assets
```
User: "I want to supply 1000 USDC to Aave"
Agent: "I'll help you supply 1000 USDC to Aave V3. Let me process this transaction for you."

✅ Successfully supplied 1000 USDC to Aave V3!
Transaction hash: 0x123...
aToken balance: 1000.00 aUSDC
Current APY: 3.5%
Collateral enabled: Yes
Your USDC is now earning interest at 3.5% APY.
```

#### Borrow Assets
```
User: "Borrow 500 USDC with variable rate"
Agent: "I'll process your request to borrow 500 USDC with a variable interest rate."

✅ Successfully borrowed 500 USDC from Aave V3!
Transaction hash: 0x456...
Interest rate mode: variable
Current rate: 5.2%
Health factor: 2.45 🟢 SAFE
```

#### Check Position
```
User: "What's my Aave position?"
Agent: Current Aave V3 Position:

Supplied assets:
- 1000.0000 USDC (APY: 3.50%) ✓ Collateral

Borrowed assets:
- 500.0000 USDC (Variable: 5.20%)

Position Metrics:
- Total Collateral: $1000.00
- Total Debt: $500.00
- Available to Borrow: $450.00
- Health Factor: 2.45 🟢 SAFE
- Current LTV: 50.0%
- Liquidation Threshold: 80.0%
- Efficiency Mode: Disabled
```

#### Enable Efficiency Mode
```
User: "Enable efficiency mode for stablecoins"
Agent: "I'll enable efficiency mode category 1 (stablecoins) to maximize your capital efficiency."

✅ Successfully enabled efficiency mode!
Transaction hash: 0x789...
eMode Category: Stablecoins (ID: 1)

Improvements achieved:
- LTV: +17% (better borrowing power)
- Liquidation threshold: +3% (safer position)
```

## Actions

### SupplyAction
Supplies assets to Aave V3 markets.
- **Triggers**: "supply", "deposit", "lend to aave"
- **Parameters**: asset, amount, enableCollateral (default: true)
- **Validation**: Balance check, market availability
- **Returns**: aToken balance, APY, collateral status

### BorrowAction
Borrows assets from Aave V3.
- **Triggers**: "borrow", "take loan from aave"
- **Parameters**: asset, amount, rateMode (stable/variable)
- **Validation**: Health factor check, borrowing capacity
- **Returns**: Debt position, interest rate, health factor

### RepayAction
Repays borrowed assets.
- **Triggers**: "repay", "pay back debt"
- **Parameters**: asset, amount (-1 for full), rateMode
- **Validation**: Balance check, debt verification
- **Returns**: Remaining debt, updated health factor

### WithdrawAction
Withdraws supplied assets.
- **Triggers**: "withdraw from aave"
- **Parameters**: asset, amount (-1 for all)
- **Validation**: Collateral requirements, health factor impact
- **Returns**: Remaining supply, health factor

### RateSwitchAction
Switches between stable and variable rates.
- **Triggers**: "switch rate", "change rate"
- **Parameters**: asset, targetRateMode
- **Analysis**: Rate comparison, projected savings
- **Returns**: New rate, savings projection

### CollateralManagementAction
Manages collateral settings for supplied assets.
- **Triggers**: "enable/disable collateral"
- **Parameters**: asset, enable (true/false)
- **Analysis**: Health factor impact, borrowing capacity change
- **Returns**: Collateral status, position changes

### eModeAction
Manages efficiency mode settings.
- **Triggers**: "enable/disable emode", "efficiency mode"
- **Categories**: 
  - 0: Disabled (standard mode)
  - 1: Stablecoins (up to 97% LTV)
  - 2: ETH-correlated (up to 90% LTV)
- **Validation**: Asset compatibility check
- **Returns**: LTV improvements, optimization benefits

### FlashLoanAction
Prepares flash loan parameters.
- **Triggers**: "flash loan"
- **Parameters**: assets[], amounts[]
- **Fee**: 0.05% on Aave V3
- **Note**: Requires custom receiver contract implementation

## Providers

### PositionContextProvider
Provides comprehensive position data for agent context.
- Supplies with APY and collateral status
- Borrows with rate mode and current rates
- Health factor with risk assessment
- Total collateral and debt values
- eMode status

### HealthFactorProvider
Provides detailed health factor analysis.
- Risk level assessment (CRITICAL/RISKY/MODERATE/SAFE/VERY SAFE)
- Liquidation risk calculation
- Safety recommendations
- LTV utilization metrics

## Evaluators

### EfficiencyModeEvaluator
Post-interaction analysis of efficiency mode effectiveness.
- Asset compatibility scoring
- LTV utilization assessment
- Optimization recommendations
- Learning from eMode changes

### InterestOptimizationEvaluator
Analyzes interest rate optimization after rate-related actions.
- Supply APY evaluation
- Borrow rate analysis
- Rate switching effectiveness
- Interest optimization insights

## Services

### AaveService
Core service for Aave V3 protocol interactions.
- Protocol operation management
- Transaction execution with retries
- Position data caching
- Health factor monitoring
- Error handling and recovery

### WalletService
Manages wallet operations and token approvals.
- Secure transaction signing
- Balance checking (native & ERC20)
- Automatic token approvals
- Gas estimation and management

## Supported Assets on Base

- **ETH** - Ethereum
- **USDC** - USD Coin
- **USDbC** - USD Base Coin
- **DAI** - Dai Stablecoin
- **cbETH** - Coinbase Wrapped Staked ETH
- **wstETH** - Wrapped Liquid Staked Ether

## Safety Features

1. **Health Factor Monitoring**
   - Continuous background monitoring
   - Configurable alert thresholds
   - Automatic warnings below 1.5

2. **Transaction Validation**
   - Pre-flight balance checks
   - Gas estimation and validation
   - Slippage protection

3. **Error Recovery**
   - Comprehensive error messages
   - Actionable suggestions
   - Transaction retry logic

4. **Risk Analysis**
   - Position health assessment
   - Liquidation risk calculation
   - Collateral optimization suggestions

## Development

### Building
```bash
bun run build
```

### Testing
```bash
bun test tests/
```

Tests are located in the `tests/` directory at the package root:
```
tests/
├── actions/           # Action-specific tests
├── services/          # Service tests
├── providers/         # Provider tests  
├── evaluators/        # Evaluator tests
└── integration/       # Integration tests
```

### Linting
```bash
bun run lint
bun run format
```

## Architecture

The plugin follows ElizaOS's architecture patterns:

```
User Input → Action → Service → Aave V3 Protocol
                ↓
            Provider → Context for agent
                ↓
        Post-interaction → Evaluator → Learning
```

### Architecture Components

**Actions** handle user commands and validation:
```typescript
export const supplyAction: Action = {
  name: 'AAVE_SUPPLY',
  description: 'Supply assets to Aave V3 lending protocol',
  validate: (runtime: IAgentRuntime, message: Memory): boolean => {
    // Check if message is about supplying to Aave
  },
  handler: async (runtime, message, state, options, callback) => {
    // Execute supply transaction
  },
  examples: [
    // User interaction examples
  ]
};
```

**Services** manage state and external integrations - AaveService handles protocol interactions, WalletService manages wallet operations.

**Providers** supply read-only context - PositionContextProvider gives current Aave positions, HealthFactorProvider analyzes liquidation risk.

**Evaluators** enable post-interaction learning - analyze efficiency and interest optimization decisions.

## Security Considerations

1. **Private Key Security**
   - Never commit private keys
   - Use environment variables
   - Consider using hardware wallets for production

2. **Transaction Safety**
   - All transactions require explicit user commands
   - Health factor checks prevent unsafe operations
   - Automatic token approvals with exact amounts

3. **Risk Management**
   - Monitor health factor continuously
   - Understand liquidation mechanics
   - Test on testnet before mainnet

## Troubleshooting

### Common Issues

1. **"Insufficient Balance"**
   - Check wallet balance for the asset
   - Ensure enough ETH for gas fees
   - Verify token decimals

2. **"Health Factor Too Low"**
   - Current HF below threshold (1.2)
   - Supply more collateral
   - Repay some debt

3. **"Asset Not Supported"**
   - Asset not listed on Aave V3 Base
   - Check supported assets list
   - Use correct token symbol

4. **"Rate Switch Failed"**
   - Some assets only support variable rates
   - Check if stable rate is available
   - Verify cooldown period

5. **"eMode Incompatible Assets"**
   - Mix of incompatible asset types
   - Category 1: Stablecoins only
   - Category 2: ETH assets only

## Resources

- [Aave V3 Documentation](https://docs.aave.com/developers/)
- [Base L2 Documentation](https://docs.base.org/)
- [ElizaOS Documentation](https://elizaos.ai/docs)
- [Aave Base Deployment](https://docs.aave.com/developers/deployed-contracts/v3-mainnet/base)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- **GitHub Issues**: [elizaos/eliza](https://github.com/elizaos/eliza/issues)
- **Discord**: [ElizaOS Community](https://discord.gg/elizaos)
- **Documentation**: [docs.elizaos.ai](https://docs.elizaos.ai)

## Disclaimer

This plugin interacts with DeFi protocols which carry financial risks:
- Smart contract risk
- Liquidation risk
- Interest rate volatility
- Impermanent loss

Always:
- Do your own research
- Test on testnet first
- Never invest more than you can afford to lose
- Keep private keys secure