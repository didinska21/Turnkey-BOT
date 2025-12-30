require("dotenv").config();
const { ethers } = require("ethers");
const { SocksProxyAgent } = require("socks-proxy-agent");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk");
const ora = require("ora");
const gradient = require("gradient-string");
const figlet = require("figlet");

// ===== LOAD CONFIGURATION =====
let config;
try {
  config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
} catch (error) {
  console.log(chalk.red("❌ Error: config.json tidak ditemukan atau invalid!"));
  console.log(chalk.yellow("Buat file config.json terlebih dahulu."));
  process.exit(1);
}

// ===== SETUP =====
const logStream = fs.createWriteStream(config.logging.log_file, { flags: "a" });

// ===== LOAD PROXIES =====
function loadProxies() {
  if (!config.proxy.enabled) {
    console.log(chalk.yellow("⚠️  Proxy disabled, menggunakan direct connection"));
    return [];
  }

  try {
    const proxyFile = config.proxy.file;
    if (!fs.existsSync(proxyFile)) {
      console.log(chalk.red(`❌ File ${proxyFile} tidak ditemukan!`));
      return [];
    }

    const content = fs.readFileSync(proxyFile, "utf-8");
    const proxies = content
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));

    if (proxies.length === 0) {
      console.log(chalk.yellow("⚠️  Tidak ada proxy valid di proxies.txt"));
      return [];
    }

    // Validate SOCKS5 format
    const validProxies = proxies.filter(proxy => {
      if (!proxy.startsWith("socks5://")) {
        console.log(chalk.yellow(`⚠️  Skipping invalid proxy format: ${proxy}`));
        return false;
      }
      return true;
    });

    return validProxies;
  } catch (error) {
    console.log(chalk.red(`❌ Error loading proxies: ${error.message}`));
    return [];
  }
}

// ===== CREATE PROVIDER WITH PROXY =====
function createProviderWithProxy(proxyUrl) {
  const agent = new SocksProxyAgent(proxyUrl);
  
  return new ethers.providers.JsonRpcProvider({
    url: config.network.rpc_url,
    timeout: config.proxy.timeout_ms,
    fetchOptions: { agent }
  });
}

// ===== LOAD WALLETS =====
function loadWallets(proxies) {
  const envContent = fs.readFileSync(".env", "utf-8");
  const lines = envContent.split("\n").map(line => line.trim()).filter(Boolean);
  
  const walletData = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comments and non-private key lines
    if (line.startsWith("#") || !line.startsWith("0x")) continue;
    
    try {
      // Assign proxy (round-robin)
      let provider, proxy;
      
      if (proxies.length > 0) {
        proxy = proxies[i % proxies.length];
        provider = createProviderWithProxy(proxy);
      } else {
        // Direct connection (no proxy)
        proxy = null;
        provider = new ethers.providers.JsonRpcProvider(config.network.rpc_url);
      }
      
      const wallet = new ethers.Wallet(line, provider);
      
      walletData.push({
        wallet: wallet,
        proxy: proxy,
        provider: provider,
        index: i
      });
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Skipping invalid private key: ${line.substring(0, 10)}...`));
    }
  }
  
  return walletData;
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
  console.log(chalk.whiteBright(`  🎯 Target: ${config.network.target_address}`));
  console.log(chalk.gray(`  📡 Network: Sepolia Testnet`));
  console.log(chalk.gray(`  ⛽ Gas Fee: ${config.transaction.min_gas_price_gwei} - ${config.transaction.max_gas_price_gwei} Gwei (Random)`));
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

function countdownBatchDelay() {
  return new Promise((resolve) => {
    const totalSeconds = config.timing.batch_delay_hours * 3600;
    let remaining = totalSeconds;
    
    const spinner = ora({
      text: "⏰ Countdown...",
      color: "magenta",
    }).start();

    const interval = setInterval(() => {
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      spinner.text = `⏰ Delay ${config.timing.batch_delay_hours} jam: ${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      
      if (--remaining < 0) {
        clearInterval(interval);
        spinner.succeed(chalk.green(`✓ Delay ${config.timing.batch_delay_hours} jam selesai! Memulai batch baru...`));
        resolve();
      }
    }, 1000);
  });
}

function getRandomDelay() {
  return Math.floor(
    Math.random() * (config.timing.max_delay_seconds - config.timing.min_delay_seconds + 1)
  ) + config.timing.min_delay_seconds;
}

function getRandomAmount() {
  const random = Math.random() * (config.transaction.max_amount - config.transaction.min_amount) + config.transaction.min_amount;
  return random.toFixed(5);
}

function getRandomGasPrice() {
  const minGwei = config.transaction.min_gas_price_gwei;
  const maxGwei = config.transaction.max_gas_price_gwei;
  const random = Math.random() * (maxGwei - minGwei) + minGwei;
  // Return with 9 decimal places max (gwei precision limit)
  return parseFloat(random.toFixed(9));
}

function maskProxy(proxyUrl) {
  if (!proxyUrl) return "Direct";
  
  try {
    const url = new URL(proxyUrl);
    // Extract IP from proxy URL (socks5://ip:port or socks5://user:pass@ip:port)
    const hostPart = url.host; // Gets "ip:port" or "user:pass@ip:port"
    
    // If there's authentication, extract the IP:port part after @
    if (hostPart.includes('@')) {
      const parts = hostPart.split('@');
      return parts[1]; // Returns "ip:port"
    }
    
    return hostPart; // Returns "ip:port"
  } catch {
    return "Invalid";
  }
}

// ===== MAIN FUNCTIONS =====
async function getBalance(wallet) {
  const balance = await wallet.getBalance();
  return ethers.utils.formatEther(balance);
}

async function sendTransaction(walletData, walletIndex, txNumber, totalTx, totalWallets) {
  const { wallet, proxy } = walletData;
  const amount = getRandomAmount();
  const gasPriceGwei = getRandomGasPrice();
  const proxyInfo = proxy ? maskProxy(proxy) : "Direct";
  
  const spinner = ora({
    text: `📤 W${walletIndex + 1}/${totalWallets} | TX ${txNumber}/${totalTx} | ${proxyInfo}...`,
    color: "yellow",
  }).start();

  for (let attempt = 1; attempt <= config.batch.max_retries; attempt++) {
    try {
      // Check balance
      const balance = await wallet.getBalance();
      const amountWei = ethers.utils.parseEther(amount);
      // Fix: Round gas price to 6 decimals to avoid precision issues
      const gasPriceRounded = parseFloat(gasPriceGwei.toFixed(6));
      const gasPrice = ethers.utils.parseUnits(gasPriceRounded.toString(), "gwei");
      const gasLimit = config.transaction.gas_limit;
      const gasCost = gasPrice.mul(gasLimit);
      const totalNeeded = amountWei.add(gasCost);

      if (balance.lt(totalNeeded)) {
        spinner.fail(
          chalk.red(`❌ W${walletIndex + 1} | Saldo tidak cukup! (${ethers.utils.formatEther(balance)} ETH) - SKIP`)
        );
        logStream.write(
          `[SKIP] Wallet ${walletIndex + 1} | TX ${txNumber} | Insufficient balance | Proxy: ${proxyInfo} | ${new Date().toISOString()}\n`
        );
        return { success: false, skipped: true, gasUsed: 0 };
      }

      // Send transaction
      spinner.text = `📤 W${walletIndex + 1}/${totalWallets} | TX ${txNumber}/${totalTx} | ${gasPriceRounded.toFixed(6)} Gwei | ${proxyInfo} | Attempt ${attempt}/${config.batch.max_retries}...`;
      
      const tx = await wallet.sendTransaction({
        to: config.network.target_address,
        value: amountWei,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
      });

      spinner.text = `⏳ Waiting confirmation... (${tx.hash.substring(0, 10)}...)`;
      
      const receipt = await tx.wait(config.transaction.confirmations);
      const newBalance = await wallet.getBalance();
      const actualGasUsed = parseFloat(ethers.utils.formatEther(receipt.gasUsed.mul(gasPrice)));

      // Success
      spinner.succeed(
        chalk.green(
          `✅ W${walletIndex + 1} | TX ${txNumber}/${totalTx} | ${amount} ETH | Gas: ${gasPriceRounded.toFixed(6)} Gwei | Block: ${receipt.blockNumber} | Sisa: ${ethers.utils.formatEther(newBalance)} ETH`
        )
      );

      console.log(chalk.gray(`   🔗 ${config.network.explorer_url}${tx.hash}`));
      console.log(chalk.gray(`   ⛽ Gas Used: ${actualGasUsed.toFixed(8)} ETH`));
      console.log(chalk.gray(`   🌐 Proxy: ${proxyInfo}`));
      console.log();

      logStream.write(
        `[SUCCESS] Wallet ${walletIndex + 1} | TX ${txNumber}/${totalTx} | Hash: ${tx.hash} | Amount: ${amount} ETH | Gas: ${gasPriceRounded.toFixed(6)} Gwei | Block: ${receipt.blockNumber} | Proxy: ${proxyInfo} | ${new Date().toISOString()}\n`
      );

      return { success: true, amount: parseFloat(amount), skipped: false, gasUsed: actualGasUsed };
      
    } catch (error) {
      if (attempt === config.batch.max_retries) {
        spinner.fail(
          chalk.red(`❌ W${walletIndex + 1} | TX ${txNumber}/${totalTx} FAILED after ${config.batch.max_retries} attempts`)
        );
        console.log(chalk.red(`   Error: ${error.message}`));
        console.log(chalk.gray(`   🌐 Proxy: ${proxyInfo}\n`));
        logStream.write(
          `[FAILED] Wallet ${walletIndex + 1} | TX ${txNumber}/${totalTx} | Error: ${error.message} | Proxy: ${proxyInfo} | ${new Date().toISOString()}\n`
        );
        return { success: false, skipped: false, gasUsed: 0 };
      }
      spinner.text = `⚠️  Retry ${attempt + 1}/${config.batch.max_retries}...`;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  
  return { success: false, skipped: false, gasUsed: 0 };
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

async function runBatch(walletDataArray, batchNumber) {
  console.log();
  console.log(chalk.green.bold("═".repeat(70)));
  console.log(chalk.green.bold(`🚀 BATCH #${batchNumber} - Memulai ${config.batch.tx_per_batch} Transaksi...`));
  console.log(chalk.green.bold("═".repeat(70)));
  console.log();

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let totalSent = 0;
  let totalGasUsed = 0;
  const walletStats = walletDataArray.map(() => ({ sent: 0, count: 0, gasUsed: 0 }));
  const startTime = Date.now();

  // Rotation system
  let currentWalletIndex = 0;
  const skippedWallets = new Set();

  for (let i = 1; i <= config.batch.tx_per_batch; i++) {
    // Find next available wallet
    let attempts = 0;
    while (skippedWallets.has(currentWalletIndex) && attempts < walletDataArray.length) {
      currentWalletIndex = (currentWalletIndex + 1) % walletDataArray.length;
      attempts++;
    }

    // If all wallets are skipped, stop
    if (attempts >= walletDataArray.length) {
      console.log(chalk.red("\n⚠️  Semua wallet balance habis! Menghentikan batch...\n"));
      break;
    }

    const walletData = walletDataArray[currentWalletIndex];
    const result = await sendTransaction(walletData, currentWalletIndex, i, config.batch.tx_per_batch, walletDataArray.length);

    if (result.success) {
      successCount++;
      totalSent += result.amount;
      totalGasUsed += result.gasUsed;
      walletStats[currentWalletIndex].sent += result.amount;
      walletStats[currentWalletIndex].count++;
      walletStats[currentWalletIndex].gasUsed += result.gasUsed;
    } else if (result.skipped) {
      skipCount++;
      skippedWallets.add(currentWalletIndex);
    } else {
      failCount++;
    }

    // Move to next wallet
    currentWalletIndex = (currentWalletIndex + 1) % walletDataArray.length;

    // Delay between transactions (except last one)
    if (i < config.batch.tx_per_batch && !result.skipped) {
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
  console.log(chalk.white(`   ⛽ Total Gas Used: ${chalk.cyan.bold(totalGasUsed.toFixed(8))} ETH`));
  console.log(chalk.white(`   💰 Total Cost    : ${chalk.magenta.bold((totalSent + totalGasUsed).toFixed(8))} ETH`));
  console.log(chalk.white(`   ⏱️  Durasi       : ${chalk.cyan(duration)} detik (${Math.floor(duration / 60)} menit)`));
  console.log(chalk.green.bold("─".repeat(70)));
  
  // Per wallet stats
  console.log(chalk.cyan.bold("📊 Statistik Per Wallet:"));
  for (let i = 0; i < walletDataArray.length; i++) {
    const balance = await getBalance(walletDataArray[i].wallet);
    const proxyInfo = walletDataArray[i].proxy ? maskProxy(walletDataArray[i].proxy) : "Direct";
    console.log(
      chalk.white(
        `   W${i + 1}: ${walletStats[i].count} TX | ${walletStats[i].sent.toFixed(6)} ETH | Gas: ${walletStats[i].gasUsed.toFixed(8)} ETH | Sisa: ${balance} ETH | 🌐 ${proxyInfo}`
      )
    );
  }
  console.log(chalk.green.bold("═".repeat(70)));
  console.log();
}

async function main() {
  try {
    showBanner();

    // Load proxies
    console.log(chalk.cyan("🌐 Memuat proxy dari proxies.txt..."));
    const proxies = loadProxies();
    
    if (config.proxy.enabled && proxies.length > 0) {
      console.log(chalk.green(`✅ ${proxies.length} SOCKS5 proxy terdeteksi!\n`));
    } else if (config.proxy.enabled) {
      console.log(chalk.yellow("⚠️  Proxy enabled tapi tidak ada proxy valid, menggunakan direct connection\n"));
    } else {
      console.log(chalk.gray("ℹ️  Proxy disabled, menggunakan direct connection\n"));
    }

    // Load wallets
    console.log(chalk.cyan("📂 Memuat wallet dari .env..."));
    const walletDataArray = loadWallets(proxies);

    if (walletDataArray.length === 0) {
      console.log(chalk.red("\n❌ Tidak ada wallet valid ditemukan di .env!\n"));
      console.log(chalk.yellow("Format .env yang benar:"));
      console.log(chalk.gray("0x1234567890abcdef..."));
      console.log(chalk.gray("0xabcdef1234567890..."));
      console.log(chalk.gray("0x9876543210fedcba...\n"));
      rl.close();
      return;
    }

    console.log(chalk.green(`✅ ${walletDataArray.length} wallet terdeteksi!\n`));

    // Proxy info
    if (proxies.length > 0) {
      console.log(chalk.cyan.bold("🌐 Proxy Configuration:"));
      console.log(chalk.cyan("─".repeat(70)));
      console.log(chalk.white(`   Type           : ${chalk.yellow("SOCKS5")} (Sticky ${config.proxy.sticky_duration_minutes} minutes)`));
      console.log(chalk.white(`   Proxies Loaded : ${chalk.yellow(proxies.length)} proxies`));
      console.log(chalk.white(`   Mode           : ${chalk.yellow("1 Wallet = 1 Proxy (Fixed)")}`));
      console.log(chalk.cyan("─".repeat(70)));
      console.log();
    }

    // Show balances
    console.log(chalk.cyan.bold("💰 Balance Wallet:"));
    console.log(chalk.cyan("─".repeat(70)));
    
    let totalBalance = 0;
    for (let i = 0; i < walletDataArray.length; i++) {
      const balance = await getBalance(walletDataArray[i].wallet);
      const balanceNum = parseFloat(balance);
      totalBalance += balanceNum;
      
      const address = walletDataArray[i].wallet.address;
      const proxyInfo = walletDataArray[i].proxy ? maskProxy(walletDataArray[i].proxy) : "Direct";
      
      console.log(
        chalk.white(
          `   Wallet ${i + 1}: ${chalk.yellow(balance)} ETH | ${chalk.gray(address)} | 🔒 ${proxyInfo}`
        )
      );
    }
    
    console.log(chalk.cyan("─".repeat(70)));
    console.log(chalk.white(`   Total Balance: ${chalk.yellow.bold(totalBalance.toFixed(6))} ETH\n`));

    // Estimate costs with random gas
    const avgAmount = (config.transaction.min_amount + config.transaction.max_amount) / 2;
    const avgGasGwei = (config.transaction.min_gas_price_gwei + config.transaction.max_gas_price_gwei) / 2;
    const gasPerTx = (avgGasGwei * config.transaction.gas_limit) / 1e9;
    const costPerTx = avgAmount + gasPerTx;
    const estimatedTotal = costPerTx * config.batch.tx_per_batch;

    console.log(chalk.cyan.bold("📋 KONFIGURASI BATCH:"));
    console.log(chalk.cyan("─".repeat(70)));
    console.log(chalk.white(`   Wallet Aktif     : ${chalk.yellow(walletDataArray.length)} wallet`));
    console.log(chalk.white(`   TX per Batch     : ${chalk.yellow(config.batch.tx_per_batch)} TX`));
    console.log(chalk.white(`   Amount per TX    : ${chalk.yellow(config.transaction.min_amount)} - ${chalk.yellow(config.transaction.max_amount)} ETH (random)`));
    console.log(chalk.white(`   Gas Price per TX : ${chalk.yellow(config.transaction.min_gas_price_gwei)} - ${chalk.yellow(config.transaction.max_gas_price_gwei)} Gwei (random)`));
    console.log(chalk.white(`   Avg Gas Cost/TX  : ${chalk.yellow(gasPerTx.toFixed(8))} ETH (avg ${avgGasGwei.toFixed(6)} Gwei)`));
    console.log(chalk.white(`   Delay antar TX   : ${chalk.yellow(config.timing.min_delay_seconds)} - ${chalk.yellow(config.timing.max_delay_seconds)} detik`));
    console.log(chalk.white(`   Delay antar Batch: ${chalk.yellow(config.timing.batch_delay_hours)} jam`));
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
      await runBatch(walletDataArray, batchNumber);
      
      console.log(chalk.magenta.bold(`⏰ Delay ${config.timing.batch_delay_hours} jam sebelum batch berikutnya...\n`));
      await countdownBatchDelay();
      
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
