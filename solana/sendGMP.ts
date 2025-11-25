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

const GMP_CALL_INSTRUCTION_ID = await anchorInstructionDiscriminator("call_contract");

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
