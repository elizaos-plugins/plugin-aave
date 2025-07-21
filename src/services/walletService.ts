import { IAgentRuntime, ServiceType } from '@elizaos/core';
import { createPublicClient, createWalletClient, http, Address, parseUnits, formatUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import BigNumber from 'bignumber.js';
import { WalletService as IWalletService } from '../types';

export class WalletService implements IWalletService {
    static readonly serviceType: ServiceType = ServiceType.AGENT;
    
    private runtime: IAgentRuntime;
    private publicClient: any;
    private walletClient: any;
    private account: any;
    private address: Address | null = null;
    private network: 'base' | 'base-sepolia';

    constructor() {
        this.network = 'base';
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.runtime = runtime;
        
        // Load configuration from environment
        const network = runtime.getSetting('AAVE_NETWORK') || 'base';
        const rpcUrl = runtime.getSetting('BASE_RPC_URL');
        const privateKey = runtime.getSetting('WALLET_PRIVATE_KEY');
        
        if (!rpcUrl) {
            throw new Error('BASE_RPC_URL is required for wallet operations');
        }
        
        if (!privateKey) {
            throw new Error('WALLET_PRIVATE_KEY is required for wallet operations');
        }

        // Set up chain based on network
        const chain = network === 'base-sepolia' ? baseSepolia : base;
        this.network = network as 'base' | 'base-sepolia';

        // Initialize clients
        this.publicClient = createPublicClient({
            chain,
            transport: http(rpcUrl)
        });

        this.account = privateKeyToAccount(privateKey as `0x${string}`);
        this.address = this.account.address;

        this.walletClient = createWalletClient({
            account: this.account,
            chain,
            transport: http(rpcUrl)
        });

        console.log(`Wallet initialized on ${network} with address: ${this.address}`);
    }

    async connect(): Promise<void> {
        if (!this.address) {
            throw new Error('WalletService not initialized');
        }
        
        // Verify connection by checking balance
        try {
            await this.getBalance();
            console.log('Wallet connected successfully');
        } catch (error) {
            throw new Error(`Failed to connect wallet: ${error}`);
        }
    }

    async getAddress(): Promise<string> {
        if (!this.address) {
            throw new Error('WalletService not initialized');
        }
        return this.address;
    }

    async signTransaction(tx: any): Promise<any> {
        if (!this.walletClient) {
            throw new Error('WalletService not initialized');
        }

        try {
            const signedTx = await this.walletClient.signTransaction(tx);
            return signedTx;
        } catch (error: any) {
            throw new Error(`Failed to sign transaction: ${error.message}`);
        }
    }

    async getBalance(token?: string): Promise<BigNumber> {
        if (!this.publicClient || !this.address) {
            throw new Error('WalletService not initialized');
        }

        try {
            if (!token) {
                // Get native token balance (ETH)
                const balance = await this.publicClient.getBalance({
                    address: this.address
                });
                return new BigNumber(balance.toString()).dividedBy(1e18);
            } else {
                // Get ERC20 token balance
                const erc20ABI = [
                    {
                        inputs: [{ name: 'owner', type: 'address' }],
                        name: 'balanceOf',
                        outputs: [{ name: '', type: 'uint256' }],
                        stateMutability: 'view',
                        type: 'function'
                    },
                    {
                        inputs: [],
                        name: 'decimals',
                        outputs: [{ name: '', type: 'uint8' }],
                        stateMutability: 'view',
                        type: 'function'
                    }
                ];

                const [balance, decimals] = await Promise.all([
                    this.publicClient.readContract({
                        address: token as Address,
                        abi: erc20ABI,
                        functionName: 'balanceOf',
                        args: [this.address]
                    }),
                    this.publicClient.readContract({
                        address: token as Address,
                        abi: erc20ABI,
                        functionName: 'decimals'
                    })
                ]);

                return new BigNumber(balance.toString()).dividedBy(10 ** decimals);
            }
        } catch (error: any) {
            throw new Error(`Failed to get balance: ${error.message}`);
        }
    }

    async approveToken(
        token: string,
        spender: string,
        amount: BigNumber
    ): Promise<string> {
        if (!this.walletClient || !this.publicClient || !this.address) {
            throw new Error('WalletService not initialized');
        }

        try {
            const erc20ABI = [
                {
                    inputs: [
                        { name: 'spender', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                    ],
                    name: 'approve',
                    outputs: [{ name: '', type: 'bool' }],
                    stateMutability: 'nonpayable',
                    type: 'function'
                },
                {
                    inputs: [],
                    name: 'decimals',
                    outputs: [{ name: '', type: 'uint8' }],
                    stateMutability: 'view',
                    type: 'function'
                }
            ];

            // Get token decimals
            const decimals = await this.publicClient.readContract({
                address: token as Address,
                abi: erc20ABI,
                functionName: 'decimals'
            });

            // Convert amount to proper decimals
            const amountInWei = parseUnits(amount.toString(), decimals);

            // Simulate the transaction first
            const { request } = await this.publicClient.simulateContract({
                account: this.account,
                address: token as Address,
                abi: erc20ABI,
                functionName: 'approve',
                args: [spender as Address, amountInWei]
            });

            // Execute the transaction
            const hash = await this.walletClient.writeContract(request);
            
            console.log(`Approval transaction sent: ${hash}`);
            return hash;
        } catch (error: any) {
            throw new Error(`Failed to approve token: ${error.message}`);
        }
    }

    async waitForTransaction(hash: string): Promise<any> {
        if (!this.publicClient) {
            throw new Error('WalletService not initialized');
        }

        try {
            const receipt = await this.publicClient.waitForTransactionReceipt({
                hash: hash as `0x${string}`,
                confirmations: 2
            });

            if (receipt.status === 'reverted') {
                throw new Error('Transaction reverted');
            }

            return receipt;
        } catch (error: any) {
            throw new Error(`Failed to wait for transaction: ${error.message}`);
        }
    }

    // Helper method to check if we have enough balance for gas
    async hasEnoughGasBalance(estimatedGas?: bigint): Promise<boolean> {
        if (!this.publicClient || !this.address) {
            throw new Error('WalletService not initialized');
        }

        try {
            const [balance, gasPrice] = await Promise.all([
                this.publicClient.getBalance({ address: this.address }),
                this.publicClient.getGasPrice()
            ]);

            // Default to 300k gas if not provided
            const gasLimit = estimatedGas || BigInt(300000);
            const requiredBalance = gasLimit * gasPrice;

            return balance >= requiredBalance;
        } catch (error) {
            console.error('Failed to check gas balance:', error);
            return false;
        }
    }

    // Helper method to estimate gas for a transaction
    async estimateGas(tx: any): Promise<bigint> {
        if (!this.publicClient) {
            throw new Error('WalletService not initialized');
        }

        try {
            const gasEstimate = await this.publicClient.estimateGas({
                ...tx,
                account: this.account
            });

            // Add 20% buffer to gas estimate
            return (gasEstimate * BigInt(120)) / BigInt(100);
        } catch (error: any) {
            console.error('Failed to estimate gas:', error);
            // Return default gas limit if estimation fails
            return BigInt(300000);
        }
    }

    // Helper method to get current gas price
    async getGasPrice(): Promise<BigNumber> {
        if (!this.publicClient) {
            throw new Error('WalletService not initialized');
        }

        try {
            const gasPrice = await this.publicClient.getGasPrice();
            return new BigNumber(gasPrice.toString());
        } catch (error: any) {
            throw new Error(`Failed to get gas price: ${error.message}`);
        }
    }

    // Helper method to transfer native tokens
    async transferNative(to: string, amount: BigNumber): Promise<string> {
        if (!this.walletClient || !this.publicClient || !this.address) {
            throw new Error('WalletService not initialized');
        }

        try {
            const value = parseUnits(amount.toString(), 18);

            const hash = await this.walletClient.sendTransaction({
                to: to as Address,
                value
            });

            console.log(`Native transfer transaction sent: ${hash}`);
            return hash;
        } catch (error: any) {
            throw new Error(`Failed to transfer native tokens: ${error.message}`);
        }
    }

    // Helper method to transfer ERC20 tokens
    async transferToken(
        token: string,
        to: string,
        amount: BigNumber
    ): Promise<string> {
        if (!this.walletClient || !this.publicClient || !this.address) {
            throw new Error('WalletService not initialized');
        }

        try {
            const erc20ABI = [
                {
                    inputs: [
                        { name: 'to', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                    ],
                    name: 'transfer',
                    outputs: [{ name: '', type: 'bool' }],
                    stateMutability: 'nonpayable',
                    type: 'function'
                },
                {
                    inputs: [],
                    name: 'decimals',
                    outputs: [{ name: '', type: 'uint8' }],
                    stateMutability: 'view',
                    type: 'function'
                }
            ];

            // Get token decimals
            const decimals = await this.publicClient.readContract({
                address: token as Address,
                abi: erc20ABI,
                functionName: 'decimals'
            });

            // Convert amount to proper decimals
            const amountInWei = parseUnits(amount.toString(), decimals);

            // Simulate the transaction first
            const { request } = await this.publicClient.simulateContract({
                account: this.account,
                address: token as Address,
                abi: erc20ABI,
                functionName: 'transfer',
                args: [to as Address, amountInWei]
            });

            // Execute the transaction
            const hash = await this.walletClient.writeContract(request);
            
            console.log(`Token transfer transaction sent: ${hash}`);
            return hash;
        } catch (error: any) {
            throw new Error(`Failed to transfer tokens: ${error.message}`);
        }
    }
}