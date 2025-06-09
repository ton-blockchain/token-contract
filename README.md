# Old Fungible, Non-Fungible, Semi-Fungible Tokens Smart Contracts

> ⚠️ This is an outdated repository with the first versions of Jettons and NFTs.
> 
> Current versions of tokens:
>
> Jetton - https://github.com/ton-blockchain/jetton-contract
>
> NFT - https://github.com/ton-blockchain/nft-contract

## Structure

ft/ - Jetton (Fungible Token) smart contract and build.

misc/ - forward-fee-calc.fc

nft/ - NFT smart contract and build.

sandbox_tests/ - Jetton Sandbox (Blueprint) tests.

scripts/ - Jetton Sandbox (Blueprint) deploy scripts.

wrappers/ - Jetton Sandbox (Blueprint) JS wrappers.

stdlib.fc

## NFT (Non-Fungible tokens) in `nft` folder

Basic implementation of smart contracts for NFT tokens and NFT collections in accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/62).

`nft-collection.fc` - basic implementation of immutable NFT collection with royalty.

`nft-collection-editable.fc` - basic implementation of the NFT collection with royalty in which the author can change the content and royalty params.

It is preferable to use an editable collection in case if you decide to change content hosting in the future (for example, to TON Storage).

`nft-item.fc` - basic implementation of immutable NFT item.

[TonWeb](https://github.com/toncenter/tonweb) JavaScript SDK 0.0.38+ supports these contracts. 

Also repo contains an example of a simple marketplace smart contract `nft-marketplace` and a smart contract for selling NFT for a fixed price for Toncoins `nft-sale`.

In a real product, marketplace and sale smart contracts are likely to be more sophisticated.

## Jettons (Fungible tokens) in `ft` folder

Basic implementation of smart contracts for Jetton wallet and Jetton minter in accordance with the [Standard](https://github.com/ton-blockchain/TIPs/issues/74).

Contains an example of a simple ICO smart contract.

## Semi-Fungible

Semi-Fungible tokens is combination of NFT and FT.

# Compile

Compiled contracts are in `build/` folders. Compiled by [func-0.3.0](https://github.com/ton-blockchain/ton/releases/tag/func-0.3.0).

## Security

The Ton Jetton smart contract has been audited by:
- TonTech: [Audit Report](./audits/Ton_Jetton_Audit_Report_20250327.pdf)