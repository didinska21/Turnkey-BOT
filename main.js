require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk");
const ora = require("ora");
const gradient = require("gradient-string");
const figlet = require("figlet");

// Banner
function showBanner() {
  console.clear();
  const banner = figlet.textSync("TURNKEY", {
    font: "ANSI Shadow",
    horizontalLayout: "default",
    verticalLayout: "default",
  });
  console.log(gradient.pastel.multiline(banner));
  console.log(chalk.whiteBright("Build by: t.me/didinska\n"));
}

// Delay dengan countdown spinner
function delayWithCountdown(seconds) {
  return new Promise((resolve) => {
    let remaining = seconds;
    const spinner = ora(`Menunggu ${remaining} detik...`).start();
    const interval = setInterval(() => {
      remaining--;
      spinner.text = `Menunggu ${remaining} detik...`;
      if (remaining <= 0) {
        clearInterval(interval);
        spinner.succeed(`Delay ${seconds} detik selesai.`);
        resolve();
      }
    }, 1000);
  });
}

// Countdown 24 jam (fitur 3)
function countdown24Jam() {
  return new Promise((resolve) => {
    let sisa = 86400;
    const spinner = ora("Menunggu 24 jam untuk pengiriman ulang...").start();
    const interval = setInterval(() => {
      const jam = Math.floor(sisa / 3600);
      const menit = Math.floor((sisa % 3600) / 60);
      const detik = sisa % 60;
      spinner.text = `Countdown: ${jam.toString().padStart(2, "0")}:${menit.toString().padStart(2, "0")}:${detik.toString().padStart(2, "0")}`;
      if (--sisa < 0) {
        clearInterval(interval);
        spinner.succeed("Countdown selesai. Mengirim batch baru...");
        resolve();
      }
    }, 1000);
  });
}

// Setup
const rpcUrl = "https://ethereum-sepolia.publicnode.com";
const explorerUrl = "https://sepolia.etherscan.io/tx/";
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  console.log(chalk.redBright("PRIVATE_KEY tidak ditemukan di .env"));
  process.exit(1);
}
const wallet = new ethers.Wallet(privateKey, provider);
const addressList = JSON.parse(fs.readFileSync("address.json", "utf-8"));
const logStream = fs.createWriteStream("logs.txt", { flags: "a" });

// TX
async function sendTx(to, amountInEther, index, total) {
  const spinner = ora(`Mengirim ke ${to}...`).start();
  try {
    const saldo = await wallet.getBalance();
    if (saldo.lt(ethers.utils.parseEther(amountInEther))) {
      spinner.fail(chalk.redBright(`SALDO ETH TIDAK CUKUP untuk TX ${index}/${total}`));
      logStream.write(`[FAILED] ${to} | SALDO TIDAK CUKUP | ${new Date().toLocaleString()}\n`);
      return;
    }

    const tx = await wallet.sendTransaction({
      to,
      value: ethers.utils.parseEther(amountInEther),
    });

    spinner.text = "Menunggu konfirmasi...";
    await tx.wait();
    const balance = await wallet.getBalance();

    spinner.succeed(`TX Sukses ke ${to} | Sisa: ${ethers.utils.formatEther(balance)} ETH`);
    logStream.write(`[SUCCESS] ${to} | ${tx.hash} | ${new Date().toLocaleString()}\n`);
    console.log(chalk.gray(`Explorer: ${explorerUrl}${tx.hash}\n`));
  } catch (error) {
    spinner.fail(`TX GAGAL ke ${to} | ${error.message}`);
    logStream.write(`[FAILED] ${to} | ${error.message} | ${new Date().toLocaleString()}\n`);
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function showMenu() {
  showBanner();
  console.log(gradient.pastel(`
1. Transfer ke address tertentu
2. Transfer ke beberapa address (loop tanpa henti)
3. Kirim ke X address acak dari address.json (24 jam interval)
4. Exit
`));
  rl.question(chalk.yellowBright("Pilih opsi (1-4): "), (option) => {
    switch (option) {
      case '1': transferToSpecific(); break;
      case '2': transferToLoop(); break;
      case '3': transferToRandom(); break;
      case '4': console.log(chalk.green("Keluar dari program.")); rl.close(); break;
      default: console.log(chalk.red("Pilihan tidak valid.")); setTimeout(showMenu, 1500);
    }
  });
}

function transferToSpecific() {
  rl.question(chalk.yellow("Address tujuan: "), (to) => {
    rl.question(chalk.yellow("Jumlah ETH (contoh: 0.0001): "), (amount) => {
      rl.question(chalk.yellow("Berapa kali mengirim ke address ini?: "), async (count) => {
        const txCount = parseInt(count);
        if (isNaN(txCount) || txCount < 1) return showMenu();
        for (let i = 0; i < txCount; i++) {
          await sendTx(to, amount, i + 1, txCount);
          await delayWithCountdown(Math.floor(Math.random() * 5) + 5);
        }
        setTimeout(showMenu, 1500);
      });
    });
  });
}

async function transferToLoop() {
  rl.question(chalk.yellow(`Ambil berapa address pertama untuk loop? (1-${addressList.length}): `), async (input) => {
    const count = parseInt(input);
    if (isNaN(count) || count < 1 || count > addressList.length) return showMenu();
    console.log(chalk.green(`Loop mengirim ke ${count} address tanpa henti (CTRL+C untuk stop)`));
    let loopIndex = 0, txCount = 1;
    while (true) {
      const to = addressList[loopIndex];
      await sendTx(to, "0.0001", txCount, "∞");
      await delayWithCountdown(Math.floor(Math.random() * 5) + 5);
      loopIndex = (loopIndex + 1) % count;
      txCount++;
    }
  });
}

async function transferToRandom() {
  rl.question(chalk.yellow(`Berapa address acak ingin dikirim hari ini?: `), async (input) => {
    const count = parseInt(input);
    if (isNaN(count) || count < 1 || count > addressList.length) return showMenu();
    while (true) {
      const shuffled = addressList.sort(() => 0.5 - Math.random()).slice(0, count);
      for (let i = 0; i < shuffled.length; i++) {
        await sendTx(shuffled[i], "0.0001", i + 1, count);
        await delayWithCountdown(Math.floor(Math.random() * 5) + 5);
      }
      await countdown24Jam();
    }
  });
}

showMenu();
