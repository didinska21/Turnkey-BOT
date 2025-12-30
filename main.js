require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk");
const ora = require("ora");
const gradient = require("gradient-string");
const figlet = require("figlet");

// ===== CONFIGURATION =====
const RPC_URL = "https://ethereum-sepolia.core.chainstack.com/2174ebf7ef5828c7ac37f9b9486ca77c";
const EXPLORER_URL = "https://sepolia.etherscan.io/tx/";
const TARGET_ADDRESS = "0x08d2b0a37F869FF76BACB5Bab3278E26ab7067B7";
const FIXED_GAS_PRICE = "0.95"; // in Gwei (0.00000002 ETH per TX)
const MIN_AMOUNT = 0.00002;
const MAX_AMOUNT = 0.00005;
const MIN_DELAY = 30;
const MAX_DELAY = 60;
const TX_PER_BATCH = 500;
const BATCH_DELAY_HOURS = 12;
const MAX_RETRIES = 3;
const CONFIRMATIONS = 2;

// ===== SETUP =====
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const logStream = fs.createWriteStream("activity_logs.txt", { flags: "a" });

// ===== LOAD WALLETS =====
function loadWallets() {
  const envContent = fs.readFileSync(".env", "utf-8");
  const lines = envContent.split("\n").map(line => line.trim()).filter(Boolean);
  
  const wallets = [];
  for (const line of lines) {
    // Skip comments and non-private key lines
    if (line.startsWith("#") || !line.startsWith("0x")) continue;
    
    try {
      const wallet = new ethers.Wallet(line, provider);
      wallets.push(wallet);
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Skipping invalid private key: ${line.substring(0, 10)}...`));
    }
  }
  
  return wallets;
}

// ===== UTILITIES =====
function showBanner() {
  console.clear();
  const banner = figlet.textSync("TURNKEY", {
    font: "ANSI Shadow",
    horizontalLayout: "default",
  });
  console.log(gradient.pastel.multiline(banner));
  console.log(chalk.cyan.bold("═".repeat(70)));
  console.log(chalk.whiteBright(`  🎯 Target: ${TARGET_ADDRESS}`));
  console.log(chalk.gray(`  📡 Network: Sepolia Testnet`));
  console.log(chalk.gray(`  ⛽ Gas Fee: 0.00000002 ETH (Fixed)`));
  console.log(chalk.cyan.bold("═".repeat(70)));
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

function countdown12Hours() {
  return new Promise((resolve) => {
    const totalSeconds = BATCH_DELAY_HOURS * 3600;
    let remaining = totalSeconds;
    
    const spinner = ora({
      text: "⏰ Countdown...",
      color: "magenta",
    }).start();

    const interval = setInterval(() => {
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      spinner.text = `⏰ Delay ${BATCH_DELAY_HOURS} jam: ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      
      if (--remaining < 0) {
        clearInterval(interval);
        spinner.succeed(chalk.green(`✓ Delay ${BATCH_DELAY_HOURS} jam selesai! Memulai batch baru...`));
        resolve();
      }
    }, 1000);
  });
}

function getRandomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}

function getRandomAmount() {
  const random = Math.random() * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT;
  return random.toFixed(5);
}

// ===== MAIN FUNCTIONS =====
async function getBalance(wallet) {
  const balance = await wallet.getBalance();
  return ethers.utils.formatEther(balance);
}

async function sendTransaction(wallet, walletIndex, txNumber, totalTx, totalWallets) {
  const amount = getRandomAmount();
  const spinner = ora({
    text: `📤 Wallet ${walletIndex + 1}/${totalWallets} | TX ${txNumber}/${totalTx}...`,
    color: "yellow",
  }).start();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check balance
      const balance = await wallet.getBalance();
      const amountWei = ethers.utils.parseEther(amount);
      const gasPrice = ethers.utils.parseUnits(FIXED_GAS_PRICE, "gwei");
      const gasLimit = 21000;
      const gasCost = gasPrice.mul(gasLimit);
      const totalNeeded = amountWei.add(gasCost);

      if (balance.lt(totalNeeded)) {
        spinner.fail(
          chalk.red(`❌ Wallet ${walletIndex + 1} | Saldo tidak cukup! (${ethers.utils.formatEther(balance)} ETH) - SKIP`)
        );
        logStream.write(
          `[SKIP] Wallet ${walletIndex + 1} | TX ${txNumber} | Insufficient balance | ${new Date().toISOString()}\n`
        );
        return { success: false, skipped: true };
      }

      // Send transaction
      spinner.text = `📤 Wallet ${walletIndex + 1}/${totalWallets} | TX ${txNumber}/${totalTx} | ${amount} ETH (Attempt ${attempt}/${MAX_RETRIES})...`;
      
      const tx = await wallet.sendTransaction({
        to: TARGET_ADDRESS,
        value: amountWei,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
      });

      spinner.text = `⏳ Waiting confirmation... (${tx.hash.substring(0, 10)}...)`;
      
      const receipt = await tx.wait(CONFIRMATIONS);
      const newBalance = await wallet.getBalance();

      // Success
      spinner.succeed(
        chalk.green(
          `✅ W${walletIndex + 1} | TX ${txNumber}/${totalTx} | ${amount} ETH | Block: ${receipt.blockNumber} | Sisa: ${ethers.utils.formatEther(newBalance)} ETH`
        )
      );

      console.log(chalk.gray(`   🔗 ${EXPLORER_URL}${tx.hash}`));
      console.log();

      logStream.write(
        `[SUCCESS] Wallet ${walletIndex + 1} | TX ${txNumber}/${totalTx} | Hash: ${tx.hash} | Amount: ${amount} ETH | Block: ${receipt.blockNumber} | ${new Date().toISOString()}\n`
      );

      return { success: true, amount: parseFloat(amount), skipped: false };
      
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        spinner.fail(
          chalk.red(`❌ W${walletIndex + 1} | TX ${txNumber}/${totalTx} FAILED after ${MAX_RETRIES} attempts`)
        );
        console.log(chalk.red(`   Error: ${error.message}\n`));
        logStream.write(
          `[FAILED] Wallet ${walletIndex + 1} | TX ${txNumber}/${totalTx} | Error: ${error.message} | ${new Date().toISOString()}\n`
        );
        return { success: false, skipped: false };
      }
      spinner.text = `⚠️  Retry ${attempt + 1}/${MAX_RETRIES}...`;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  
  return { success: false, skipped: false };
}

// ===== INTERACTIVE MENU =====
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

async function runBatch(wallets, batchNumber) {
  console.log();
  console.log(chalk.green.bold("═".repeat(70)));
  console.log(chalk.green.bold(`🚀 BATCH #${batchNumber} - Memulai ${TX_PER_BATCH} Transaksi...`));
  console.log(chalk.green.bold("═".repeat(70)));
  console.log();

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let totalSent = 0;
  const walletStats = wallets.map(() => ({ sent: 0, count: 0 }));
  const startTime = Date.now();

  // Rotation system
  let currentWalletIndex = 0;
  const skippedWallets = new Set();

  for (let i = 1; i <= TX_PER_BATCH; i++) {
    // Find next available wallet (skip wallets with insufficient balance)
    let attempts = 0;
    while (skippedWallets.has(currentWalletIndex) && attempts < wallets.length) {
      currentWalletIndex = (currentWalletIndex + 1) % wallets.length;
      attempts++;
    }

    // If all wallets are skipped, stop
    if (attempts >= wallets.length) {
      console.log(chalk.red("\n⚠️  Semua wallet balance habis! Menghentikan batch...\n"));
      break;
    }

    const wallet = wallets[currentWalletIndex];
    const result = await sendTransaction(wallet, currentWalletIndex, i, TX_PER_BATCH, wallets.length);

    if (result.success) {
      successCount++;
      totalSent += result.amount;
      walletStats[currentWalletIndex].sent += result.amount;
      walletStats[currentWalletIndex].count++;
    } else if (result.skipped) {
      skipCount++;
      skippedWallets.add(currentWalletIndex);
    } else {
      failCount++;
    }

    // Move to next wallet
    currentWalletIndex = (currentWalletIndex + 1) % wallets.length;

    // Delay between transactions (except last one)
    if (i < TX_PER_BATCH && !result.skipped) {
      const delayTime = getRandomDelay();
      await delay(delayTime);
    }
  }

  // Batch summary
  const endTime = Date.now();
  const duration = Math.floor((endTime - startTime) / 1000);

  console.log();
  console.log(chalk.green.bold("═".repeat(70)));
  console.log(chalk.green.bold(`🎉 BATCH #${batchNumber} SELESAI!`));
  console.log(chalk.green.bold("═".repeat(70)));
  console.log(chalk.white(`   ✅ Sukses       : ${chalk.green.bold(successCount)} TX`));
  console.log(chalk.white(`   ❌ Gagal        : ${chalk.red.bold(failCount)} TX`));
  console.log(chalk.white(`   ⏭️  Skip         : ${chalk.yellow.bold(skipCount)} TX`));
  console.log(chalk.white(`   💸 Total Terkirim: ${chalk.yellow.bold(totalSent.toFixed(6))} ETH`));
  console.log(chalk.white(`   ⏱️  Durasi       : ${chalk.cyan(duration)} detik (${Math.floor(duration / 60)} menit)`));
  console.log(chalk.green.bold("─".repeat(70)));
  
  // Per wallet stats
  console.log(chalk.cyan.bold("📊 Statistik Per Wallet:"));
  for (let i = 0; i < wallets.length; i++) {
    const balance = await getBalance(wallets[i]);
    console.log(
      chalk.white(
        `   W${i + 1}: ${walletStats[i].count} TX | ${walletStats[i].sent.toFixed(6)} ETH | Sisa: ${balance} ETH`
      )
    );
  }
  console.log(chalk.green.bold("═".repeat(70)));
  console.log();
}

async function main() {
  try {
    showBanner();

    // Load wallets
    console.log(chalk.cyan("📂 Memuat wallet dari .env..."));
    const wallets = loadWallets();

    if (wallets.length === 0) {
      console.log(chalk.red("\n❌ Tidak ada wallet valid ditemukan di .env!\n"));
      console.log(chalk.yellow("Format .env yang benar:"));
      console.log(chalk.gray("0x1234567890abcdef..."));
      console.log(chalk.gray("0xabcdef1234567890..."));
      console.log(chalk.gray("0x9876543210fedcba...\n"));
      rl.close();
      return;
    }

    console.log(chalk.green(`✅ ${wallets.length} wallet terdeteksi!\n`));

    // Show balances
    console.log(chalk.cyan.bold("💰 Balance Wallet:"));
    console.log(chalk.cyan("─".repeat(70)));
    
    let totalBalance = 0;
    for (let i = 0; i < wallets.length; i++) {
      const balance = await getBalance(wallets[i]);
      const balanceNum = parseFloat(balance);
      totalBalance += balanceNum;
      
      const address = wallets[i].address;
      console.log(
        chalk.white(
          `   Wallet ${i + 1}: ${chalk.yellow(balance)} ETH | ${chalk.gray(address)}`
        )
      );
    }
    
    console.log(chalk.cyan("─".repeat(70)));
    console.log(chalk.white(`   Total Balance: ${chalk.yellow.bold(totalBalance.toFixed(6))} ETH\n`));

    // Estimate costs
    const avgAmount = (MIN_AMOUNT + MAX_AMOUNT) / 2;
    const gasPerTx = 0.00000002;
    const costPerTx = avgAmount + gasPerTx;
    const estimatedTotal = costPerTx * TX_PER_BATCH;

    console.log(chalk.cyan.bold("📋 KONFIGURASI BATCH:"));
    console.log(chalk.cyan("─".repeat(70)));
    console.log(chalk.white(`   Wallet Aktif     : ${chalk.yellow(wallets.length)} wallet`));
    console.log(chalk.white(`   TX per Batch     : ${chalk.yellow(TX_PER_BATCH)} TX`));
    console.log(chalk.white(`   Amount per TX    : ${chalk.yellow(MIN_AMOUNT)} - ${chalk.yellow(MAX_AMOUNT)} ETH (random)`));
    console.log(chalk.white(`   Gas Fee per TX   : ${chalk.yellow("0.00000002")} ETH (fixed)`));
    console.log(chalk.white(`   Delay antar Batch: ${chalk.yellow(BATCH_DELAY_HOURS)} jam`));
    console.log(chalk.white(`   Est. Cost/Batch  : ${chalk.yellow.bold(estimatedTotal.toFixed(6))} ETH`));
    console.log(chalk.cyan("─".repeat(70)));
    console.log();

    // Warning if balance low
    if (totalBalance < estimatedTotal) {
      console.log(chalk.red.bold("⚠️  WARNING: Total balance mungkin tidak cukup untuk 1 batch penuh!\n"));
    }

    // Confirmation
    const confirm = await question(chalk.yellow("⚠️  Lanjutkan dan mulai loop otomatis? (y/n): "));
    if (confirm.toLowerCase() !== "y") {
      console.log(chalk.red("\n❌ Dibatalkan.\n"));
      rl.close();
      return;
    }

    console.log(chalk.green.bold("\n✅ Memulai bot dalam mode otomatis (loop forever)...\n"));
    
    // Infinite loop
    let batchNumber = 1;
    while (true) {
      await runBatch(wallets, batchNumber);
      
      console.log(chalk.magenta.bold(`⏰ Delay ${BATCH_DELAY_HOURS} jam sebelum batch berikutnya...\n`));
      await countdown12Hours();
      
      batchNumber++;
    }

  } catch (error) {
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    rl.close();
    throw error;
  }
}

// ===== RUN =====
main().catch((error) => {
  console.log(chalk.red(`\n❌ Fatal Error: ${error.message}\n`));
  process.exit(1);
});
