import {
  BrowserProvider,
  Contract,
  type Eip1193Provider,
  type JsonRpcSigner,
  MaxUint256,
  formatUnits,
  parseUnits,
} from "ethers";

import { PAYMASTER_ABI, PAYMASTER_ADDRESS } from "@/config/azuro-polygon-contracts";

const erc20ApproveAbi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

function getPaymasterContract(signerOrProvider: JsonRpcSigner | BrowserProvider) {
  return new Contract(PAYMASTER_ADDRESS, PAYMASTER_ABI, signerOrProvider);
}

export function getBrowserProvider(ethereum: Eip1193Provider): BrowserProvider {
  return new BrowserProvider(ethereum);
}

/** Read `freeBetsFund` + `feeFund` for a bettor on PayMaster (on-chain). */
export async function readPaymasterBalances(
  provider: BrowserProvider,
  bettorAddress: string,
): Promise<{ freeBetsWei: bigint; feeWei: bigint }> {
  const pm = getPaymasterContract(provider);
  const [freeBetsWei, feeWei] = await Promise.all([
    pm.freeBetsFund!(bettorAddress),
    pm.feeFund!(bettorAddress),
  ]);
  return { freeBetsWei: BigInt(freeBetsWei.toString()), feeWei: BigInt(feeWei.toString()) };
}

export async function readErc20Balance(provider: BrowserProvider, tokenAddress: string, account: string): Promise<bigint> {
  const token = new Contract(tokenAddress, erc20ApproveAbi, provider);
  const raw = await token.balanceOf!(account);
  return BigInt(raw.toString());
}

/**
 * Approve bet token for PayMaster if allowance is insufficient.
 * `totalWei` should be `freeBetAmount + feeAmount` for the upcoming `depositFor`.
 */
export async function ensurePaymasterAllowance(
  signer: JsonRpcSigner,
  betTokenAddress: string,
  totalWei: bigint,
): Promise<void> {
  const owner = await signer.getAddress();
  const token = new Contract(betTokenAddress, erc20ApproveAbi, signer);
  const allowance = await token.allowance!(owner, PAYMASTER_ADDRESS);
  if (BigInt(allowance.toString()) >= totalWei) return;
  const tx = await token.approve!(PAYMASTER_ADDRESS, MaxUint256);
  await tx.wait();
}

/**
 * `depositFor(address account, uint256 freeBetAmount, uint256 feeAmount)` — pulls ERC20 from caller.
 * Approves `freeBetAmount + feeAmount` then deposits for `account` (usually the same as msg.sender).
 */
export async function depositForPaymaster(
  signer: JsonRpcSigner,
  account: string,
  betTokenAddress: string,
  decimals: number,
  freeBetHuman: string,
  feeHuman = "0",
): Promise<{ hash: string }> {
  const freeWei = parseUnits(freeBetHuman, decimals);
  const feeWei = parseUnits(feeHuman, decimals);
  const total = freeWei + feeWei;
  if (total <= BigInt(0)) throw new Error("Deposit amount must be positive.");

  await ensurePaymasterAllowance(signer, betTokenAddress, total);

  const pm = getPaymasterContract(signer);
  const tx = await pm.depositFor!(account, freeWei, feeWei);
  const receipt = await tx.wait();
  return { hash: receipt?.hash ?? tx.hash };
}

/** `withdraw(uint256 freeBetAmount, uint256 feeAmount)` — pulls from PayMaster internal funds to wallet. */
export async function withdrawFromPaymaster(
  signer: JsonRpcSigner,
  decimals: number,
  freeBetHuman: string,
  feeHuman: string,
): Promise<{ hash: string }> {
  const freeWei = parseUnits(freeBetHuman, decimals);
  const feeWei = parseUnits(feeHuman, decimals);
  const pm = getPaymasterContract(signer);
  const tx = await pm.withdraw!(freeWei, feeWei);
  const receipt = await tx.wait();
  return { hash: receipt?.hash ?? tx.hash };
}

/** `withdrawPayouts(uint256[] freeBetIds)` — claim winning payouts for given Azuro free-bet ids. */
export async function withdrawPayoutsFromPaymaster(
  signer: JsonRpcSigner,
  freeBetIds: bigint[],
): Promise<{ hash: string }> {
  if (freeBetIds.length === 0) throw new Error("No bet ids to claim.");
  const pm = getPaymasterContract(signer);
  const tx = await pm.withdrawPayouts!(freeBetIds);
  const receipt = await tx.wait();
  return { hash: receipt?.hash ?? tx.hash };
}

export function formatToken(wei: bigint, decimals: number, symbol: string): string {
  try {
    return `${formatUnits(wei, decimals)} ${symbol}`;
  } catch {
    return "—";
  }
}
