import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import * as borsh from "borsh";

// -------------------------------------------------
// Constants
// -------------------------------------------------
export const ITS_PROGRAM_ID = new PublicKey(
  "itsqybuNsChBo3LgVhCWWnTJVJdoVTUJaodmqQcG6z7"
);

// Flow epoch length = 6 hours = 21,600 seconds
const EPOCH_LENGTH_SECONDS = 21600n;

// -------------------------------------------------
// Flow epoch calculator
// -------------------------------------------------
export function flowEpochWithTimestamp(timestamp: bigint): bigint {
  if (timestamp < 0n) {
    throw new Error("ArithmeticOverflow: timestamp must be non-negative");
  }
  return timestamp / EPOCH_LENGTH_SECONDS;
}

// -------------------------------------------------
// PDA helpers
// -------------------------------------------------
export async function findItsRootPda(): Promise<[PublicKey, number]> {
  const seed = Buffer.from("interchain-token-service");
  return PublicKey.findProgramAddress([seed], ITS_PROGRAM_ID);
}

export async function findTokenManagerPda(
  itsRootPda: PublicKey,
  tokenId: Uint8Array
): Promise<[PublicKey, number]> {
  if (tokenId.length !== 32) {
    throw new Error("tokenId must be 32 bytes");
  }
  const seed = Buffer.from("token-manager");
  return PublicKey.findProgramAddress(
    [seed, itsRootPda.toBuffer(), Buffer.from(tokenId)],
    ITS_PROGRAM_ID
  );
}

export async function findFlowSlotPda(
  tokenManagerPda: PublicKey,
  epoch: bigint
): Promise<[PublicKey, number]> {
  const epochBuf = Buffer.alloc(8);
  epochBuf.writeBigUInt64LE(epoch);

  const seed = Buffer.from("flow-slot");
  return PublicKey.findProgramAddress(
    [seed, tokenManagerPda.toBuffer(), epochBuf],
    ITS_PROGRAM_ID
  );
}

// -------------------------------------------------
// Instruction schema (borsh)
// -------------------------------------------------
class InterchainTransfer {
  token_id: Uint8Array;
  destination_chain: string;
  destination_address: Uint8Array;
  amount: bigint;
  gas_value: bigint;
  signing_pda_bump: number;

  constructor(fields: {
    token_id: Uint8Array;
    destination_chain: string;
    destination_address: Uint8Array;
    amount: bigint;
    gas_value: bigint;
    signing_pda_bump: number;
  }) {
    Object.assign(this, fields);
  }
}
// { struct: { x: 'u8', y: 'u64', 'z': 'string', 'arr': { array: { type: 'u8' }}}};
const schema = {
    struct:
    {
        "token_id": { array: { type: 'u8', len: 32 } },
        "destination_chain": "string",
        "destination_address": { array: { type: 'u8'} },
        "amount": "u64",
        "gas_value": "u64",
        "signing_pda_bump": "u8",
    },
};

// -------------------------------------------------
// Instruction builder
// -------------------------------------------------
export function createInterchainTransferIx(params: {
  payer: PublicKey;
  ownerOrDelegate: PublicKey;
  sourceAccount: PublicKey;
  mint: PublicKey;
  tokenManager: PublicKey;
  tokenManagerAta: PublicKey;
  tokenProgram: PublicKey;
  flowSlot: PublicKey;
  gatewayRoot: PublicKey;
  gatewayProgram: PublicKey;
  gasConfig: PublicKey;
  gasService: PublicKey;
  itsRoot: PublicKey;
  callContractSigning: PublicKey;
  tokenId: Uint8Array; // 32 bytes
  destinationChain: string;
  destinationAddress: Uint8Array;
  amount: bigint;
  gasValue: bigint;
  signingPdaBump: number;
}): TransactionInstruction {
  const {
    payer,
    ownerOrDelegate,
    sourceAccount,
    mint,
    tokenManager,
    tokenManagerAta,
    tokenProgram,
    flowSlot,
    gatewayRoot,
    gatewayProgram,
    gasConfig,
    gasService,
    itsRoot,
    callContractSigning,
    tokenId,
    destinationChain,
    destinationAddress,
    amount,
    gasValue,
    signingPdaBump,
  } = params;

  // Serialize payload
  const payload = new InterchainTransfer({
    token_id: tokenId,
    destination_chain: destinationChain,
    destination_address: destinationAddress,
    amount,
    gas_value: gasValue,
    signing_pda_bump: signingPdaBump,
  });

  const serialized = Buffer.from(borsh.serialize(schema, payload));

  const variantIndex = 8;
  const data = Buffer.concat([Buffer.from([variantIndex]), serialized]);

  const keys: AccountMeta[] = [
    { pubkey: payer, isSigner: true, isWritable: true }, // 0
    { pubkey: ownerOrDelegate, isSigner: false, isWritable: false }, // 1
    { pubkey: sourceAccount, isSigner: false, isWritable: true }, // 2
    { pubkey: mint, isSigner: false, isWritable: false }, // 3
    { pubkey: tokenManager, isSigner: false, isWritable: false }, // 4
    { pubkey: tokenManagerAta, isSigner: false, isWritable: true }, // 5
    { pubkey: tokenProgram, isSigner: false, isWritable: false }, // 6
    { pubkey: flowSlot, isSigner: false, isWritable: true }, // 7
    { pubkey: gatewayRoot, isSigner: false, isWritable: false }, // 8
    { pubkey: gatewayProgram, isSigner: false, isWritable: false }, // 9
    { pubkey: gasConfig, isSigner: false, isWritable: true }, // 10
    { pubkey: gasService, isSigner: false, isWritable: false }, // 11
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 12
    { pubkey: itsRoot, isSigner: false, isWritable: false }, // 13
    { pubkey: callContractSigning, isSigner: false, isWritable: false }, // 14
    { pubkey: ITS_PROGRAM_ID, isSigner: false, isWritable: false }, // 15
  ];

  return new TransactionInstruction({
    programId: ITS_PROGRAM_ID,
    keys,
    data,
  });
}