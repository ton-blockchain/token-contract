import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { Errors } from '../wrappers/JettonConstants';
import { jettonContentToCell, JettonMinter, JettonMinterConfig } from '../wrappers/JettonMinter';

describe("Jetton Minter", () => {

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

    describe("when mint message is received", () => {
        it('and sender is admin then mint jettons', () => {
            // can mint from deployer
            let initialTotalSupply = jettonMinter.config.totalSupply;
            let initialJettonBalance = toNano('1000.23');
            const mintResult = jettonMinter.sendMint(deployer.address, deployer.address, initialJettonBalance, toNano('0.05'), toNano('1'));
    
            expect(mintResult).toHaveTransaction({ success: true });
            expect(jettonMinter.config.totalSupply).toEqual(initialTotalSupply + initialJettonBalance);
            initialTotalSupply += initialJettonBalance;
            
            // can mint from deployer again
            let additionalJettonBalance = toNano('2.31');
            jettonMinter.sendMint(deployer.address, deployer.address, additionalJettonBalance, toNano('0.05'), toNano('1'));
            expect(jettonMinter.config.totalSupply).toEqual(initialTotalSupply + additionalJettonBalance);
            initialTotalSupply += additionalJettonBalance;
            
            // can mint to other address
            let otherJettonBalance = toNano('3.12');
            jettonMinter.sendMint(deployer.address, notDeployer.address, otherJettonBalance, toNano('0.05'), toNano('1'));
            expect(jettonMinter.config.totalSupply).toEqual(initialTotalSupply + otherJettonBalance);
        });
    
        it('and sender is not admin then throw Errors.not_admin', () => {
            let initialTotalSupply = jettonMinter.config.totalSupply;
            const unAuthMintResult = jettonMinter.sendMint(notDeployer.address, deployer.address, toNano('777'), toNano('0.05'), toNano('1'));
    
            expect(unAuthMintResult).toHaveTransaction({ exitCode: Errors.not_admin });
            expect(jettonMinter.config.totalSupply).toEqual(initialTotalSupply);
        });
    });

    describe("when change_admin message is received", () => {
        it('and sender is minter admin then change admin', () => {
            let res = jettonMinter.sendChangeAdmin(deployer.address, notDeployer.address);
            expect(res).toHaveTransaction({ success: true });
    
            expect(jettonMinter.config.admin).toEqualAddress(notDeployer.address);
        });
        
        it('and sender is not a minter admin then throw `not_admin`', () => {
            const adminBefore = jettonMinter.config.admin;

            let changeAdmin = jettonMinter.sendChangeAdmin(notDeployer.address, notDeployer.address);
            
            expect(jettonMinter.config.admin).toEqualAddress(adminBefore);
            expect(changeAdmin).toHaveTransaction({ exitCode: Errors.not_admin });
        });
    })

    describe("when change_content message is received", () => {
        it('minter admin can change content', () => {
            let newContent = jettonContentToCell({type: 1, uri: "https://totally_new_jetton.org/content.json"})
            jettonMinter.sendChangeContent(deployer.address, newContent);
            expect(jettonMinter.config.content).toEqualCell(newContent);
        });
        
        it('not a minter admin can not change content', () => {
            let newContent = beginCell().storeUint(1,1).endCell();
            let changeContent = jettonMinter.sendChangeContent(notDeployer.address, newContent);
            expect(jettonMinter.config.content).toEqualCell(defaultContent);
            expect(changeContent).toHaveTransaction({ exitCode: Errors.not_admin });
        });
    })

});
