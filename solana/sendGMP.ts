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

export function encodeSolanaTxAsGMPPayload(
    keys: {pubkey: PublicKey, isSigner: boolean, isWritable: boolean}[],
    inputScheme: any,
    inputs: any,
): Buffer<ArrayBufferLike> {
    const inputSerialized = borsh.serialize(inputScheme, inputs);
    const keysSerialized = keys.map(({pubkey, isSigner, isWritable}) => (
        Buffer.concat([pubkey.toBuffer(), Buffer.from(isSigner ? '\x01' : '\x00'), Buffer.from(isWritable ? '\x01' : '\x00')])
    ));
    return Buffer.concat([Buffer.concat(keysSerialized), inputSerialized]);
}

export async function buildCallContractTx(
  input: GMPCallInput,
): Promise<Transaction> {
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

  class CallContractSchema {
    destination_chain: string;
    destination_contract_address: string;
    payload: string;
    signing_pda_bump: Number;
    constructor(destination_chain: string, destination_contract_address: string, payload: string, signing_pda_bump: Number) {
        this.destination_chain = destination_chain;
        this.destination_contract_address = destination_contract_address;
        this.payload = payload;
        this.signing_pda_bump = signing_pda_bump;
    }
  }

  const schema = {
    struct: {
      destination_chain: 'string',
      destination_contract_address: 'string',
      payload: 'string',
      signing_pda_bump: 'u8', // unsigned 64-bit integer
    },
  };

  // test the SolanaTxAsGMPPayload with this tx
  const txAsPayload = encodeSolanaTxAsGMPPayload(keys, schema, new CallContractSchema(input.destinationChain, input.destinationAddress, payload, 0));
  console.log("Tx as Payload: " + txAsPayload);

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
