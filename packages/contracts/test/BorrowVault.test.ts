import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("BorrowVault", function () {
  const ONE_18 = 10n ** 18n;

  async function fixture() {
    const [owner, executor, payee, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.connect(owner).deploy("Mock USD", "mUSD", 6);

    const Pool = await ethers.getContractFactory("MockPool");
    const pool = await Pool.connect(owner).deploy();

    const Provider = await ethers.getContractFactory("MockPoolAddressesProvider");
    const provider = await Provider.connect(owner).deploy(await pool.getAddress());

    const Vault = await ethers.getContractFactory("BorrowVault");
    const vault = await Vault.connect(owner).deploy(owner.address, executor.address, await provider.getAddress());

    await token.connect(owner).mint(await pool.getAddress(), 1_000_000_000n);

    return { owner, executor, payee, other, token, pool, provider, vault };
  }

  async function nowTs() {
    const block = await ethers.provider.getBlock("latest");
    if (!block) throw new Error("missing latest block");
    return BigInt(block.timestamp);
  }

  async function expectCustomError(txPromise: Promise<unknown>, errorName: string) {
    try {
      await txPromise;
      assert.fail(`expected custom error ${errorName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      assert.match(message, new RegExp(`\\b${errorName}\\b`), `expected ${errorName}, got: ${message}`);
    }
  }

  it("executes borrow-and-pay for a valid executor plan", async function () {
    const { owner, executor, payee, token, vault } = await fixture();
    const borrowAmount = 100n;
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);

    await vault
      .connect(executor)
      .executeBorrowAndPay(await token.getAddress(), borrowAmount, payee.address, expiresAt, 1);

    assert.equal(await token.balanceOf(payee.address), borrowAmount);
    assert.equal(await vault.nonce(), 1n);
    assert.equal(await vault.dailyBorrowed(), borrowAmount);
  });

  it("rejects non-executor callers", async function () {
    const { owner, other, payee, token, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);

    await expectCustomError(
      vault.connect(other).executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1),
      "NotExecutor"
    );
  });

  it("enforces payee allowlist", async function () {
    const { owner, executor, payee, token, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);

    await expectCustomError(
      vault.connect(executor).executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1),
      "NotAllowlisted"
    );
  });

  it("prevents replay by requiring a monotonic nonce", async function () {
    const { owner, executor, payee, token, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);
    await vault.connect(owner).setPolicy(ONE_18, 0, 1_000_000n, 1_000_000n);

    await vault
      .connect(executor)
      .executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1);

    await expectCustomError(
      vault.connect(executor).executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1),
      "InvalidPlan"
    );
  });

  it("enforces cooldown between executions", async function () {
    const { owner, executor, payee, token, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);
    await vault.connect(owner).setPolicy(ONE_18, 3600, 1_000_000n, 1_000_000n);

    await vault
      .connect(executor)
      .executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1);

    await expectCustomError(
      vault.connect(executor).executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 2),
      "Cooldown"
    );
  });

  it("enforces max borrow per day and per tx limits", async function () {
    const { owner, executor, payee, token, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);
    await vault.connect(owner).setPolicy(ONE_18, 0, 100n, 150n);

    await vault
      .connect(executor)
      .executeBorrowAndPay(await token.getAddress(), 100, payee.address, expiresAt, 1);

    await expectCustomError(
      vault.connect(executor).executeBorrowAndPay(await token.getAddress(), 60, payee.address, expiresAt, 2),
      "Limit"
    );
  });

  it("reverts when health factor is below policy threshold", async function () {
    const { owner, executor, payee, token, pool, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);
    await pool.connect(owner).setHealthFactor(await vault.getAddress(), ONE_18); // default min is 1.6e18

    await expectCustomError(
      vault.connect(executor).executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1),
      "HealthFactorTooLow"
    );
  });

  it("blocks execution while paused", async function () {
    const { owner, executor, payee, token, vault } = await fixture();
    const expiresAt = (await nowTs()) + 3600n;

    await vault.connect(owner).setApprovedBorrowToken(await token.getAddress(), true);
    await vault.connect(owner).setApprovedPayee(payee.address, true);
    await vault.connect(owner).setPaused(true);

    await expectCustomError(
      vault.connect(executor).executeBorrowAndPay(await token.getAddress(), 10, payee.address, expiresAt, 1),
      "Paused"
    );
  });

  it("enforces collateral token allowlist on supply", async function () {
    const { owner, token, pool, vault } = await fixture();
    const amount = 50_000n;

    await token.connect(owner).mint(owner.address, amount);
    await token.connect(owner).approve(await vault.getAddress(), amount);

    await expectCustomError(
      vault.connect(owner).supplyCollateral(await token.getAddress(), amount),
      "NotAllowlisted"
    );

    await vault.connect(owner).setApprovedCollateralToken(await token.getAddress(), true);
    await vault.connect(owner).supplyCollateral(await token.getAddress(), amount);

    assert.equal(await token.balanceOf(await pool.getAddress()), 1_000_000_000n + amount);
  });
});
