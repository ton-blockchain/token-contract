import { Blockchain, SandboxContract, TreasuryContract, internal } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, CommonMessageInfoInternal, TransactionDescriptionGeneric, TransactionComputeVm, contractAddress } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Op, Errors } from '../wrappers/JettonConstants';
import { randomAddress } from '@ton/test-utils';
import { createBouncedMessage } from './utils';

describe("Jetton Wallet", () => {
    const min_tons_for_storage = 10000000n; // 0.01 TON
    
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

    describe('When bounces', () => {
        it('wallet should restore balance on internal_transfer bounce', async () => {
            const initialBalance = sut.config.balance;
            
            const txAmount = toNano(Math.random());
            
            const result = sut.receiveMessage(
                createBouncedMessage({
                    from: userWallet(notOwner.address).address,
                    to: sut.address,
                    body: JettonWallet.internalTransferMessage(0n, txAmount, owner.address, owner.address, 0n, null),
                    value: toNano(1n)
                })
            );
            expect(result).toHaveTransaction({ success: true });

            // Balance should roll back
            expect(sut.config.balance).toEqual(initialBalance + txAmount);
        });

        it('wallet should restore balance on burn_notification bounce', async () => {
            const initialBalance = sut.config.balance;
            
            const txAmount = toNano(Math.random());
            
            const result = sut.receiveMessage(
                createBouncedMessage({
                    from: userWallet(notOwner.address).address,
                    to: sut.address,
                    body: JettonWallet.burnNotificationMessage(0n, txAmount, owner.address, owner.address),
                    value: toNano(1n)
                })
            );
            expect(result).toHaveTransaction({ success: true });

            // Balance should roll back
            expect(sut.config.balance).toEqual(initialBalance + txAmount);
        });
    });

    describe.skip("when withdraw_tons", () => {
        it('owner can withdraw excesses', async () => {
            const withdrawResult = sut.sendWithdrawTons(owner.address);
            expect(withdrawResult.outMessages.get(0)?.info.dest).toEqualAddress(owner.address);

            expect(sut.balance).toEqual(min_tons_for_storage);
        });

        it('not owner can not withdraw excesses', async () => {
            const withdrawResult = sut.sendWithdrawTons(notOwner.address);
            
            expect(withdrawResult).toHaveTransaction({ exitCode: Errors.not_owner });
        });
    })

    describe.skip("when withdraw_jettons", () => {
        it('owner can withdraw jettons owned by JettonWallet', async () => {
            let sentAmount = toNano('0.5');
            
            let withdrawResult = sut.sendWithdrawJettons(
                owner.address, 
                userWallet(sut.address).address,
                sentAmount);
            expect(withdrawResult.outMessages.get(0)?.body.toString()).toEqual(
                JettonWallet.transferMessage(sentAmount, owner.address, 0n, owner.address, null, 0n, null).toString()
            );
        });
        
        it('not owner can not withdraw jettons owned by JettonWallet', async () => {
            let sentAmount = toNano('0.5');
            
            let withdrawResult = sut.sendWithdrawJettons(notOwner.address, userWallet(sut.address).address, sentAmount);
            expect(withdrawResult).toHaveTransaction({ exitCode: Errors.not_owner });
        });
    })
    
    it('jettonWallet can process 250 transfer', async () => {
        //         
        let initialJettonBalance = sut.jettonBalance;
        let sentAmount = 1n, count = 250n;
        let forwardAmount = toNano('0.05');
        let sendResult: any;
        let payload = beginCell()
                            .storeUint(0x12345678, 32).storeUint(0x87654321, 32)
                            .storeRef(beginCell().storeUint(0x12345678, 32).storeUint(0x87654321, 108).endCell())
                            .storeRef(beginCell().storeUint(0x12345671, 32).storeUint(0x87654321, 240).endCell())
                            .storeRef(beginCell().storeUint(0x12345672, 32).storeUint(0x87654321, 77)
                                                .storeRef(beginCell().endCell())
                                                .storeRef(beginCell().storeUint(0x1245671, 91).storeUint(0x87654321, 32).endCell())
                                                .storeRef(beginCell().storeUint(0x2245671, 180).storeUint(0x87654321, 32).endCell())
                                                .storeRef(beginCell().storeUint(0x8245671, 255).storeUint(0x87654321, 32).endCell())
                                    .endCell())
                        .endCell();
        let initialBalance = (await blockchain.getContract(sut.address)).balance;
        for(let i = 0; i < count; i++) {
            sendResult = sut.sendTransfer(owner.address, toNano('0.1'), //tons
                    sentAmount, notOwner.address, 0n,
                    owner.address, Cell.EMPTY, forwardAmount, payload);
        }
        // last chain was successful
        expect(sendResult).toHaveTransaction({ success: true });

        expect(sut.jettonBalance).toEqual(initialJettonBalance - sentAmount*count);

        let finalBalance = (await blockchain.getContract(sut.address)).balance;

        // if it is not true, it's ok but gas_consumption constant is too high
        // and excesses of TONs will be accrued on wallet
        if (finalBalance > initialBalance + toNano('0.001') || finalBalance < initialBalance - toNano('0.001')) {
            console.warn("gas_consumption constant is too high, excesses of TONs will be accrued on wallet")
        }
    });
})