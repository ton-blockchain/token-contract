import { Blockchain, SandboxContract, TreasuryContract, internal } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, CommonMessageInfoInternal, TransactionDescriptionGeneric, TransactionComputeVm, contractAddress } from '@ton/core';
import { JettonWallet, jettonWalletConfigToCell } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Op, Errors } from '../wrappers/JettonConstants';
import { randomAddress } from '@ton/test-utils';
import { jettonContentToCell, JettonMinter, JettonMinterConfig } from '../wrappers/JettonMinter';

describe('TEP 74 - Fungible tokens (Jettons) standard', () => {
    describe("Jetton Wallet", () => {
        const min_tons_for_storage = 10000000n; // 0.01 TON
        const gas_consumption = 15000000n; // 0.01 TON
        
        let jwallet_code:Cell;
    
        beforeAll(async () => {
            jwallet_code = await compile('JettonWallet');
        });
    
        let blockchain: Blockchain;
        let owner:SandboxContract<TreasuryContract>;
        let notOwner:SandboxContract<TreasuryContract>;
        let userWallet:(address:Address) => JettonWallet;
        let jettonMinterAddress: Address;
        let sut: JettonWallet;
        
        beforeEach(async () => {
            blockchain     = await Blockchain.create();
            jettonMinterAddress = randomAddress();
            owner       = await blockchain.treasury('owner');
            notOwner    = await blockchain.treasury('notOwner');
            userWallet = (address:Address) => JettonWallet.createFromConfig(
                blockchain,
                {
                    balance: 0n,
                    jetton_master_address: jettonMinterAddress,
                    jetton_wallet_code: jwallet_code,
                    owner_address: address
                },
                jwallet_code
            );
            sut = userWallet(owner.address);
            sut.config = {
                balance: toNano(1n),
                jetton_master_address: jettonMinterAddress,
                jetton_wallet_code: jwallet_code,
                owner_address: owner.address
            }
            sut.balance = toNano(1n);
        });
    
        describe("when transfer message is received", () => {
            describe("should be rejected if", () => {
                it('sender is not wallet owner, throw `not_owner`', () => {
                    let initialJettonBalance = sut.jettonBalance;
        
                    let sentAmount = toNano('0.5');
                    const sendResult = sut.sendTransfer(
                        notOwner.address, 
                        toNano('0.1'), //tons
                        sentAmount, 
                        notOwner.address,
                        0n,
                        owner.address, 
                        null, 
                        toNano('0.05'), 
                        null);
                    
                    expect(sendResult).toHaveTransaction({ exitCode: Errors.not_owner });
                    expect(sendResult.outMessagesCount).toBe(1); // bounced message
                    expect(sendResult.outMessages.get(0)?.info.dest).toEqualAddress(notOwner.address);
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });

                it('jetton transfer is greater than balance, throw `balance_error`', () => {
                    let initialJettonBalance = sut.jettonBalance;
                    
                    let sentAmount = initialJettonBalance + 1n;
                    let forwardAmount = toNano('0.05');
                    const sendResult = sut.sendTransfer(
                        owner.address, 
                        toNano('0.1'), //tons
                        sentAmount, 
                        notOwner.address,
                        0n,
                        owner.address, 
                        null, 
                        forwardAmount, 
                        null);
                    expect(sendResult).toHaveTransaction({ exitCode: Errors.balance_error });
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });

                it('sender can not guarantee excesses to response_destination, throw `not_enought_ton`', () => {
                    let fwdFee = 100n;
                    let fwdFeeExaggerated = (fwdFee*3n)/2n;
                    let initialJettonBalance = sut.jettonBalance;
                    const someAddress = Address.parse("EQD__________________________________________0vo");
                    
                    let forwardAmount = toNano('0.3');
                    /*
                                    forward_ton_amount +
                                    fwd_count * fwd_fee +
                                    (2 * gas_consumption + min_tons_for_storage));
                    */
                    let minimalFee = 2n* fwdFeeExaggerated + 2n*gas_consumption + min_tons_for_storage;
                    let sentAmount = forwardAmount + minimalFee; // not enough, need >
                    let forwardPayload = null;
                    let sendResult = sut.sendTransfer(owner.address, sentAmount,
                            sentAmount, someAddress, 0n,
                            owner.address, Cell.EMPTY, forwardAmount, forwardPayload,
                            fwdFee);

                    expect(sendResult).toHaveTransaction({ exitCode: Errors.not_enough_ton });
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });

                it('not enough tons for forward, throw `not_enought_ton`', () => {
                    let initialJettonBalance = sut.jettonBalance;
                    let sentAmount = toNano('0.1');
                    let forwardAmount = toNano('0.3');
                    let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
                    
                    const sendResult = sut.sendTransfer(
                        owner.address, 
                        forwardAmount, // not enough tons, no tons for gas
                        sentAmount, 
                        notOwner.address,
                        0n, // queryId
                        owner.address, 
                        Cell.EMPTY, 
                        forwardAmount, 
                        forwardPayload);
                        
                    expect(sendResult).toHaveTransaction({ exitCode: Errors.not_enough_ton });
                    // Make sure value bounced
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });
            });

            describe("otherwise should do", () => {

                it('decrease jetton amount', () => {
                    // given
                    let initialJettonBalance = sut.jettonBalance;
                    let sentAmount = toNano('0.5');
                    let forwardAmount = toNano('0.05');
                    let queryId = toNano(Math.random());
        
                    // when
                    const sendResult = sut.sendTransfer(
                        owner.address, 
                        toNano('0.1'), // tons,
                        sentAmount, 
                        notOwner.address,
                        queryId,
                        owner.address, // responseAddress 
                        null, // customPayload
                        forwardAmount, 
                        null); // forwardPayload
                    
                    // then
                    expect(sendResult).toHaveTransaction({ success: true });
                    expect(sut.jettonBalance).toEqual(initialJettonBalance - sentAmount);
                });

                it('send internal_transfer to receiver wallet for further processing', async() => {
                    // given
                    let sentAmount = toNano('0.5');
                    let forwardAmount = toNano('0.05');
                    let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
                    let queryId = toNano(Math.random());
        
                    // when
                    const sendResult = sut.sendTransfer(
                        owner.address, 
                        toNano('0.1'), // tons,
                        sentAmount, 
                        notOwner.address,
                        queryId,
                        owner.address, // responseAddress 
                        null, // customPayload
                        forwardAmount, 
                        forwardPayload); // forwardPayload
                    
                    // then
                    expect(sendResult.outMessagesCount).toBe(1);
                    expect(sendResult.outMessages.get(0)?.body.toString()).toEqual(
                        JettonWallet.internalTransferMessage(queryId, sentAmount, owner.address, owner.address, forwardAmount, forwardPayload).toString()
                    )
                })
            })

            describe("on successful transfer when internal_transfer message is received by receiver wallet", () => {
                it('should be rejected if is not from wallet, throw `not_valid_wallet`', () => {
                    let initialJettonBalance = sut.jettonBalance;
                    
                    let internalTransfer = JettonWallet.internalTransferMessage(
                        0n,
                        1n,
                        notOwner.address,
                        owner.address,
                        0n,
                        null
                    );
                    const sendResult = sut.receiveMessage(internal({
                                from: notOwner.address,
                                to: sut.address,
                                body: internalTransfer,
                                value: toNano('0.3')
                            }));
                    expect(sendResult).toHaveTransaction({ exitCode: Errors.not_valid_wallet });
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });
    
                describe("otherwise should do", () => {
                    it('increase balance', () => {
                        let initialJettonBalance = sut.jettonBalance;
                        
                        let internalTransfer = JettonWallet.internalTransferMessage(
                            0n,
                            1n,
                            notOwner.address,
                            owner.address,
                            0n,
                            null
                        );
                        const receiveResult = sut.receiveMessage(internal({
                                    from: userWallet(notOwner.address).address,
                                    to: sut.address,
                                    body: internalTransfer,
                                    value: toNano('0.3')
                                }));
                        expect(receiveResult).toHaveTransaction({ success: true });
                        expect(sut.jettonBalance).toEqual(initialJettonBalance + 1n);
                    });
        
                    it('skip transfer_notification if forward_amount = 0', () => {
                        let receivedAmount = toNano('0.5');
                        let forwardAmount = 0n;
                        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
                        let internalTransfer = JettonWallet.internalTransferMessage(
                            0n,
                            receivedAmount,
                            notOwner.address,
                            owner.address,
                            forwardAmount,
                            forwardPayload
                        );
                        const sendResult = sut.receiveMessage(internal({
                                    from: userWallet(notOwner.address).address,
                                    to: sut.address,
                                    body: internalTransfer,
                                    value: toNano('0.3')
                                }));
                        
                        expect(sendResult).toHaveTransaction({ success: true });
                        expect(sendResult.outMessages.values().map( mes => mes?.body.beginParse().loadUint(32) )).not.toContain(Op.transfer_notification);
                    });

                    it('send transfer_notification to wallet owner', () => {
                        let forwardAmount = 1n;
                        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
                        let queryId = toNano(Math.random());
                        let internalTransfer = JettonWallet.internalTransferMessage(
                            queryId,
                            1n,
                            notOwner.address,
                            owner.address,
                            forwardAmount,
                            forwardPayload
                        );

                        const receiveResult = sut.receiveMessage(internal({
                                    from: userWallet(notOwner.address).address,
                                    to: sut.address,
                                    body: internalTransfer,
                                    value: toNano('0.3')
                                }));
                        
                        expect(receiveResult).toHaveTransaction({ success: true });
                        expect(receiveResult.outMessages.values().map(msg => msg.body.toString())).toContain(
                            JettonWallet.transferNotificationMessage(queryId, forwardAmount, notOwner.address, forwardPayload).toString()
                        );
                    });

                    it("send all excesses of incoming message coins to response_destination", () => {
                        let receivedAmount = toNano('0.5');
                        let forwardAmount = 0n;
                        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
                        let queryId = toNano(Math.random());
                        let internalTransfer = JettonWallet.internalTransferMessage(
                            queryId,
                            receivedAmount,
                            notOwner.address,
                            owner.address,
                            forwardAmount,
                            forwardPayload
                        );
                        let messageValue = toNano(0.3);

                        const sendResult = sut.receiveMessage(internal({
                                    from: userWallet(notOwner.address).address,
                                    to: sut.address,
                                    body: internalTransfer,
                                    value: toNano('0.3')
                                }));
                        
                        expect(sendResult).toHaveTransaction({ success: true });
                        expect(sendResult.outMessages.get(0)?.body).toEqualCell(
                            beginCell()
                                .storeUint(Op.excesses, 32)
                                .storeUint(queryId, 64)
                            .endCell()
                        );

                        // gas consumption is deducted manually instead of sending all remaining message value
                        // Otherwise it `gas_consumption` const should be replaced by  
                        // ((sendResult.description as TransactionDescriptionGeneric).computePhase! as TransactionComputeVm).gasFees
                        expect((sendResult.outMessages.get(0)?.info as CommonMessageInfoInternal).value.coins).toEqual(
                            messageValue
                                - gas_consumption
                                - (sendResult.description as TransactionDescriptionGeneric).actionPhase!.totalFwdFees!
                        );
                    })
                })
            })
        })

        describe("when burn message is received", () => {
            describe("should be rejected if", () => {
                it('message is not from the owner, throw `not_owner`', () => {
                    let initialJettonBalance = sut.jettonBalance;
                    let burnAmount = toNano('0.01');

                    // when
                    const sendResult = sut.sendBurn(
                        notOwner.address, 
                        toNano('0.1'), // ton amount
                        burnAmount, // amount 
                        owner.address, // response_address
                        Cell.EMPTY); // custom payload
                    
                    // then
                    expect(sendResult).toHaveTransaction({ exitCode: Errors.not_owner });
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });

                it('there is no enough jettons on the sender wallet, throw `balance_error`', () => {
                    let initialJettonBalance = sut.jettonBalance;
                    let burnAmount = initialJettonBalance + 1n;
                    const sendResult = sut.sendBurn(owner.address, toNano('0.1'), // ton amount
                                            burnAmount, owner.address, Cell.EMPTY); // amount, response address, custom payload
    
    
                    expect(sendResult).toHaveTransaction({ exitCode: Errors.balance_error });
                    expect(sut.jettonBalance).toEqual(initialJettonBalance);
                });

                it("there's no enough TONs to guarantee excesses being sent to response_destination", () => {
                    let initialJettonBalance   = sut.jettonBalance;
                    let burnAmount   = toNano('0.01');
                    let fwd_fee      = 100n;
                    let fwdFeeExaggerated = (fwd_fee*3n)/2n;
                    let minimalFee   = fwdFeeExaggerated + 2n*gas_consumption;
            
                    const sendLow    = sut.sendBurn(owner.address, minimalFee, // ton amount
                                        burnAmount, owner.address, Cell.EMPTY, // amount, response address, custom payload
                                        fwd_fee);
                                        
                    expect(sendLow).toHaveTransaction({ exitCode: Errors.not_enough_gas });
                    expect(sut.config.balance).toEqual(initialJettonBalance);
                });
            })

            describe("otherwise should do", () => {
                it('decrease jetton amount on burner wallet', () => {
                    let initialJettonBalance = sut.jettonBalance;
    
                    let burnAmount = toNano('0.01');
                    const burnResult = sut.sendBurn(
                        owner.address, 
                        toNano('0.1'), // ton amount
                        burnAmount, // amount
                        owner.address, // response address 
                        Cell.EMPTY); // custom payload
                    
                    expect(burnResult).toHaveTransaction({ success: true });
                    
                    // balance update
                    expect(sut.jettonBalance).toEqual(initialJettonBalance - burnAmount);
                });

                it('send burn notification to jetton master', () => {
                    let burnAmount = toNano('0.01');
                    let queryId = toNano(Math.random());
                    const burnResult = sut.sendBurn(
                        owner.address, 
                        toNano('0.1'), // ton amount
                        burnAmount, // amount
                        owner.address, // response address 
                        Cell.EMPTY, // custom payload
                        0n, queryId); 
                    
                    expect(burnResult).toHaveTransaction({ success: true });
                    expect(burnResult.outMessagesCount).toEqual(1);
                    
                    // burn notification 
                    expect(burnResult.outMessages.get(0)?.body).toEqualCell(
                        JettonWallet.burnNotificationMessage(queryId, burnAmount, owner.address, owner.address)
                    );
                    expect(burnResult.outMessages.get(0)?.info.dest).toEqualAddress(jettonMinterAddress);
                })
            })
        })

        it("when get_wallet_data method is invoked then return current config", async () => {
            // given
            const expectedConfig = { 
                balance: toNano(Math.random()),
                owner_address: owner.address,
                jetton_master_address: randomAddress(),
                jetton_wallet_code: jwallet_code
            };
            sut.config = expectedConfig;
        
            // when
            let actualConfig = sut.getWalletData()
        
            // then
            expect(actualConfig.balance).toEqual(expectedConfig.balance);
            expect(actualConfig.jetton_master_address).toEqualAddress(expectedConfig.jetton_master_address);
            expect(actualConfig.owner_address).toEqualAddress(expectedConfig.owner_address);
            expect(actualConfig.jetton_wallet_code).toEqualCell(expectedConfig.jetton_wallet_code);
        })
    })

    describe("Jetton Master", () => {
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
        });

        describe("when burn_notification", () => {
            let burnAmount = toNano('1');

            it('should be rejected if is not from wallet, throw `unouthorized_burn`', async () => {
                // when
                let res = jettonMinter.sendBurnNotification(
                    notDeployer.address, 
                    burnAmount, 
                    notDeployer.address,
                    deployer.address
                )
        
                // then
                expect(res).toHaveTransaction({ exitCode: Errors.unouthorized_burn });
            });

            describe('otherwise should do', () => {
                it("decrease total_supply", async () => {
                    // given
                    let initialSupply = toNano(1);
                    let jettonWalletAddress = await jettonMinter.getWalletAddress(notDeployer.address);
                    jettonMinter.config = {
                        ...defaultConfig,
                        totalSupply: initialSupply
                    }

                    // when
                    let res = jettonMinter.sendBurnNotification(
                        jettonWalletAddress, 
                        burnAmount, 
                        notDeployer.address,
                        deployer.address
                    );

                    // then
                    expect(res).toHaveTransaction({ success: true });
                    expect(jettonMinter.config.totalSupply).toEqual(initialSupply - burnAmount);
                })

                it("send all excesses of incoming message coins to response_destination", async () => {
                    let initialSupply = toNano(1);
                    let jettonWalletAddress = await jettonMinter.getWalletAddress(notDeployer.address);
                    jettonMinter.config = {
                        ...defaultConfig,
                        totalSupply: initialSupply
                    }
                    let queryId = toNano(Math.random());
                    let messageValue = toNano(1);
                    
                    // when
                    let res = jettonMinter.sendBurnNotification(
                        jettonWalletAddress, 
                        burnAmount, 
                        notDeployer.address,
                        deployer.address,
                        messageValue,
                        queryId
                    );
                    
                    expect(res).toHaveTransaction({ success: true });
                    expect(res.outMessages.get(0)?.body).toEqualCell(
                        beginCell()
                            .storeUint(Op.excesses, 32)
                            .storeUint(queryId, 64)
                        .endCell()
                    );
                    
                    expect((res.outMessages.get(0)?.info as CommonMessageInfoInternal).value.coins).toEqual(
                        messageValue
                            - ((res.description as TransactionDescriptionGeneric).computePhase! as TransactionComputeVm).gasFees
                            - (res.description as TransactionDescriptionGeneric).actionPhase!.totalFwdFees!
                    );
                })
            });
            
        });

        it("when get_jetton_data method is invoked then return current config", async () => {
            // given
            const expectedConfig: JettonMinterConfig = {
                totalSupply: toNano(Math.random()),
                admin: deployer.address,
                content: defaultContent,
                wallet_code: beginCell().endCell()
            };
            jettonMinter.config = expectedConfig;
        
            // when
            let actualConfig = jettonMinter.getJettonData()
        
            // then
            expect(actualConfig.totalSupply).toEqual(expectedConfig.totalSupply);
            expect(actualConfig.admin).toEqualAddress(expectedConfig.admin);
            expect(actualConfig.content).toEqualCell(expectedConfig.content);
            expect(actualConfig.wallet_code).toEqualCell(expectedConfig.wallet_code);
        })

        it("when get_wallet_address method is invoked then return jetton wallet address for given owner address", async () => {
            // given
            const userAddress = randomAddress();
            const expectedWalletAddress = contractAddress(0, {
                code: jettonMinter.config.wallet_code,
                data: jettonWalletConfigToCell({
                    balance: 0n,
                    jetton_master_address: jettonMinter.address,
                    jetton_wallet_code: jettonMinter.config.wallet_code,
                    owner_address: userAddress
                })
            });
        
            // when
            let actualWalletAddress = jettonMinter.getWalletAddress(userAddress);
        
            // then
            expect(actualWalletAddress).toEqualAddress(expectedWalletAddress);
        })
    })
});
