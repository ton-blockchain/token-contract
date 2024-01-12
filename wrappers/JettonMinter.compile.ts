import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    targets: ['stdlib.fc', 'ft/params.fc','ft/op-codes.fc','ft/discovery-params.fc','ft/jetton-utils.fc','ft/jetton-minter-discoverable.fc'],
};
