const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const hbs = require('handlebars');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));

// --- YENİ EKLENECEK KISIM (BURADAN) ---
// Bu kod, UptimeRobot'un "Orada mısın?" sorusuna "Evet!" der.
app.get('/', (req, res) => {
    res.send('PDF Servisi Aktif ve Çalışıyor! 🚀');
});
// --- YENİ EKLENECEK KISIM (BURAYA KADAR) ---

// GLOBAL TARAYICI DEĞİŞKENİ
let browser;

// Tarayıcıyı Başlatma Fonksiyonu (Sadece ihtiyaç olduğunda çalışır)
async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        console.log("Yeni tarayıcı başlatılıyor...");
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Bellek tasarrufu için önemli
                '--single-process' // Hız için
            ]
        });
    }
    return browser;
}

app.post('/generate', async (req, res) => {
    let page = null;
    try {
        const { data } = req.body;
        if (!data) return res.status(400).json({ error: 'Veri yok.' });

        console.log("Hızlı PDF isteği geldi...");

        // 1. Şablonu Oku
        const templatePath = path.resolve('./templates/teklif.html');
        const templateHtml = fs.readFileSync(templatePath, 'utf8');
        const template = hbs.compile(templateHtml);
        const finalHtml = template(data);

        // 2. Hazır Tarayıcıyı Kullan (Sıfırdan açmak yok!)
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // 3. İçeriği Yükle (En Hızlı Mod: domcontentloaded)
        // networkidle0 yerine bunu kullanmak süreyi çok kısaltır.
        await page.setContent(finalHtml, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        // 4. Sadece Sekmeyi Kapat (Tarayıcı açık kalsın)
        await page.close();

        const pdfBase64 = pdfBuffer.toString('base64');
        console.log("PDF başarıyla oluşturuldu ve gönderiliyor!");
        res.json({ status: 'Success', base64: pdfBase64 });

    } catch (error) {
        console.error("Hata:", error);
        if (page) await page.close().catch(() => {}); // Hata olursa sekmeyi kapat
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Sunucu ${PORT} portunda!`);
    // Sunucu açılır açılmaz tarayıcıyı hazırla
    await getBrowser();
});