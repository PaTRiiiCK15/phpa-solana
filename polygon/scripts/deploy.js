const hre = require("hardhat");

async function main() {
  // PHPA-OPS-TESTNET vault address
  // This address receives MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE, FREEZER_ROLE
  // DEFAULT_ADMIN_ROLE goes to msg.sender (also PHPA-OPS-TESTNET since we deploy from vault 1)
  const fireblocksVault = "0x38d6030282DE5C10B3601117EaFE7106372f41C4";

  console.log("Deploying PHPA contract...");
  console.log("fireblocksVault address:", fireblocksVault);

  const PHPA = await hre.ethers.getContractFactory("PHPA");
  const phpa = await PHPA.deploy(fireblocksVault);

  await phpa.waitForDeployment();

  const deployedAddress = await phpa.getAddress();
  console.log("PHPA deployed to:", deployedAddress);
  console.log("Save this address. You will need it for grantRole and revokeRole next.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });