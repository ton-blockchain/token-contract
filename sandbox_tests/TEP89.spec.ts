import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, contractAddress } from '@ton/core';
import { jettonWalletConfigToCell } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Op, Errors } from '../wrappers/JettonConstants';
import { randomAddress } from '@ton/test-utils';
import { jettonContentToCell, JettonMinter, JettonMinterConfig } from '../wrappers/JettonMinter';

describe('TEP 89 - Discoverable Jettons Wallets', () => {
    describe("Jetton Master", () => {
        const provideAddressGasConsumption = 10000000n; // defined in contract

        let code: Cell;
        let defaultConfig: JettonMinterConfig
        let defaultContent:Cell;
        let jwallet_code:Cell;

        beforeAll(async () => {
            code = await compile('JettonMinter');
            defaultContent = jettonContentToCell({type: 1, uri: "https://testjetton.org/content.json"});
            jwallet_code = beginCell().endCell();
        });

        let blockchain: Blockchain;
        let deployer: SandboxContract<TreasuryContract>;
        let notDeployer: SandboxContract<TreasuryContract>;
        let jettonMinter: JettonMinter;
        let userWalletAddress: (userAddress: Address) => Address
        
        beforeEach(async () => {
            blockchain = await Blockchain.create();
            deployer = await blockchain.treasury('deployer');
            notDeployer = await blockchain.treasury('notDeployer');
            defaultConfig = {
                totalSupply: 0n,
                admin: deployer.address,
                content: defaultContent,
                wallet_code: jwallet_code
            }
            jettonMinter = JettonMinter.createFromConfig(blockchain, defaultConfig, code, 0, toNano("1"));
            jettonMinter.config = defaultConfig;
            jettonMinter.balance = toNano(1n);
            userWalletAddress = function (userAddress) {
                return contractAddress(0, {
                    code: jettonMinter.config.wallet_code,
                    data: jettonWalletConfigToCell({
                        balance: 0n,
                        jetton_master_address: jettonMinter.address,
                        jetton_wallet_code: jettonMinter.config.wallet_code,
                        owner_address: userAddress
                    })
                });
            }
        });

        describe("when provide_wallet_address message is received", () => {
            
            it('report correct wallet address', async () => {
                let discoveryResult = jettonMinter.sendDiscovery(deployer.address, deployer.address, false);
                /*
                take_wallet_address#d1735400 query_id:uint64 wallet_address:MsgAddress owner_address:(Maybe ^MsgAddress) = InternalMsgBody;
                */
               const deployerJettonWalletAddress = userWalletAddress(deployer.address);
               expect(discoveryResult.outMessages.get(0)?.body).toEqualCell(
                    beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                        .storeAddress(deployerJettonWalletAddress)
                        .storeUint(0, 1)
                        .endCell()
                );
            });
            
            it('include owner_address in response if include_address is true', async () => {
                /*
                take_wallet_address#d1735400 query_id:uint64 wallet_address:MsgAddress owner_address:(Maybe ^MsgAddress) = InternalMsgBody;
                */
                let discoveryResult = jettonMinter.sendDiscovery(deployer.address, notDeployer.address, true);
                const notDeployerJettonWalletAddress = userWalletAddress(notDeployer.address);
                expect(discoveryResult.outMessages.get(0)?.body).toEqualCell(
                    beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                        .storeAddress(notDeployerJettonWalletAddress)
                        .storeUint(1, 1)
                        .storeRef(beginCell().storeAddress(notDeployer.address).endCell())
                        .endCell()
                );
            });
            
            it('Should reject if amount of incoming value is not enough to calculate wallet address', async () => {
                const fwdFee = 10000n; // arbitrary
                const minimalFee = ((fwdFee*3n)/2n) + provideAddressGasConsumption;
                
                let discoveryResult = jettonMinter.sendDiscovery(deployer.address, notDeployer.address, false, minimalFee, fwdFee);
        
                expect(discoveryResult).toHaveTransaction({ exitCode: Errors.discovery_fee_not_matched });
                
                /*
                * Might be helpfull to have logical OR in expect lookup
                * Because here is what is stated in standard:
                * and either throw an exception if amount of incoming value is not enough to calculate wallet address
                * or response with message (sent with mode 64)
                * https://github.com/ton-blockchain/TEPs/blob/master/text/0089-jetton-wallet-discovery.md
                * At least something like
                * expect(discoveryResult.hasTransaction({such and such}) ||
                * discoveryResult.hasTransaction({yada yada})).toBeTruethy()
                */
            });
        
            it('return addr_none if generating wallet address is impossible for the given address', async () =>{
                const badAddr = randomAddress(-1);
                
                let discoveryResult = jettonMinter.sendDiscovery(deployer.address, badAddr, false);
                
                expect(discoveryResult.outMessages.get(0)?.body).toEqualCell(
                    beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                            .storeUint(0, 2) // addr_none
                            .storeUint(0, 1)
                            .endCell()
                );
        
                // Include address should still be available
                discoveryResult = jettonMinter.sendDiscovery(deployer.address, badAddr, true); // Include addr
                
                expect(discoveryResult.outMessages.get(0)?.body).toEqualCell(
                    beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                    .storeUint(0, 2) // addr_none
                    .storeUint(1, 1)
                    .storeRef(beginCell().storeAddress(badAddr).endCell())
                    .endCell()
                );
            });
        })
    })
});
