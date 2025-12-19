const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const app = express();

// Gelen JSON verisinin boyut sınırını artırıyoruz
app.use(bodyParser.json({ limit: '50mb' }));

app.post('/generate', async (req, res) => {
    try {
        const { htmlContent } = req.body;

        if (!htmlContent) {
            return res.status(400).json({ error: 'HTML içeriği gönderilmedi.' });
        }

        console.log("PDF isteği alındı, işleniyor...");

        // Tarayıcıyı başlat
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // HTML'i sayfaya yerleştir
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        // PDF oluştur
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close();

        // Base64'e çevir ve gönder
        const pdfBase64 = pdfBuffer.toString('base64');
        
        console.log("PDF başarıyla oluşturuldu.");
        res.json({ status: 'Success', base64: pdfBase64 });

    } catch (error) {
        console.error("Hata oluştu:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sunucu çalışıyor! Port: ${PORT}`);
});