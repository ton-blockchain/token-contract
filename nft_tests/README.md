# NFT Collection example project

This project allows you to:

1.  Build basic nft collection contract
2.  Aims to *hopefully* test any nft collection contract for compliance with [NFT Standard](https://github.com/ton-blockchain/TIPs/issues/62)
3.  Deploy collection contract via `toncli deploy nft_collection`
4.  Manually deploy NFT item to the collection look (Deploying individual items)

## Building

  Just run `toncli build`
  Depending on your fift/func build you may want
  to uncomment some *func/helpers*

## Testing

  Build project and then: `toncli run_test`  

  ⚠ If you see `6` error code on all tests - you need to update your binary [more information here](https://github.com/disintar/toncli/issues/72)
  
## Deploying collection contract

  This project consists of two subprojects **nft_item** and **nft_collection**
  You can see that in the *project.yml*
  **BOTH** of those have to be built.
  However, it makes sense to deploy only *nft_collection*.  
  Prior to deployment you need to check out *fift/collection-data.fif*
  and change all mock configuration values like collection_content,
  owner_address Etc.  
  To deploy run:`toncli deploy -n testnet nft_collection`.  
  
## Deploying individual items

  To deploy your own NFT item to the already deployed collection
  you will need:  
  
+   Configure *fift/deploy.fif* script with your own values:
[Take a look](https://github.com/ton-blockchain/TIPs/issues/64)  

+   Make yourself familiar with process of sending  [internal messages](https://github.com/disintar/toncli/blob/master/docs/advanced/send_fift_internal.md)  

`toncli send -n testnet -a 0.05 -c nft_collection --body fift/deploy.fif`  
Every next item deployment you should make sure to
change item index in the *fift/deploy.fif* file ( Yes. Manually for now ).

## Parse nft content

Parse nft for collection (will work only if collection-data is same with on-chain):

`toncli get get_nft_data -a "NFT_ADDRESS" --fift ./fift/parse-data-nft-collection.fif`

Parse nft for single:

`toncli get get_nft_data -a "NFT_ADDRESS" --fift ./fift/parse-data-nft-single.fif`
