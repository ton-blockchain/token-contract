rm build/nft-item-code.fif
rm build/nft-item-editable-code.fif
rm build/nft-collection-code.fif
rm build/nft-collection-editable-code.fif
rm build/nft-marketplace-code.fif
rm build/nft-sale-code.fif

func -o build/nft-item-code.fif -SPA ../stdlib.fc params.fc op-codes.fc nft-item.fc
func -o build/nft-item-editable-code.fif -SPA ../stdlib.fc params.fc op-codes.fc nft-item-editable-DRAFT.fc
func -o build/nft-collection-code.fif -SPA ../stdlib.fc params.fc op-codes.fc nft-collection.fc
func -o build/nft-collection-editable-code.fif -SPA ../stdlib.fc params.fc op-codes.fc nft-collection-editable.fc
func -o build/nft-marketplace-code.fif -SPA ../stdlib.fc op-codes.fc nft-marketplace.fc
func -o build/nft-sale-code.fif -SPA ../stdlib.fc op-codes.fc nft-sale.fc

fift -s build/print-hex.fif
