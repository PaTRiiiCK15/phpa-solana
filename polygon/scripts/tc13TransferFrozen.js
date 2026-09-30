const { FireblocksWeb3Provider, ChainId } = require("@fireblocks/fireblocks-web3-provider");
const { ethers } = require("ethers");
const fs = require("fs");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const RECIPIENT = "0x38d6030282DE5C10B3601117EaFE7106372f41C4";
  const AMOUNT = ethers.parseUnits("1", 18);

  const apiKey = process.env.FIREBLOCKS_API_KEY;
  const secretKeyPath = process.env.FIREBLOCKS_SECRET_KEY_PATH;
  const vaultAccountId = process.env.FIREBLOCKS_VAULT_ACCOUNT_ID;
  const privateKey = fs.readFileSync(secretKeyPath, "utf8");

  const fbProvider = new FireblocksWeb3Provider({
    apiKey,
    privateKey,
    vaultAccountIds: vaultAccountId,
    chainId: ChainId.POLYGON_AMOY,
    rpcUrl: "https://polygon-amoy.g.alchemy.com/v2/alch_5ckxOBI9tfkkTYKiexoRB",
  });

  const provider = new ethers.BrowserProvider(fbProvider);
  const signer = await provider.getSigner();

  const abi = ["function transfer(address to, uint256 amount) external returns (bool)"];
  const phpa = new ethers.Contract(PHPA_ADDRESS, abi, signer);

  console.log("TC-13: Attempting transfer() from frozen USER-TEST-001 (vault ID 13)...");
  console.log("Signer address:", await signer.getAddress());
  console.log("Expected: Transfer blocked because sender is frozen.");

  const tx = await phpa.transfer(RECIPIENT, AMOUNT);
  await tx.wait();
  console.log("FAIL: Transfer went through. Hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("TC-13 Result:", error.message);
    console.log("PASS if error contains frozen or custom error.");
    process.exit(1);
  });
