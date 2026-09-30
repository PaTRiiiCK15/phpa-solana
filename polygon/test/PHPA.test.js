// PHPA.test.js
// Full test suite for PHPA ERC-20 stablecoin contract
// Run: npx hardhat test

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PHPA — Philippine Peso Stablecoin", function () {
  let phpa;
  let deployer, fireblocks, user1, user2, unauthorized;

  // Role constants — must match contract
  let MINTER_ROLE, BURNER_ROLE, PAUSER_ROLE, FREEZER_ROLE, DEFAULT_ADMIN_ROLE;

  beforeEach(async function () {
    [deployer, fireblocks, user1, user2, unauthorized] =
      await ethers.getSigners();

    const PHPA = await ethers.getContractFactory("PHPA");
    phpa = await PHPA.deploy(fireblocks.address);
    await phpa.waitForDeployment();

    MINTER_ROLE       = await phpa.MINTER_ROLE();
    BURNER_ROLE       = await phpa.BURNER_ROLE();
    PAUSER_ROLE       = await phpa.PAUSER_ROLE();
    FREEZER_ROLE      = await phpa.FREEZER_ROLE();
    DEFAULT_ADMIN_ROLE = await phpa.DEFAULT_ADMIN_ROLE();
  });

  // --------------------------------------------------------
  // DEPLOYMENT
  // --------------------------------------------------------

  describe("Deployment", function () {
    it("Should set correct token name and symbol", async function () {
      expect(await phpa.name()).to.equal("Philippine Peso Stablecoin");
      expect(await phpa.symbol()).to.equal("PHPA");
    });

    it("Should set 6 decimal places", async function () {
      expect(await phpa.decimals()).to.equal(6);
    });

    it("Should start with zero total supply", async function () {
      expect(await phpa.totalSupply()).to.equal(0);
    });

    it("Should assign all operational roles to Fireblocks vault", async function () {
      expect(await phpa.hasRole(MINTER_ROLE,  fireblocks.address)).to.be.true;
      expect(await phpa.hasRole(BURNER_ROLE,  fireblocks.address)).to.be.true;
      expect(await phpa.hasRole(PAUSER_ROLE,  fireblocks.address)).to.be.true;
      expect(await phpa.hasRole(FREEZER_ROLE, fireblocks.address)).to.be.true;
    });

    it("Should assign DEFAULT_ADMIN_ROLE to deployer", async function () {
      expect(await phpa.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("Should revert if vault address is zero", async function () {
      const PHPA = await ethers.getContractFactory("PHPA");
      await expect(
        PHPA.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("PHPA: vault address cannot be zero");
    });
  });

  // --------------------------------------------------------
  // MINTING
  // --------------------------------------------------------

  describe("Minting", function () {
    it("Should allow Fireblocks vault to mint tokens", async function () {
      // 10000 units (test amount)
      await phpa.connect(fireblocks).mint(user1.address, 10000);
      expect(await phpa.balanceOf(user1.address)).to.equal(10000);
      expect(await phpa.totalSupply()).to.equal(10000);
    });

    it("Should emit Minted event", async function () {
      await expect(phpa.connect(fireblocks).mint(user1.address, 10000))
        .to.emit(phpa, "Minted")
        .withArgs(user1.address, 10000, fireblocks.address);
    });

    it("Should revert if unauthorized address tries to mint", async function () {
      await expect(
        phpa.connect(unauthorized).mint(user1.address, 10000)
      ).to.be.reverted;
    });

    it("Should revert mint to zero address", async function () {
      await expect(
        phpa.connect(fireblocks).mint(ethers.ZeroAddress, 10000)
      ).to.be.revertedWith("PHPA: mint to zero address");
    });

    it("Should revert mint of zero amount", async function () {
      await expect(
        phpa.connect(fireblocks).mint(user1.address, 0)
      ).to.be.revertedWith("PHPA: mint amount must be greater than zero");
    });
  });

  // --------------------------------------------------------
  // BURNING (OPERATOR-INITIATED REDEMPTION)
  // --------------------------------------------------------

  describe("Operator Burn (Redemption)", function () {
    beforeEach(async function () {
      await phpa.connect(fireblocks).mint(user1.address, 10000);
    });

    it("Should allow Fireblocks vault to burn tokens on redemption", async function () {
      await phpa.connect(fireblocks).operatorBurn(user1.address, 10000);
      expect(await phpa.balanceOf(user1.address)).to.equal(0);
      expect(await phpa.totalSupply()).to.equal(0);
    });

    it("Should emit Burned event", async function () {
      await expect(phpa.connect(fireblocks).operatorBurn(user1.address, 10000))
        .to.emit(phpa, "Burned")
        .withArgs(user1.address, 10000, fireblocks.address);
    });

    it("Should revert if unauthorized address tries to operator burn", async function () {
      await expect(
        phpa.connect(unauthorized).operatorBurn(user1.address, 10000)
      ).to.be.reverted;
    });

    it("Should revert burn of zero amount", async function () {
      await expect(
        phpa.connect(fireblocks).operatorBurn(user1.address, 0)
      ).to.be.revertedWith("PHPA: burn amount must be greater than zero");
    });

    it("Should not allow token holder to self-burn", async function () {
  // ERC20Burnable removed in v1.1.2 — burn is operator-only.
  // Confirm the burn function does not exist on the contract.
  expect(typeof phpa.burn).to.equal("undefined");
});
  });

  // --------------------------------------------------------
  // TRANSFERS
  // --------------------------------------------------------

  describe("Transfers", function () {
    beforeEach(async function () {
      await phpa.connect(fireblocks).mint(user1.address, 10000);
    });

    it("Should allow normal token transfers between users", async function () {
      await phpa.connect(user1).transfer(user2.address, 5000);
      expect(await phpa.balanceOf(user1.address)).to.equal(5000);
      expect(await phpa.balanceOf(user2.address)).to.equal(5000);
    });

    it("Should revert transfer when contract is paused", async function () {
      await phpa.connect(fireblocks).pause();
      await expect(
        phpa.connect(user1).transfer(user2.address, 5000)
      ).to.be.reverted;
    });
  });

  // --------------------------------------------------------
  // PAUSE / UNPAUSE
  // --------------------------------------------------------

  describe("Pause", function () {
    it("Should allow Fireblocks vault to pause", async function () {
      await phpa.connect(fireblocks).pause();
      expect(await phpa.paused()).to.be.true;
    });

    it("Should allow Fireblocks vault to unpause", async function () {
      await phpa.connect(fireblocks).pause();
      await phpa.connect(fireblocks).unpause();
      expect(await phpa.paused()).to.be.false;
    });

    it("Should revert pause from unauthorized address", async function () {
      await expect(phpa.connect(unauthorized).pause()).to.be.reverted;
    });

    it("Should block minting while paused", async function () {
      await phpa.connect(fireblocks).pause();
      await expect(
        phpa.connect(fireblocks).mint(user1.address, 10000)
      ).to.be.reverted;
    });

    it("Should block burns while paused", async function () {
      await phpa.connect(fireblocks).mint(user1.address, 10000);
      await phpa.connect(fireblocks).pause();
      await expect(
        phpa.connect(fireblocks).operatorBurn(user1.address, 10000)
      ).to.be.reverted;
    });
  });

  // --------------------------------------------------------
  // FREEZE / UNFREEZE
  // --------------------------------------------------------

  describe("Freeze", function () {
    beforeEach(async function () {
      await phpa.connect(fireblocks).mint(user1.address, 10000);
    });

    it("Should allow Fireblocks vault to freeze an address", async function () {
      await phpa.connect(fireblocks).freeze(user1.address);
      expect(await phpa.isFrozen(user1.address)).to.be.true;
    });

    it("Should emit AddressFrozen event", async function () {
      await expect(phpa.connect(fireblocks).freeze(user1.address))
        .to.emit(phpa, "AddressFrozen")
        .withArgs(user1.address, fireblocks.address);
    });

    it("Should block transfers from frozen address", async function () {
      await phpa.connect(fireblocks).freeze(user1.address);
      await expect(
        phpa.connect(user1).transfer(user2.address, 1000)
      ).to.be.revertedWith("PHPA: sender address is frozen");
    });

    it("Should block transfers to frozen address", async function () {
      await phpa.connect(fireblocks).mint(user2.address, 10000);
      await phpa.connect(fireblocks).freeze(user1.address);
      await expect(
        phpa.connect(user2).transfer(user1.address, 1000)
      ).to.be.revertedWith("PHPA: recipient address is frozen");
    });

    it("Should allow Fireblocks vault to unfreeze an address", async function () {
      await phpa.connect(fireblocks).freeze(user1.address);
      await phpa.connect(fireblocks).unfreeze(user1.address);
      expect(await phpa.isFrozen(user1.address)).to.be.false;
    });

    it("Should emit AddressUnfrozen event", async function () {
      await phpa.connect(fireblocks).freeze(user1.address);
      await expect(phpa.connect(fireblocks).unfreeze(user1.address))
        .to.emit(phpa, "AddressUnfrozen")
        .withArgs(user1.address, fireblocks.address);
    });

    it("Should allow transfers after unfreeze", async function () {
      await phpa.connect(fireblocks).freeze(user1.address);
      await phpa.connect(fireblocks).unfreeze(user1.address);
      await phpa.connect(user1).transfer(user2.address, 5000);
      expect(await phpa.balanceOf(user2.address)).to.equal(5000);
    });

    it("Should revert freeze from unauthorized address", async function () {
      await expect(
        phpa.connect(unauthorized).freeze(user1.address)
      ).to.be.reverted;
    });

    it("Should revert double freeze", async function () {
      await phpa.connect(fireblocks).freeze(user1.address);
      await expect(
        phpa.connect(fireblocks).freeze(user1.address)
      ).to.be.revertedWith("PHPA: address already frozen");
    });

    it("Should revert unfreeze of non-frozen address", async function () {
      await expect(
        phpa.connect(fireblocks).unfreeze(user1.address)
      ).to.be.revertedWith("PHPA: address is not frozen");
    });

    it("Should revert freeze of zero address", async function () {
      await expect(
        phpa.connect(fireblocks).freeze(ethers.ZeroAddress)
      ).to.be.revertedWith("PHPA: cannot freeze zero address");
    });
  });

  // --------------------------------------------------------
  // ROLE MANAGEMENT
  // --------------------------------------------------------

  describe("Role Management", function () {
    it("Should allow admin to grant MINTER_ROLE to a new address", async function () {
      await phpa.connect(deployer).grantRole(MINTER_ROLE, user1.address);
      expect(await phpa.hasRole(MINTER_ROLE, user1.address)).to.be.true;
    });

    it("Should allow admin to revoke MINTER_ROLE", async function () {
      await phpa.connect(deployer).revokeRole(MINTER_ROLE, fireblocks.address);
      expect(await phpa.hasRole(MINTER_ROLE, fireblocks.address)).to.be.false;
    });

    it("Should revert role grant from non-admin", async function () {
      await expect(
        phpa.connect(unauthorized).grantRole(MINTER_ROLE, user1.address)
      ).to.be.reverted;
    });
  });

  // --------------------------------------------------------
  // AXE1-2: OPERATOR BURN ON FROZEN ADDRESSES
  // --------------------------------------------------------

  describe("AXE1-2: operatorBurn on frozen addresses", function () {
    it("Should allow BURNER_ROLE to burn from a frozen address", async function () {
      const amount = 100n * 1_000_000n;
      await phpa.connect(fireblocks).mint(user1.address, amount);
      await phpa.connect(fireblocks).freeze(user1.address);
      expect(await phpa.isFrozen(user1.address)).to.equal(true);
      await expect(phpa.connect(fireblocks).operatorBurn(user1.address, amount))
        .to.emit(phpa, "Burned")
        .withArgs(user1.address, amount, fireblocks.address);
      expect(await phpa.balanceOf(user1.address)).to.equal(0n);
    });

    it("Should still block normal transfers from a frozen address", async function () {
      const amount = 100n * 1_000_000n;
      await phpa.connect(fireblocks).mint(user1.address, amount);
      await phpa.connect(fireblocks).freeze(user1.address);
      await expect(
        phpa.connect(user1).transfer(user2.address, amount)
      ).to.be.revertedWith("PHPA: sender address is frozen");
    });

    it("Should block operatorBurn when contract is paused", async function () {
      const amount = 100n * 1_000_000n;
      await phpa.connect(fireblocks).mint(user1.address, amount);
      await phpa.connect(fireblocks).freeze(user1.address);
      await phpa.connect(fireblocks).pause();
      await expect(
        phpa.connect(fireblocks).operatorBurn(user1.address, amount)
      ).to.be.revertedWithCustomError(phpa, "EnforcedPause");
    });
  });
// --------------------------------------------------------
  // TOKEN RESCUE
  // --------------------------------------------------------

  describe("Token Rescue", function () {
    it("Should allow admin to rescue accidentally sent ERC-20 tokens", async function () {
      // Mint some PHPA to the contract address to simulate
      // a foreign token accidentally sent there.
      // We use a second PHPA instance as the "foreign token".
      const PHPA2 = await ethers.getContractFactory("PHPA");
      const foreignToken = await PHPA2.deploy(fireblocks.address);
      await foreignToken.waitForDeployment();

      const amount = 100n * 1_000_000n;
      await foreignToken.connect(fireblocks).mint(await phpa.getAddress(), amount);

      await expect(
        phpa.connect(deployer).rescueERC20(
          await foreignToken.getAddress(),
          deployer.address,
          amount
        )
      ).to.emit(phpa, "ERC20Rescued")
        .withArgs(await foreignToken.getAddress(), deployer.address, amount);

      expect(await foreignToken.balanceOf(deployer.address)).to.equal(amount);
    });

    it("Should block rescuing PHPA itself", async function () {
      await expect(
        phpa.connect(deployer).rescueERC20(
          await phpa.getAddress(),
          deployer.address,
          1000n
        )
      ).to.be.revertedWith("PHPA: cannot rescue PHPA itself");
    });

    it("Should block ERC-20 rescue from unauthorized address", async function () {
      const PHPA2 = await ethers.getContractFactory("PHPA");
      const foreignToken = await PHPA2.deploy(fireblocks.address);
      await foreignToken.waitForDeployment();
      await expect(
        phpa.connect(unauthorized).rescueERC20(
          await foreignToken.getAddress(),
          deployer.address,
          1000n
        )
      ).to.be.reverted;
    });

    it("Should allow admin to rescue accidentally sent ETH", async function () {
      // Send ETH to the contract
      await deployer.sendTransaction({
        to: await phpa.getAddress(),
        value: ethers.parseEther("1.0")
      });

      const balanceBefore = await ethers.provider.getBalance(deployer.address);

      await expect(
        phpa.connect(deployer).rescueETH(
          deployer.address,
          ethers.parseEther("1.0")
        )
      ).to.emit(phpa, "ETHRescued")
        .withArgs(deployer.address, ethers.parseEther("1.0"));

      const balanceAfter = await ethers.provider.getBalance(deployer.address);
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should block ETH rescue from unauthorized address", async function () {
      await deployer.sendTransaction({
        to: await phpa.getAddress(),
        value: ethers.parseEther("1.0")
      });
      await expect(
        phpa.connect(unauthorized).rescueETH(
          unauthorized.address,
          ethers.parseEther("1.0")
        )
      ).to.be.reverted;
    });

    it("Should expose VERSION constant", async function () {
      expect(await phpa.VERSION()).to.equal("1.1.2");
    });
  });
});