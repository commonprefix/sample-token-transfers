import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";

import {
  findCallContractSigningPda,
  findEventAuthority,
  findGasTreasuryPda,
  findGatewayRootPda,
} from "./solanaPda";
import {
  type GMPCallInput,
} from "./types";
import {
    anchorInstructionDiscriminator,
  encodeStringBorsh,
  encodeU32LE,
  encodeU64LE,
  encodeVariantU8,
  getAxelarGasServiceProgramId,
  getGatewayProgramId,
  getItsProgramId,
} from "./utils";
import { getSolanaChainConfig } from "../common/chains";
import * as borsh from 'borsh';

const GMP_CALL_INSTRUCTION_ID = await anchorInstructionDiscriminator("call_contract");

export function encodeSendMemoCall(memoProgramId: PublicKey, data: string) {
  const [counterPda, counterBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter")],
    memoProgramId
  );

  const keys = [{pubkey: counterPda, isSigner: false, isWritable: true}];

  const dataEncoded = Buffer.from(data);
  return encodeSolanaTxAsGMPPayload(dataEncoded, keys);
}

export function borshEncode(inputScheme: any, inputs: any): Uint8Array<ArrayBufferLike> {
    const inputSerialized = borsh.serialize(inputScheme, inputs);
    return inputSerialized;
} 

export function encodeSolanaTxAsGMPPayload(
    payload: Uint8Array<ArrayBufferLike>,
    keys: {pubkey: PublicKey, isSigner: boolean, isWritable: boolean}[],
): Uint8Array<ArrayBufferLike> {
    const keysSerialized = keys.map(({pubkey, isSigner, isWritable}) => {
        const signerWritableEncoded = (isWritable ? 2 : 0) + (isSigner ? 1 : 0);
        return Buffer.concat([pubkey.toBuffer(), Buffer.from(String.fromCharCode(signerWritableEncoded))]);
    });
    // 0 -> use borsh scheme, len of inner payload bytes, inner payload, serialized keys array 
    return Buffer.concat([Buffer.from('\x00'), encodeU32LE(payload.length), payload, encodeU32LE(keysSerialized.length), Buffer.concat(keysSerialized)]);
}

export function encodeITSTransferPayloadForEVM(payload: Uint8Array<ArrayBufferLike>) {
    // for some reason, when we call interchainTransfer on an EVM chain, we need to prepend a u32 versionUint that should be 0
    return Buffer.concat([Buffer.from('\x00'.repeat(4)), payload]); 
}

export async function buildCallContractTx(
  input: GMPCallInput,
): Promise<Transaction> {
  const sendMemo = encodeSendMemoCall(new PublicKey("mem5NJXuxU7b4UJqq6ib8XUjk1Hnp4z2B1szyRZ8bLv"), "TS encode");
  console.log("Send Memo Payload: ", Buffer.from(sendMemo).toString("hex"));

  const chainConfig = await getSolanaChainConfig();
  const rpcUrl = chainConfig.config.rpc?.[0];
  if (!rpcUrl) throw new Error("No Solana RPC configured");

  const gatewayProgramId = await getGatewayProgramId();
  const gasServiceProgramId = await getAxelarGasServiceProgramId();

  const payer = new PublicKey(input.caller);
  const connection = new Connection(rpcUrl, "confirmed");

  const [gatewayRootPda] = findGatewayRootPda(gatewayProgramId);
  const [gatewayEventAuthority] = findEventAuthority(gatewayProgramId);
  const [gasEventAuthority] = findEventAuthority(gasServiceProgramId);
  const [gasTreasury] = findGasTreasuryPda(gasServiceProgramId);

  const destinationAddressBytes = Buffer.from(
    input.destinationAddress.replace(/^0x/, ""),
    "hex"
  );
  const gas = BigInt(input.gasValue ?? "0");

//   class CallContractSchema {
//     destination_chain: string;
//     destination_contract_address: string;
//     payload: string;
//     signing_pda_bump: Number;
//     constructor(destination_chain: string, destination_contract_address: string, payload: string, signing_pda_bump: Number) {
//         this.destination_chain = destination_chain;
//         this.destination_contract_address = destination_contract_address;
//         this.payload = payload;
//         this.signing_pda_bump = signing_pda_bump;
//     }
//   }

//   const schema = {
//     struct: {
//       destination_chain: 'string',
//       destination_contract_address: 'string',
//       payload: 'string',
//       signing_pda_bump: 'u8', // unsigned 64-bit integer
//     },
//   };

//   // test the SolanaTxAsGMPPayload with this tx
//   const borshsSerializedPayload = borshEncode(schema, new CallContractSchema(input.destinationChain, input.destinationAddress, payload, 0));
//   if (borshsSerializedPayload !== data) {
//     console.error("Borsh serialized payload:", borshsSerializedPayload);
//     console.error("Custom encoding:", data);
//     throw Error("Mismatched serializations");
//   }
//
//  const txAsPayload = encodeSolanaTxAsGMPPayload(borshsSerializedPayload, keys);
//  console.log("Tx as Payload: " + txAsPayload);
//  const txAsEVMPayload = encodeITSTransferPayloadForEVM(txAsPayload);
//  console.log("Tx as EVM ITS Payload: ", txAsEVMPayload);

  const payload = input.payload ?? "";

  const encodedPayload = Buffer.concat([encodeU32LE(payload.length), Buffer.from(payload)]);

  const data = Buffer.concat([
    // instruction id
    GMP_CALL_INSTRUCTION_ID,
    // destination_chain
    encodeStringBorsh(input.destinationChain),
    // destination_address
    encodeStringBorsh(input.destinationAddress),
    // payload
    encodedPayload,
    // pda_seeds
    Buffer.from("\x00"), // for now, we are calling it as EOA, so we don't need to specify the signing_pda_seeds
  ]);

  const NoneKey = { pubkey: gatewayProgramId, isSigner: false, isWritable: false }; // in Anchor, passing the program id as key gets parsed as a "None" (c.f. https://github.com/solana-foundation/anchor/pull/2101)

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    NoneKey, // no need to specify the signing_pda 
    { pubkey: gatewayRootPda, isSigner: false, isWritable: false },
    { pubkey: gatewayEventAuthority, isSigner: false, isWritable: false },    
    { pubkey: gatewayProgramId, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({
    programId: gatewayProgramId,
    keys,
    data,
  });
  const tx = new Transaction();
  
  // Add optional priority fee instruction at the start
  if (input.priorityFee > 0) {
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: BigInt(input.priorityFee),
      })
    );
  }

  tx.add(ix);
  tx.feePayer = payer;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  return tx;
}
