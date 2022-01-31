let Cell = TonWeb.boc.Cell;
let Address = TonWeb.utils.Address;
let base64ToBytes = TonWeb.utils.base64ToBytes;
let bytesToBase64 = TonWeb.utils.bytesToBase64;
let Contract = TonWeb.Contract;

let readIntFromBitString = (bs, cursor, bits) => {
  n=BigInt(0);
  for(let i=0; i< bits; i++) {
    n*=BigInt(2);
    n+=BigInt(bs.get(cursor+i));
  }
  return n;
}
class NFTCollection extends Contract {
    /**
     * @param provider    {HttpProvider}
     * @param options?    {{code: Uint8Array, publicKey?: Uint8Array, address?: Address | string, wc?: number}}
     */
    constructor(provider, options) {
        if (!options.address) throw new Error('NFTCollection should have address in options')
        super(provider, options);

        this.methods = {
            get_nft_address_by_index: (index) => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'get_nft_address_by_index', [["num", index]]);
                        let nft_address = null;
                        try {
                            let slice_address = Cell.fromBoc(base64ToBytes(result.stack[0][1].bytes))[0];
                            let n = readIntFromBitString(slice_address.bits, 3, 8);
                            if( n>BigInt(127)) {
                              n = n - BigInt(256); 
                            }
                            let hashpart =  readIntFromBitString(slice_address.bits, 3+8, 256);
                            nft_address = new Address(n.toString(10)+":"+hashpart.toString(16));
                        } catch (e) {

                        }
                        return nft_address;
                    }
                }
            },
            get_std_nft_address_by_index: (index) => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'get_std_nft_address_by_index', [["num", index]]);
                        let nft_address = null;
                        try {
                            console.log("get_std_nft_address_by_index", index, result.stack[0][1], result.stack[1][1], parseInt(result.stack[0][1], 16)+":"+result.stack[1][1].slice(2));
                            nft_address = new Address(parseInt(result.stack[0][1], 16)+":"+result.stack[1][1].slice(2));
                        } catch (e) {

                        }
                        return nft_address;
                    }
                }
            },
            tokens_num: (index) => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'get_next_index', []);
                        let num = null;
                        try {
                            num = parseInt(result.stack[0][1], 16);
                        } catch (e) {

                        }
                        return num;
                    }
                }
            },

            member_content: (index, individual_content) => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'member_content', [["num", index], ["cell", JSON.stringify(individual_content.toObject())]]);
                        let content = null;
                        try {
                            content = Cell.fromBoc(base64ToBytes(result.stack[0][1].bytes))[0];
                        } catch (e) {

                        }
                        return content;
                    }
                }
            },
            member_uri: (index, individual_content) => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'member_uri', [["num", index], ["cell", JSON.stringify(individual_content.toObject())]]);
                        let uri = null;
                        try {
                            console.log(result);
                            var curi = Cell.fromBoc(base64ToBytes(result.stack[0][1].bytes))[0];
                            var data = curi.bits.array.slice(0, Math.ceil(curi.bits.length/8));
                            while (curi.refs.length == 1) {
                              curi = curi.refs[0];
                              data = new Uint8Array([ ...data, ...curi.bits.array.slice(0, Math.ceil(curi.bits.length/8))]);
                            }
                            uri = new TextDecoder().decode(data.slice());
                        } catch (e) {
                          console.log(e);
                        }
                        return uri;
                    }
                }
            }
        }
    }
}

class NFT extends Contract {
    /**
     * @param provider    {HttpProvider}
     * @param options?    {{code: Uint8Array, publicKey?: Uint8Array, address?: Address | string, wc?: number}}
     */
    constructor(provider, options) {
        if (!options.address) throw new Error('NFT should have address in options')
        super(provider, options);

        this.methods = {

            create_transfer_payload: (params) => {
              //<b 1 32 u, now 64 u, b{100} s, new-owner addr, 500000 Gram, b>
              const cell = new Cell();
              cell.bits.writeUint(1, 32); // transfer operation
              cell.bits.writeUint((new Date()).getTime(), 64); // query id
              cell.bits.writeAddress(params.to); // new owner
              cell.bits.writeGrams(params.amount); // 0 if no notifications
              return cell;
            },
            get_nft_data: () => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'get_nft_data', []);
                        let index = null, collection = null, owner = null, editor = null, content = null;
                        let ha= (wc, hp) => {
                          let s = parseInt(wc, 16);
                          s += ":";
                          let _hp = hp.slice(2);
                          s += "0".repeat(64-_hp.length) + _hp;
                          return new Address(s);
                        }
                        try {
                            if (result.exit_code !== 0 ) throw new Error(result);
                            index = parseInt(result.stack[1][1], 16);
                            if(parseInt(result.stack[2][1], 16)>-2) {
                              collection = ha(result.stack[2][1], result.stack[3][1]);
                            }
                            if(parseInt(result.stack[4][1], 16)>-2) {
                              owner = ha(result.stack[4][1], result.stack[5][1]);
                            }
                            if(parseInt(result.stack[6][1], 16)>-2) {
                              editor = ha(result.stack[6][1], result.stack[7][1]);
                            }
                            content = Cell.fromBoc(base64ToBytes(result.stack[8][1].bytes))[0];
                        } catch (e) {
console.log(e);
                        }
                        console.log( result, [index, collection, owner, editor, content]);
                        return [index, collection, owner, editor, content];
                    }
                }
            },
            get_name: () => {
                return {
                    /**
                     * @return {Promise<number>}
                     */
                    call: async () => {
                        const address = await this.getAddress();
                        const result = await provider.call(address.toString(false), 'get_name', []);
                        let name = "";
                        try {
                            if (result.exit_code !== 0 ) throw new Error(result);
                            let name_cell = Cell.fromBoc(base64ToBytes(result.stack[0][1].bytes))[0];
                            var data = name_cell.bits.array.slice(0, Math.ceil(name_cell.bits.length/8));
                            name = new TextDecoder().decode(data.slice());
                        } catch (e) {

                        }
                        return name;
                    }
                }
            }
        }
    }

    async loadData() {
        let res = await this.methods.get_nft_data().call();
        this.index = res[0];
        this.collection_address = res[1];
        this.owner = res[2];
        this.editor = res[3];
        this.individual_content = res[4];
        if(this.collection_address) {
          this.collection = new NFTCollection(this.provider, {address: this.collection_address});
          this.content = await this.collection.methods.member_content(this.index, this.individual_content).call();
          this.uri = await this.collection.methods.member_uri(this.index, this.individual_content).call();
        } else {
          this.content = this.individual_content;
          //TODO individual uri
        }
        this.name = await this.methods.get_name().call();
    }
}

function parse_nft_content (cell) {
  console.log(data);
  var data = cell.bits.array.slice(0, Math.ceil(cell.bits.length/8));
  let vw = new DataView(data.slice(0,4).buffer, 0);
  var type = vw.getUint32(0);
  data = data.slice(4);
  while (cell.refs.length == 1) {
    cell = cell.refs[0];
    console.log(cell.bits.array.slice(0, Math.ceil(cell.bits.length/8)));
    data = new Uint8Array([ ...data, ...cell.bits.array.slice(0, Math.ceil(cell.bits.length/8))]);
  }
  if(type == 0) {
    return {"text": new TextDecoder().decode(data.slice())};
  }
  if(type == 0x504e4721) {
    return {"png/base64": bytesToBase64(data)};
  }
}

