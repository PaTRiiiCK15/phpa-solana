const hre = require("hardhat");

async function main() {
  const PHPA_ADDRESS = "0xAB9b61022C0f8aC255F5E437Bb303A7E55504987";

  const phpa = await hre.ethers.getContractAt("PHPA", PHPA_ADDRESS);

  console.log("TC-23: Attempting pause() from unauthorized vault (ID: 13)...");

  const tx = await phpa.pause();
  await tx.wait();

  console.log("FAIL: Transaction went through. Hash:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("TC-23 Result:", error.message);
    console.log("PASS if error contains BLOCKED_BY_POLICY.");
    process.exit(1);
  });
