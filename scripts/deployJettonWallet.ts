import { toNano } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const jettonWallet = JettonWallet.createFromConfig({}, await compile('JettonWallet'));

    await provider.deploy(jettonWallet, toNano('0.05'));

    const openedContract = provider.open(jettonWallet);

    // run methods on `openedContract`
}
