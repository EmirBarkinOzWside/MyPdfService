const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const hbs = require('handlebars'); // Şablon motoru
const fs = require('fs'); // Dosya okumak için
const path = require('path');

const app = express();
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/generate', async (req, res) => {
    try {
        // Salesforce'tan artık HTML değil, sadece VERİ (data) gelecek
        const { data } = req.body; 

        if (!data) {
            return res.status(400).json({ error: 'Veri (data) gönderilmedi.' });
        }

        console.log("Şablonlu PDF isteği alındı...");

        // 1. Şablon Dosyasını Oku (templates/teklif.html)
        const templatePath = path.join(__dirname, 'templates', 'teklif.html');
        const templateHtml = fs.readFileSync(templatePath, 'utf8');

        // 2. Handlebars ile Veriyi Şablona Göm
        const template = hbs.compile(templateHtml);
        const finalHtml = template(data); // {{musteriIsmi}} -> "Ahmet Yılmaz" olur

        // 3. Puppeteer Başlat
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // 4. Oluşan HTML'i Yazdır
        await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close();

        // 5. Sonuç Gönder
        const pdfBase64 = pdfBuffer.toString('base64');
        res.json({ status: 'Success', base64: pdfBase64 });

    } catch (error) {
        console.error("Hata:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));