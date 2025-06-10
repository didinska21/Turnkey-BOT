
# TURNKEY

Script Node.js untuk mengirim token ETH (Sepolia Testnet) ke banyak alamat secara otomatis dari terminal.  
Dilengkapi dengan tampilan CLI yang menarik dan log yang jelas.

## Fitur

- Kirim ETH testnet (Sepolia) ke banyak address dari file JSON
- Input jumlah tujuan dari CLI
- Delay acak antar transaksi
- Log sukses & error dengan tampilan berwarna
- Tampilan banner keren di awal

## Instalasi

1. Clone repositori ini:

```bash
git clone https://github.com/didinska21/Turnkey-BOT.git
cd Turnkey-BOT
```

2. Install dependencies:

```bash
npm install
```

3. Buat file `.env` dan masukkan private key wallet:

```
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

> Gunakan wallet yang memiliki saldo ETH di Sepolia Testnet.

4. Buat file `address.json` berisi array address tujuan, contoh:

```json
[
  "0xAbc123...",
  "0xDef456...",
  "0x789Ghi..."
]
```

## Menjalankan

```bash
node main.js
```

Ikuti instruksi di terminal untuk memilih berapa address yang ingin dikirimi.

## Konfigurasi

- RPC Sepolia menggunakan: `https://ethereum-sepolia.publicnode.com`
- Explorer: https://sepolia.etherscan.io/tx/
- Default nilai transfer: `0.0001 ETH`
- Delay antar transaksi: 10 detik (acak)

## Testing

Gunakan faucet untuk mendapatkan ETH testnet di Sepolia:  
[https://sepoliafaucet.com](https://sepoliafaucet.com)
