import { AxelarQueryAPI } from "@axelar-network/axelarjs-sdk";
import { environment } from "../common/env";
import { isPartOfTypeOnlyImportOrExportDeclaration } from "typescript";

export type HopParams = {
  sourceChain: string;
  destinationChain: string;
  gasLimit: string;
  executeData?: string;
};

export async function calculateEstimatedFee(
  sourceChain: string,
  destinationChain: string,
  payload: string | null,
): Promise<string> {
  const sdk = new AxelarQueryAPI({
    environment,
  });

  const hopParams: HopParams[] = [
    {
      sourceChain: sourceChain,
      destinationChain: "axelar",
      gasLimit: "400000",
      executeData: payload ?? undefined,
    },
    {
      sourceChain: "axelar",
      destinationChain: destinationChain,
      gasLimit: "1100000",
      executeData: payload ?? undefined,
    },
  ];
  const amount = (await sdk.estimateMultihopFee(hopParams)) as string;

  return destinationChain === "xrpl"
    ? Math.ceil(parseInt(amount) / 2).toString()
    : amount;
}
