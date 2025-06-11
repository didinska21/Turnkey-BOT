require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const readline = require("readline");
const chalk = require("chalk");
const boxen = require("boxen");
const figlet = require("figlet");
const gradient = require("gradient-string");

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
showBanner();

// Setup provider & wallet
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

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendTx(to, amountInEther, index, total) {
  try {
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.utils.parseEther(amountInEther),
    });
    await tx.wait();
    const balance = await wallet.getBalance();
    const message = `
${chalk.greenBright.bold("✓ SUCCESS")}  [${index}/${total}]
To         : ${chalk.cyan(to)}
TX Hash    : ${chalk.yellow(tx.hash)}
Explorer   : ${chalk.underline(explorerUrl + tx.hash)}
Sisa saldo : ${chalk.magenta(ethers.utils.formatEther(balance))} ETH
Waktu      : ${chalk.gray(new Date().toLocaleString())}
`;
    console.log(boxen(message, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "green",
    }));
    logStream.write(`[SUCCESS] ${to} | ${tx.hash} | ${new Date().toLocaleString()}\n`);
  } catch (error) {
    const message = `
${chalk.redBright.bold("✗ GAGAL")} [${index}/${total}]
To        : ${chalk.cyan(to)}
Error     : ${chalk.red(error.message)}
Waktu     : ${chalk.gray(new Date().toLocaleString())}
`;
    console.log(boxen(message, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "red",
    }));
    logStream.write(`[FAILED]  ${to} | ${error.message} | ${new Date().toLocaleString()}\n`);
  }
}

// CLI interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Menu utama
function showMenu() {
  console.clear();
  showBanner();
  const menu = `
1. Transfer ke address tertentu
2. Transfer ke beberapa address (loop tanpa henti)
3. Exit
  `;
  console.log(gradient.pastel(menu));
  rl.question(chalk.yellowBright("Pilih opsi (1-3): "), (option) => {
    switch (option) {
      case '1':
        transferToSpecific();
        break;
      case '2':
        transferToLoop();
        break;
      case '3':
        console.log(chalk.green("Keluar dari program."));
        rl.close();
        break;
      default:
        console.log(chalk.red("Pilihan tidak valid."));
        setTimeout(showMenu, 1500);
    }
  });
}

// Opsi 1 - transfer ke satu address berkali-kali
function transferToSpecific() {
  rl.question(chalk.yellowBright(`Masukkan address tujuan: `), (to) => {
    rl.question(chalk.yellowBright(`Masukkan jumlah ETH yang dikirim (contoh: 0.0001): `), (amount) => {
      rl.question(chalk.yellowBright(`Berapa kali ingin mengirim ke address ini?: `), async (count) => {
        const txCount = parseInt(count);
        if (isNaN(txCount) || txCount < 1) {
          console.log(chalk.red("Jumlah transaksi tidak valid."));
          setTimeout(showMenu, 1500);
          return;
        }

        for (let i = 0; i < txCount; i++) {
          console.log(chalk.blueBright(`\n[${i + 1}/${txCount}] Mengirim ke: ${to}`));
          await sendTx(to, amount, i + 1, txCount);

          const delayMs = Math.floor(Math.random() * 5000) + 5000;
          console.log(chalk.gray(`Menunggu ${delayMs / 1000} detik...\n`));
          await delay(delayMs);
        }

        console.log(chalk.greenBright(`\n✓ Selesai mengirim ${txCount} transaksi ke ${to}`));
        setTimeout(showMenu, 1500);
      });
    });
  });
}

// Opsi 2 - loop terus-menerus ke beberapa address
async function transferToLoop() {
  rl.question(chalk.yellowBright(`Ambil berapa address pertama untuk loop? (1-${addressList.length}): `), async (input) => {
    const count = parseInt(input);
    if (isNaN(count) || count < 1 || count > addressList.length) {
      console.log(chalk.red("Input tidak valid."));
      setTimeout(showMenu, 1500);
      return;
    }

    console.log(chalk.green(`\nScript akan terus mengirim ke ${count} address secara berulang tanpa henti.`));
    console.log(chalk.gray("Tekan CTRL + C untuk menghentikan.\n"));

    let loopIndex = 0;
    let txCount = 1;

    while (true) {
      const target = addressList[loopIndex];
      console.log(chalk.blueBright(`\n[${txCount}] Mengirim ke: ${target}`));
      await sendTx(target, "0.0001", txCount, "∞");

      const delayMs = Math.floor(Math.random() * 5000) + 5000;
      console.log(chalk.gray(`Menunggu ${delayMs / 1000} detik...\n`));
      await delay(delayMs);

      loopIndex = (loopIndex + 1) % count;
      txCount++;
    }
  });
}

showMenu();
