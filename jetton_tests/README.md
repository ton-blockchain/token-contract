# Jetton Minter example project

This project allows you to:

1.  Build basic jetton minter contract
2.  Aims to *hopefully* test any nftcollection contract for compliance with [Jetton standerd](https://github.com/ton-blockchain/TIPs/issues/74)
3.  Deploy minter contract via `toncli deploy`
4.  Manually deploy jetton wallet via minting tokens
5.  Manually send to other jetton wallets
6.  Manyally burn coins on your wallet

## Building

  `toncli start jetton_minter`  
  `toncli build`  

## Testing

  Same here `toncli run_test`  
  If you encounter **error 6** during *run_tests*
  make shure that your binaries are built according to:[this manual](https://github.com/disintar/toncli/blob/master/docs/advanced/func_tests_new.md)
  
## Deploying minter contract

  This project consists of two sub-projects **jetton_minter** and **jetton_wallet**
  You can see that in the *project.yml*
  **BOTH** of those have to be built.
  First type:`toncli build`
  However it makes sense to deploy only *jetton_minter*.  
  Prior to deployment you need to check out *fift/minter_data.fif*
  and change all mock configuration values to your own liking.  
  To deploy run:`toncli deploy -n testnet jetton_minter`.  
  
## Minting jettons

  To mint coins to your wallet
  you will have to:  
  
+   Configure *fift/mint_jettons.fif* script with your own values:
[Take a look](https://github.com/ton-blockchain/TIPs/issues/74)  

+   Make yourself familiar with process of sending  [internal messages](https://github.com/disintar/toncli/blob/master/docs/advanced/send_fift_internal.md)  

`toncli send -n testnet -a 0.035 -c jetton_minter  --body fift/mint_jettons.fif`

## Sending jettons

  To send coins to someone elses jetton wallet
  you will have to:

+   Setup values in *fift/send_jettons.fif*  
+   Run:`toncli send -n testnet -a 0.1 --address < your jetton wallet addr>  --body fift/send_jettons.fif`  

## Burning jettons

  To burn jettons

+   Setup values in *fift/burn_jettons.fif*
+   Run `toncli send -n testnet -a 0.1 --address < your jetton wallet addr >  --body fift/burn_jettons.fif`
