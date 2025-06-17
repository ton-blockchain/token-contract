import { Address, beginCell, Cell, Contract, contractAddress, Message, ShardAccount, Slice, toNano } from '@ton/core';
import { Blockchain, createShardAccount, internal, SmartContract, SmartContractTransaction } from '@ton/sandbox';
import { Op } from './JettonConstants';
import { AccountStateActive } from '@ton/core/dist/types/AccountState';

export type JettonWalletConfig = {
    balance:bigint;
    owner_address:Address;
    jetton_master_address:Address;
    jetton_wallet_code:Cell;
};

export function jettonWalletConfigToCell(config: JettonWalletConfig): Cell {
    return beginCell()
            .storeCoins(config.balance ?? 0)
            .storeAddress(config.owner_address)
            .storeAddress(config.jetton_master_address)
            .storeRef(config.jetton_wallet_code)
            .endCell();
}

function cellToJettonWalletConfig(cell: Cell): JettonWalletConfig {
    let slice = cell.beginParse()
    return {
        balance: slice.loadCoins(),
        owner_address: slice.loadAddress(),
        jetton_master_address: slice.loadAddress(),
        jetton_wallet_code: slice.loadRef()
    }
}

export class JettonWallet implements Contract {
    constructor(readonly address: Address, private readonly smc: SmartContract, readonly init?: { code: Cell; data: Cell }) { }
    
    static createFromAddress(blockchain: Blockchain, address: Address) {
        return new JettonWallet(address, SmartContract.empty(blockchain, address));
    }
    static createFromConfig(blockchain: Blockchain, config: JettonWalletConfig, code: Cell, workchain = 0, balance = toNano(1n)) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        const smc = SmartContract.create(blockchain, {
            address: contractAddress(workchain, init),
            balance,
            code,
            data
        })
        return new JettonWallet(contractAddress(workchain, init), smc, init);
    }

    sendDeploy(from: Address, balance: bigint = toNano("0.01")): SmartContractTransaction {
        return this.smc.receiveMessage(internal({
            to: this.address,
            from,
            body: beginCell().endCell(),
            value: balance
        }));
    }
    
    /*
        transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
                 response_destination:MsgAddress custom_payload:(Maybe ^Cell)
                 forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell)
                 = InternalMsgBody;
    */
    static transferMessage(jettonAmount: bigint, 
                            to: Address,
                            queryId: bigint,
                            responseAddress:Address,
                            customPayload: Cell | null,
                            forward_ton_amount: bigint,
                            forwardPayload: Cell | null) {
        return beginCell()
            .storeUint(Op.transfer, 32)
            .storeUint(queryId, 64) // op, queryId
            .storeCoins(jettonAmount)
            .storeAddress(to)
            .storeAddress(responseAddress)
            .storeMaybeRef(customPayload)
            .storeCoins(forward_ton_amount)
            .storeMaybeRef(forwardPayload)
            .endCell();
    }
    sendTransfer(from: Address,
                              value: bigint,
                              jettonAmount: bigint, 
                              to: Address,
                              queryId: bigint,
                              responseAddress:Address,
                              customPayload: Cell | null,
                              forward_ton_amount: bigint,
                              forwardPayload: Cell | null, 
                              fwdFee: bigint = 0n) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonWallet.transferMessage(jettonAmount, to, queryId, responseAddress, customPayload, forward_ton_amount, forwardPayload),
            value:value,
            forwardFee: fwdFee
        }));
    }
    
    /*
      burn#595f07bc query_id:uint64 amount:(VarUInteger 16)
                    response_destination:MsgAddress custom_payload:(Maybe ^Cell)
                    = InternalMsgBody;
    */
    static burnMessage(jetton_amount: bigint,
                       responseAddress:Address,
                       customPayload: Cell | null,
                       queryId: bigint) {
        return beginCell().storeUint(0x595f07bc, 32).storeUint(queryId, 64) // op, queryId
                          .storeCoins(jetton_amount).storeAddress(responseAddress)
                          .storeMaybeRef(customPayload)
               .endCell();
    }
    sendBurn(from: Address, value: bigint,
                        jetton_amount: bigint,
                        responseAddress:Address,
                        customPayload: Cell,
                        fwdFee: bigint = 0n,
                        queryId: bigint = 0n) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonWallet.burnMessage(jetton_amount, responseAddress, customPayload, queryId),
            value:value,
            forwardFee: fwdFee
        }));

    }

    /*
      withdraw_tons#107c49ef query_id:uint64 = InternalMsgBody;
    */
      static withdrawTonsMessage() {
        return beginCell().storeUint(Op.withdraw_tons, 32).storeUint(0, 64) // op, queryId
               .endCell();
    }
    sendWithdrawTons(from: Address) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonWallet.withdrawTonsMessage(),
            value:toNano('0.1')
        }));
    }
    
    /*
      withdraw_jettons#10 query_id:uint64 wallet:MsgAddressInt amount:Coins = InternalMsgBody;
    */
    static withdrawJettonsMessage(from:Address, amount:bigint) {
        return beginCell().storeUint(Op.withdraw_jettons, 32).storeUint(0, 64) // op, queryId
                          .storeAddress(from)
                          .storeCoins(amount)
                          .storeMaybeRef(null)
               .endCell();
    }
    sendWithdrawJettons(from: Address, childWalletAddress: Address, amount:bigint) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonWallet.withdrawJettonsMessage(childWalletAddress, amount),
            value:toNano('0.1')
        }));
    }


    
    static internalTransferMessage(queryId: bigint, jettonAmount: bigint, ownerAddress: Address, responseAddress: Address, forwardTonAmount: bigint, forwardPayload: Cell | null) {
        return beginCell()
            .storeUint(Op.internal_transfer, 32)
            .storeUint(queryId, 64)
            .storeCoins(jettonAmount)
            .storeAddress(ownerAddress)
            .storeAddress(responseAddress)
            .storeCoins(forwardTonAmount)
            .storeMaybeRef(forwardPayload)
            .endCell();
    }
    static burnNotificationMessage(queryId: bigint, jettonAmount: bigint, ownerAddress: Address, responseAddress: Address) {
        return beginCell()
                .storeUint(Op.burn_notification, 32)
                .storeUint(queryId, 64)
                .storeCoins(jettonAmount)
                .storeAddress(ownerAddress)
                .storeAddress(responseAddress)
                .endCell();
    }
    static transferNotificationMessage(queryId: bigint, jettonAmount: bigint, sender: Address, forwardPayload: Cell) {
        return beginCell()
                    .storeUint(Op.transfer_notification, 32)
                    .storeUint(queryId, 64)
                    .storeCoins(jettonAmount)
                    .storeAddress(sender)
                    .storeMaybeRef(forwardPayload)
                .endCell()
    }


    getWalletData(): JettonWalletConfig {
        let res = this.smc.get('get_wallet_data', []);
        return {
            balance: res.stackReader.readBigNumber(),
            owner_address: res.stackReader.readAddress(),
            jetton_master_address: res.stackReader.readAddress(),
            jetton_wallet_code: res.stackReader.readCell()
        };
    }


    receiveMessage(message: Message) {
        return this.smc.receiveMessage(message);
    }
    
    get config(): JettonWalletConfig {
        let cell = (this.smc.account.account?.storage.state as AccountStateActive).state.data
        if(!cell) throw "contract state data not found"
        return cellToJettonWalletConfig(cell!)
    }
    set config(config: JettonWalletConfig) {
        this.smc.account = createShardAccount({
            address: this.address,
            code: this.init?.code!,
            data: jettonWalletConfigToCell(config),
            balance: 0n
        })
    }

    get balance(): bigint {
        return this.smc.balance;
    }
    set balance(balance: bigint) {
        this.smc.balance = balance;
    }
    get jettonBalance(): bigint {
        return this.config.balance
    }
}
