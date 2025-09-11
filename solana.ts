import { getSolanaChainConfig } from "./common/chains";
import { getSolanaKeypair } from "./solana/wallet";
import { Environment } from "@axelar-network/axelarjs-sdk";
import { formatUnits, parseUnits } from "ethers";
import { calculateEstimatedFee } from "./common/gasEstimation";
import { environment } from "./common/env";
import { Connection, clusterApiUrl, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ExitStatus } from "typescript";
import { fundWallet } from "./solana/wallet";

// --- Constants ---
const DESTINATION_CHAIN: string = process.argv[2] || "ethereum-sepolia";
const DESTINATION_ADDRESS =
  process.argv[3] || "0xA57ADCE1d2fE72949E4308867D894CD7E7DE0ef2";
const UNIT_AMOUNT = parseUnits(process.argv[4] || "1", 9);
const ENVIRONMENT = environment;
// translate environment into one of the Solana clusters
// Possible options: 'devnet' | 'testnet' | 'mainnet-beta'
const solanaClusterMapping = {
  "devnet-amplifier": "devnet",
  "testnet": "testnet",
  "mainnet": "mainnet-beta",
};
console.log(environment);
const solanaCluster = solanaClusterMapping[environment];

const SOLANA_CONFIG = await getSolanaChainConfig();
const SOLANA_CONTRACTS = SOLANA_CONFIG.config.contracts;

const { InterchainTokenService, AxelarGateway, AxelarGasService } = SOLANA_CONTRACTS;

console.log(InterchainTokenService);

const connection = new Connection(clusterApiUrl(solanaCluster), "confirmed");

// get balance of the current wallet
const keypair = getSolanaKeypair();

let balance = await connection.getBalance(keypair.publicKey);
console.log("Current wallet balance is:", balance);

if (balance < 1 * LAMPORTS_PER_SOL && (environment == "testnet" || environment == "devnet-amplifier")) {
  // attempt to refund wallet if we are on a testnet 
  balance = await fundWallet(connection, keypair);
  console.log("Balance after refund is", balance);

}

// for every signature on the transaction, the transaction needs to pay 5000 lamports (with 10^9 lamports = 1 SOL)

// there is an optional priority fee, which we query now
// example taken from https://docs.chainstack.com/docs/solana-estimate-priority-fees-getrecentprioritizationfees
interface PrioritizationFeeObject {
    slot: number;
    prioritizationFee: number;
}

const prioritizationFeeObjects = await connection.getRecentPrioritizationFees() as PrioritizationFeeObject[];

if (prioritizationFeeObjects.length === 0) {
    console.log('No prioritization fee data available.');
    throw new Error("Failed to get prioritization fee data");
}

const slots = prioritizationFeeObjects.map(feeObject => feeObject.slot).sort((a, b) => a - b);

// Extract slots range
const slotsRangeStart = slots[0];
const slotsRangeEnd = slots[slots.length - 1];

// Calculate the average including zero fees
const averageFeeIncludingZeros = prioritizationFeeObjects.length > 0
    ? Math.floor(prioritizationFeeObjects.reduce((acc, feeObject) => acc + feeObject.prioritizationFee, 0) / prioritizationFeeObjects.length)
    : 0;

// Filter out prioritization fees that are equal to 0 for other calculations
const nonZeroFees = prioritizationFeeObjects
    .map(feeObject => feeObject.prioritizationFee)
    .filter(fee => fee !== 0);

// Calculate the average of the non-zero fees
const averageFeeExcludingZeros = nonZeroFees.length > 0
    ? Math.floor(nonZeroFees.reduce((acc, fee) => acc + fee, 0) / nonZeroFees.length )
    : 0;

// Calculate the median of the non-zero fees
const sortedFees = nonZeroFees.sort((a, b) => a - b);
let medianFee = 0;
if (sortedFees.length > 0) {
    const midIndex = Math.floor(sortedFees.length / 2);
    medianFee = sortedFees.length % 2 !== 0
        ? sortedFees[midIndex]
        : Math.floor((sortedFees[midIndex - 1] + sortedFees[midIndex]) / 2);
}

console.log(`Slots examined for priority fees: ${prioritizationFeeObjects.length}`)
console.log(`Slots range examined from ${slotsRangeStart} to ${slotsRangeEnd}`);
console.log('====================================================================================')

// You can use averageFeeIncludingZeros, averageFeeExcludingZeros, and medianFee in your transactions script
console.log(` 💰 Average Prioritization Fee (including slots with zero fees): ${averageFeeIncludingZeros} micro-lamports.`);
console.log(` 💰 Average Prioritization Fee (excluding slots with zero fees): ${averageFeeExcludingZeros} micro-lamports.`);
console.log(` 💰 Median Prioritization Fee (excluding slots with zero fees): ${medianFee} micro-lamports.`);

/*
console.log("Environment:", environment);

// If the destination chain is XRPL, you'll need to set a trust line with token issuer first (the address of interchain token service contract at xrpl).
let destinationAddress =
  DESTINATION_CHAIN === "xrpl"
    ? convertAddressForXrpl(DESTINATION_ADDRESS).toBytes()
    : convertAddress(DESTINATION_ADDRESS).toBytes();

// SQD token
const TOKEN_SYMBOL = "SQD";
const TOKEN_ADDRESS =
  "0xdec8d72a69438bc872824e70944cd4d89d25c34e3f149993b2d06718d4fd87e2";
const ITS_TOKEN_ID =
  "0x42e69c5a9903ba193f3e9214d41b1ad495faace3ca712fb0c9d0c44cc4d31a0c";
const ITS_TOKEN_TYPE = `${TOKEN_ADDRESS}::${TOKEN_SYMBOL.toLowerCase()}::${TOKEN_SYMBOL.toUpperCase()}`;
const CLOCK_PACKAGE_ID = "0x6";

// --- Main Execution ---
(async () => {
  const chainConfig = await getSuiChainConfig();
  const contracts = chainConfig.config.contracts;

  const suiClient = new SuiClient({ url: chainConfig.config.rpc[0] });
  const suiWallet = getSuiKeypair();
  const walletAddress = suiWallet.toSuiAddress();

  console.log("Wallet Address:", walletAddress);

  const balance = await suiClient.getBalance({
    owner: walletAddress,
  });

  console.log("Total Balance:", `${formatUnits(balance.totalBalance, 9)} SUI`);

  const objectIds = {
    its: contracts.InterchainTokenService.objects.InterchainTokenService,
    itsv0: contracts.InterchainTokenService.objects.InterchainTokenServicev0,
    gateway: contracts.AxelarGateway.objects.Gateway,
    gasService: contracts.GasService.objects.GasService,
  };

  const fee = await calculateEstimatedFee("sui", DESTINATION_CHAIN);
  console.log("Estimated Fee:", `${formatUnits(fee, 9)} SUI`);

  console.log(
    `Sending ${formatUnits(UNIT_AMOUNT, 9)} ${TOKEN_SYMBOL} to ${DESTINATION_ADDRESS} on ${DESTINATION_CHAIN}`,
  );

  const itsCoinObjectId = await getItsCoin(
    suiClient,
    walletAddress,
    ITS_TOKEN_TYPE,
  );

  // Create a new transaction block
  const tx = new Transaction();

  // Split Gas for paying axelar fee
  const gas = tx.splitCoins(tx.gas, [BigInt(fee)]);

  // Split Coin for transferring amount through interchain transfer
  const transferCoin = tx.splitCoins(tx.object(itsCoinObjectId), [UNIT_AMOUNT]);

  // Create a new channel
  const channel = AxelarGateway.channel.builder.new$(tx, []);
  const tokenId = InterchainTokenService.token_id.builder.fromU256(tx, [
    BigInt(ITS_TOKEN_ID),
  ]);

  // Serialize empty metadata as a byte vector
  const emptyMetadata = bcs.byteVector().serialize(new Uint8Array()).toBytes();

  // Prepare interchain transfer
  const ticket =
    InterchainTokenService.interchain_token_service.builder.prepareInterchainTransfer(
      tx,
      [
        tokenId,
        transferCoin,
        DESTINATION_CHAIN,
        tx.pure(destinationAddress),
        tx.pure(emptyMetadata),
        channel,
      ],
      [ITS_TOKEN_TYPE],
    );

  // Send interchain transfer
  const messageTicket =
    InterchainTokenService.interchain_token_service.builder.sendInterchainTransfer(
      tx,
      [objectIds.its, ticket, CLOCK_PACKAGE_ID],
      [ITS_TOKEN_TYPE],
    );

  // Pay gas for the transfer
  GasService.gas_service.builder.payGas(
    tx,
    [objectIds.gasService, messageTicket, gas, walletAddress, tx.object("0x")],
    ["0x2::sui::SUI"],
  );

  // Send the message
  AxelarGateway.gateway.builder.sendMessage(tx, [
    objectIds.gateway,
    messageTicket,
  ]);

  // Destroy the channel
  AxelarGateway.channel.builder.destroy(tx, [channel]);

  // Sign and execute the transaction
  const response = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: suiWallet,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log(
    "Transaction Hash:",
    `${chainConfig.blockExplorers[0].url}/tx/${response.digest}`,
  );
})();
*/