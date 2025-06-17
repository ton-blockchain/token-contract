import { Address, beginCell, Cell, toNano } from "@ton/core";
import { internal } from "@ton/sandbox";

export function createBouncedMessage(params: { from: Address, to: Address, body: Cell, value: bigint | null }) {
    return internal({
        from: params.from,
        to: params.to,
        bounced: true,
        body: beginCell().storeUint(0xFFFFFFFF, 32).storeBits(params.body.beginParse().loadBits(Math.min(params.body.bits.length, 256))).endCell(),
        value: params.value ?? toNano(1)
    })
}