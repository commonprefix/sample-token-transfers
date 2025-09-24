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
  findGasConfigPda,
  findGatewayRootPda,
  findItsRootPda,
  findTokenManagerPda,
} from "./solanaPda";
import {
  type InterchainTransferInput,
} from "./types";
import {
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

export async function buildInterchainTransferTx(
  input: InterchainTransferInput,
): Promise<Transaction> {
  const chainConfig = await getSolanaChainConfig();
  const rpcUrl = chainConfig.config.rpc?.[0];
  if (!rpcUrl) throw new Error("No Solana RPC configured");

  const itsProgramId = await getItsProgramId();
  const gatewayProgramId = await getGatewayProgramId();
  const gasServiceProgramId = await getAxelarGasServiceProgramId();

  const caller = new PublicKey(input.caller);
  const connection = new Connection(rpcUrl, "confirmed");

  const tokenIdBytes = Buffer.from(input.tokenId.replace(/^0x/, ""), "hex");
  if (tokenIdBytes.length !== 32) throw new Error("tokenId must be 32 bytes");
  const [itsRootPda] = findItsRootPda(itsProgramId);
  const [tokenManagerPda] = findTokenManagerPda(
    itsProgramId,
    itsRootPda,
    tokenIdBytes
  );
  const mint = new PublicKey(input.tokenAddress);

  // Determine token program (support TOKEN_2022 and SPL)
  const mintInfo = await connection.getAccountInfo(mint);
  if (!mintInfo) throw new Error("Mint not found");
  const tokenProgramId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : SPL_TOKEN_PROGRAM_ID;

  const sourceAccount = getAssociatedTokenAddressSync(
    mint,
    caller,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const tokenManagerAta = getAssociatedTokenAddressSync(
    mint,
    tokenManagerPda,
    true,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Flow slot PDA requires epoch (current timestamp / 6h)
  const now = Math.floor(Date.now() / 1000);
  const epoch = Math.floor(now / (6 * 60 * 60));
  const flowEpochBuf = Buffer.alloc(8);
  flowEpochBuf.writeBigUInt64LE(BigInt(epoch));
  const [flowSlotPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("flow-slot"), tokenManagerPda.toBuffer(), flowEpochBuf],
    itsProgramId
  );

  const [gatewayRootPda] = findGatewayRootPda(gatewayProgramId);
  const [gasConfigPda] = await findGasConfigPda(gasServiceProgramId);
  const [callContractSigningPda, signingPdaBump] =
    findCallContractSigningPda(itsProgramId);

  const destinationAddressBytes = Buffer.from(
    input.destinationAddress.replace(/^0x/, ""),
    "hex"
  );
  const amount = BigInt(input.amount);
  const gas = BigInt(input.gasValue ?? "0");

  const data = Buffer.concat([
    encodeVariantU8(8),
    Buffer.from(tokenIdBytes),
    encodeStringBorsh(input.destinationChain),
    encodeU32LE(destinationAddressBytes.length),
    Buffer.from(destinationAddressBytes),
    encodeU64LE(amount),
    encodeU64LE(gas),
    Buffer.from([signingPdaBump]),
  ]);

  const keys = [
    { pubkey: caller, isSigner: true, isWritable: false },
    { pubkey: sourceAccount, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: tokenManagerPda, isSigner: false, isWritable: false },
    { pubkey: tokenManagerAta, isSigner: false, isWritable: true },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: flowSlotPda, isSigner: false, isWritable: true },
    { pubkey: gatewayRootPda, isSigner: false, isWritable: false },
    { pubkey: gatewayProgramId, isSigner: false, isWritable: false },
    { pubkey: gasConfigPda, isSigner: false, isWritable: true },
    { pubkey: gasServiceProgramId, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: itsRootPda, isSigner: false, isWritable: false },
    { pubkey: callContractSigningPda, isSigner: false, isWritable: false },
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
  tx.feePayer = caller;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  return tx;
}
