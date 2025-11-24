import { getSolanaChainConfig } from "./common/chains";
import { getSolanaKeypair } from "./solana/wallet";
import { calculateEstimatedFee } from "./common/gasEstimation";
import { environment } from "./common/env";
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL, sendAndConfirmTransaction, type Cluster } from "@solana/web3.js";
import { fundWallet } from "./solana/wallet";
import { buildInterchainTransferTx } from "./solana/tokenOperations";
import { type InterchainTransferInput } from "./solana/types";

// --- Constants ---
const TOKEN_ID: string = process.argv[2] || "f238f2d38d16c5f472629c401433ccb704eea5e9d1aa8bb8e75e3628db65dc65";
const TOKEN_ADDRESS: string = process.argv[3] || "8yqTiWbBsd82Lcnw3wJpX2mTVPxyftKKoMt2hCA2m2wS";
const DESTINATION_CHAIN: string = process.argv[4] || "avalanche-fuji";
const DESTINATION_ADDRESS: string = process.argv[5] || "0xA57ADCE1d2fE72949E4308867D894CD7E7DE0ef2";
const AMOUNT = process.argv[6] || "1";
let PAYLOAD = process.argv[7] || null;
if((PAYLOAD ?? "").length > 530) {
  throw new Error("Payload too long! Consider using off-chain data");
}

// translate environment into one of the Solana clusters
// Possible options: 'devnet' | 'testnet' | 'mainnet-beta'
const configMapping = {
  "devnet-amplifier": {solanaCluster: "devnet", axelarscanUrl: "https://devnet-amplifier.axelarscan.io"},
  "testnet": {solanaCluster: "testnet", axelarscanUrl: "https://testnet.axelarscan.io"},
  "mainnet": {solanaCluster: "mainnet-beta", axelarscanUrl: "https://axelarscan.io"},
};

console.log("Environment:", environment);
if (!(environment in configMapping)) {
  throw new Error("Invalid environment");
}
const {solanaCluster, axelarscanUrl} = configMapping[environment];


const SOLANA_CONFIG = await getSolanaChainConfig();
const SOLANA_CONTRACTS = SOLANA_CONFIG.config.contracts;

const { InterchainTokenService, AxelarGateway, AxelarGasService } = SOLANA_CONTRACTS;

const connection = new Connection(clusterApiUrl(solanaCluster as Cluster), "confirmed");

// get balance of the current wallet
const keypair = getSolanaKeypair();

let balance = await connection.getBalance(keypair.publicKey);
console.log("Current wallet balance is:", balance, "lamports (", balance / LAMPORTS_PER_SOL, "SOL)");

if (balance < 1 * LAMPORTS_PER_SOL && (environment == "testnet" || environment == "devnet-amplifier")) {
  // attempt to refund wallet if we are on a testnet 
  balance = await fundWallet(connection, keypair);
  console.log("Balance after funding wallet is", balance);
}

// SOLANA GAS ESTIMATION 
// For every signature on the transaction, the transaction needs to pay 5000 lamports (with 10^9 lamports = 1 SOL)

// There is an optional priority fee, which we query now -> this is equivalent to the "gas price" when there is high demand
// This example is taken from https://docs.chainstack.com/docs/solana-estimate-priority-fees-getrecentprioritizationfees
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
// Done with reading prioritization fee for Solana

// Calculating how much gas we have to pay for the ITS transfer to go through.
const GAS = await calculateEstimatedFee(SOLANA_CONFIG.id, DESTINATION_CHAIN, PAYLOAD);
console.log("Estimated gas as", GAS);

const params = {
  caller: keypair.publicKey.toString(),
  tokenId: TOKEN_ID,
  tokenAddress: TOKEN_ADDRESS,
  destinationChain: DESTINATION_CHAIN,
  destinationAddress: DESTINATION_ADDRESS,  
  amount: AMOUNT,
  gasValue: GAS,
  priorityFee: averageFeeIncludingZeros, // use the average priority fee
  payload: PAYLOAD,
} as InterchainTransferInput;

const tx = await buildInterchainTransferTx(params);

tx.sign(keypair);

const signature = await sendAndConfirmTransaction(connection, tx, [
  keypair,
]);

console.log("Sent transaction!", signature);
console.log("View it on the explorer: https://explorer.solana.com/tx/" + signature + '?cluster=' + solanaCluster);
console.log("View it on Axelarscan: " + axelarscanUrl + "/gmp/" + signature + '-1.7'); // might have to update this index

