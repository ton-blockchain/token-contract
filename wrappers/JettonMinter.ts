import { Address, beginCell, Cell, Contract, contractAddress, Dictionary, TupleBuilder, Message, ShardAccount, toNano } from '@ton/core';
import { Op } from './JettonConstants';
import { Blockchain, createShardAccount, internal, SmartContract, SmartContractTransaction } from '@ton/sandbox';
import { AccountStateActive } from '@ton/core/dist/types/AccountState';

export type JettonMinterContent = {
    type:0|1,
    uri:string
};

export type JettonMinterConfig = {
    totalSupply: bigint,
    admin: Address; 
    content: Cell;
    wallet_code: Cell;
};

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
                      .storeCoins(config.totalSupply)
                      .storeAddress(config.admin)
                      .storeRef(config.content)
                      .storeRef(config.wallet_code)
           .endCell();
}
export function cellToJettonMinterConfig(cell: Cell): JettonMinterConfig {
    let slice = cell.beginParse()
    return {
        totalSupply: slice.loadCoins(),
        admin: slice.loadAddress(),
        content: slice.loadRef(),
        wallet_code: slice.loadRef()
    }
}

export function jettonContentToCell(content:JettonMinterContent) {
    return beginCell()
                      .storeUint(content.type, 8)
                      .storeStringTail(content.uri) //Snake logic under the hood
           .endCell();
}

export class JettonMinter implements Contract {
    constructor(readonly address: Address, private readonly smc: SmartContract, readonly init?: { code: Cell; data: Cell }) { }

    static createFromAddress(blockchain: Blockchain, address: Address) {
        return new JettonMinter(address, SmartContract.empty(blockchain, address));
    }

    static createFromConfig(blockchain: Blockchain, config: JettonMinterConfig, code: Cell, workchain = 0, balance = toNano(1n)) {
        const data = jettonMinterConfigToCell(config);
        const init = { code, data };
        const smc = SmartContract.create(blockchain, {
            address: contractAddress(workchain, init),
            balance,
            code,
            data
        })
        return new JettonMinter(contractAddress(workchain, init), smc, init);
    }

    sendDeploy(from: Address, balance: bigint = toNano("0.01")): SmartContractTransaction {
        return this.smc.receiveMessage(internal({
            to: this.address,
            from,
            body: beginCell().endCell(),
            value: balance
        }));
    }

    static mintMessage(from: Address, to: Address, jetton_amount: bigint, forward_ton_amount: bigint, total_ton_amount: bigint, query_id: number | bigint = 0) {
		const mintMsg = beginCell().storeUint(Op.internal_transfer, 32)
                                   .storeUint(0, 64)
                                   .storeCoins(jetton_amount)
                                   .storeAddress(null)
                                   .storeAddress(from) // Response addr
                                   .storeCoins(forward_ton_amount)
                                   .storeMaybeRef(null)
                    .endCell();

        return beginCell().storeUint(Op.mint, 32).storeUint(query_id, 64) // op, queryId
                          .storeAddress(to)
                          .storeCoins(total_ton_amount)
                          .storeCoins(jetton_amount)
                          .storeRef(mintMsg)
               .endCell();
    }
    sendMint(from: Address, to: Address, jetton_amount: bigint, forward_ton_amount: bigint, total_ton_amount: bigint) {
        if(total_ton_amount <= forward_ton_amount) {
            throw new Error("Total ton amount should be > forward amount");
        }
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonMinter.mintMessage(this.address, to, jetton_amount, forward_ton_amount, total_ton_amount),
            value: total_ton_amount + toNano('0.015'),
        }));
    }

    /* provide_wallet_address#2c76b973 query_id:uint64 owner_address:MsgAddress include_address:Bool = InternalMsgBody;
    */
    static discoveryMessage(owner: Address, include_address: boolean) {
        return beginCell().storeUint(0x2c76b973, 32).storeUint(0, 64) // op, queryId
                          .storeAddress(owner).storeBit(include_address)
               .endCell();
    }
    sendDiscovery(from: Address, owner: Address, include_address: boolean, value:bigint = toNano('0.1'), forwardFee: bigint | undefined = undefined) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonMinter.discoveryMessage(owner, include_address),
            value: value,
            forwardFee: forwardFee
        }));
    }

    static burnNotificationMessage(queryId: bigint, amount: bigint, addr: Address, response_address: Address) {
        return beginCell()
                .storeUint(Op.burn_notification, 32)
                .storeUint(queryId, 64)
                .storeCoins(amount)
                .storeAddress(addr)
                .storeAddress(response_address)
                .endCell();
    }
    sendBurnNotification(from: Address, amount: bigint, addr: Address, response_address: Address, value: bigint = toNano(1), queryId: bigint = 0n) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonMinter.burnNotificationMessage(queryId, amount, addr, response_address),
            value
        }))
    }

    static changeAdminMessage(newOwner: Address) {
        return beginCell().storeUint(Op.change_admin, 32).storeUint(0, 64) // op, queryId
                          .storeAddress(newOwner)
               .endCell();
    }
    sendChangeAdmin(from: Address, newOwner: Address) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonMinter.changeAdminMessage(newOwner),
            value: toNano("0.05"),
        }));
    }

    static changeContentMessage(content: Cell) {
        return beginCell().storeUint(Op.change_content, 32).storeUint(0, 64) // op, queryId
                          .storeRef(content)
               .endCell();
    }
    sendChangeContent(from: Address, content: Cell) {
        return this.smc.receiveMessage(internal({
            from,
            to: this.address,
            body: JettonMinter.changeContentMessage(content),
            value: toNano("0.05"),
        }));
    }

    getWalletAddress(owner: Address): Address {
        let builder = new TupleBuilder()
        builder.writeAddress(owner);
        const res = this.smc.get('get_wallet_address', builder.build());
        return res.stackReader.readAddress()
    }
    getJettonData(): JettonMinterConfig & { mintable: boolean } {
        let res = this.smc.get('get_jetton_data', []);
        let totalSupply = res.stackReader.readBigNumber();
        let mintable = res.stackReader.readBoolean();
        let adminAddress = res.stackReader.readAddress();
        let content = res.stackReader.readCell();
        let walletCode = res.stackReader.readCell();
        return {
            totalSupply,
            mintable,
            admin: adminAddress,
            content,
            wallet_code: walletCode
        };
    }

    receiveMessage(message: Message) {
        return this.smc.receiveMessage(message);
    }
    get config(): JettonMinterConfig {
        let cell = (this.smc.account.account?.storage.state as AccountStateActive).state.data
        if(!cell) throw "contract state data not found"
        return cellToJettonMinterConfig(cell!)
    }
    set config(config: JettonMinterConfig) {
        this.smc.account = createShardAccount({
            address: this.address,
            code: this.init?.code!,
            data: jettonMinterConfigToCell(config),
            balance: 0n
        })
    }

    get balance(): bigint {
        return this.smc.balance;
    }
    set balance(balance: bigint) {
        this.smc.balance = balance;
    }
}
