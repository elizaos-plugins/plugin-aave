# @elizaos/plugin-aave

A comprehensive Aave V3 Protocol integration plugin for ElizaOS that enables DeFi lending and borrowing operations across 16+ supported networks.

## Features

- **Multi-Chain Support**: Ethereum, Polygon, Avalanche, Arbitrum, Optimism, Base, BNB Chain, and more
- **DeFi Operations**: Supply, borrow, repay, and withdraw assets
- **Portfolio Management**: Monitor health factors and liquidation risks
- **Market Data**: Real-time APYs and protocol statistics
- **Natural Language**: Intuitive command interface

## Installation

```bash
bun add @elizaos/plugin-aave
```

## Configuration

```env
# RPC URLs (at least one required)
ETHEREUM_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon-rpc.com
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org

# Optional
WALLET_PRIVATE_KEY=your_private_key_here
AAVE_DEFAULT_CHAIN=ethereum
HEALTH_FACTOR_ALERT=1.5
```

## Supported Networks

| Network | Chain ID | Native | Status |
|---------|----------|--------|--------|
| Ethereum | 1 | ETH | ✅ Mainnet |
| Polygon | 137 | MATIC | ✅ Mainnet |
| Avalanche | 43114 | AVAX | ✅ Mainnet |
| Arbitrum One | 42161 | ETH | ✅ Mainnet |
| Optimism | 10 | ETH | ✅ Mainnet |
| Base | 8453 | ETH | ✅ Mainnet |
| BNB Chain | 56 | BNB | ✅ Mainnet |
| Gnosis Chain | 100 | xDAI | ✅ Mainnet |
| + 8 more networks including testnets | | | |

## Usage

### Register the Plugin

```typescript
import { aavePlugin } from '@elizaos/plugin-aave';
agent.registerPlugin(aavePlugin);
```

### Available Actions

#### Supply Assets
```typescript
// Natural language
"Supply 1000 USDC to Aave on Ethereum"
"Lend 0.5 ETH to Aave on Arbitrum"

// Action format
{
  action: "AAVE_SUPPLY",
  options: {
    asset: "USDC",
    amount: "1000", 
    chain: "ethereum",
    enableAsCollateral: true
  }
}
```

#### Borrow Assets
```typescript
// Natural language
"Borrow 500 USDC from Aave on Ethereum"
"Borrow 0.2 ETH against my collateral"

// Action format
{
  action: "AAVE_BORROW",
  options: {
    asset: "USDC",
    amount: "500",
    chain: "ethereum",
    interestRateMode: "variable"
  }
}
```

#### Repay Debt
```typescript
// Natural language  
"Repay 300 USDC debt to Aave"
"Pay back all my DAI debt on Polygon"

// Action format
{
  action: "AAVE_REPAY",
  options: {
    asset: "USDC",
    amount: "300",
    chain: "ethereum",
    isMax: false
  }
}
```

#### Withdraw Assets
```typescript
// Natural language
"Withdraw 500 USDC from Aave"
"Remove 0.1 ETH from my position"

// Action format
{
  action: "AAVE_WITHDRAW", 
  options: {
    asset: "USDC",
    amount: "500",
    chain: "ethereum"
  }
}
```

### Providers

#### AAVE_POSITION_CONTEXT
```
Aave Portfolio Summary:
- Total Value: $12,500.00 (Health Factor: 2.45)
- Active Chains: 3

Ethereum:
- USDC: $5,000 supplied (4.25% APY)
- DAI: $1,000 borrowed (5.50% APY)

Arbitrum: 
- ETH: $2,000 supplied (2.95% APY)
```

#### AAVE_MARKET_DATA
```
Aave Markets:
Ethereum: USDC 4.25%/5.50% APY, ETH 2.80%/3.95% APY
Arbitrum: USDC 4.10%/5.25% APY, ETH 2.95%/4.10% APY
Polygon: MATIC 6.20%/8.50% APY, USDC 3.80%/5.10% APY
```

## Service API

```typescript
const aaveService = runtime.getService<AaveService>('aave');

// Supply assets
await aaveService.supply({
  asset: 'USDC',
  amount: new BigNumber('1000'),
  chain: 'ethereum'
});

// Get user position
const position = await aaveService.getUserPosition();

// Get market data
const markets = await aaveService.getMarketData('ethereum');
```

## Common Assets

- **Stablecoins**: USDC, USDT, DAI
- **Native Assets**: ETH, MATIC, AVAX, BNB
- **Wrapped Assets**: WETH, WBTC
- **DeFi Tokens**: AAVE, LINK, ARB, OP

## Safety Features

- Health factor monitoring with configurable alerts
- Liquidation prevention for risky operations
- Transaction validation and slippage protection
- Cross-chain risk assessment

## Development

```bash
bun run build    # Build the plugin
bun run test     # Run tests
bun run dev      # Development mode
bun run lint     # Code linting
```

## Error Handling

- `InsufficientBalanceError`: Not enough tokens
- `HealthFactorTooLowError`: Liquidation risk
- `AssetNotSupportedError`: Asset not available
- `NetworkConnectionError`: RPC issues
- `ChainNotSupportedError`: Unsupported chain

## Interest Rate Modes

- **Variable**: Fluctuating rates based on market (default)
- **Stable**: Fixed rates for predictable payments (limited)

## License

MIT

## Support

For issues and feature requests, please create an issue on the [GitHub repository](https://github.com/elizaos/eliza).