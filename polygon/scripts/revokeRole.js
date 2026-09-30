const hre = require("hardhat");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";
  const OPS_VAULT = "0x38d6030282DE5C10B3601117EaFE7106372f41C4";

  const phpa = await hre.ethers.getContractAt("PHPA", PHPA_ADDRESS);

  const DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();
  console.log("DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);

  // Verify ADMIN_VAULT has the role before revoking from OPS_VAULT
  const ADMIN_VAULT = "0xEE6ff5444b8ff9aEb2acB06388e9156E9b526503";
  const adminHasRole = await phpa.hasRole(DEFAULT_ADMIN_ROLE, ADMIN_VAULT);
  console.log("PHPA-ADMIN-TESTNET has DEFAULT_ADMIN_ROLE:", adminHasRole);

  if (!adminHasRole) {
    console.error("STOP: PHPA-ADMIN-TESTNET does not have DEFAULT_ADMIN_ROLE yet. Run grantRole first.");
    process.exit(1);
  }

  console.log("Revoking DEFAULT_ADMIN_ROLE from PHPA-OPS-TESTNET...");
  const tx = await phpa.revokeRole(DEFAULT_ADMIN_ROLE, OPS_VAULT);
  await tx.wait();

  console.log("revokeRole transaction confirmed:", tx.hash);
  console.log("DEFAULT_ADMIN_ROLE successfully removed from:", OPS_VAULT);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });