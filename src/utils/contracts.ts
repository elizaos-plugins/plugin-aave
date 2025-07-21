import { Address, getContract } from 'viem';

// ABI for the Aave Protocol Data Provider
const protocolDataProviderABI = [
    {
        inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
        name: 'getUserAccountData',
        outputs: [
            {
                internalType: 'uint256',
                name: 'totalCollateralETH',
                type: 'uint256'
            },
            { internalType: 'uint256', name: 'totalDebtETH', type: 'uint256' },
            {
                internalType: 'uint256',
                name: 'availableBorrowsETH',
                type: 'uint256'
            },
            {
                internalType: 'uint256',
                name: 'currentLiquidationThreshold',
                type: 'uint256'
            },
            { internalType: 'uint256', name: 'ltv', type: 'uint256' },
            { internalType: 'uint256', name: 'healthFactor', type: 'uint256' }
        ],
        stateMutability: 'view',
        type: 'function'
    }
];

export function marketDataProviderContract(
    address: string,
    publicClient: any
) {
    return getContract({
        address: address as Address,
        abi: protocolDataProviderABI,
        publicClient
    });
}