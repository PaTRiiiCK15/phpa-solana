const hre = require("hardhat");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const ADMIN_VAULT = "0xEE6ff5444b8ff9aEb2acB06388e9156E9b526503";

  const phpa = await hre.ethers.getContractAt("PHPA", PHPA_ADDRESS);

  const DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();
  console.log("DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);
  console.log("Granting DEFAULT_ADMIN_ROLE to PHPA-ADMIN-TESTNET...");

  const tx = await phpa.grantRole(DEFAULT_ADMIN_ROLE, ADMIN_VAULT);
  await tx.wait();

  console.log("grantRole transaction confirmed:", tx.hash);
  console.log("DEFAULT_ADMIN_ROLE successfully granted to:", ADMIN_VAULT);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });