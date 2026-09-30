const hre = require("hardhat");

async function main() {
  // PHPA-OPS-MAINNET vault address
  // This address receives MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE, FREEZER_ROLE
  // DEFAULT_ADMIN_ROLE goes to msg.sender (deployer) — must be transferred to PHPA-ADMIN-MAINNET after deployment
  const fireblocksVault = "0x8ECf844D4Cf0a6F77033D552F8ee45F3FdF2DBbd";

  console.log("Deploying PHPA contract to Polygon mainnet...");
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
