require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk");
const ora = require("ora");
const gradient = require("gradient-string");
const figlet = require("figlet");

// ===== CONFIGURATION =====
const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/KatanYBT5TYSiPJ8Lr8iE_-kebTVnVvq";
const EXPLORER_URL = "https://sepolia.etherscan.io/tx/";
const TARGET_ADDRESS = "0x08d2b0a37F869FF76BACB5Bab3278E26ab7067B7";
const DEFAULT_AMOUNT = "0.0001";
const MIN_DELAY = 30;
const MAX_DELAY = 60;
const MAX_RETRIES = 3;
const CONFIRMATIONS = 2;

// ===== SETUP =====
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
  console.log(chalk.redBright("\n❌ PRIVATE_KEY tidak ditemukan di file .env\n"));
  process.exit(1);
}

const wallet = new ethers.Wallet(privateKey, provider);
const logStream = fs.createWriteStream("activity_logs.txt", { flags: "a" });

// ===== UTILITIES =====
function showBanner() {
  console.clear();
  const banner = figlet.textSync("TURNKEY BOT", {
    font: "ANSI Shadow",
    horizontalLayout: "default",
  });
  console.log(gradient.pastel.multiline(banner));
  console.log(chalk.cyan.bold("═".repeat(60)));
  console.log(chalk.whiteBright(`  🎯 Target: ${TARGET_ADDRESS}`));
  console.log(chalk.gray(`  📡 Network: Sepolia Testnet`));
  console.log(chalk.cyan.bold("═".repeat(60)));
  console.log();
}

function delay(seconds) {
  return new Promise((resolve) => {
    let remaining = seconds;
    const spinner = ora({
      text: `⏳ Menunggu ${remaining} detik...`,
      color: "cyan",
    }).start();

    const interval = setInterval(() => {
      remaining--;
      spinner.text = `⏳ Menunggu ${remaining} detik...`;
      if (remaining <= 0) {
        clearInterval(interval);
        spinner.succeed(chalk.green(`✓ Delay selesai`));
        resolve();
      }
    }, 1000);
  });
}

function getRandomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}

// ===== MAIN FUNCTIONS =====
async function getBalance() {
  const balance = await wallet.getBalance();
  return ethers.utils.formatEther(balance);
}

async function estimateGasCost(amount) {
  try {
    const gasPrice = await provider.getGasPrice();
    const gasLimit = 21000; // Standard ETH transfer
    const gasCost = gasPrice.mul(gasLimit);
    const totalCost = gasCost.add(ethers.utils.parseEther(amount));
    return {
      gasCost: ethers.utils.formatEther(gasCost),
      totalCost: ethers.utils.formatEther(totalCost),
    };
  } catch (error) {
    return null;
  }
}

async function sendTransaction(amount, txNumber, totalTx) {
  const spinner = ora({
    text: `📤 Preparing transaction ${txNumber}/${totalTx}...`,
    color: "yellow",
  }).start();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check balance
      const balance = await wallet.getBalance();
      const amountWei = ethers.utils.parseEther(amount);
      const gasPrice = await provider.getGasPrice();
      const gasLimit = 21000;
      const gasCost = gasPrice.mul(gasLimit);
      const totalNeeded = amountWei.add(gasCost);

      if (balance.lt(totalNeeded)) {
        spinner.fail(
          chalk.redBright(
            `❌ Saldo tidak cukup! Perlu: ${ethers.utils.formatEther(totalNeeded)} ETH, Punya: ${ethers.utils.formatEther(balance)} ETH`
          )
        );
        logStream.write(
          `[FAILED] TX ${txNumber} | Insufficient balance | ${new Date().toISOString()}\n`
        );
        return false;
      }

      // Send transaction
      spinner.text = `📤 Sending transaction ${txNumber}/${totalTx} (Attempt ${attempt}/${MAX_RETRIES})...`;
      
      const tx = await wallet.sendTransaction({
        to: TARGET_ADDRESS,
        value: amountWei,
        gasLimit: gasLimit,
      });

      spinner.text = `⏳ Waiting for confirmation... (${tx.hash.substring(0, 10)}...)`;
      
      const receipt = await tx.wait(CONFIRMATIONS);
      const newBalance = await wallet.getBalance();

      // Success
      spinner.succeed(
        chalk.green(
          `✅ TX ${txNumber}/${totalTx} Success! | Block: ${receipt.blockNumber} | Sisa: ${ethers.utils.formatEther(newBalance)} ETH`
        )
      );

      console.log(chalk.gray(`   🔗 ${EXPLORER_URL}${tx.hash}`));
      console.log(chalk.gray(`   ⛽ Gas Used: ${receipt.gasUsed.toString()} | Fee: ${ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice))} ETH`));
      console.log();

      logStream.write(
        `[SUCCESS] TX ${txNumber}/${totalTx} | Hash: ${tx.hash} | Block: ${receipt.blockNumber} | Amount: ${amount} ETH | ${new Date().toISOString()}\n`
      );

      return true;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        spinner.fail(
          chalk.redBright(`❌ TX ${txNumber}/${totalTx} FAILED after ${MAX_RETRIES} attempts`)
        );
        console.log(chalk.red(`   Error: ${error.message}\n`));
        logStream.write(
          `[FAILED] TX ${txNumber}/${totalTx} | Error: ${error.message} | ${new Date().toISOString()}\n`
        );
        return false;
      }
      spinner.text = `⚠️  Retry ${attempt + 1}/${MAX_RETRIES}...`;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return false;
}

// ===== INTERACTIVE MENU =====
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  showBanner();

  // Show balance
  const balanceSpinner = ora("📊 Mengecek saldo...").start();
  const balance = await getBalance();
  balanceSpinner.succeed(
    chalk.green(`💰 Saldo Anda: ${chalk.bold.yellow(balance)} ETH (Sepolia)`)
  );
  console.log();

  // Input amount
  const amountInput = await question(
    chalk.cyan(`💵 Masukkan jumlah ETH per transaksi [${chalk.yellow(DEFAULT_AMOUNT)}]: `)
  );
  const amount = amountInput.trim() || DEFAULT_AMOUNT;

  // Validate amount
  try {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.log(chalk.red("\n❌ Jumlah tidak valid!\n"));
      rl.close();
      return;
    }
  } catch (error) {
    console.log(chalk.red("\n❌ Jumlah tidak valid!\n"));
    rl.close();
    return;
  }

  // Input transaction count
  const countInput = await question(
    chalk.cyan(`🔢 Berapa kali transaksi yang ingin dikirim?: `)
  );
  const txCount = parseInt(countInput);

  if (isNaN(txCount) || txCount < 1) {
    console.log(chalk.red("\n❌ Jumlah transaksi tidak valid!\n"));
    rl.close();
    return;
  }

  console.log();

  // Show summary and estimate
  const estimate = await estimateGasCost(amount);
  if (estimate) {
    const totalAmount = (parseFloat(amount) * txCount).toFixed(6);
    const estimatedGas = (parseFloat(estimate.gasCost) * txCount).toFixed(6);
    const estimatedTotal = (parseFloat(estimate.totalCost) * txCount).toFixed(6);

    console.log(chalk.cyan.bold("📋 RINGKASAN TRANSAKSI"));
    console.log(chalk.cyan("─".repeat(60)));
    console.log(chalk.white(`   Amount per TX    : ${chalk.yellow(amount)} ETH`));
    console.log(chalk.white(`   Jumlah TX        : ${chalk.yellow(txCount)}x`));
    console.log(chalk.white(`   Total Amount     : ${chalk.yellow(totalAmount)} ETH`));
    console.log(chalk.white(`   Estimasi Gas     : ${chalk.yellow(estimatedGas)} ETH`));
    console.log(chalk.white(`   Estimasi Total   : ${chalk.yellow.bold(estimatedTotal)} ETH`));
    console.log(chalk.cyan("─".repeat(60)));
    console.log();
  }

  // Confirm
  const confirm = await question(chalk.yellow("⚠️  Lanjutkan? (y/n): "));
  if (confirm.toLowerCase() !== "y") {
    console.log(chalk.red("\n❌ Dibatalkan.\n"));
    rl.close();
    return;
  }

  console.log();
  console.log(chalk.green.bold("🚀 Memulai pengiriman transaksi...\n"));

  // Execute transactions
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 1; i <= txCount; i++) {
    const success = await sendTransaction(amount, i, txCount);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Delay between transactions (except last one)
    if (i < txCount) {
      const delayTime = getRandomDelay();
      await delay(delayTime);
    }
  }

  // Final summary
  const endTime = Date.now();
  const duration = Math.floor((endTime - startTime) / 1000);
  const finalBalance = await getBalance();

  console.log();
  console.log(chalk.green.bold("═".repeat(60)));
  console.log(chalk.green.bold("🎉 SELESAI!"));
  console.log(chalk.green.bold("═".repeat(60)));
  console.log(chalk.white(`   ✅ Sukses       : ${chalk.green.bold(successCount)}/${txCount}`));
  console.log(chalk.white(`   ❌ Gagal        : ${chalk.red.bold(failCount)}/${txCount}`));
  console.log(chalk.white(`   ⏱️  Durasi       : ${chalk.cyan(duration)} detik`));
  console.log(chalk.white(`   💰 Saldo Akhir  : ${chalk.yellow.bold(finalBalance)} ETH`));
  console.log(chalk.green.bold("═".repeat(60)));
  console.log();
  console.log(chalk.gray(`📝 Log tersimpan di: activity_logs.txt`));
  console.log();

  rl.close();
}

// ===== RUN =====
main().catch((error) => {
  console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
  rl.close();
  process.exit(1);
});
