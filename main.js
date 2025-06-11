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

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendTx(to, amountInEther, index, total) {
  try {
    const balance = await wallet.getBalance();
    const amountWei = ethers.utils.parseEther(amountInEther);

    if (balance.lt(amountWei)) {
      const message = `
${chalk.redBright.bold("✗ SALDO TIDAK CUKUP")} [${index}/${total}]
To        : ${chalk.cyan(to)}
Dibutuhkan: ${chalk.yellow(amountInEther)} ETH
Saldo     : ${chalk.magenta(ethers.utils.formatEther(balance))} ETH
Waktu     : ${chalk.gray(new Date().toLocaleString())}
`;
      console.log(boxen(message, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "red",
      }));
      logStream.write(`[SALDO KURANG] ${to} | Butuh: ${amountInEther} ETH | Punya: ${ethers.utils.formatEther(balance)} ETH | ${new Date().toLocaleString()}\n`);
      return;
    }

    const tx = await wallet.sendTransaction({ to, value: amountWei });
    await tx.wait();

    const newBalance = await wallet.getBalance();
    const message = `
${chalk.greenBright.bold("✓ SUCCESS")}  [${index}/${total}]
To         : ${chalk.cyan(to)}
TX Hash    : ${chalk.yellow(tx.hash)}
Explorer   : ${chalk.underline(explorerUrl + tx.hash)}
Sisa saldo : ${chalk.magenta(ethers.utils.formatEther(newBalance))} ETH
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

// CLI Interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Menu
function showMenu() {
  console.clear();
  showBanner();
  const menu = `
1. Transfer ke address tertentu
2. Transfer ke beberapa address (loop tanpa henti)
3. Kirim ke X address acak dari address.json (ulang setiap 24 jam)
4. Exit
`;
  console.log(gradient.pastel(menu));
  rl.question(chalk.yellowBright("Pilih opsi (1-4): "), (option) => {
    switch (option) {
      case '1':
        transferToSpecific();
        break;
      case '2':
        transferToLoop();
        break;
      case '3':
        transferRandomFromList();
        break;
      case '4':
        console.log(chalk.green("Keluar dari program."));
        rl.close();
        break;
      default:
        console.log(chalk.red("Pilihan tidak valid."));
        setTimeout(showMenu, 1500);
    }
  });
}

// Opsi 1
function transferToSpecific() {
  rl.question(chalk.yellowBright(`Masukkan address tujuan: `), (to) => {
    rl.question(chalk.yellowBright(`Masukkan jumlah ETH (contoh: 0.0001): `), (amount) => {
      rl.question(chalk.yellowBright(`Berapa kali ingin mengirim?: `), async (count) => {
        const txCount = parseInt(count);
        if (isNaN(txCount) || txCount < 1) {
          console.log(chalk.red("Jumlah tidak valid."));
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

// Opsi 2
async function transferToLoop() {
  rl.question(chalk.yellowBright(`Ambil berapa address pertama? (1-${addressList.length}): `), async (input) => {
    const count = parseInt(input);
    if (isNaN(count) || count < 1 || count > addressList.length) {
      console.log(chalk.red("Input tidak valid."));
      setTimeout(showMenu, 1500);
      return;
    }

    console.log(chalk.green(`\nLoop kirim ke ${count} address terus menerus.`));
    console.log(chalk.gray("Tekan CTRL + C untuk berhenti.\n"));

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

// Opsi 3
function transferRandomFromList() {
  rl.question(chalk.yellowBright(`Ingin mengirim ke berapa address acak? (max: ${addressList.length}): `), async (input) => {
    const count = parseInt(input);
    if (isNaN(count) || count < 1 || count > addressList.length) {
      console.log(chalk.red("Input tidak valid."));
      setTimeout(showMenu, 1500);
      return;
    }

    async function doSendRound() {
      const shuffled = addressList.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, count);
      console.log(chalk.greenBright(`\nMengirim ke ${count} address acak:`));

      for (let i = 0; i < selected.length; i++) {
        console.log(chalk.blueBright(`\n[${i + 1}/${count}] Mengirim ke: ${selected[i]}`));
        await sendTx(selected[i], "0.0001", i + 1, count);
        const delayMs = Math.floor(Math.random() * 5000) + 5000;
        console.log(chalk.gray(`Menunggu ${delayMs / 1000} detik...\n`));
        await delay(delayMs);
      }

      console.log(chalk.greenBright(`\n✓ Selesai kirim ke ${count} address. Menunggu 24 jam...\n`));
      await delay(24 * 60 * 60 * 1000); // 24 jam
      await doSendRound(); // Ulang lagi besok
    }

    await doSendRound();
  });
}

showMenu();
