const hre = require("hardhat");

async function main() {
  const PHPA_ADDRESS = "0x5F032911775d8A0304e57cA35ba659290749EaD3";
  const OPS_VAULT = "0x8ECf844D4Cf0a6F77033D552F8ee45F3FdF2DBbd";
  const ADMIN_VAULT = "0x9f2C68888aA7e453dA5aC6e40F5acd455306f00B";

  const phpa = await hre.ethers.getContractAt("PHPA", PHPA_ADDRESS);

  const DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();
  const MINTER_ROLE = await phpa.MINTER_ROLE();
  const BURNER_ROLE = await phpa.BURNER_ROLE();
  const PAUSER_ROLE = await phpa.PAUSER_ROLE();
  const FREEZER_ROLE = await phpa.FREEZER_ROLE();

  console.log("Granting DEFAULT_ADMIN_ROLE to PHPA-ADMIN-MAINNET...");
  const tx1 = await phpa.grantRole(DEFAULT_ADMIN_ROLE, ADMIN_VAULT);
  await tx1.wait();
  console.log("DEFAULT_ADMIN_ROLE granted. TX:", tx1.hash);

  console.log("Granting MINTER_ROLE to PHPA-OPS-MAINNET...");
  const tx2 = await phpa.grantRole(MINTER_ROLE, OPS_VAULT);
  await tx2.wait();
  console.log("MINTER_ROLE granted. TX:", tx2.hash);

  console.log("Granting BURNER_ROLE to PHPA-OPS-MAINNET...");
  const tx3 = await phpa.grantRole(BURNER_ROLE, OPS_VAULT);
  await tx3.wait();
  console.log("BURNER_ROLE granted. TX:", tx3.hash);

  console.log("Granting PAUSER_ROLE to PHPA-OPS-MAINNET...");
  const tx4 = await phpa.grantRole(PAUSER_ROLE, OPS_VAULT);
  await tx4.wait();
  console.log("PAUSER_ROLE granted. TX:", tx4.hash);

  console.log("Granting FREEZER_ROLE to PHPA-OPS-MAINNET...");
  const tx5 = await phpa.grantRole(FREEZER_ROLE, OPS_VAULT);
  await tx5.wait();
  console.log("FREEZER_ROLE granted. TX:", tx5.hash);

  console.log("All roles granted successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
