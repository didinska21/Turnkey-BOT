# Cara Install & Menjalankan Turnkey-BOT

Ikuti langkah-langkah berikut di terminal:

1. Clone repository:
   ```bash
   git clone https://github.com/didinska21/Turnkey-BOT
   ```

2. Masuk ke folder project:
   ```bash
   cd Turnkey-BOT
   ```

3. Install semua dependensi:
   ```bash
   npm install boxen@8.0.1 chalk@4.1.2 dotenv@16.5.0 ethers@5.8.0 figlet@1.8.1 gradient-string@1.2.0 ora@5.4.1
   ```

4. Tambahkan private key ke file .env:
   ```bash
   echo 'PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE' >> .env
   ```

5. (Opsional) Tambahkan juga RPC_URL jika dibutuhkan:
   ```bash
   echo 'RPC_URL=https://your-rpc-url-here' >> .env
   ```

6. Buat screen
   ```bash
   screen -S turnkey
   ```

7. Jalankan bot:
   ```bash
   node main.js
   ```
