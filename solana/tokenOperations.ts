import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
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
  findItsRootPda,
  findTokenManagerPda,
} from "./solanaPda";
import {
  type InterchainTransferInput,
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

// SPL Token program ID (regular SPL tokens)
const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

const INTERCHAIN_TRANSFER_INSTRUCTION_ID = await anchorInstructionDiscriminator("interchain_transfer");

export async function buildInterchainTransferTx(
  input: InterchainTransferInput,
): Promise<Transaction> {
  const chainConfig = await getSolanaChainConfig();
  const rpcUrl = chainConfig.config.rpc?.[0];
  if (!rpcUrl) throw new Error("No Solana RPC configured");

  const itsProgramId = await getItsProgramId();
  const gatewayProgramId = await getGatewayProgramId();
  const gasServiceProgramId = await getAxelarGasServiceProgramId();

  const payer = new PublicKey(input.caller);
  const connection = new Connection(rpcUrl, "confirmed");

  const tokenIdBytes = Buffer.from(input.tokenId.replace(/^0x/, ""), "hex");
  if (tokenIdBytes.length !== 32) throw new Error("tokenId must be 32 bytes");
  const [itsRootPda] = findItsRootPda(itsProgramId);
  const [tokenManagerPda] = findTokenManagerPda(
    itsProgramId,
    itsRootPda,
    tokenIdBytes
  );
  const tokenMint = new PublicKey(input.tokenAddress);

  // Determine token program (support TOKEN_2022 and SPL)
  const mintInfo = await connection.getAccountInfo(tokenMint);
  if (!mintInfo) throw new Error("Mint not found");
  const tokenProgramId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : SPL_TOKEN_PROGRAM_ID;

  const authority = getAssociatedTokenAddressSync( // not sure what this is? just a copy of caller for now?
    tokenMint,
    payer,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const tokenManagerAta = getAssociatedTokenAddressSync(
    tokenMint,
    tokenManagerPda,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const authorityTokenAccount = getAssociatedTokenAddressSync(
      tokenMint,
      payer,
      true,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Flow slot PDA requires epoch (current timestamp / 6h)
  const now = Math.floor(Date.now() / 1000);
  const epoch = Math.floor(now / (6 * 60 * 60));
  const flowEpochBuf = Buffer.alloc(8);
  flowEpochBuf.writeBigUInt64LE(BigInt(epoch));

  const [gatewayRootPda] = findGatewayRootPda(gatewayProgramId);
  const [signingPda, signingPdaBump] =
    findCallContractSigningPda(itsProgramId);
  const [gatewayEventAuthority] = findEventAuthority(gatewayProgramId);
  const [gasEventAuthority] = findEventAuthority(gasServiceProgramId);
  const [itsEventAuthority] = findEventAuthority(itsProgramId);
  const [gasTreasury] = findGasTreasuryPda(gasServiceProgramId);

  const destinationAddressBytes = Buffer.from(
    input.destinationAddress.replace(/^0x/, ""),
    "hex"
  );
  const amount = BigInt(input.amount);
  const gas = BigInt(input.gasValue ?? "0");
  const payload = input.payload ?? "";

  let encodedPayload = Buffer.from("\0");
  if (payload.length > 0) {
    encodedPayload = Buffer.concat([Buffer.from("\x01"), encodeU32LE(payload.length), Buffer.from(payload)]);
  }

  const data = Buffer.concat([
    // instruction id
    INTERCHAIN_TRANSFER_INSTRUCTION_ID,
    // token_id
    Buffer.from(tokenIdBytes),
    // destination_chain
    encodeStringBorsh(input.destinationChain),
    // destination_address
    encodeU32LE(destinationAddressBytes.length),
    Buffer.from(destinationAddressBytes),
    // amount
    encodeU64LE(amount),
    // gas_value
    encodeU64LE(gas),
    // source_id
    Buffer.from("\x00"), // for now, we are calling it as EOA
    // pda_seeds
    Buffer.from("\x00"), // for now, we are calling it as EOA
    encodedPayload,
  ]);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: false }, // replaced `authority` with `payer` because it is an EOA?
    { pubkey: gatewayRootPda, isSigner: false, isWritable: false },
    { pubkey: gatewayEventAuthority, isSigner: false, isWritable: false },    
    { pubkey: gatewayProgramId, isSigner: false, isWritable: false },
    { pubkey: signingPda, isSigner: false, isWritable: false },
    { pubkey: gasTreasury, isSigner: false, isWritable: true },
    { pubkey: gasServiceProgramId, isSigner: false, isWritable: false },
    { pubkey: gasEventAuthority, isSigner: false, isWritable: false },
    { pubkey: itsRootPda, isSigner: false, isWritable: false },
    { pubkey: tokenManagerPda, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: tokenMint, isSigner: false, isWritable: true },
    { pubkey: authorityTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenManagerAta, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: itsEventAuthority, isSigner: false, isWritable: false },
    { pubkey: itsProgramId, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({
    programId: itsProgramId,
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
